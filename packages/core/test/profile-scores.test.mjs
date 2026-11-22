import assert from 'node:assert/strict';
import test from 'node:test';
import { securityScore, riskScore, transactionCostScore, quotesByWorkload, letterGrade } from '../src/profile-scores.ts';
import { MIN_COVERAGE } from '../src/profile-rubrics.ts';
import { profile } from './fixtures/profile.mjs';

test('security score is passed weight over known applicable weight; not-applicable leaves the denominator', () => {
  // Applicable weight 100 - 10 (verified-contracts n/a) = 90; unknown account-protection (5) leaves 85 known.
  // Passed: 20+10+10+10+15+10+5 = 80. 80/85 = 94.1 -> 94. Coverage 85/90.
  const s = securityScore(profile());
  assert.equal(s.score, 94);
  assert.equal(s.coverage, 0.94);
  assert.equal(s.rubricVersion, '1');
  assert.equal(s.breakdown.find((b) => b.criterion === 'account-protection').outcome, 'unknown');
});

test('a criterion with no check counts as unknown, and low coverage withholds the score', () => {
  const p = profile();
  p.securityChecks = p.securityChecks.slice(0, 2); // only 30 of 90 applicable weight known
  const s = securityScore(p);
  assert.equal(s.score, null);
  assert.ok(s.coverage < MIN_COVERAGE);
});

test('risk score counts triggered indicators (outcome fail) over known weight', () => {
  // Known: 100 - 10 (conflicting-terms unknown) = 90. Triggered: custodial 20 + single-operator 10 = 30. 30/90 = 33.
  assert.equal(riskScore(profile()).score, 33);
});

test('transaction cost sums percent fees and USD fixed fees on the USD 100 reference; gas is excluded', () => {
  // 4% + 0.30/100*100 = 4.3% -> score 100*(1-4.3/20) = 78.5 -> 79
  const c = transactionCostScore(profile());
  assert.equal(c.costPercent, 4.3);
  assert.equal(c.score, 79);
  assert.deepEqual(c.excluded, ['network-gas']);
});

test('a fee in another currency or with an unpublished amount makes the cost score not computable, never converted', () => {
  const p = profile();
  p.costComponents[1].currency = 'EUR';
  assert.equal(transactionCostScore(p).score, null);
  const q = profile();
  q.costComponents.push({ kind: 'withdrawal', amount: null, appliesTo: 'seller', scope: 'Payouts', searched: ['https://fixture.example/fees'] });
  const r = transactionCostScore(q);
  assert.equal(r.score, null);
  assert.match(r.notComputable.join(' '), /withdrawal/);
});

test('no published fee at all is not computable rather than free', () => {
  const p = profile();
  p.costComponents = [];
  assert.equal(transactionCostScore(p).score, null);
});

test('costs above the cap floor the score at zero', () => {
  const p = profile();
  p.costComponents = [{ kind: 'take-rate', basis: 'percent', amount: '35', appliesTo: 'seller', scope: 'x', evidence: ['e1'] }];
  assert.equal(transactionCostScore(p).score, 0);
});

test('quotes are compared only within the same workload, currency, unit and statistic', () => {
  const a = profile();
  const b = profile({ meta: { ...profile().meta, directoryId: 'vast-ai' } });
  b.priceQuotes = [
    { ...a.priceQuotes[0], amount: '2.10' },
    { ...a.priceQuotes[0], currency: 'EUR', amount: '1.50' },
  ];
  const groups = quotesByWorkload([{ id: 'akash', data: a }, { id: 'vast-ai', data: b }]);
  const usd = groups.get('gpu-hour-h100-80gb|USD|GPU-hour|median');
  assert.deepEqual(usd.map((r) => [r.directoryId, r.amount]), [['akash', 1.8], ['vast-ai', 2.1]]);
  assert.equal(groups.get('gpu-hour-h100-80gb|EUR|GPU-hour|median').length, 1);
});

test('letters: A 90+, B 80-89, C 70-79, D 50-69, F below 50; withheld scores get no letter', () => {
  assert.deepEqual([100, 90, 89, 80, 79, 70, 69, 50, 49, 0].map(letterGrade), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
  assert.equal(letterGrade(null), null);
  const p = profile();
  p.securityChecks = p.securityChecks.slice(0, 2);
  assert.equal(securityScore(p).grade, null);
});

test('security and cost are graded on their score; risk is graded on 100 minus its score', () => {
  assert.equal(securityScore(profile()).grade, 'A'); // 94
  assert.equal(riskScore(profile()).grade, 'D'); // 100 - 33 = 67
  assert.equal(transactionCostScore(profile()).grade, 'C'); // 79
});
