import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';
import { SUITES } from '../src/eval/suites.ts';
import { judge, lastJsonObject } from '../src/eval/tool-selection.ts';

const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/tool-selection-v1.jsonl', import.meta.url));
/** Version "1" is these bytes. A change to the items needs a new version, with its own seed, file and hash. */
const V1_SHA256 = '95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const ITEMS = buildItems();
const byName = (item, name) => item.tools.find((tool) => tool.name === name);
const domainOf = (name) => Object.entries(TOOLS).find(([, tools]) => tools.some((tool) => tool.name === name))[0];

// ─── Items ───────────────────────────────────────────────────────────────────

test('the committed data file is exactly what the generator produces, and version 1 is frozen', () => {
  const committed = readFileSync(DATA, 'utf8');
  assert.equal(committed, toJsonl(ITEMS));
  assert.equal(sha256(committed), V1_SHA256, 'changed items are a new benchmark version, not version 1');
  assert.deepEqual(buildItems(), ITEMS, 'the generator is deterministic');
});

test('100 items with unique ids, 15 of them with no correct call, each offering 8 to 16 distinct tools', () => {
  assert.equal(ITEMS.length, 100);
  assert.equal(new Set(ITEMS.map((item) => item.id)).size, 100);
  assert.equal(ITEMS.filter((item) => item.expected.tool === null).length, NONE_COUNT);
  for (const item of ITEMS) {
    assert.equal(item.system, SYSTEM);
    assert.ok(item.tools.length >= 8 && item.tools.length <= 16, `${item.id}: ${item.tools.length} tools`);
    assert.equal(new Set(item.tools.map((tool) => tool.name)).size, item.tools.length, `${item.id}: a tool is offered twice`);
  }
});

test('every item offers its whole domain, so its near misses are always there', () => {
  for (const item of ITEMS) {
    const leftOut = item.expected.tool === null ? NONE_TARGETS.find((name) => domainOf(name) === item.domain && !byName(item, name)) : null;
    for (const tool of TOOLS[item.domain]) {
      if (tool.name !== leftOut) assert.ok(byName(item, tool.name), `${item.id}: ${tool.name} is missing`);
    }
  }
});

test('a call item offers its tool and its arguments fit the schema; a no-call item lacks the tool its request needs', () => {
  for (const item of ITEMS.filter((entry) => entry.expected.tool !== null)) {
    const { properties, required } = byName(item, item.expected.tool).parameters;
    const args = item.expected.arguments;
    for (const name of required) assert.ok(name in args, `${item.id}: required ${name} missing`);
    for (const [name, value] of Object.entries(args)) {
      const schema = properties[name];
      assert.ok(schema, `${item.id}: unknown argument ${name}`);
      assert.equal(typeof value, schema.type === 'integer' ? 'number' : schema.type, `${item.id}: ${name} has the wrong type`);
      if (schema.type === 'integer') assert.ok(Number.isInteger(value), `${item.id}: ${name} is not an integer`);
      if (schema.enum) assert.ok(schema.enum.includes(value), `${item.id}: ${name} is not one of its values`);
      if (typeof value === 'string') assert.ok(item.request.includes(value) || name === 'status', `${item.id}: ${name} is not written in the request`);
      if (schema.default !== undefined) assert.notEqual(value, schema.default, `${item.id}: ${name} repeats its default`);
    }
  }
  const noCall = ITEMS.filter((item) => item.expected.tool === null);
  assert.deepEqual(noCall.map((item) => item.expected.arguments), noCall.map(() => ({})));
  assert.deepEqual(
    NONE_TARGETS.filter((name) => noCall.some((item) => item.domain === domainOf(name) && !byName(item, name))).sort(),
    [...NONE_TARGETS].sort(),
    'each left-out tool is missing from an item of its domain',
  );
});

