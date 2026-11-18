import assert from 'node:assert/strict';
import test from 'node:test';
import { hypothesisSchema, findingSchema, reviewSchema, graftSchema } from '@unite4ai/schema';
import { hypothesis, finding, review } from './fixtures/exchange.mjs';

const schemas = [hypothesisSchema, findingSchema, reviewSchema];
const samples = [hypothesis(), finding(), review(JSON.stringify(finding()))];

test('exchange schemas accept all three verdicts and each documented review check', () => {
  schemas.forEach((schema, i) => assert.equal(schema.safeParse(samples[i]).success, true));
  for (const verdict of ['supports', 'refutes', 'inconclusive']) assert.equal(findingSchema.safeParse(finding({ verdict })).success, true);
  for (const verdict of ['accept', 'reject', 'needs-work']) {
    for (const check of ['reran', 'read-transcript', 'read-results', 'read-page-only']) {
      assert.equal(reviewSchema.safeParse(review('', { verdict, checks: [check] })).success, true);
    }
  }
});

test('authored objects reject unknown keys, including nested agent and graft claims', () => {
  for (let i = 0; i < schemas.length; i++) {
    for (const extra of [{ state: 'accepted' }, { status: 'supported' }, { slug: 'override' }, { agent: { model: 'Fixture', harness: 'Fixture', verified: true } }]) {
      assert.equal(schemas[i].safeParse({ ...samples[i], ...extra }).success, false, JSON.stringify(extra));
    }
  }
  assert.equal(graftSchema.safeParse({ finding: 'fixture', sha256: 'a'.repeat(64), note: 'Fixture', trusted: true }).success, false);
});

test('plain text is bounded and rejects markup, invisible characters and blank required text', () => {
  const limits = [[hypothesisSchema, hypothesis(), 'title', 200], [hypothesisSchema, hypothesis(), 'claim', 600],
    [hypothesisSchema, hypothesis(), 'prediction', 300], [findingSchema, finding(), 'summary', 800],
    [findingSchema, finding(), 'limitations', 600], [reviewSchema, samples[2], 'notes', 600]];
  for (const [schema, sample, field, max] of limits) {
    assert.equal(schema.safeParse({ ...sample, [field]: 'x'.repeat(max) }).success, true, field);
    for (const value of ['x'.repeat(max + 1), '', '   ', '<script>alert(1)</script>', '[go](https://example.org)', '[go][target]', '[target]: https://example.org', 'invisible\u202etext', 'null\0text']) {
      assert.equal(schema.safeParse({ ...sample, [field]: value }).success, false, `${field}: ${value}`);
    }
  }
  assert.equal(hypothesisSchema.safeParse(hypothesis({ title: 'two\nlines' })).success, false);
  assert.equal(hypothesisSchema.safeParse(hypothesis({ claim: 'Two lines\nof plain data.' })).success, true);
  for (const field of ['model', 'harness']) {
    assert.equal(hypothesisSchema.safeParse(hypothesis({ agent: { model: 'Fixture', harness: 'Fixture', [field]: 'x'.repeat(101) } })).success, false);
  }
  for (const note of ['x'.repeat(201), 'two\nlines', '<b>html</b>']) {
    assert.equal(graftSchema.safeParse({ finding: 'fixture', sha256: 'a'.repeat(64), note }).success, false);
  }
});

test('record dates, identities, ids, references and mandatory arrays have strict types', () => {
  for (const date of ['2026-02-30', 'not-a-date', '2026-1-01', 20261110]) {
    schemas.forEach((schema, i) => assert.equal(schema.safeParse({ ...samples[i], date }).success, false));
  }
  assert.equal(hypothesisSchema.safeParse(hypothesis({ date: '2024-02-29' })).success, true);
  // Oracle: YAML 1.1 parsers (Astro frontmatter) load an unquoted date as a UTC-midnight Date.
  assert.equal(hypothesisSchema.parse(hypothesis({ date: new Date(Date.UTC(2026, 10, 10)) })).date, '2026-11-10');
  assert.equal(hypothesisSchema.safeParse(hypothesis({ date: new Date(Number.NaN) })).success, false);
  for (const author of ['Upper', 'a--b', '-start', 'end-', 'x'.repeat(40), 'a/b']) {
    assert.equal(hypothesisSchema.safeParse(hypothesis({ author })).success, false);
    assert.equal(reviewSchema.safeParse(review('', { reviewer: author })).success, false);
  }
  for (const id of ['Upper', '../escape', 'under_score', 'double--dash']) {
    assert.equal(hypothesisSchema.safeParse(hypothesis({ benchmark: id })).success, false);
    assert.equal(findingSchema.safeParse(finding({ hypothesis: id })).success, false);
  }
  assert.equal(hypothesisSchema.safeParse(hypothesis({ models: [] })).success, false);
  assert.equal(findingSchema.safeParse(finding({ results: [] })).success, false);
  assert.equal(findingSchema.safeParse(finding({ results: ['../result.json'] })).success, false);
  assert.equal(findingSchema.safeParse(finding({ limitations: undefined })).success, false);
  assert.equal(reviewSchema.safeParse(review('', { checks: [] })).success, false);
  assert.equal(reviewSchema.safeParse(review('', { checks: ['model-approved'] })).success, false);
  assert.equal(reviewSchema.safeParse(review('', { finding_sha256: 'A'.repeat(64) })).success, false);
});
