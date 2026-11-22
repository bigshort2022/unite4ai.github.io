import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SYSTEM as TOOL_SELECTION_SYSTEM } from '../../../scripts/benchmarks/tool-selection.mjs';
import { ANSWERS, BFCL_COMMIT, SYSTEM, buildMessages, checkCall, judge, parseItems, standardize } from '../src/eval/bfcl.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/bfcl/', import.meta.url));
const QUESTIONS_FILE = join(FIXTURES, 'BFCL_v4_multiple.json');
const ANSWERS_FILE = join(FIXTURES, 'BFCL_v4_multiple_possible_answer.json');
const QUESTIONS_SHA256 = 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const QUESTIONS = readFileSync(QUESTIONS_FILE, 'utf8');
const ANSWER_KEY = readFileSync(ANSWERS_FILE, 'utf8');
const ITEMS = parseItems(QUESTIONS, ANSWER_KEY, 50);
const CONFORMANCE = JSON.parse(readFileSync(join(FIXTURES, 'conformance.json'), 'utf8'));

// ─── Source ──────────────────────────────────────────────────────────────────

test('the fixtures are BFCL\'s files at the pinned commit, with its licence', () => {
  assert.equal(sha256(readFileSync(QUESTIONS_FILE)), QUESTIONS_SHA256);
  assert.equal(sha256(readFileSync(ANSWERS_FILE)), ANSWERS.sha256);
  assert.match(readFileSync(join(FIXTURES, 'LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
  assert.ok(ANSWERS.url.includes(`/gorilla/${BFCL_COMMIT}/`));
});

test('the items are the first 50 of the category, each with one request and the call it expects', () => {
  assert.deepEqual(ITEMS.map((item) => item.id), Array.from({ length: 50 }, (_, index) => `multiple_${index}`));
  for (const item of ITEMS) {
    assert.ok(item.request.length > 0);
    assert.ok(item.functions.length >= 2 && item.functions.length <= 3, item.id);
    assert.ok(item.functions.some((fn) => fn.name === item.answer.name), item.id);
  }
  assert.equal(ITEMS[1].request, 'Calculate the area of a triangle, given the lengths of its three sides: 3, 4, and 5.');
  assert.deepEqual(ITEMS[1].answer, { name: 'math.triangle_area_heron', params: { side1: [3], side2: [4], side3: [5] } });
});

test('a source that does not fit is refused, naming the item', () => {
  const rows = QUESTIONS.trim().split('\n');
  assert.throws(() => parseItems(rows.slice(0, 10).join('\n'), ANSWER_KEY, 50), /has 10 items; the benchmark needs 50/);
  const nested = JSON.parse(rows[0]);
  nested.function[0].parameters.properties.extra = { type: 'array', items: { type: 'dict' }, description: 'x' };
  assert.throws(() => parseItems([JSON.stringify(nested), ...rows.slice(1)].join('\n'), ANSWER_KEY, 50), /multiple_0: .*arrays of dict are not supported/);
  const shuffled = [rows[1], rows[0], ...rows.slice(2)].join('\n');
  assert.throws(() => parseItems(shuffled, ANSWER_KEY, 50), /item 1: expected id multiple_0/);
  const answerRows = ANSWER_KEY.trim().split('\n');
  const stringly = JSON.parse(answerRows[1]);
  stringly.ground_truth[0]['math.triangle_area_heron'].side1 = ['3'];
  const stringlyKey = [answerRows[0], JSON.stringify(stringly), ...answerRows.slice(2)].join('\n');
  assert.throws(() => parseItems(QUESTIONS, stringlyKey, 50), /multiple_1: accepted values of side1 are not integer; BFCL's variable path is not ported/);
});

// ─── Prompt ──────────────────────────────────────────────────────────────────

test('the prompt is tool selection\'s, with BFCL\'s types written as JSON Schema\'s and names kept', () => {
  assert.equal(SYSTEM, TOOL_SELECTION_SYSTEM);
  const [system, user] = buildMessages(ITEMS[1]);
  assert.deepEqual(system, { role: 'system', content: SYSTEM });
  const [request, tools] = user.content.split('\n\nTools:\n');
  assert.equal(request, `Request: ${ITEMS[1].request}`);
  const shown = JSON.parse(tools);
  assert.deepEqual(shown.map((fn) => fn.name), ITEMS[1].functions.map((fn) => fn.name));
  assert.equal(tools, JSON.stringify(shown, null, 2));
  for (const item of ITEMS) {
    const text = buildMessages(item)[1].content;
    assert.doesNotMatch(text, /"type": "(dict|float|tuple)"/, item.id);
  }
  assert.equal(shown[0].parameters.type, 'object');
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

test('the port gives BFCL\'s own verdict on every answer of the conformance corpus', () => {
  assert.equal(CONFORMANCE.commit, BFCL_COMMIT);
  assert.equal(CONFORMANCE.questions_sha256, QUESTIONS_SHA256);
  assert.equal(CONFORMANCE.answers_sha256, ANSWERS.sha256);
  const byId = new Map(ITEMS.map((item) => [item.id, item]));
  const disagreements = CONFORMANCE.entries.filter((entry) =>
    (checkCall(byId.get(entry.id), entry.tool, entry.arguments) === null) !== entry.valid);
  assert.deepEqual(disagreements.map((entry) => `${entry.id} ${entry.variant}`), []);
  // The corpus has both verdicts for every item, so a port that always says yes or no fails.
  for (const item of ITEMS) {
    const verdicts = new Set(CONFORMANCE.entries.filter((entry) => entry.id === item.id).map((entry) => entry.valid));
    assert.deepEqual([...verdicts].sort(), [false, true], item.id);
  }
});

test('BFCL\'s string normalisation drops spaces and , . / - _ * ^, lowers case and reads \' as "', () => {
  assert.equal(standardize("San Diego, CA"), 'sandiegoca');
  assert.equal(standardize('a-b_c*d^e/f.g'), 'abcdefg');
  assert.equal(standardize("it's"), 'it"s');
});

test('a reply is judged by its last JSON object, with reasoning removed and null arguments left out', () => {
  const item = ITEMS[1];
  const call = { tool: 'math.triangle_area_heron', arguments: { side1: 3, side2: 4, side3: 5 } };
  assert.deepEqual(judge(JSON.stringify(call), item), { correct: true, extracted: JSON.stringify(call) });
  assert.equal(judge(`<think>${JSON.stringify({ tool: 'x' })}</think>Here: ${JSON.stringify(call)}`, item).correct, true);
  const withNull = { ...call, arguments: { ...call.arguments, unknown: null } };
  assert.equal(judge(JSON.stringify(withNull), item).correct, true);
  assert.equal(judge(JSON.stringify({ tool: null, arguments: {} }), item).correct, false);
  assert.equal(judge(JSON.stringify({ tool: 'math.triangle_area_heron', arguments: '{"side1": 3}' }), item).correct, false);
  assert.deepEqual(judge('The area is 6.', item), { correct: false, extracted: null });
});