/** Every request a template can make: 2,000 draws from a fixed stream cover the small pools. */
const madeBy = new Map();
function requestsOf(template) {
  if (!madeBy.has(template)) {
    const next = generator(1);
    const pick = (pool) => POOLS[pool][Math.floor(next() * POOLS[pool].length)];
    madeBy.set(template, new Set(Array.from({ length: 2000 }, () => template(pick).request)));
  }
  return madeBy.get(template);
}
const asks = (name, request) => TEMPLATES[name].some((template) => requestsOf(template).has(request));

test('each request comes from its expected tool, or, with no call, from the tool left out and from no offered tool', () => {
  for (const item of ITEMS) {
    const offeredAsk = item.tools.filter((tool) => asks(tool.name, item.request)).map((tool) => tool.name);
    if (item.expected.tool === null) {
      assert.deepEqual(offeredAsk, [], `${item.id}: an offered tool makes this request`);
      const leftOut = NONE_TARGETS.filter((name) => !byName(item, name) && asks(name, item.request));
      assert.equal(leftOut.length, 1, `${item.id}: ${leftOut.length} left-out tools make this request`);
    } else {
      assert.deepEqual(offeredAsk, [item.expected.tool], `${item.id}: made by ${offeredAsk.join(', ')}`);
    }
  }
});

test('every tool is the answer to some item, and requests are unique among calls and among no-calls', () => {
  const answered = new Set(ITEMS.map((item) => item.expected.tool).filter(Boolean));
  assert.deepEqual([...answered].sort(), Object.values(TOOLS).flat().map((tool) => tool.name).sort());
  const calls = ITEMS.filter((item) => item.expected.tool !== null).map((item) => item.request);
  const noCalls = ITEMS.filter((item) => item.expected.tool === null).map((item) => item.request);
  assert.equal(new Set(calls).size, calls.length);
  assert.equal(new Set(noCalls).size, noCalls.length);
});

test('the data file is under 1 MB', () => {
  assert.ok(readFileSync(DATA).length < 1024 * 1024);
});

// ─── Suite ───────────────────────────────────────────────────────────────────

test('the suite reads its vendored copy of the data', () => {
  assert.equal(SUITES['tool-selection-v1'].localSource, '../../public/data/benchmarks/tool-selection-v1.jsonl');
});

