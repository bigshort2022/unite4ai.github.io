/**
 * Repeat-run statistics. A result stores counts; every rate and interval is derived here, so
 * the runner that writes a result and the content gate that checks it compute the same numbers.
 * Intervals count items, not answers: the answers to one item are not independent.
 */
import type { RepeatMethod, RepeatResult } from '@unite4ai/schema';

/** z for a two-sided 95% interval. */
const Z = 1.959963984540054;
/** Fixed, so a pass@1 interval is the same on every machine that recomputes it. */
export const BOOTSTRAP_SEED = 20261122;
export const BOOTSTRAP_RESAMPLES = 2000;

const round = (value: number, digits: number) => Number(value.toFixed(digits));
/** A share as a percentage with two decimals; never negative zero, never above 100. */
const percent = (share: number) => round(Math.min(Math.max(share, 0), 1) * 100, 2);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Wilson score interval for `successes` out of `n`, in percent. */
export function wilsonPercent(successes: number, n: number): [number, number] {
  const p = successes / n;
  const z2 = Z * Z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [percent(centre - half), percent(centre + half)];
}

/** mulberry32: a small seeded generator with the same output on every platform. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Percentile bootstrap over items of the share of answers that were correct, in percent.
 * `histogram[j]` items were right in j of `runs` runs.
 */
export function bootstrapPass1Percent(histogram: readonly number[], runs: number): [number, number] {
  const shares = histogram.flatMap((count, passed) => Array<number>(count).fill(passed / runs));
  const n = shares.length;
  const next = generator(BOOTSTRAP_SEED);
  const means: number[] = [];
  for (let resample = 0; resample < BOOTSTRAP_RESAMPLES; resample += 1) {
    let total = 0;
    for (let draw = 0; draw < n; draw += 1) total += shares[Math.floor(next() * n)];
    means.push(total / n);
  }
  means.sort((a, b) => a - b);
  return [
    percent(means[Math.floor(0.025 * BOOTSTRAP_RESAMPLES)]),
    percent(means[Math.ceil(0.975 * BOOTSTRAP_RESAMPLES) - 1]),
  ];
}

