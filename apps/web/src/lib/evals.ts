import { getCollection, type CollectionEntry } from 'astro:content';
import { baselineVersionKey, byCodeUnit, groupEvals, indistinguishableFrom, leaderboard, matchingBaseline, type EvalGroup } from '@unite4ai/core';
import { EVAL_CATEGORIES, bfclCalibrationSchema, type BaselineData, type EvalResult, type RepeatResult } from '@unite4ai/schema';
import { REPO } from './site';

export const SUBMIT_GUIDE = `${REPO}/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result`;
/** The no-git route: the issue form a maintainer turns into a pull request. */
export const RESULT_ISSUE_FORM = `${REPO}/issues/new?template=submit-eval-result.yml`;

export const CATEGORIES = EVAL_CATEGORIES;
export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  quality: 'Quality',
  security: 'Security',
  efficiency: 'Efficiency',
};

type EvalPageRun = EvalResult & { id: string };

interface BaselineRow {
  entry: BaselineData['entries'][number];
  anchor: string;
  runs: EvalPageRun[];
}

const calibrationPath = '../content/calibrations/bfcl-multiple-50-v1.json';
const calibrationData = import.meta.glob('../content/calibrations/bfcl-multiple-50-v1.json', {
  eager: true,
  import: 'default',
})[calibrationPath];
const bfclCalibration = calibrationData === undefined ? undefined : bfclCalibrationSchema.parse(calibrationData);

/** A benchmark with the leaderboard of its current version and its runs, newest first (runs on one date order by id). */
export interface Board {
  benchmark: CollectionEntry<'benchmarks'>;
  /** A speed on one machine does not outrank a speed on another: a measured board is sorted, not ranked. */
  measured: boolean;
  /** Empty when the current version has no result. */
  rows: EvalGroup[];
  /** Per row, "not distinguishable from #j" when its 95% interval overlaps a higher-ranked row's; null otherwise. */
  rankNotes: (string | null)[];
  /** Runs of the current version. */
  runs: EvalPageRun[];
  /** Runs of any other version: kept on the benchmark page, off the leaderboard. */
  earlierRuns: EvalPageRun[];
  /** Current and previous versions that have a manifest, in that order. */
  registered: { version: string; entries: BaselineRow[] }[];
  /** Run ID to baseline anchor, or null for an unregistered setup on a version with a manifest. */
  runBaselines: Map<string, string | null>;
}

/**
 * Everything the evaluation pages need, loaded once per page. Throws, failing the build,
 * for missing model and benchmark references. API-only runs can cite an upstream card.
 */
