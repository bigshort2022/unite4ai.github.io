import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTENT_ID, benchmarkSchema, evalResultSchema } from '@unite4ai/schema';
import { benchmark, measuredBenchmark, result } from './fixtures/evals.mjs';

const ok = (schema, value) => schema.safeParse(value).success;
const messages = (schema, value) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? '' : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
};
const submittedBy = (submitter) => result({ run: { ...result().run, submitter } });

test('a complete benchmark and a complete result are accepted', () => {
  assert.equal(ok(benchmarkSchema, benchmark()), true);
  assert.equal(ok(evalResultSchema, result()), true);
  assert.equal(ok(evalResultSchema, result({ perf: { tokens_per_second: 88.2, time_to_first_token_ms: 410 } })), true);
});

test('only deterministic scoring kinds are allowed, so a hosted judge cannot become a per-run bill', () => {
  for (const scoring of ['exact-match', 'multiple-choice', 'canary']) {
    assert.equal(ok(benchmarkSchema, benchmark({ scoring })), true, scoring);
  }
  assert.equal(ok(benchmarkSchema, measuredBenchmark()), true);
  assert.equal(ok(benchmarkSchema, benchmark({ scoring: 'llm-judge' })), false);
});

test('benchmarks need an https source and an open licence', () => {
  assert.equal(ok(benchmarkSchema, benchmark({ source_url: 'http://example.org/items.jsonl' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ license: 'cc-by-nc-4.0' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ source_sha256: 'abc' })), false);
});

test('a benchmark has an item count exactly when its scoring counts items', () => {
  assert.match(messages(benchmarkSchema, benchmark({ scoring: 'exact-match', items: 0 })), /^items: /m);
  assert.match(messages(benchmarkSchema, measuredBenchmark({ items: 5 })), /^items: /m);
});

test('a measured benchmark names the benchmark whose runs it is measured on, and no other benchmark may', () => {
  assert.equal(benchmarkSchema.parse(measuredBenchmark()).measured_on, 'bench-a');
  assert.match(
    messages(benchmarkSchema, measuredBenchmark({ measured_on: undefined })),
    /^measured_on: is required when scoring is "measured"$/m,
  );
  assert.match(
    messages(benchmarkSchema, benchmark({ measured_on: 'bench-b' })),
    /^measured_on: is only for benchmarks whose scoring is "measured"$/m,
  );
  assert.match(messages(benchmarkSchema, measuredBenchmark({ measured_on: 'Bench_A' })), /^measured_on: must be a lowercase id/m);
});

test('a benchmark metric range cannot be inverted', () => {
  const metric = (overrides) => benchmark({ metric: { ...benchmark().metric, ...overrides } });
  assert.match(messages(benchmarkSchema, metric({ min: 100, max: 0 })), /^metric\.min: /m);
  assert.equal(ok(benchmarkSchema, metric({ min: 50, max: 50 })), true);
  assert.equal(ok(benchmarkSchema, metric({ min: undefined, max: -1 })), true);
});

test('a benchmark version that YAML read as a number says to quote it', () => {
  assert.match(messages(benchmarkSchema, benchmark({ version: 1 })), /^version: .*quote/m);
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

test('model and benchmark ids use the one lowercase id grammar', () => {
  for (const id of ['model-a', 'gsm8k-200', '7b', 'a']) assert.equal(CONTENT_ID.test(id), true, id);
  for (const id of ['Model-A', 'model.a', 'model_a', 'model--a', '-model', 'model-', 'org/model', '']) {
    assert.equal(CONTENT_ID.test(id), false, id);
    assert.equal(ok(evalResultSchema, result({ model: id })), false, `model ${id}`);
    assert.equal(ok(evalResultSchema, result({ benchmark: id })), false, `benchmark ${id}`);
  }
  assert.match(messages(evalResultSchema, result({ model: 'Model.A' })), /^model: must be a lowercase id like my-model-7b$/m);
  assert.match(messages(evalResultSchema, result({ benchmark: 'Bench_A' })), /^benchmark: must be a lowercase id like my-model-7b$/m);
});

test('unknown keys are rejected at every level, so a typo cannot silently drop a field', () => {
  assert.equal(ok(benchmarkSchema, benchmark({ slug: 'other-id' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ source_sha265: 'a'.repeat(64) })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ metric: { ...benchmark().metric, direction: 'up' } })), false);
  const unknown = [
    result({ notes: 'free text' }),
    result({ perf: { tokens_per_sec: 88.2 } }),
    result({ run: { ...result().run, host: 'laptop' } }),
    result({ run: { ...result().run, harness: { ...result().run.harness, commit: 'abc' } } }),
    result({ setup: { ...result().setup, context: 4096 } }),
    result({ setup: { ...result().setup, hardware: { ...result().setup.hardware, gpu: 'M2 Max' } } }),
    result({ evidence: { ...result().evidence, sha265: 'abc' } }),
  ];
  unknown.forEach((value, index) => assert.equal(ok(evalResultSchema, value), false, `case ${index}`));
  assert.match(messages(evalResultSchema, result({ perf: { tokens_per_sec: 88.2 } })), /^perf: .*tokens_per_sec/m);
});

