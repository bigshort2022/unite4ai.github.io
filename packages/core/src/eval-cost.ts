import type { EvalResult, RepeatResult } from '@unite4ai/schema';

type EstimatedCost = Extract<NonNullable<EvalResult['cost']>, { kind: 'models-dev' }>;
export type SnapshotPrices = Omit<EstimatedCost, 'kind' | 'total_usd' | 'usd_per_success'>;

/** Calendar date as used by API approval, estimates, and result records (UTC). */
export function isEvalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function perSuccess(total: number, repeat: RepeatResult): number | undefined {
  const successes = repeat.run_correct.reduce((sum, count) => sum + count, 0);
  return successes === 0 ? undefined : total / successes;
}

/** List-price estimate from all completed attempts; a missing usage count is not zero. */
export function estimatedApiCost(repeat: RepeatResult, prices: SnapshotPrices): EstimatedCost | undefined {
  const { prompt_tokens_total: prompt, completion_tokens_total: completion } = repeat;
  if (prompt === undefined || completion === undefined) return undefined;
  const total = (prompt * prices.input_usd_per_million + completion * prices.output_usd_per_million) / 1e6;
  if (!Number.isFinite(total)) return undefined;
  const per = perSuccess(total, repeat);
  // Copy the source fields explicitly: the gate can also call this with the published record.
  return {
    kind: 'models-dev',
    snapshot_date: prices.snapshot_date,
    snapshot_sha256: prices.snapshot_sha256,
    input_usd_per_million: prices.input_usd_per_million,
    output_usd_per_million: prices.output_usd_per_million,
    total_usd: total,
    ...(per === undefined ? {} : { usd_per_success: per }),
  };
}

/** Provider weight formats and quantization are not known from a hosted chat response. */
export function apiWeightProblem(format: string, quantization: string): string | undefined {
  if (format === 'other' && quantization === 'undisclosed') return undefined;
  return 'runtime api requires setup.format "other" and setup.quantization "undisclosed"';
}

/** Invariants on a schema-checked result. Invoice attribution itself is a contributor assertion. */
export function apiCostProblems(result: EvalResult): string[] {
  const { api, cost, repeat, run, setup } = result;
  const problems: string[] = [];
  if (setup.runtime !== 'api') {
    if (api !== undefined) problems.push('api metadata is only allowed for runtime api');
    if (cost !== undefined) problems.push('cost is only allowed for runtime api');
    return problems;
  }
  if (api === undefined) problems.push('api metadata is required for runtime api');
  if (repeat === undefined) problems.push('repeat evidence is required for runtime api');
  if (!setup.served_model?.trim()) problems.push('nonblank setup.served_model is required for runtime api');
  const weights = apiWeightProblem(setup.format, setup.quantization);
  if (weights !== undefined) problems.push(weights);
  if (!isEvalDate(run.date)) problems.push('run.date must be a calendar date for runtime api');
  if (api !== undefined && api.terms_checked_on > run.date) {
    problems.push('api.terms_checked_on must not be after run.date');
  }
  if (cost === undefined || repeat === undefined) return problems;

  let expectedPerSuccess: number | undefined;
  if (cost.kind === 'models-dev') {
    if (cost.snapshot_date > run.date) problems.push('cost.snapshot_date must not be after run.date');
    const computed = estimatedApiCost(repeat, cost);
    if (computed === undefined) {
      problems.push('models-dev cost needs complete prompt and completion token usage and a finite estimate');
      return problems;
    }
    if (computed.total_usd !== cost.total_usd) problems.push(`cost.total_usd must be ${computed.total_usd} from token totals and rates`);
    expectedPerSuccess = computed.usd_per_success;
  } else {
    expectedPerSuccess = perSuccess(cost.total_usd, repeat);
  }
  if (cost.usd_per_success !== expectedPerSuccess) {
    problems.push(expectedPerSuccess === undefined
      ? 'cost.usd_per_success must be omitted when no attempt succeeded'
      : `cost.usd_per_success must be ${expectedPerSuccess} from total USD and successful attempts`);
  }
  return problems;
}
