import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { benchmarkSchema, evalResultSchema } from '@unite4ai/schema';
import { renderEveryEval } from '../src/lib/eee-export.ts';

const bfclId = 'qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8';
const canaryId = 'qwen3-4b-instruct-2507--canary-injection-v1--bigshort2022--2026-11-15--0f64fdf6';
const speedId = 'qwen3-6-35b-a3b--decode-speed-gsm8k-200--bigshort2022--2026-11-16--9008aeda';
const servedArtifact = 'mlx-community/Qwen3.8-27B-4bit';

function published(id) {
  const content = new URL('../src/content/', import.meta.url);
  const run = evalResultSchema.parse(JSON.parse(readFileSync(new URL(`evals/${id}.json`, content), 'utf8')));
  const page = readFileSync(new URL(`benchmarks/${run.benchmark}.md`, content), 'utf8');
  const benchmark = benchmarkSchema.parse(Bun.YAML.parse(page.split(/^---$/m)[1]));
  return {
    run: { ...run, id }, benchmark,
    resultUrl: `https://unite4ai.example/evals/${run.benchmark}#run-${id}`,
    evidenceUrl: `https://unite4ai.example/data/eval-exports/${id}/evidence.json`,
  };
}

test('the published BFCL export keeps exact scores, denominators, sampling and interval semantics', () => {
  const input = published(bfclId);
  const result = renderEveryEval(input);
  assert.equal(result.schema_version, '0.3.0');
  assert.equal(result.source_metadata.source_type, 'documentation');
  assert.equal(result.source_metadata.evaluator_relationship, 'other');
  const metadata = result.source_metadata.additional_details;
  assert.equal(metadata.unite4ai_result_url, input.resultUrl);
  assert.equal(metadata.unite4ai_evidence_url, input.evidenceUrl);
  assert.deepEqual(JSON.parse(metadata.unite4ai_repeat_v1), input.run.repeat);
  assert.deepEqual(result.eval_library, { name: 'unite4ai-eval', version: '0.3.0' });
  assert.equal(result.retrieved_timestamp, '1795392000');
  assert.equal(metadata.unite4ai_run_date, '2026-11-23');
  assert.match(metadata.unite4ai_retrieved_timestamp_basis, /date-only/);
  assert.equal('evaluation_timestamp' in result, false);
  assert.equal('detailed_evaluation_results' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|Thinking disabled|execution_command/);

  assert.equal(result.evaluation_results.length, 2);
  const [all, mean] = result.evaluation_results;
  assert.equal(mean.metric_config.metric_id, 'pass_at_k');
  assert.equal(mean.metric_config.metric_name, 'Mean pass@1');
  assert.deepEqual(mean.metric_config.metric_parameters, { k: 1, runs: 5 });
  assert.equal(all.metric_config.metric_id, 'unite4ai.all_runs_pass_at_k');
  assert.equal(all.metric_config.metric_name, 'All-runs pass@5');
  assert.deepEqual(all.metric_config.metric_parameters, { k: 5, runs: 5 });
  assert.notEqual(mean.evaluation_result_id, all.evaluation_result_id);
  for (const row of [mean, all]) {
    assert.equal(row.metric_config.metric_unit, 'percent');
    assert.equal(row.metric_config.lower_is_better, false);
    assert.deepEqual(row.source_data.url, [input.benchmark.source_url]);
    assert.equal(row.source_data.additional_details.unite4ai_source_sha256, input.benchmark.source_sha256);
    assert.deepEqual(row.generation_config.generation_args, { temperature: 0.7, top_p: 1 });
    assert.equal(row.score_details.details.unite4ai_n, '50');
    assert.equal(row.score_details.uncertainty.num_samples, 50);
    assert.equal('standard_error' in row.score_details.uncertainty, false);
    assert.equal('standard_deviation' in row.score_details.uncertainty, false);
  }
  assert.equal(mean.score_details.score, 88.8);
  assert.deepEqual(mean.score_details.uncertainty.confidence_interval, {
    lower: 82.4, upper: 94.4, confidence_level: 0.95, method: 'item-level percentile bootstrap',
  });
  assert.equal(mean.score_details.uncertainty.num_bootstrap_samples, 2000);
  assert.equal(all.score_details.score, 76);
  assert.deepEqual(all.score_details.uncertainty.confidence_interval, {
    lower: 62.59, upper: 85.7, confidence_level: 0.95, method: 'Wilson score',
  });
  assert.equal('num_bootstrap_samples' in all.score_details.uncertainty, false);
  assert.equal(JSON.parse(metadata.unite4ai_repeat_v1).run_score_sd, 2.28);
  assert.equal('energy_wh_total' in JSON.parse(metadata.unite4ai_repeat_v1), false);
});

test('evaluation ID is stable, but distinct runs on the same day do not collide', () => {
  const input = published(bfclId);
  const otherId = bfclId.replace(/5e58a1a8$/, '12345678');
  const first = renderEveryEval(input);
  const second = renderEveryEval({ ...input, run: { ...input.run, id: otherId } });
  assert.deepEqual(first, renderEveryEval(input));
  assert.equal(first.evaluation_id, renderEveryEval({ ...input, hfModel: servedArtifact }).evaluation_id);
  assert.ok(first.evaluation_id.endsWith(bfclId));
  assert.ok(second.evaluation_id.endsWith(otherId));
  assert.equal(first.retrieved_timestamp, second.retrieved_timestamp);
  assert.notEqual(first.evaluation_id, second.evaluation_id);
});

