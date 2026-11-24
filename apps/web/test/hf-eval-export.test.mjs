import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkSchema, evalResultSchema } from '@unite4ai/schema';
import { parseHfBindings, renderHfEval } from '../src/lib/hf-eval-export.ts';

const binding = {
  benchmark: 'fixture-test', version: '2', dataset: 'fixture-org/Test-Dataset',
  task_id: 'fixture-org/first-four', revision: '1234567890'.repeat(4),
  source_sha256: 'a'.repeat(64), metric_unit: '%',
};
const bindings = parseHfBindings([binding]);
const modelId = 'fixture-org/model-4bit';
const input = {
  run: {
    ...evalResultSchema.parse({
      schema_version: 1, model: 'fixture-model', benchmark: binding.benchmark, benchmark_version: binding.version, score: 25, n: 4,
      run: { date: '2026-11-22', submitter: 'alice', harness: { name: 'fixture', version: '1' }, command: 'local fixture command' },
      setup: { runtime: 'mlx-lm', runtime_version: '1', format: 'mlx', quantization: '4bit', served_model: modelId, hardware: { device: 'Fixture', accelerator: 'apple-silicon', memory_gb: 32 } },
      evidence: { sha256: 'b'.repeat(64), bytes: 179, url: 'https://example.test/contributor-evidence' },
    }),
    id: 'fixture-model--fixture-test--alice--2026-11-22--bbbbbbbb',
  },
  benchmark: benchmarkSchema.parse({
    name: 'Fixture', summary: 'Fixture benchmark', category: 'quality', version: binding.version, previous_versions: ['1'],
    metric: { name: 'accuracy', unit: binding.metric_unit, higher_is_better: true, min: 0, max: 100 },
    scoring: 'exact-match', items: 4, source_url: 'https://example.test/fixture', source_sha256: binding.source_sha256,
    license: 'mit', updated: '2026-11-22',
  }),
  model: { name: 'Fixture model', openWeights: true }, hfModel: modelId,
  resultUrl: 'https://unite4ai.test/evals/fixture-test/#run-fixture',
  evidenceUrl: 'https://unite4ai.test/data/fixture/evidence.json?key=a:b&next=%22%23#evidence',
};

function ready(value = input, config = bindings) {
  const result = renderHfEval(value, config);
  assert.equal(result.status, 'ready', JSON.stringify(result));
  return result;
}

function blocked(value, reason, config = bindings) {
  const result = renderHfEval(value, config);
  assert.equal(result.status, 'blocked');
  assert.ok(result.reasons.includes(reason), JSON.stringify(result));
  assert.equal(Object.hasOwn(result, 'yaml'), false);
}

test('an exact binding emits only a Community Evals YAML sequence and links the evidence sidecar', () => {
  const result = ready();
  assert.equal(result.model, modelId);
  assert.match(result.yaml, /^- dataset:\n/);
  assert.match(result.yaml, /^    url: "https:\/\/.*"$/m);
  assert.deepEqual(Bun.YAML.parse(result.yaml), [{
    dataset: { id: binding.dataset, task_id: binding.task_id, revision: binding.revision },
    value: 25,
    date: input.run.run.date,
    source: { url: input.evidenceUrl, name: 'Unite4AI evaluation evidence' },
    notes: 'Published aggregate; unit: %. See source for run setup and evidence.',
  }]);
  assert.equal(ready().yaml, result.yaml);
});

test('zero stays numeric and an empty unit is accepted when the benchmark is unitless', () => {
  const config = parseHfBindings([{ ...binding, metric_unit: '' }]);
  const result = ready({
    ...input,
    run: { ...input.run, score: 0 },
    benchmark: { ...input.benchmark, metric: { ...input.benchmark.metric, unit: '' } },
  }, config);
  const [evaluation] = Bun.YAML.parse(result.yaml);
  assert.equal(evaluation.value, 0);
  assert.match(evaluation.notes, /unit: unitless\./);
});

test('a review for a different benchmark or version does not transfer', () => {
  blocked(input, 'missing_benchmark_binding', parseHfBindings([]));
  blocked({ ...input, run: { ...input.run, benchmark: 'other-benchmark' } }, 'missing_benchmark_binding');
  const historicalRun = { ...input, run: { ...input.run, benchmark_version: '1' } };
  blocked(historicalRun, 'noncurrent_benchmark_version', parseHfBindings([binding, { ...binding, version: '1' }]));
  blocked(input, 'missing_benchmark_binding', parseHfBindings([{ ...binding, version: '02' }]));
});

test('changed or absent method digests and different metric units block export', () => {
  for (const source_sha256 of [undefined, 'c'.repeat(64)]) {
    blocked({ ...input, benchmark: { ...input.benchmark, source_sha256 } }, 'benchmark_source_mismatch');
  }
  blocked(input, 'metric_unit_mismatch', parseHfBindings([{ ...binding, metric_unit: 'fraction' }]));
});

test('hosted runs, unproven model IDs and quantized aliases are not destinations', () => {
  blocked({ ...input, hfModel: undefined }, 'unverified_model_artifact');
  blocked({ ...input, hfModel: 'fixture-org/model' }, 'unverified_model_artifact');
  blocked({ ...input, hfModel: 'Fixture-org/model-4bit' }, 'unverified_model_artifact');
  blocked({ ...input, run: { ...input.run, setup: { ...input.run.setup, served_model: undefined } } }, 'unverified_model_artifact');
  blocked({ ...input, run: { ...input.run, setup: { ...input.run.setup, runtime: 'api' } } }, 'hosted_run');
});

test('binding configuration rejects duplicates, non-plain entries, malformed values and unknown keys', () => {
  assert.throws(() => parseHfBindings([binding, { ...binding, dataset: 'other-org/other-dataset' }]), /duplicate.*fixture-test.*2/i);
  assert.throws(() => parseHfBindings({ bindings: [binding] }), /array/i);
  assert.throws(() => parseHfBindings([Object.assign(Object.create({ inherited: true }), binding)]), /plain object/i);
  const { revision, ...withoutRevision } = binding;
  for (const malformed of [
    { ...binding, benchmark: 'Fixture-Test' },
    { ...binding, version: 2 },
    { ...binding, version: '2\n' },
    { ...binding, dataset: 'https://huggingface.co/datasets/fixture-org/Test-Dataset' },
    { ...binding, dataset: 'fixture-org' },
    { ...binding, dataset: 'fixture-org/Test-Dataset/path' },
    { ...binding, task_id: ' ' },
    { ...binding, revision: 'main' },
    { ...binding, revision: revision.slice(0, 12) },
    { ...binding, source_sha256: `${binding.source_sha256.slice(1)}g` },
    { ...binding, metric_unit: 0 },
    { ...binding, unexpected: true },
    withoutRevision,
  ]) {
    assert.throws(() => parseHfBindings([malformed]), /binding/i);
  }
});
