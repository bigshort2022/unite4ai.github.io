import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatProblems } from '@unite4ai/core/repeat';
import { validateContent } from '@unite4ai/core/validate';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';
import { runEval } from '../src/eval/run.ts';
import { SUITES } from '../src/eval/suites.ts';
import { judge, lastJsonObject } from '../src/eval/tool-selection.ts';

const CONTENT_ROOT = fileURLToPath(new URL('../../web/src/content', import.meta.url));
const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/tool-selection-v1.jsonl', import.meta.url));
const DEFINITION = join(CONTENT_ROOT, 'benchmarks/tool-selection-v1.md');
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

test('an argument named like a built-in object property is still an unknown argument', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    assert.equal(correct(`{"tool": "search_files", "arguments": {"query": "invoice", "directory": "docs", "${name}": "x"}}`), false, name);
  }
});

test('braces inside a string value do not move the answer, and a boolean written as a string is wrong', () => {
  const braces = { ...ITEM, expected: { tool: 'search_files', arguments: { query: 'a}b{c' } } };
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'a}b{c' } }), braces), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: 'false' } }), LIST), false);
});

test('with no correct call, null arguments count as left out', () => {
  assert.equal(correct(reply({ tool: null, arguments: { query: null } }), NONE), true);
  assert.equal(correct(reply({ tool: null, arguments: null }), NONE), true);
});

// ─── Page and runner ─────────────────────────────────────────────────────────

test('the benchmark page pins the data and gives the system message word for word', () => {
  const definition = readFileSync(DEFINITION, 'utf8');
  assert.match(definition, new RegExp(`^source_sha256: ${V1_SHA256}$`, 'm'));
  assert.match(definition, /^version: "1"$/m);
  assert.match(definition, /^items: 100$/m);
  assert.match(definition, /^scoring: exact-match$/m);
  assert.match(definition, /^repeat:\n {2}runs: 5\n {2}temperature: 0\.7\n {2}top_p: 1$/m);
  assert.ok(definition.includes(`\n\`\`\`text\n${SYSTEM}\n\`\`\`\n`), 'the system message must be on the page verbatim');
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

/** A content root laid out as in the repository, with the real definition and the vendored data. */
function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-tools-'));
  temps.push(root);
  const contentRoot = join(root, 'src/content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  copyFileSync(DEFINITION, join(contentRoot, 'benchmarks/tool-selection-v1.md'));
  const data = join(root, 'public/data/benchmarks/tool-selection-v1.jsonl');
  mkdirSync(dirname(data), { recursive: true });
  copyFileSync(DATA, data);
  return { contentRoot, workDir: join(root, 'work') };
}

/**
 * A model that answers every item with its expected call, except that it never declines: on an
 * item with no correct call it calls the first tool offered. A request that departs from the
 * published method gets a 500 that says how.
 */
function stubServer() {
  const items = new Map(ITEMS.map((item) => [item.request + JSON.stringify(item.tools), item]));
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
        const fixed = { model: 'stub-model', temperature: 0.7, top_p: 1, max_tokens: 1024, stream: true };
        const wrong = Object.keys(fixed).find((key) => parsed[key] !== fixed[key]);
        if (wrong) return json(500, { error: { message: `stub: ${wrong} must be ${fixed[wrong]}` } });
        const user = parsed.messages[1].content;
        const [, request, tools] = user.match(/^Request: ([\s\S]*?)\n\nTools:\n([\s\S]*)$/);
        const item = items.get(request + JSON.stringify(JSON.parse(tools)));
        if (!item) return json(500, { error: { message: 'stub: not an item as published' } });
        const answer = item.expected.tool === null ? { tool: item.tools[0].name, arguments: {} } : item.expected;
        res.setHeader('content-type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answer) }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 30 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, bodies }));
  });
}

test('a run sends every item five times as published and publishes a result the gate accepts', { timeout: 120_000 }, async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer();
  const outcome = await runEval({
    benchmark: 'tool-selection-v1',
    model: 'model-a',
    servedModel: 'stub-model',
    submitter: 'alice',
    runtime: 'mlx-lm',
    runtimeVersion: '0.32.2',
    format: 'mlx',
    quantization: '4bit',
    baseUrl: stub.baseUrl,
    contentRoot: workspace.contentRoot,
    workDir: workspace.workDir,
    command: 'bun run eval -- --benchmark tool-selection-v1 --model model-a',
    hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 },
    today: '2026-11-22',
  });

  assert.equal(stub.bodies.length, 500);
  assert.deepEqual(stub.bodies.map((body) => body.seed), Array.from({ length: 500 }, (_, position) => position));
  // The stub never declines, so exactly the 85 items with a call are right on every run.
  assert.deepEqual([outcome.n, outcome.runs, outcome.correct, outcome.score], [100, 5, 85, 85]);
  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  assert.deepEqual(result.repeat.item_pass_histogram, [15, 0, 0, 0, 0, 85]);
  assert.deepEqual(repeatProblems(result.repeat, result.n), []);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});