test('the submitter is a lowercase GitHub handle', () => {
  for (const handle of ['alice', 'alice-2', 'a', '0x', 'a'.repeat(39)]) {
    assert.equal(ok(evalResultSchema, submittedBy(handle)), true, handle);
  }
  for (const handle of ['Alice', '-a', 'a-', 'a--b', 'a_b', 'a'.repeat(40), '']) {
    assert.equal(ok(evalResultSchema, submittedBy(handle)), false, handle);
  }
  assert.match(messages(evalResultSchema, submittedBy('Alice')), /^run\.submitter: must be a lowercase GitHub handle$/m);
});

test('free-text fields are a single bounded line, so a result cannot smuggle layout or hidden characters onto a page', () => {
  const command = (value) => result({ run: { ...result().run, command: value } });
  assert.equal(ok(evalResultSchema, command('bun run eval -- --prompt "é < ü & 数学" --model \'model-a\'')), true);
  assert.equal(ok(evalResultSchema, command('x'.repeat(2000))), true);
  const message = /^run\.command: must be a single line without control or invisible formatting characters$/m;
  assert.match(messages(evalResultSchema, command('bun run eval\nrm -rf ~')), message);
  assert.match(messages(evalResultSchema, command('bun run eval \u202Elave nur nub')), message);
  assert.match(messages(evalResultSchema, command('bun run eval\u2028next')), message);
  assert.equal(ok(evalResultSchema, command('x'.repeat(2001))), false);

  const multiline = 'two\nlines';
  const bad = [
    result({ benchmark_version: multiline }),
    result({ benchmark_version: '1'.repeat(51) }),
    result({ run: { ...result().run, harness: { name: multiline, version: '0.1.0' } } }),
    result({ run: { ...result().run, harness: { name: 'x'.repeat(101), version: '0.1.0' } } }),
    result({ run: { ...result().run, harness: { name: 'unite4ai-eval', version: multiline } } }),
    result({ run: { ...result().run, harness: { name: 'unite4ai-eval', version: '1'.repeat(101) } } }),
    result({ setup: { ...result().setup, runtime_version: multiline } }),
    result({ setup: { ...result().setup, runtime_version: '1'.repeat(101) } }),
    result({ setup: { ...result().setup, quantization: multiline } }),
    result({ setup: { ...result().setup, quantization: 'q'.repeat(101) } }),
    result({ setup: { ...result().setup, hardware: { ...result().setup.hardware, device: multiline } } }),
    result({ setup: { ...result().setup, hardware: { ...result().setup.hardware, device: 'd'.repeat(201) } } }),
  ];
  bad.forEach((value, index) => assert.equal(ok(evalResultSchema, value), false, `case ${index}`));
});

test('setup.notes is an optional single bounded line, for what the other fields cannot say (thinking on or off)', () => {
  const noted = (notes) => result({ setup: { ...result().setup, notes } });
  assert.equal(ok(evalResultSchema, noted('thinking disabled')), true);
  assert.equal(ok(evalResultSchema, noted('n'.repeat(200))), true);
  assert.match(messages(evalResultSchema, noted('thinking\ndisabled')), /^setup\.notes: must be a single line without control or invisible formatting characters$/m);
  assert.equal(ok(evalResultSchema, noted('n'.repeat(201))), false);
  assert.equal(ok(evalResultSchema, noted('')), false);
});

