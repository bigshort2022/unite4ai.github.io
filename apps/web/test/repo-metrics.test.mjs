import assert from 'node:assert/strict';
import test from 'node:test';
import { countLabel, formatDuration, medianTimeToMerge, mergedInMonth, openPulls, peopleCount } from '../src/lib/repo-metrics.ts';

const HOUR = 3_600_000;
/** A pull request opened at noon on 1 November 2026 (UTC) and merged the given hours later, or still open. */
const pull = (hoursToMerge) => ({
  state: hoursToMerge === null ? 'open' : 'closed',
  created_at: '2026-11-01T12:00:00Z',
  merged_at: hoursToMerge === null ? null : new Date(Date.UTC(2026, 10, 1, 12) + hoursToMerge * HOUR).toISOString(),
});
/** A pull request closed without merging. */
const rejected = { state: 'closed', created_at: '2026-11-01T12:00:00Z', merged_at: null };

test('the median time to merge is the middle of an odd number of merged pull requests', () => {
  assert.equal(medianTimeToMerge([pull(10), pull(1), pull(4)]), 4 * HOUR);
});

test('the median time to merge is the mean of the two middle ones of an even number', () => {
  assert.equal(medianTimeToMerge([pull(10), pull(1), pull(4), pull(2)]), 3 * HOUR);
});

test('open and unmerged pull requests do not count towards the median', () => {
  assert.equal(medianTimeToMerge([pull(null), rejected, pull(6), pull(null)]), 6 * HOUR);
});

test('there is no median when no pull request was merged', () => {
  assert.equal(medianTimeToMerge([]), null);
  assert.equal(medianTimeToMerge([pull(null), rejected]), null);
});

test('a duration is shown in hours with one decimal, or in whole minutes under one hour', () => {
  assert.equal(formatDuration(3.54 * HOUR), '3.5 h');
  assert.equal(formatDuration(HOUR), '1.0 h');
  assert.equal(formatDuration(52 * HOUR), '52.0 h');
  assert.equal(formatDuration(42 * 60_000), '42 min');
  assert.equal(formatDuration(20_000), '0 min');
  // 59.6 minutes rounds to a full hour, not to "60 min".
  assert.equal(formatDuration(59.6 * 60_000), '1.0 h');
});

test('open pull requests and those merged in a month are counted from the list', () => {
  const pulls = [pull(null), pull(null), rejected, pull(1), pull(24 * 40)];
  assert.equal(openPulls(pulls), 2);
  // Merged on 1 November and on 11 December 2026; mid-month, so the viewer's time zone cannot move either.
  assert.equal(mergedInMonth(pulls, new Date(2026, 10, 15)), 1);
  assert.equal(mergedInMonth(pulls, new Date(2026, 11, 15)), 1);
  assert.equal(mergedInMonth(pulls, new Date(2027, 10, 15)), 0);
});

test('contributors are counted without bots: accounts that are not users, and logins ending in [bot]', () => {
  const contributors = [
    { login: 'ada', type: 'User' },
    { login: 'grace', type: 'User' },
    { login: 'dependabot[bot]', type: 'Bot' },
    { login: 'renovate[bot]', type: 'User' },
    { login: 'some-org', type: 'Organization' },
  ];
  assert.equal(peopleCount(contributors, 100), '2');
  assert.equal(peopleCount([], 100), '0');
});

test('a full page of contributors is marked as a lower bound', () => {
  const page = [{ login: 'ada', type: 'User' }, { login: 'dependabot[bot]', type: 'Bot' }];
  assert.equal(peopleCount(page, 2), '1+');
  assert.equal(peopleCount(page, 3), '1');
});

test('a count from a full page of any list is a lower bound, and exact otherwise', () => {
  // 3 open pull requests among a page of 100 that came back full: there may be more further on.
  assert.equal(countLabel(3, 100, 100), '3+');
  assert.equal(countLabel(0, 100, 100), '0+');
  assert.equal(countLabel(3, 99, 100), '3');
  assert.equal(countLabel(0, 0, 100), '0');
});
