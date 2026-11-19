import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeBiases, share } from '../src/lib/exchange-biases.ts';
import { collectExchangeLatency } from '../src/lib/exchange-latency.ts';

const pull = (number, state = 'open', hours = null) => ({ number, state, base: { ref: 'main' },
  created_at: '2026-11-01T00:00:00Z', merged_at: hours === null ? null : new Date(Date.UTC(2026, 10, 1, hours)).toISOString() });
const files = [{ filename: 'apps/web/src/content/hypotheses/fixture-test.md', status: 'added' }];
function api(routes) {
  return async (url) => {
    const parsed = new URL(url);
    const key = parsed.pathname.replace('/repos/fixture/repo/', '') + '?' + parsed.searchParams.toString();
    assert.ok(key in routes, `Unexpected API request: ${key}`);
    const value = routes[key];
    return value instanceof Response ? value : Response.json(value);
  };
}
const list = (state, page = 1) => `pulls?state=${state}&base=main&sort=created&direction=asc&per_page=100&page=${page}`;
const fileList = (number, page = 1) => `pulls/${number}/files?per_page=100&page=${page}`;

test('bias denominators include superseded findings and result submitters, not invented independent people', () => {
  const structure = { hypotheses: [{ author: 'alice' }], findings: [
    { author: 'alice', verdict: 'supports', state: 'accepted', superseded_by: ['new'] },
    { author: 'bob', verdict: 'refutes', state: 'unreviewed', superseded_by: [] },
    { author: 'bob', verdict: 'inconclusive', state: 'disputed', superseded_by: [] },
  ], reviews: [
    { reviewer: 'bob', checks: ['read-page-only', 'read-page-only'] },
    { reviewer: 'carol', checks: ['read-page-only', 'read-results'] },
  ] };
  const metrics = exchangeBiases(structure, [{ run: { submitter: 'dave' } }]);
  assert.equal(metrics.posters, 3);
  assert.equal(metrics.reviewers, 2);
  assert.equal(metrics.pageOnly, 1);
  assert.deepEqual(metrics.verdicts, { supports: 1, refutes: 1, inconclusive: 1 });
  assert.equal(metrics.unreviewed, 1);
  assert.equal(share(1, 3), '33.3% (1 / 3)');
  assert.equal(share(0, 0), 'Unavailable (0 records)');
});

test('latency includes held/draft open records, excludes mixed changes and closed unmerged PRs', async () => {
  const result = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [{ ...pull(1), draft: true, labels: [{ name: 'hold' }] }, pull(2)],
    [fileList(1)]: files,
    [fileList(2)]: [...files, { filename: 'README.md', status: 'modified' }],
    [list('closed')]: [pull(3, 'closed', 2), pull(4, 'closed', 6), pull(5, 'closed')],
    [fileList(3)]: files, [fileList(4)]: files,
  }));
  assert.deepEqual(result.waiting, { value: 1, inspected: 2, matched: 1, error: null });
  assert.deepEqual(result.median, { value: 4 * 3_600_000, inspected: 3, matched: 2, error: null });
});

test('empty populations distinguish successful zero waiting from no merged records', async () => {
  const result = await collectExchangeLatency('fixture/repo', api({ [list('open')]: [], [list('closed')]: [] }));
  assert.equal(result.waiting.value, 0);
  assert.equal(result.waiting.error, null);
  assert.equal(result.median.value, null);
  assert.equal(result.median.matched, 0);
  assert.equal(result.median.error, null);
});

test('all PR pages are required before a repository-wide count is returned', async () => {
  const closed = Array.from({ length: 100 }, (_, i) => pull(i + 1, 'closed'));
  const result = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [], [list('closed')]: closed,
    [list('closed', 2)]: [pull(101, 'closed', 8)], [fileList(101)]: files,
  }));
  assert.equal(result.median.value, 8 * 3_600_000);
  assert.equal(result.median.inspected, 101);
});

test('complete file lists prevent truncated PRs from qualifying as record-only', async () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ filename: `apps/web/src/content/findings/fixture-${i}.json`, status: 'added' }));
  const result = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [pull(1)], [fileList(1)]: many,
    [fileList(1, 2)]: [{ filename: 'README.md', status: 'added' }], [list('closed')]: [],
  }));
  assert.equal(result.waiting.value, 0);
});

test('budget exhaustion never converts partial populations into totals', async () => {
  const result = await collectExchangeLatency('fixture/repo', api({ [list('open')]: [pull(1)] }), { requestBudget: 1 });
  assert.equal(result.waiting.value, null);
  assert.match(result.waiting.error, /budget/i);
  assert.equal(result.median.value, null);
});

test('rate limits and malformed metadata are unavailable, while a separately complete metric survives', async () => {
  const limited = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [], [list('closed')]: new Response('', { status: 403 }),
  }));
  assert.equal(limited.waiting.value, 0);
  assert.equal(limited.median.value, null);
  assert.match(limited.median.error, /403/);
  const malformed = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [pull(1)], [fileList(1)]: [{ filename: files[0].filename }], [list('closed')]: [],
  }));
  assert.equal(malformed.waiting.value, null);
  assert.match(malformed.waiting.error, /metadata/i);
});

test('duplicated pagination and invalid merged times fail closed', async () => {
  const duplicate = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [pull(1), pull(1)], [list('closed')]: [],
  }));
  assert.equal(duplicate.waiting.value, null);
  const invalid = await collectExchangeLatency('fixture/repo', api({
    [list('open')]: [], [list('closed')]: [{ ...pull(2, 'closed', 2), created_at: 'invalid' }],
  }));
  assert.equal(invalid.median.value, null);
  assert.match(invalid.median.error, /metadata/i);
});
