import { BOOTSTRAP_RESAMPLES } from '@unite4ai/core/repeat';
import type { RepeatResult } from '@unite4ai/schema';
import type { EvalExportInput } from './eval-export-types.ts';

/** Project public aggregates into Every Eval Ever 0.3.0 without inferring missing run metadata. */
export function renderEveryEval({ run, benchmark, model, hfModel, resultUrl, evidenceUrl }: EvalExportInput) {
  const { n, repeat, setup } = run;
  const { date, harness } = run.run;
  const current = run.benchmark_version === benchmark.version;
  const sourceDigest = current ? benchmark.source_sha256 : undefined;
  const hosted = setup.runtime === 'api';
  const hostedModel = hosted ? setup.served_model : undefined;
  const matchedArtifact = !hosted && hfModel === setup.served_model ? hfModel : undefined;
  const retrievedTimestamp = String(Date.parse(`${date}T00:00:00Z`) / 1000);

  const sourceData = {
    dataset_name: current ? benchmark.measured_on ?? benchmark.name : run.benchmark,
    source_type: 'url',
    url: [sourceDigest === undefined ? resultUrl : benchmark.source_url],
    additional_details: {
      unite4ai_source_reference: sourceDigest !== undefined ? 'benchmark_definition'
        : current ? 'result_page_no_source_digest' : 'historical_result_page',
      ...(sourceDigest === undefined ? {} : { unite4ai_source_sha256: sourceDigest }),
    },
  };
  const metricRow = (metricId: string) => ({
    evaluation_result_id: `${run.id}/${metricId}`,
    evaluation_name: current ? benchmark.name : run.benchmark,
    source_data: sourceData,
  });
  const details = { unite4ai_n: String(n) };
  const reportedScore = () => {
    const metric = benchmark.metric;
    const metricId = `unite4ai.${run.benchmark}.v${run.benchmark_version}`;
    return {
      ...metricRow(metricId),
      metric_config: {
        metric_id: metricId,
        ...(current ? {
          evaluation_description: benchmark.summary,
          metric_name: metric.name,
          ...(metric.unit !== '' ? { metric_unit: metric.unit } : {}),
          lower_is_better: !metric.higher_is_better,
          ...(metric.min !== undefined ? { min_score: metric.min } : {}),
          ...(metric.max !== undefined ? { max_score: metric.max } : {}),
          additional_details: { unite4ai_scoring: benchmark.scoring },
        } : {
          lower_is_better: false,
          additional_details: {
            unite4ai_metric_direction: 'unknown; lower_is_better is required, so false is a placeholder, not a ranking direction',
          },
        }),
      },
      score_details: { score: run.score, details },
    };
  };
  const repeatRows = (observed: RepeatResult) => {
    const { runs, temperature, top_p } = observed;
    const generation = { generation_args: { temperature, top_p } };
    const asRepeatRow = (all: boolean) => {
      const metricId = all ? 'unite4ai.all_runs_pass_at_k' : 'pass_at_k';
      const [lower, upper] = all ? observed.pass_k_ci : observed.pass_1_ci;
      return {
        ...metricRow(metricId),
        metric_config: {
          metric_id: metricId,
          metric_name: all ? `All-runs pass@${runs}` : 'Mean pass@1',
          evaluation_description: all
            ? 'Percentage of items correct in every run, not the conventional at-least-one pass@k.'
            : 'Mean percentage correct over the observed runs on the same items.',
          metric_kind: 'pass_rate',
          metric_unit: 'percent',
          metric_parameters: { k: all ? runs : 1, runs },
          lower_is_better: false,
          min_score: 0,
          max_score: 100,
        },
        score_details: {
          score: all ? observed.pass_k : observed.pass_1,
          details,
          uncertainty: {
            confidence_interval: {
              lower, upper, confidence_level: 0.95,
              method: all ? 'Wilson score' : 'item-level percentile bootstrap',
            },
            num_samples: n,
            ...(all ? {} : { num_bootstrap_samples: BOOTSTRAP_RESAMPLES }),
          },
        },
        generation_config: generation,
      };
    };
    return [asRepeatRow(true), asRepeatRow(false)];
  };

  const modelId = hostedModel ?? matchedArtifact ?? run.model;
  return {
    schema_version: '0.3.0',
    evaluation_id: `${run.benchmark}/${run.model}/${retrievedTimestamp}-${run.id}`,
    retrieved_timestamp: retrievedTimestamp,
    source_metadata: {
      source_name: 'Unite4AI evaluation results',
      source_type: 'documentation',
      source_organization_name: 'Unite4AI',
      evaluator_relationship: 'other',
      additional_details: {
        unite4ai_result_url: resultUrl,
        unite4ai_evidence_url: evidenceUrl,
        unite4ai_run_date: date,
        unite4ai_retrieved_timestamp_basis: 'Recorded UTC run date at midnight (date-only surrogate, not an observed retrieval time).',
        unite4ai_benchmark_version: run.benchmark_version,
        ...(repeat !== undefined ? { unite4ai_repeat_v1: JSON.stringify(repeat) } : {}),
      },
    },
    model_info: {
      name: model?.name ?? modelId,
      id: modelId,
      ...(hosted
        ? run.api && { inference_platform: run.api.provider }
        : { inference_engine: { name: setup.runtime, version: setup.runtime_version } }),
      additional_details: {
        deployment_type: hosted ? 'externally_managed' : 'self_deployed',
        model_availability: model?.openWeights === undefined ? 'unknown' : model.openWeights ? 'open_weights' : 'closed_weights',
        unite4ai_model_identity: hostedModel !== undefined ? 'reported_api_served_model'
          : matchedArtifact !== undefined ? 'matched_hf_artifact' : 'local_card_id',
      },
    },
    eval_library: { name: harness.name, version: harness.version },
    evaluation_results: [
      // Current repeat results report pass_k as their primary score. Some historical
      // records may make no such guarantee, so keep a distinct recorded score if present.
      ...(repeat === undefined || run.score !== repeat.pass_k ? [reportedScore()] : []),
      ...(repeat === undefined ? [] : repeatRows(repeat)),
    ],
  };
}