export async function loadEvals() {
  const [benchmarks, evals, models, baselines] = await Promise.all([
    getCollection('benchmarks'),
    getCollection('evals'),
    getCollection('models'),
    getCollection('baselines'),
  ]);
  const runs: EvalPageRun[] = evals.map((entry) => ({ id: entry.id, ...entry.data }));
  const modelNames = new Map(models.map((model) => [model.id, model.data.name]));
  const baselineByVersion = new Map(baselines.map(({ data }) => [baselineVersionKey(data.benchmark, data.benchmark_version), data]));

  function modelReference(id: string, upstream?: string) {
    const name = modelNames.get(id);
    return name === undefined ? { name: id, url: upstream } : { name, url: `/registry/models/${id}`, upstream };
  }

  function groupModelReference(row: EvalGroup) {
    return modelReference(row.model, row.api?.model_card);
  }

  const benchmarkIds = new Set(benchmarks.map((benchmark) => benchmark.id));
  const dangling: string[] = [];
  for (const run of runs) {
    if (!modelNames.has(run.model) && !(run.setup.runtime === 'api' && run.api?.model_card !== undefined)) {
      dangling.push(`evals/${run.id}: model "${run.model}" has no card in models/`);
    }
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
    modelReference,
    groupModelReference,
    bfclCalibration,
    /** One board per benchmark, in the same order. */
    boards: ordered.map((benchmark): Board => {
      const own = runs
        .filter((run) => run.benchmark === benchmark.id)
        .sort((a, b) => byCodeUnit(b.run.date, a.run.date) || byCodeUnit(a.id, b.id));
      const rows = leaderboard(groups, {
        id: benchmark.id,
        version: benchmark.data.version,
        higher_is_better: benchmark.data.metric.higher_is_better,
      });
      const runBaselines = new Map<string, string | null>();
      const registered = [...new Set([benchmark.data.version, ...benchmark.data.previous_versions])]
        .flatMap((version) => {
          const manifest = baselineByVersion.get(baselineVersionKey(benchmark.id, version));
          if (manifest === undefined) return [];
          const entries: BaselineRow[] = manifest.entries.map((entry) => ({
            entry,
            // Entry ids never contain "--", so different version/id pairs cannot collide.
            anchor: `baseline-${encodeURIComponent(version)}--${entry.id}`,
            runs: [],
          }));
          const byEntry = new Map(entries.map((row) => [row.entry.id, row]));
          for (const run of own) {
            if (run.benchmark_version !== version) continue;
            const entry = matchingBaseline(manifest, run, modelNames.has(run.model));
            const row = entry === undefined ? undefined : byEntry.get(entry.id);
            row?.runs.push(run);
            runBaselines.set(run.id, row?.anchor ?? null);
          }
          return [{ version, entries }];
        });
      return {
        benchmark,
        measured: byHardware.has(benchmark.id),
        rows,
        rankNotes: indistinguishableFrom(rows).map((above) => (above === null ? null : `not distinguishable from #${above + 1}`)),
        runs: own.filter((run) => run.benchmark_version === benchmark.data.version),
        earlierRuns: own.filter((run) => run.benchmark_version !== benchmark.data.version),
        registered,
        runBaselines,
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

/** Name an API provider and checkpoint, or the local runtimes (with versions on measured boards). */
export function runtimeLabel(group: EvalGroup): string {
  if (group.api !== undefined) return `API · ${group.api.provider} · ${group.api.served_model}`;
  return group.runtime === null
    ? group.runtimes.join(', ')
    : `${group.runtime} ${(group.runtime_versions ?? []).join(', ')}`;
}

/** A machine and its memory ("MacBook Pro · 32 GB"): a run's, or that of a group grouped by hardware; null for a group that pools machines. */
export function deviceLine(machine: { device: string | null; memory_gb: number | null }): string | null {
  return machine.device === null ? null : `${machine.device} · ${machine.memory_gb} GB`;
}

/** "60–64" when the group's runs disagree, null when they all scored the same. */
export function scoreRange(group: EvalGroup): string | null {
  return group.score_min === group.score_max
    ? null
    : `${formatNumber(group.score_min)}–${formatNumber(group.score_max)}`;
}

/** A row's run count; each result of a repeat-run benchmark is several runs, so there it counts results ("1 result"). */
export function runsLabel(count: number, repeated: boolean): string {
  const [one, many] = repeated ? ['result', 'results'] : ['run', 'runs'];
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What a repeat-run result adds under its score: the score's 95% interval, pass@1 with its
 * 95% interval, and the per-run scores' range (one value when every run scored the same) and
 * standard deviation in percentage points.
 */
export function repeatLines(repeat: RepeatResult, n: number): string[] {
  const range = ([low, high]: readonly [number, number]) => `${formatNumber(low)}–${formatNumber(high)}%`;
  const perRun = repeat.run_correct.map((correct) => (100 * correct) / n);
  const [lowest, highest] = [formatNumber(Math.min(...perRun)), formatNumber(Math.max(...perRun))];
  return [
    `score 95% CI ${range(repeat.pass_k_ci)}`,
    `pass@1 ${formatNumber(repeat.pass_1)}% (95% CI ${range(repeat.pass_1_ci)})`,
    `per run ${lowest === highest ? lowest : `${lowest}–${highest}`}%, sd ${formatNumber(repeat.run_score_sd)} pts`,
  ];
}

/** Keep measured usage separate from money. Missing usage and zero-success ratios are not zeros. */
export function resourceLines(repeat: RepeatResult): string[] {
  const lines: string[] = [];
  const add = (total: number | undefined, ratio: number | undefined, unit: string, label = '') => {
    if (total === undefined) return;
    lines.push(`${label}${formatNumber(total)} ${unit} total${ratio === undefined ? '' : ` · ${formatNumber(ratio)} ${unit} per success`}`);
  };
  add(repeat.seconds_total, repeat.seconds_per_success, 's');
  add(repeat.prompt_tokens_total, repeat.prompt_tokens_per_success, 'prompt tokens');
  add(repeat.completion_tokens_total, repeat.completion_tokens_per_success, 'completion tokens');
  if (repeat.energy_wh_total !== undefined) {
    const successes = repeat.run_correct.reduce((sum, correct) => sum + correct, 0);
    add(repeat.energy_wh_total, successes === 0 ? undefined : repeat.energy_wh_total / successes, 'Wh', 'Measured energy: ');
  }
  return lines;
}
