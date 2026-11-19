import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeBiases, share } from '../src/lib/exchange-biases.ts';
import { collectExchangeLatency, loadExchangeLatency } from '../src/lib/exchange-latency.ts';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 18);
const CREATED = Date.UTC(2026, 10, 1);
const BEFORE_WINDOW = Date.UTC(2026, 8, 1);
const iso = (ms) => new Date(ms).toISOString();
const pull = (number, state = 'open', hours = null, updated = null) => ({ number, state, base: { ref: 'main' },
  created_at: iso(CREATED), merged_at: hours === null ? null : iso(CREATED + hours * HOUR),
  updated_at: iso(updated ?? CREATED + (hours ?? 0) * HOUR) });
const oldMerge = (number, updated = BEFORE_WINDOW + 2 * HOUR) => ({ number, state: 'closed', base: { ref: 'main' },
  created_at: iso(BEFORE_WINDOW), merged_at: iso(BEFORE_WINDOW + HOUR), updated_at: iso(updated) });
const files = [{ filename: 'apps/web/src/content/hypotheses/fixture-test.md', status: 'added' }];
function api(routes, seen = []) {
  return async (url) => {
    const parsed = new URL(url);
    const key = parsed.pathname.replace('/repos/fixture/repo/', '') + '?' + parsed.searchParams.toString();
    seen.push(key);
    assert.ok(key in routes, `Unexpected API request: ${key}`);
    const value = routes[key];
    return value instanceof Response ? value : Response.json(value);
  };
}
const open = (page = 1) => `pulls?state=open&base=main&sort=created&direction=asc&per_page=100&page=${page}`;
const closed = (page = 1) => `pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`;
const fileList = (number, page = 1) => `pulls/${number}/files?per_page=100&page=${page}`;
const collect = (routes, options = {}) => collectExchangeLatency('fixture/repo', api(routes), { now: NOW, ...options });

// Oracle: hand-counted categories, each a different number, so a swapped or shared bucket fails.
test('bias counts keep each verdict, state and check category separate, including superseded findings', () => {
  const structure = { hypotheses: [{ author: 'alice' }], findings: [
    { author: 'alice', verdict: 'supports', state: 'accepted', superseded_by: ['new'] },
    { author: 'bob', verdict: 'supports', state: 'unreviewed', superseded_by: [] },
    { author: 'bob', verdict: 'supports', state: 'unreviewed', superseded_by: [] },
    { author: 'erin', verdict: 'refutes', state: 'unreviewed', superseded_by: [] },
    { author: 'erin', verdict: 'refutes', state: 'unreviewed', superseded_by: [] },
    { author: 'bob', verdict: 'inconclusive', state: 'disputed', superseded_by: [] },
  ], reviews: [
    { reviewer: 'bob', checks: ['read-page-only', 'read-page-only'] },
    { reviewer: 'carol', checks: ['read-page-only', 'read-results'] },
    { reviewer: 'carol', checks: ['read-page-only'] },
  ] };
  const metrics = exchangeBiases(structure, [{ run: { submitter: 'dave' } }]);
  assert.equal(metrics.posters, 4);
  assert.equal(metrics.reviewers, 2);
  assert.equal(metrics.pageOnly, 2);
  assert.deepEqual(metrics.verdicts, { supports: 3, refutes: 2, inconclusive: 1 });
  assert.equal(metrics.unreviewed, 4);
  assert.equal(share(1, 3), '33.3% (1 / 3)');
  assert.equal(share(0, 0), 'Unavailable (0 records)');
});

