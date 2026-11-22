import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeProfileSchema } from '@unite4ai/schema';
import { profile } from './fixtures/profile.mjs';

test('a complete published profile parses', () => {
  assert.equal(exchangeProfileSchema.safeParse(profile()).success, true);
});

test('a published profile without a reviewer is rejected', () => {
  const p = profile();
  delete p.meta.reviewedBy;
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('a missing value must say where it was searched for, never be zero or blank', () => {
  const p = profile();
  p.identity.headquarters = { value: null, level: 'not-published', searched: [] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  p.identity.headquarters = { value: '', level: 'stated', evidence: ['e1'] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('a known check outcome must cite evidence; unknown may not', () => {
  const p = profile();
  p.securityChecks[0] = { criterion: 'third-party-audit', outcome: 'pass', evidence: [] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('fixed fees need a currency and amounts are decimal strings', () => {
  const p = profile();
  p.costComponents[1] = { kind: 'payment-processor', basis: 'fixed', amount: '0.30', appliesTo: 'buyer', scope: 'x', evidence: ['e1'] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  const q = profile();
  q.costComponents[0].amount = 4;
  assert.equal(exchangeProfileSchema.safeParse(q).success, false);
});

test('unknown keys and HTML text are rejected', () => {
  const p = profile();
  p.meta.score = 99;
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  const q = profile();
  q.evidence[0].quote = '<b>bold</b>';
  assert.equal(exchangeProfileSchema.safeParse(q).success, false);
});

test('a usage window must not end before it starts', () => {
  const p = profile();
  p.usage.volume.window = { start: '2026-11-17', end: '2026-11-10' };
  const r = exchangeProfileSchema.safeParse(p);
  assert.equal(r.success, false);
  assert.match(r.error.message, /window must not end before it starts/);
  p.usage.volume.window = { start: '2026-11-17', end: '2026-11-17' };
  assert.equal(exchangeProfileSchema.safeParse(p).success, true);
});
