import { getCollection, type CollectionEntry } from 'astro:content';
import { byCodeUnit, groupEvals, leaderboard, type EvalGroup, type EvalRun } from '@unite4ai/core';
import { EVAL_CATEGORIES } from '@unite4ai/schema';
import { REPO } from './site';

// The model page still imports it from here.
export { REPO };
export const SUBMIT_GUIDE = `${REPO}/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result`;
/** The no-git route: the issue form a maintainer turns into a pull request. */
export const RESULT_ISSUE_FORM = `${REPO}/issues/new?template=submit-eval-result.yml`;

export const CATEGORIES = EVAL_CATEGORIES;
export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  quality: 'Quality',
  security: 'Security',
  efficiency: 'Efficiency',
};

/** A benchmark with the leaderboard of its current version and its runs, newest first (runs on one date order by id). */
export interface Board {
  benchmark: CollectionEntry<'benchmarks'>;
  /** A speed on one machine does not outrank a speed on another: a measured board is sorted, not ranked. */
  measured: boolean;
  /** Empty when the current version has no result. */
  rows: EvalGroup[];
  /** Runs of the current version. */
  runs: EvalRun[];
  /** Runs of any other version: kept on the benchmark page, off the leaderboard. */
  earlierRuns: EvalRun[];
}

/**
 * Everything the evaluation pages need, loaded once per page. Throws, failing the build, when
 * a result references a model or benchmark that is not in its collection.
 */
export async function loadEvals() {
  const [benchmarks, evals, models] = await Promise.all([
    getCollection('benchmarks'),
    getCollection('evals'),
    getCollection('models'),
  ]);
  const runs: EvalRun[] = evals.map((entry) => ({ id: entry.id, ...entry.data }));
  const modelNames = new Map(models.map((model) => [model.id, model.data.name]));

  const benchmarkIds = new Set(benchmarks.map((benchmark) => benchmark.id));
  const dangling: string[] = [];
  for (const run of runs) {
    if (!modelNames.has(run.model)) dangling.push(`evals/${run.id}: model "${run.model}" has no card in models/`);
    if (!benchmarkIds.has(run.benchmark)) {
      dangling.push(`evals/${run.id}: benchmark "${run.benchmark}" is not defined in benchmarks/`);
    }
  }
  if (dangling.length > 0) {
    throw new Error(`Evaluation results reference content that does not exist:\n${dangling.sort(byCodeUnit).join('\n')}`);
  }

  // A measured quantity such as speed only compares on one machine, so those groups are per machine and runtime.
  const byHardware = new Set(benchmarks.filter((b) => b.data.scoring === 'measured').map((b) => b.id));
  const ordered = benchmarks.sort((a, b) =>
    CATEGORIES.indexOf(a.data.category) - CATEGORIES.indexOf(b.data.category)
    || byCodeUnit(a.data.name, b.data.name)
    || byCodeUnit(a.id, b.id));
  const groups = groupEvals(runs, { byHardware });
  return {
    benchmarks: ordered,
    runs,
    /** Distinct runs: a run is one transcript, however many result files it backs. */
    runCount: new Set(runs.map((run) => run.evidence.sha256)).size,
    groups,
    modelNames,
    /** One board per benchmark, in the same order. */
    boards: ordered.map((benchmark): Board => {
      const own = runs
        .filter((run) => run.benchmark === benchmark.id)
        .sort((a, b) => byCodeUnit(b.run.date, a.run.date) || byCodeUnit(a.id, b.id));
      return {
        benchmark,
        measured: byHardware.has(benchmark.id),
        rows: leaderboard(groups, {
          id: benchmark.id,
          version: benchmark.data.version,
          higher_is_better: benchmark.data.metric.higher_is_better,
        }),
        runs: own.filter((run) => run.benchmark_version === benchmark.data.version),
        earlierRuns: own.filter((run) => run.benchmark_version !== benchmark.data.version),
      };
    }),
  };
}

/** Two decimals at most, without trailing zeros (62, 62.5, 62.25); three significant digits below 1 (0.123). */
export function formatNumber(value: number): string {
  return String(Number(Math.abs(value) < 1 ? value.toPrecision(3) : value.toFixed(2)));
}

/** A value with its unit: a percent sign attaches ("62%"), any other unit follows a space ("140.25 tok/s"), no unit adds nothing. */
export function withUnit(text: string, unit: string): string {
  if (unit === '') return text;
  return unit === '%' ? `${text}%` : `${text} ${unit}`;
}

/** The runtimes behind a group: its one runtime with every version run when it is grouped by hardware, otherwise each runtime's name. */
export function runtimeLabel(group: EvalGroup): string {
  return group.runtime === null
    ? group.runtimes.join(', ')
    : `${group.runtime} ${(group.runtime_versions ?? []).join(', ')}`;
}

/** The machine behind a group grouped by hardware ("MacBook Pro · 32 GB"); null for a group that pools machines. */
export function deviceLine(group: EvalGroup): string | null {
  return group.device === null ? null : `${group.device} · ${group.memory_gb} GB`;
}

/** "60–64" when the group's runs disagree, null when they all scored the same. */
export function scoreRange(group: EvalGroup): string | null {
  return group.score_min === group.score_max
    ? null
    : `${formatNumber(group.score_min)}–${formatNumber(group.score_max)}`;
}
