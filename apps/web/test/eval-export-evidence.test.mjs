import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHfModel, renderExportEvidence } from '../src/lib/eval-export-evidence.ts';

const digest = 'a'.repeat(64);
const input = {
  run: {
    id: 'qwen--fixture--alice--2026-11-22--aaaaaaaa', model: 'qwen', benchmark: 'fixture', benchmark_version: '1', score: 0, n: 3,
    run: { date: '2026-11-22', submitter: 'alice', harness: { name: 'harness', version: '1' }, command: 'internal runner command' },
    setup: { runtime: 'mlx-lm', runtime_version: '1', format: 'mlx', quantization: '4bit', served_model: 'mlx-community/qwen-4bit', hardware: { device: 'Mac mini', accelerator: 'apple-silicon', memory_gb: 64 }, notes: 'third-party setup prose' },
    repeat: { runs: 2, temperature: 0.7, top_p: 1, item_pass_histogram: [2, 1, 0], run_correct: [1, 0], pass_1: 16.67, pass_1_ci: [0, 43], pass_k: 0, pass_k_ci: [0, 56], run_score_sd: 23.57, seconds_total: 60, seconds_per_success: 60, completion_tokens_total: 1, completion_tokens_per_success: 1, energy_wh_total: 3.8 },
    evidence: { sha256: digest, bytes: 123, url: 'https://example.test/private-review-bundle' },
  },
  benchmark: { version: '1', scoring: 'canary', metric: { unit: '%', name: 'resisted on every run', higher_is_better: true }, source_sha256: digest, source_url: 'https://example.test/data' },
  model: { name: 'Qwen', openWeights: true }, hfModel: 'mlx-community/qwen-4bit', resultUrl: 'https://unite4ai.test/evals/fixture/#run-a', evidenceUrl: 'https://unite4ai.test/data/evidence.json',
};

test('lossless repeat evidence retains zero and exact optional fields without republishing commands or arbitrary links', () => {
  const document = renderExportEvidence(input);
  assert.deepEqual(document.repeat, input.run.repeat);
  assert.equal(document.score, 0);
  assert.equal(document.n, 3);
  assert.deepEqual(document.evidence, { sha256: digest, bytes: 123 });
  assert.deepEqual(document.run, { date: '2026-11-22', submitter: 'alice', harness: { name: 'harness', version: '1' } });
  assert.equal(Object.hasOwn(document.setup, 'notes'), false);
  assert.equal(Object.hasOwn(document, 'cost'), false);
  assert.equal(document.source_url, input.resultUrl);
  const older = renderExportEvidence({ ...input, run: { ...input.run, benchmark_version: '0' } });
  assert.equal(Object.hasOwn(older, 'metric'), false, 'the historical score has no current metric definition');
  assert.deepEqual(older.repeat, input.run.repeat);
  assert.equal(Object.hasOwn(older, 'benchmark_source'), false, 'current source does not define an old result');
});

test('exact served artifact can be found only in genuine Hugging Face weight links', () => {
  const artifacts = [
    { kind: 'weights', url: 'https://huggingface.co/Qwen/qwen' },
    { kind: 'demo', url: 'https://huggingface.co/mlx-community/qwen-4bit' },
    { kind: 'weights', url: 'https://huggingface.co.evil.test/mlx-community/qwen-4bit' },
  ];
  const servedModel = 'mlx-community/qwen-4bit';
  assert.equal(resolveHfModel(servedModel, artifacts), undefined);
  assert.equal(resolveHfModel(servedModel, [...artifacts, { kind: 'weights', url: 'https://huggingface.co/mlx-community/qwen-4bit/tree/main' }]), servedModel);
  assert.equal(resolveHfModel(undefined, artifacts), undefined);
});