test('model identity is separate from local engine, model authorship and hosting provider', () => {
  const input = published(bfclId);
  const model = { name: 'Qwen3.8-27B', openWeights: true };
  const matched = renderEveryEval({ ...input, model, hfModel: servedArtifact }).model_info;
  assert.equal(matched.name, model.name);
  assert.equal(matched.id, servedArtifact);
  assert.deepEqual(matched.inference_engine, {
    name: 'mlx-lm-go', version: input.run.setup.runtime_version,
  });
  assert.equal(matched.additional_details.deployment_type, 'self_deployed');
  assert.equal(matched.additional_details.model_availability, 'open_weights');
  assert.equal(matched.additional_details.unite4ai_model_identity, 'matched_hf_artifact');
  assert.equal('developer' in matched, false);
  assert.equal('inference_platform' in matched, false);

  const unmatched = renderEveryEval({ ...input, model }).model_info;
  assert.equal(unmatched.id, input.run.model);
  assert.equal(unmatched.additional_details.unite4ai_model_identity, 'local_card_id');
  assert.doesNotMatch(JSON.stringify(unmatched), /mlx-community/);
  assert.equal(renderEveryEval({ ...input, model: { name: model.name, openWeights: false } }).model_info
    .additional_details.model_availability, 'closed_weights');

  const hostedServed = 'actual-model-name-2026-11-23';
  const api = {
    provider: 'fixture-provider', terms_url: 'https://example.org/terms',
    terms_checked_on: '2026-11-23', expected_usd: 0, approved_usd: 1,
  };
  const run = {
    ...input.run, model: 'hosted-model', id: bfclId.replace(input.run.model, 'hosted-model'), api,
    setup: { ...input.run.setup, runtime: 'api', served_model: hostedServed, format: 'other', quantization: 'undisclosed' },
    repeat: { ...input.run.repeat, energy_wh_total: 1.2345 },
  };
  const hosted = renderEveryEval({ ...input, run });
  assert.equal(hosted.model_info.id, hostedServed);
  assert.equal(hosted.model_info.inference_platform, api.provider);
  assert.equal(hosted.model_info.additional_details.deployment_type, 'externally_managed');
  assert.equal(hosted.model_info.additional_details.model_availability, 'unknown');
  assert.equal(hosted.model_info.additional_details.unite4ai_model_identity, 'reported_api_served_model');
  assert.equal('developer' in hosted.model_info, false);
  assert.equal('inference_engine' in hosted.model_info, false);
  assert.deepEqual(JSON.parse(hosted.source_metadata.additional_details.unite4ai_repeat_v1), run.repeat);
});

test('a historical canary score does not borrow current source or metric metadata', () => {
  const input = published(canaryId);
  input.run.evidence.url = 'https://example.org/not-an-export-transcript.jsonl';
  const result = renderEveryEval(input);
  const [row] = result.evaluation_results;
  assert.equal(result.evaluation_results.length, 1);
  assert.equal(row.score_details.score, 16);
  assert.equal(row.score_details.details.unite4ai_n, '50');
  assert.equal('uncertainty' in row.score_details, false);
  assert.deepEqual(row.source_data.url, [input.resultUrl]);
  assert.equal(row.source_data.additional_details.unite4ai_source_reference, 'historical_result_page');
  assert.equal(result.source_metadata.additional_details.unite4ai_benchmark_version, '1');
  for (const key of ['metric_unit', 'metric_name', 'evaluation_description', 'min_score', 'max_score', 'metric_parameters']) {
    assert.equal(key in row.metric_config, false, key);
  }
  assert.match(row.metric_config.additional_details.unite4ai_metric_direction, /unknown.*required/i);
  assert.equal('unite4ai_repeat_v1' in result.source_metadata.additional_details, false);
  assert.equal('generation_config' in row, false);
  assert.doesNotMatch(JSON.stringify(result), /not-an-export-transcript|resisted on every run|canary-injection-v1\.jsonl/);
});

test('the measured companion retains native units, original precision and observed n without fabricated stats', () => {
  const input = published(speedId);
  const result = renderEveryEval(input);
  const [row] = result.evaluation_results;
  assert.equal(result.evaluation_results.length, 1);
  assert.equal(row.score_details.score, 25.9);
  assert.equal(row.score_details.details.unite4ai_n, '200');
  assert.equal(row.metric_config.metric_unit, 'tok/s');
  assert.equal(row.metric_config.metric_name, 'decode speed');
  assert.equal(row.metric_config.lower_is_better, false);
  assert.equal(row.metric_config.min_score, 0);
  assert.equal('max_score' in row.metric_config, false);
  assert.equal('uncertainty' in row.score_details, false);
  assert.equal('unite4ai_repeat_v1' in result.source_metadata.additional_details, false);
  assert.deepEqual(row.source_data.url, [input.resultUrl]);
  assert.equal(row.source_data.additional_details.unite4ai_source_reference, 'result_page_no_source_digest');
});
