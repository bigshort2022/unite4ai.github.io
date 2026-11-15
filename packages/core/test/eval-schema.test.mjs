import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkSchema, evalResultSchema } from '@unite4ai/schema';
import { benchmark, result } from './fixtures/evals.mjs';

const ok = (schema, value) => schema.safeParse(value).success;

test('a complete benchmark and a complete result are accepted', () => {
  assert.equal(ok(benchmarkSchema, benchmark()), true);
  assert.equal(ok(evalResultSchema, result()), true);
  assert.equal(ok(evalResultSchema, result({ perf: { tokens_per_second: 88.2, time_to_first_token_ms: 410 } })), true);
});

test('only deterministic scoring kinds are allowed, so a hosted judge cannot become a per-run bill', () => {
  for (const scoring of ['exact-match', 'multiple-choice', 'canary', 'measured']) {
    assert.equal(ok(benchmarkSchema, benchmark({ scoring })), true, scoring);
  }
  assert.equal(ok(benchmarkSchema, benchmark({ scoring: 'llm-judge' })), false);
});

test('benchmarks need an https source and an open licence', () => {
  assert.equal(ok(benchmarkSchema, benchmark({ source_url: 'http://example.org/items.jsonl' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ license: 'cc-by-nc-4.0' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ source_sha256: 'abc' })), false);
});

test('results are rejected when a required part is malformed', () => {
  const bad = [
    result({ schema_version: 2 }),
    result({ n: 0 }),
    result({ evidence: { sha256: 'abc' } }),
    result({ evidence: { sha256: 'a'.repeat(64), url: 'http://example.org/raw.jsonl' } }),
    result({ run: { ...result().run, date: '2026-1-5' } }),
    result({ run: { ...result().run, submitter: 'not a handle' } }),
    result({ setup: { ...result().setup, runtime: 'made-up-runtime' } }),
    result({ setup: { ...result().setup, hardware: { ...result().setup.hardware, memory_gb: 0 } } }),
    result({ perf: { tokens_per_second: -1 } }),
  ];
  bad.forEach((value, index) => assert.equal(ok(evalResultSchema, value), false, `case ${index}`));
  const { evidence: _dropped, ...withoutEvidence } = result();
  assert.equal(ok(evalResultSchema, withoutEvidence), false);
});