test('evidence.url is a bounded single-line https URL, because it is printed as a link', () => {
  const linked = (url) => result({ evidence: { ...result().evidence, url } });
  const base = 'https://example.org/';
  assert.equal(ok(evalResultSchema, linked(`${base}raw.jsonl`)), true);
  assert.equal(ok(evalResultSchema, linked(base + 'x'.repeat(500 - base.length))), true);
  assert.equal(ok(evalResultSchema, linked(base + 'x'.repeat(501 - base.length))), false);
  const message = /^evidence\.url: must be a single line without control or invisible formatting characters$/m;
  assert.match(messages(evalResultSchema, linked(`${base}raw\n.jsonl`)), message);
  assert.match(messages(evalResultSchema, linked(`${base}\u202Eraw.jsonl`)), message);
  assert.match(messages(evalResultSchema, linked('http://example.org/raw.jsonl')), /^evidence\.url: must be an https URL$/m);
});

test('a benchmark version is one bounded line, and earlier versions are listed explicitly', () => {
  assert.deepEqual(benchmarkSchema.parse(benchmark()).previous_versions, []);
  assert.deepEqual(benchmarkSchema.parse(benchmark({ version: '2', previous_versions: ['0', '1'] })).previous_versions, ['0', '1']);
  assert.match(messages(benchmarkSchema, benchmark({ previous_versions: ['two\nlines'] })), /^previous_versions\.0: must be a single line/m);
  assert.match(messages(benchmarkSchema, benchmark({ previous_versions: ['1'.repeat(51)] })), /^previous_versions\.0: /m);
  assert.match(messages(benchmarkSchema, benchmark({ previous_versions: [0] })), /^previous_versions\.0: /m);
  assert.match(messages(benchmarkSchema, benchmark({ previous_versions: '0' })), /^previous_versions: /m);

  assert.match(messages(benchmarkSchema, benchmark({ version: 'two\nlines' })), /^version: must be a single line/m);
  assert.match(messages(benchmarkSchema, benchmark({ version: '1'.repeat(51) })), /^version: /m);
  assert.match(messages(benchmarkSchema, benchmark({ version: '' })), /^version: /m);
});

const METHOD = { runs: 5, temperature: 0.7, top_p: 1 };
/** Shape only: whether the numbers agree is the validator's job (validate-evals.test.mjs). */
const REPEAT = {
  ...METHOD,
  item_pass_histogram: [0, 0, 0, 0, 0, 200],
  run_correct: [200, 200, 200, 200, 200],
  pass_1: 100,
  pass_1_ci: [100, 100],
  pass_k: 100,
  pass_k_ci: [98.12, 100],
  run_score_sd: 0,
  seconds_total: 1000,
  seconds_per_success: 1,
};

test('a benchmark may fix a repeat-run method of 2 to 20 runs, and a measured benchmark may not', () => {
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: METHOD })), true);
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: { ...METHOD, runs: 1 } })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: { ...METHOD, runs: 21 } })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: { ...METHOD, top_p: 0 } })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: { ...METHOD, temperature: 2.5 } })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ repeat: { ...METHOD, seed: 1 } })), false);
  assert.match(messages(benchmarkSchema, measuredBenchmark({ repeat: METHOD })), /^repeat: is only for benchmarks that score items/m);
});

test('a result may carry a repeat block; its rates are percentages and its intervals are pairs', () => {
  assert.equal(ok(evalResultSchema, result({ repeat: REPEAT })), true);
  assert.equal(ok(evalResultSchema, result({ repeat: { ...REPEAT, pass_1: 101 } })), false);
  assert.equal(ok(evalResultSchema, result({ repeat: { ...REPEAT, pass_k_ci: [90] } })), false);
  assert.equal(ok(evalResultSchema, result({ repeat: { ...REPEAT, run_correct: [200.5, 200, 200, 200, 200] } })), false);
  assert.equal(ok(evalResultSchema, result({ repeat: { ...REPEAT, typo: 1 } })), false);
});
