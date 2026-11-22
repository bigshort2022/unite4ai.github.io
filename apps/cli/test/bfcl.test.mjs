import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatProblems } from '@unite4ai/core/repeat';
import { validateContent } from '@unite4ai/core/validate';
import { SYSTEM as TOOL_SELECTION_SYSTEM } from '../../../scripts/benchmarks/tool-selection.mjs';
import { ANSWERS, BFCL_COMMIT, SYSTEM, buildMessages, checkCall, judge, parseItems, standardize } from '../src/eval/bfcl.ts';
import { runEval } from '../src/eval/run.ts';
import { SUITES } from '../src/eval/suites.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/bfcl/', import.meta.url));
const CONTENT_ROOT = fileURLToPath(new URL('../../web/src/content', import.meta.url));
const DEFINITION = join(CONTENT_ROOT, 'benchmarks/bfcl-multiple-50.md');
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

// ─── Suite, page and runner ──────────────────────────────────────────────────

test('the suite reads both pinned files and needs the answers', () => {
  const suite = SUITES['bfcl-multiple-50'];
  assert.deepEqual(suite.answers, ANSWERS);
  assert.equal(suite.items(QUESTIONS, 50, ANSWER_KEY).length, 50);
  assert.throws(() => suite.items(QUESTIONS, 50), /needs its answers file/);
});

test('the benchmark page pins both files and the method the suite runs', () => {
  const definition = readFileSync(DEFINITION, 'utf8');
  assert.match(definition, new RegExp(`^source_sha256: ${QUESTIONS_SHA256}$`, 'm'));
  assert.match(definition, new RegExp(`^source_url: https://raw\\.githubusercontent\\.com/ShishirPatil/gorilla/${BFCL_COMMIT}/`, 'm'));
  assert.ok(definition.includes(ANSWERS.sha256), 'the page names the answers file\'s hash');
  assert.match(definition, /^items: 50$/m);
  assert.match(definition, /^license: apache-2\.0$/m);
  assert.match(definition, /^repeat:\n {2}runs: 5\n {2}temperature: 0\.7\n {2}top_p: 1$/m);
  assert.ok(definition.includes(`${CONFORMANCE.entries.length} answers`), 'the page states the size of the conformance corpus');
});

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const temps = [];
const servers = [];
after(() => {
  servers.forEach((server) => server.close());
  temps.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/** A model that gives the canonical call on even items and calls the wrong function on odd ones. */
function stubServer() {
  const byRequest = new Map(ITEMS.map((item) => [item.request, item]));
  const bodies = [];
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const json = (code, payload) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.url === '/v1/models') return json(200, { data: [{ id: 'stub-model' }] });
        if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(404, { error: 'not found' });
        const parsed = JSON.parse(body);
        bodies.push(parsed);
        const request = parsed.messages[1].content.split('\n\nTools:\n')[0].slice('Request: '.length);
        const item = byRequest.get(request);
        if (!item) return json(500, { error: { message: 'stub: not an item as published' } });
        const even = Number(item.id.split('_')[1]) % 2 === 0;
        const canonical = CONFORMANCE.entries.find((entry) => entry.id === item.id && entry.variant === (even ? 'canonical' : 'wrong_function'));
        const answer = JSON.stringify({ tool: canonical.tool, arguments: canonical.arguments });
        res.setHeader('content-type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 700, completion_tokens: 40 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, bodies }));
  });
}

/** Runs `fn` with every request to another machine refused: the tests never fetch BFCL's files. */
async function offline(fn) {
  const real = globalThis.fetch;
  const refused = [];
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (new URL(url).hostname === '127.0.0.1') return real(input, init);
    refused.push(url);
    return Promise.reject(new Error(`a test must not use the network: ${url}`));
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test('a run reads both pinned files from the cache, sends each item five times, and publishes a result the gate accepts', { timeout: 120_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-bfcl-'));
  temps.push(root);
  const contentRoot = join(root, 'content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  copyFileSync(DEFINITION, join(contentRoot, 'benchmarks/bfcl-multiple-50.md'));
  const workDir = join(root, 'work');
  mkdirSync(join(workDir, 'cache'), { recursive: true });
  copyFileSync(QUESTIONS_FILE, join(workDir, 'cache', `${QUESTIONS_SHA256}.txt`));
  copyFileSync(ANSWERS_FILE, join(workDir, 'cache', `${ANSWERS.sha256}.txt`));
  const stub = await stubServer();

  const outcome = await offline(() => runEval({
    benchmark: 'bfcl-multiple-50',
    model: 'model-a',
    servedModel: 'stub-model',
    submitter: 'alice',
    runtime: 'mlx-lm',
    runtimeVersion: '0.32.2',
    format: 'mlx',
    quantization: '4bit',
    baseUrl: stub.baseUrl,
    contentRoot,
    workDir,
    command: 'bun run eval -- --benchmark bfcl-multiple-50 --model model-a',
    hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 },
    today: '2026-11-22',
  }));

  assert.equal(stub.bodies.length, 250);
  assert.deepEqual(stub.bodies.map((body) => [body.seed, body.temperature, body.top_p, body.max_tokens]),
    Array.from({ length: 250 }, (_, position) => [position, 0.7, 1, 1024]));
  assert.deepEqual([outcome.n, outcome.runs, outcome.correct, outcome.score], [50, 5, 25, 50]);
  const [header] = readFileSync(outcome.transcriptPath, 'utf8').split('\n').map((line) => (line ? JSON.parse(line) : null));
  assert.equal(header.answers_sha256, ANSWERS.sha256);
  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  assert.deepEqual(result.repeat.item_pass_histogram, [25, 0, 0, 0, 0, 25]);
  assert.deepEqual(repeatProblems(result.repeat, result.n), []);
  assert.deepEqual((await validateContent(contentRoot)).errors, []);
});
