import type { BenchmarkData, EvalResult } from '@unite4ai/schema';
import { EXPORT_FILES, exportPath } from './eval-exports';
import { evalRunPath } from './evals';
import { REPO } from './site';

export const BFCL_BENCHMARK_ID = 'bfcl-multiple-50';
export const BFCL_REFERENCE_ID = 'qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const benchmarkPath = `${base}/evals/${BFCL_BENCHMARK_ID}`;
const sourceSha = 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a';
const repeat = { runs: 5, temperature: 0.7, top_p: 1 } as const;
const matchesRepeat = (candidate?: { runs: number; temperature: number; top_p: number }) =>
  candidate?.runs === repeat.runs && candidate.temperature === repeat.temperature && candidate.top_p === repeat.top_p;

export function bfclReplicationTask(
  benchmarkId: string,
  benchmark: Pick<BenchmarkData, 'version' | 'source_sha256' | 'items' | 'repeat'> | undefined,
  reference: (EvalResult & { id: string }) | undefined,
) {
  if (benchmarkId !== BFCL_BENCHMARK_ID || benchmark?.version !== '1' || benchmark.source_sha256 !== sourceSha
      || benchmark.items !== 50 || !matchesRepeat(benchmark.repeat) || reference?.id !== BFCL_REFERENCE_ID
      || reference.benchmark !== benchmarkId || reference.benchmark_version !== benchmark.version
      || reference.n !== benchmark.items || !matchesRepeat(reference.repeat) || reference.model !== 'qwen3-8-27b'
      || reference.setup.served_model !== 'mlx-community/Qwen3.8-27B-4bit'
      || reference.setup.format !== 'mlx' || reference.setup.quantization !== '4bit' || reference.setup.runtime === 'api') {
    return undefined;
  }
  return {
    id: 'bfcl-multiple-50-v1-replication',
    kind: 'independent_replication',
    card_url: `${benchmarkPath}#replication-task`,
    method_url: `${benchmarkPath}#method`,
    guide_url: `${REPO}/blob/main/docs/exchange/agent-guide.md#bfcl-replication-task`,
    reference: {
      result_id: reference.id,
      submitter: reference.run.submitter,
      result_url: `${base}${evalRunPath(benchmarkId, reference.id)}`,
      evidence_url: exportPath(reference.id, EXPORT_FILES.evidence),
    },
    benchmark: {
      id: benchmarkId, version: benchmark.version, source_sha256: sourceSha, items: benchmark.items,
      repeat, expected_attempts: benchmark.items * repeat.runs,
    },
    artifact: {
      model_card_id: reference.model, served_model: reference.setup.served_model,
      format: reference.setup.format, quantization: reference.setup.quantization, already_loaded: true, thinking: false,
    },
    requirements: {
      accelerator: 'apple-silicon', min_memory_gb: 64, idle_local_host: true,
      independent_contributor: true, run_approval: true, separate_submission_approval: true,
    },
    budget: { max_paid_usd: 0, max_wall_seconds: 3600, runner_max_seconds: 3300, request_timeout_seconds: 90, payout_usd: 0 },
    deliverable: {
      new_results: 1, submission: 'add_only_draft_pr', transcript: 'private_to_reviewer',
      review_checks: ['complete_attempts', 'method_and_artifact', 'observed_setup_and_elapsed_time',
        'scores_and_95_percent_intervals', 'transcript_sha256_and_bytes'],
    },
  } as const;
}

export type BfclReplicationTask = NonNullable<ReturnType<typeof bfclReplicationTask>>;