/** One answer as the runner recorded it. */
export interface Attempt {
  run: number;
  index: number;
  correct: boolean;
  seconds: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

/** The counts a repeat-run result publishes; everything else is derived from them. */
export type RepeatCounts = Pick<RepeatResult, 'item_pass_histogram' | 'run_correct' | 'seconds_total'>
  & Partial<Pick<RepeatResult, 'prompt_tokens_total' | 'completion_tokens_total'>>;

/** Counts every answer of a finished run. A token total is left out when any answer lacks its count. */
export function tallyAttempts(attempts: readonly Attempt[], itemCount: number, runs: number): RepeatCounts {
  if (attempts.length !== itemCount * runs) {
    throw new Error(`${attempts.length} answers; ${runs} runs of ${itemCount} items need ${itemCount * runs}`);
  }
  const passes = new Array<number>(itemCount).fill(0);
  const runCorrect = new Array<number>(runs).fill(0);
  let seconds = 0;
  let promptTokens: number | null = 0;
  let completionTokens: number | null = 0;
  const seen = new Uint8Array(itemCount * runs);
  for (const attempt of attempts) {
    const { run, index } = attempt;
    if (run < 0 || run >= runs || index < 0 || index >= itemCount) {
      throw new Error(`answer for run ${run} item ${index} is outside ${runs} runs of ${itemCount} items`);
    }
    const key = run * itemCount + index;
    if (seen[key] === 1) throw new Error(`run ${run} item ${index} is answered twice`);
    seen[key] = 1;
    if (attempt.correct) {
      passes[attempt.index] += 1;
      runCorrect[attempt.run] += 1;
    }
    seconds += attempt.seconds;
    promptTokens = promptTokens === null || attempt.promptTokens === null ? null : promptTokens + attempt.promptTokens;
    completionTokens = completionTokens === null || attempt.completionTokens === null ? null : completionTokens + attempt.completionTokens;
  }
  const histogram = new Array<number>(runs + 1).fill(0);
  for (const passed of passes) histogram[passed] += 1;
  return {
    item_pass_histogram: histogram,
    run_correct: runCorrect,
    seconds_total: round(seconds, 3),
    ...(promptTokens === null ? {} : { prompt_tokens_total: promptTokens }),
    ...(completionTokens === null ? {} : { completion_tokens_total: completionTokens }),
  };
}

/** The repeat block of a result: the method, the counts, and every figure derived from them. */
export function repeatSummary(method: RepeatMethod, counts: RepeatCounts): RepeatResult {
  const { runs } = method;
  const histogram = counts.item_pass_histogram;
  const n = sum(histogram);
  const successes = sum(counts.run_correct);
  const everyRun = histogram[runs];
  const scores = counts.run_correct.map((correct) => (100 * correct) / n);
  const mean = sum(scores) / runs;
  const sd = Math.sqrt(sum(scores.map((score) => {
    const d = score - mean;
    return d * d;
  })) / (runs - 1));
  /** Total over correct answers; undefined when the total is unknown or nothing was correct. */
  const perSuccess = (total: number | undefined, digits: number) =>
    (total === undefined || successes === 0 ? undefined : round(total / successes, digits));
  const secondsPerSuccess = perSuccess(counts.seconds_total, 3);
  const promptPerSuccess = perSuccess(counts.prompt_tokens_total, 1);
  const completionPerSuccess = perSuccess(counts.completion_tokens_total, 1);
  return {
    runs,
    temperature: method.temperature,
    top_p: method.top_p,
    item_pass_histogram: [...histogram],
    run_correct: [...counts.run_correct],
    pass_1: percent(successes / (n * runs)),
    pass_1_ci: bootstrapPass1Percent(histogram, runs),
    pass_k: percent(everyRun / n),
    pass_k_ci: wilsonPercent(everyRun, n),
    run_score_sd: round(sd, 2),
    seconds_total: counts.seconds_total,
    ...(secondsPerSuccess === undefined ? {} : { seconds_per_success: secondsPerSuccess }),
    ...(counts.prompt_tokens_total === undefined ? {} : { prompt_tokens_total: counts.prompt_tokens_total }),
    ...(counts.completion_tokens_total === undefined ? {} : { completion_tokens_total: counts.completion_tokens_total }),
    ...(promptPerSuccess === undefined ? {} : { prompt_tokens_per_success: promptPerSuccess }),
    ...(completionPerSuccess === undefined ? {} : { completion_tokens_per_success: completionPerSuccess }),
  };
}

const DERIVED = [
  'pass_1',
  'pass_1_ci',
  'pass_k',
  'pass_k_ci',
  'run_score_sd',
  'seconds_per_success',
  'prompt_tokens_per_success',
  'completion_tokens_per_success',
] as const;

const show = (value: unknown) => (value === undefined ? 'absent' : JSON.stringify(value));

/** What is wrong with a repeat block of a result with `n` items: its counts must fit, and its figures must be theirs. */
export function repeatProblems(repeat: RepeatResult, n: number): string[] {
  const { runs, item_pass_histogram: histogram, run_correct: runCorrect } = repeat;
  const shape: string[] = [];
  if (histogram.length !== runs + 1) {
    shape.push(`repeat.item_pass_histogram must have ${runs + 1} entries, one for each number of runs an item can pass (0 to ${runs})`);
  }
  if (runCorrect.length !== runs) shape.push(`repeat.run_correct must have ${runs} entries, one per run`);
  if (shape.length > 0) return shape;

  const items = sum(histogram);
  if (items !== n) return [`repeat.item_pass_histogram counts ${items} items; the result has n = ${n}`];
  const fromHistogram = histogram.reduce((total, count, passed) => total + count * passed, 0);
  if (sum(runCorrect) !== fromHistogram) {
    return [`repeat.run_correct adds up to ${sum(runCorrect)} correct answers; repeat.item_pass_histogram gives ${fromHistogram}`];
  }
  const fewest = histogram[runs];
  const most = n - histogram[0];
  if (runCorrect.some((correct) => correct < fewest || correct > most)) {
    return [`each repeat.run_correct entry must be between ${fewest} (items right on every run) and ${most} (items right on any run)`];
  }
  const descending = [...runCorrect].sort((a, b) => b - a);
  let best = 0;
  for (let t = 1; t < runs; t += 1) {
    best += descending[t - 1];
    const room = histogram.reduce((total, count, passed) => total + count * Math.min(passed, t), 0);
    if (best > room) {
      return [`repeat.run_correct cannot come from these items: its ${t} best runs have ${best} correct answers, but items passing as in repeat.item_pass_histogram allow at most ${room}`];
    }
  }

  const expected = repeatSummary(repeat, repeat);
  return DERIVED
    .filter((key) => JSON.stringify(repeat[key]) !== JSON.stringify(expected[key]))
    .map((key) => `repeat.${key} is ${show(repeat[key])}; the counts give ${show(expected[key])}`);
}