test('the suite builds the published prompt: system message, then the request and its tools as indented JSON', () => {
  const [first] = SUITES['tool-selection-v1'].items(readFileSync(DATA, 'utf8'), 100);
  assert.deepEqual(first.messages, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Request: ${ITEMS[0].request}\n\nTools:\n${JSON.stringify(ITEMS[0].tools, null, 2)}` },
  ]);
  assert.equal(first.expected, JSON.stringify(ITEMS[0].expected));
});

test('the suite refuses a source with the wrong number of items or an item whose answer is not offered', () => {
  const suite = SUITES['tool-selection-v1'];
  const lines = readFileSync(DATA, 'utf8').trim().split('\n');
  assert.throws(() => suite.items(lines.slice(0, 10).join('\n'), 100), /has 10 items; the benchmark needs 100/);
  const call = ITEMS.findIndex((item) => item.expected.tool !== null);
  const broken = ITEMS.map((item, index) => (index === call ? { ...item, tools: item.tools.filter((tool) => tool.name !== item.expected.tool) } : item));
  assert.throws(() => suite.items(toJsonl(broken), 100), new RegExp(`item ${call + 1}: expected tool "${ITEMS[call].expected.tool}" is not among its tools`));
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

const ITEM = {
  id: 'fixture',
  system: SYSTEM,
  domain: 'files',
  request: 'Look through the files in the docs directory for the phrase "invoice".',
  tools: TOOLS.files,
  expected: { tool: 'search_files', arguments: { query: 'invoice', directory: 'docs' } },
};
const LIST = { ...ITEM, request: 'What is in the docs directory?', expected: { tool: 'list_directory', arguments: { path: 'docs' } } };
const LOG = {
  ...ITEM,
  domain: 'git',
  request: 'Show me the last 3 commits.',
  tools: TOOLS.git,
  expected: { tool: 'git_log', arguments: { limit: 3 } },
};
const NONE = { ...ITEM, tools: TOOLS.files.filter((tool) => tool.name !== 'search_files'), expected: { tool: null, arguments: {} } };
const reply = (answer) => JSON.stringify(answer);
const correct = (text, item = ITEM) => judge(text, item).correct;

test('the last JSON object in the text is the answer, however much text or fencing surrounds it', () => {
  assert.deepEqual(lastJsonObject('I will search.\n```json\n{"tool": "x", "arguments": {"a": {"b": 1}}}\n```'), { tool: 'x', arguments: { a: { b: 1 } } });
  assert.deepEqual(lastJsonObject('{"tool": "a"} then {"tool": "b"}'), { tool: 'b' });
  assert.deepEqual(lastJsonObject('{"tool": "a", "arguments": {}} and a stray }'), { tool: 'a', arguments: {} });
  assert.equal(lastJsonObject('no object here'), null);
  assert.equal(lastJsonObject('{"tool": "cut off'), null);
});

test('the exact call is correct, with spaces around strings ignored and a reasoning block removed', () => {
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: 'docs' } })), true);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { directory: ' docs ', query: 'invoice' } })), true);
  const thought = `<think>Maybe {"tool": "search_web", "arguments": {"query": "invoice"}}</think>${reply(ITEM.expected)}`;
  assert.equal(correct(thought), true);
  const verdict = judge(`Here you go: ${reply(ITEM.expected)}`, ITEM);
  assert.deepEqual(verdict, { correct: true, extracted: JSON.stringify(ITEM.expected) });
});

test('a near miss, a missing, wrong or extra argument, or no object at all is wrong', () => {
  assert.equal(correct(reply({ tool: 'search_web', arguments: { query: 'invoice' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'Invoice', directory: 'docs' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: 'docs', limit: 5 } })), false);
  assert.equal(correct(reply({ tool: 'search_files' })), false);
  assert.equal(correct(reply({ name: 'search_files', arguments: ITEM.expected.arguments })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: ['invoice', 'docs'] })), false);
  assert.deepEqual(judge('I would search the files for it.', ITEM), { correct: false, extracted: null });
  // The answer is the last object, even when an earlier one was right.
  assert.equal(correct(`${reply(ITEM.expected)} or maybe ${reply({ tool: 'search_web', arguments: { query: 'invoice' } })}`), false);
});

test('an optional parameter the request does not set may be left out, null or its default, and nothing else', () => {
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs' } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: false } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: null } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: true } }), LIST), false);
  // Without a default, an unset optional parameter must be left out.
  const unset = { ...ITEM, expected: { tool: 'search_files', arguments: { query: 'invoice' } } };
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: '' } }), unset), false);
});

test('an integer must be a JSON number: 3.0 is 3, "3" is wrong', () => {
  assert.equal(correct('{"tool": "git_log", "arguments": {"limit": 3.0}}', LOG), true);
  assert.equal(correct(reply({ tool: 'git_log', arguments: { limit: '3' } }), LOG), false);
  assert.equal(correct(reply({ tool: 'git_log', arguments: { limit: 4 } }), LOG), false);
});

test('with no correct call, only a null tool with no arguments is correct', () => {
  assert.equal(correct(reply({ tool: null, arguments: {} }), NONE), true);
  assert.equal(correct(reply({ tool: null }), NONE), true);
  assert.equal(correct(reply({ tool: null, arguments: { query: 'invoice' } }), NONE), false);
  assert.equal(correct(reply({ tool: 'search_web', arguments: { query: 'invoice' } }), NONE), false);
  assert.equal(correct('I cannot do that with these tools.', NONE), false);
  // And a null answer to an item that has a call is wrong.
  assert.equal(correct(reply({ tool: null, arguments: {} })), false);
});