test('latency includes held/draft open records, excludes mixed changes and closed unmerged PRs', async () => {
  const result = await collect({
    [open()]: [{ ...pull(1), draft: true, labels: [{ name: 'hold' }] }, pull(2)],
    [fileList(1)]: files,
    [fileList(2)]: [...files, { filename: 'README.md', status: 'modified' }],
    [closed()]: [pull(4, 'closed', 6), pull(3, 'closed', 2), pull(5, 'closed')],
    [fileList(3)]: files, [fileList(4)]: files,
  });
  assert.deepEqual(result.waiting, { value: 1, inspected: 2, matched: 1, error: null });
  assert.deepEqual(result.median, { value: 4 * HOUR, inspected: 2, matched: 2, error: null });
  assert.equal(result.measuredAt, NOW);
  assert.equal(result.windowDays, 30);
});

test('empty populations distinguish successful zero waiting from no merged records', async () => {
  const result = await collect({ [open()]: [], [closed()]: [] });
  assert.equal(result.waiting.value, 0);
  assert.equal(result.waiting.error, null);
  assert.equal(result.median.value, null);
  assert.equal(result.median.matched, 0);
  assert.equal(result.median.error, null);
});

// Oracle: merged_at <= updated_at, so a page ending before the window proves no later page holds a window merge.
test('the 30-day window pages until it is complete, then stops without reading older history', async () => {
  const recent = Array.from({ length: 100 }, (_, i) => pull(i + 1, 'closed', null, Date.UTC(2026, 10, 10)));
  const older = [pull(101, 'closed', 8), oldMerge(102, Date.UTC(2026, 10, 1)),
    ...Array.from({ length: 98 }, (_, i) => oldMerge(200 + i))];
  const seen = [];
  const result = await collectExchangeLatency('fixture/repo', api({
    [open()]: [], [closed()]: recent, [closed(2)]: older, [fileList(101)]: files,
  }, seen), { now: NOW });
  assert.deepEqual(result.median, { value: 8 * HOUR, inspected: 1, matched: 1, error: null });
  assert.deepEqual(seen, [open(), closed(), closed(2), fileList(101)]);
  assert.equal(result.requests, 4);
});

test('a window that spans more than the latest page is unavailable when a later page fails', async () => {
  const recent = Array.from({ length: 100 }, (_, i) => pull(i + 1, 'closed', 1, Date.UTC(2026, 10, 10)));
  const result = await collect({ [open()]: [], [closed()]: recent, [closed(2)]: new Response('', { status: 403 }) });
  assert.equal(result.median.value, null);
  assert.match(result.median.error, /403/);
  assert.equal(result.waiting.value, 0);
});

test('complete file lists prevent truncated PRs from qualifying as record-only', async () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ filename: `apps/web/src/content/findings/fixture-${i}.json`, status: 'added' }));
  const result = await collect({
    [open()]: [pull(1)], [fileList(1)]: many,
    [fileList(1, 2)]: [{ filename: 'README.md', status: 'added' }], [closed()]: [],
  });
  assert.equal(result.waiting.value, 0);
});

test('budget exhaustion never converts partial populations into totals', async () => {
  const result = await collect({ [open()]: [pull(1)] }, { requestBudget: 1 });
  assert.equal(result.waiting.value, null);
  assert.match(result.waiting.error, /budget/i);
  assert.equal(result.median.value, null);
});

test('a history budget limit leaves an independently complete waiting count intact', async () => {
  const merged = [5, 4, 3, 2].map((hours, i) => pull(10 + i, 'closed', hours));
  const result = await collect({
    [open()]: [pull(1)], [fileList(1)]: files, [closed()]: merged,
    ...Object.fromEntries(merged.map((p) => [fileList(p.number), files])),
  }, { requestBudget: 4 });
  assert.deepEqual(result.waiting, { value: 1, inspected: 1, matched: 1, error: null });
  assert.equal(result.median.value, null);
  assert.match(result.median.error, /budget/i);
});

test('rate limits and malformed metadata are unavailable, while a separately complete metric survives', async () => {
  const limited = await collect({ [open()]: [], [closed()]: new Response('', { status: 403 }) });
  assert.equal(limited.waiting.value, 0);
  assert.equal(limited.median.value, null);
  assert.match(limited.median.error, /403/);
  const malformed = await collect({ [open()]: [pull(1)], [fileList(1)]: [{ filename: files[0].filename }], [closed()]: [] });
  assert.equal(malformed.waiting.value, null);
  assert.match(malformed.waiting.error, /metadata/i);
});

