import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { benchmarkSchema, evalResultSchema, modelSchema } from '../../packages/schema/src/index.ts';
import { resolveHfModel } from '../../apps/web/src/lib/eval-export-evidence.ts';
import { parseHfBindings, renderHfEval } from '../../apps/web/src/lib/hf-eval-export.ts';

const content = new URL('../../apps/web/src/content/', import.meta.url);
const resultId = 'qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8';
const evidenceUrl = `https://unite4ai.com/data/eval-exports/${resultId}/evidence.json`;
const read = (path) => readFileSync(new URL(path, content), 'utf8');
const frontmatter = (path) => Bun.YAML.parse(read(path).split(/^---$/m)[1]);

const run = evalResultSchema.parse(JSON.parse(read(`evals/${resultId}.json`)));
const benchmark = benchmarkSchema.parse(frontmatter(`benchmarks/${run.benchmark}.md`));
const model = modelSchema.parse(frontmatter(`models/${run.model}.md`));
const input = {
  run: { id: resultId, ...run }, benchmark,
  hfModel: resolveHfModel(run.setup.served_model, model.artifacts),
  resultUrl: `https://unite4ai.com/evals/${run.benchmark}#run-${resultId}`,
  evidenceUrl,
};

// A synthetic Hub registration for this test, not a claim of publication or approval.
const fixtureBinding = {
  benchmark: 'bfcl-multiple-50',
  version: '1',
  dataset: 'fixture-org/unite4ai-bfcl-multiple-50',
  task_id: 'bfcl-multiple-50-v1-all-runs-pass-at-5',
  revision: '0123456789abcdef0123456789abcdef01234567',
  source_sha256: 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a',
  metric_unit: '%',
};

test('the published BFCL run projects 76% all-runs accuracy for the exact served artifact', () => {
  const result = renderHfEval(input, parseHfBindings([fixtureBinding]));
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.equal(result.model, 'mlx-community/Qwen3.8-27B-4bit');
  assert.equal(run.repeat.pass_1, 88.8);
  // Compare the entire entry to ensure no verifyToken or HF user claim is emitted.
  assert.deepEqual(Bun.YAML.parse(result.yaml), [{
    dataset: { id: fixtureBinding.dataset, task_id: fixtureBinding.task_id, revision: fixtureBinding.revision },
    value: 76,
    date: '2026-11-23',
    source: { url: evidenceUrl, name: 'Unite4AI evaluation evidence' },
    notes: 'Published aggregate; unit: %. See source for run setup and evidence.',
  }]);
});

test('the published BFCL run has no uploadable YAML without a benchmark binding', () => {
  assert.deepEqual(renderHfEval(input, parseHfBindings([])), {
    status: 'blocked', reasons: ['missing_benchmark_binding'],
  });
});
