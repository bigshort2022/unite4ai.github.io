import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';

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