test('duplicated pagination, invalid times and unordered or impossible history fail closed', async () => {
  const duplicate = await collect({ [open()]: [pull(1), pull(1)], [closed()]: [] });
  assert.equal(duplicate.waiting.value, null);
  for (const history of [
    [{ ...pull(2, 'closed', 2), created_at: 'invalid' }],
    [pull(2, 'closed', 2), pull(3, 'closed', 6)],
    [{ ...pull(2, 'closed', 2), updated_at: iso(CREATED + HOUR) }],
  ]) {
    const invalid = await collect({ [open()]: [], [closed()]: history, [fileList(2)]: files, [fileList(3)]: files });
    assert.equal(invalid.median.value, null);
    assert.match(invalid.median.error, /metadata/i);
  }
});

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, String(value)); } };
}
const healthy = () => ({ [open()]: [pull(1)], [fileList(1)]: files, [closed()]: [pull(2, 'closed', 3)], [fileList(2)]: files });
const offline = async () => { throw new Error('network must not be used'); };

test('a complete observation is reused in the tab for under ten minutes, then measured again', async () => {
  const storage = memoryStorage();
  const first = await loadExchangeLatency('fixture/repo', storage, api(healthy()), { now: NOW });
  assert.equal(first.cached, false);
  assert.equal(first.observation.waiting.value, 1);
  const reused = await loadExchangeLatency('fixture/repo', storage, offline, { now: NOW + 9 * MINUTE });
  assert.equal(reused.cached, true);
  assert.deepEqual(reused.observation, first.observation);
  assert.equal(reused.observation.measuredAt, NOW);
  const seen = [];
  const expired = await loadExchangeLatency('fixture/repo', storage, api(healthy(), seen), { now: NOW + 10 * MINUTE });
  assert.equal(expired.cached, false);
  assert.equal(expired.observation.measuredAt, NOW + 10 * MINUTE);
  assert.equal(seen.length, 4);
  const otherRepository = await loadExchangeLatency('other/repo', storage, offline, { now: NOW + 11 * MINUTE });
  assert.equal(otherRepository.cached, false);
  assert.equal(otherRepository.observation.waiting.value, null);
});

test('incomplete observations are not cached, and broken or tampered storage falls back to a live measurement', async () => {
  const storage = memoryStorage();
  const failed = await loadExchangeLatency('fixture/repo', storage,
    api({ [open()]: [], [closed()]: new Response('', { status: 403 }) }), { now: NOW });
  assert.equal(failed.observation.waiting.value, 0);
  assert.equal(storage.map.size, 0);
  const good = await loadExchangeLatency('fixture/repo', storage, api(healthy()), { now: NOW });
  const [key, stored] = [...storage.map][0];
  const tampered = (change) => memoryStorage({ [key]: JSON.stringify(change(JSON.parse(stored))) });
  for (const broken of [
    memoryStorage({ [key]: '{not json' }),
    tampered((value) => ({ ...value, waiting: { ...value.waiting, value: 7 } })),
    tampered((value) => ({ ...value, median: { ...value.median, error: 'GitHub HTTP 403' } })),
    tampered((value) => ({ ...value, measuredAt: NOW + 5 * MINUTE })),
    tampered((value) => ({ ...value, windowDays: 90 })),
    { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } },
    null,
  ]) {
    const result = await loadExchangeLatency('fixture/repo', broken, api(healthy()), { now: NOW + MINUTE });
    assert.equal(result.cached, false);
    assert.equal(result.observation.measuredAt, NOW + MINUTE);
    assert.deepEqual(result.observation.waiting, good.observation.waiting);
  }
});
