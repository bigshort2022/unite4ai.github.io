/**
 * Aggregation of evaluation runs. Pure functions over plain data, so pages, the feed and
 * tests share one definition of "a group" and "a ranking".
 */

export interface EvalRun {
  id: string;
  model: string;
  benchmark: string;
  benchmark_version: string;
  score: number;
  n: number;
  run: { date: string; submitter: string; harness: { name: string; version: string }; command: string };
  setup: {
    runtime: string;
    runtime_version: string;
    format: string;
    quantization: string;
    hardware: { device: string; accelerator: string; memory_gb: number };
  };
  perf?: {
    tokens_per_second?: number;
    time_to_first_token_ms?: number;
    peak_memory_gb?: number;
    energy_wh_per_1k_tokens?: number;
  };
  evidence: { sha256: string; url?: string; bytes?: number };
}

/** Runs of one model on one benchmark version in one format and quantization. */
export interface EvalGroup {
  /** Opaque identity of the group: JSON of its five grouping fields, so no field value can collide with another's. */
  key: string;
  model: string;
  benchmark: string;
  benchmark_version: string;
  format: string;
  quantization: string;
  /** Median score of the group's runs. */
  score: number;
  score_min: number;
  score_max: number;
  runs: number;
  /** Smallest item count among the runs. */
  n: number;
  submitters: string[];
  runtimes: string[];
  accelerators: string[];
  /** Median of the runs that measured it; null when none did. */
  tokens_per_second: number | null;
  latest: string;
  run_ids: string[];
}

export interface BenchmarkRef {
  id: string;
  version: string;
  higher_is_better: boolean;
}

export interface LocalSetup {
  runtime: string;
  format: string;
  quantization: string;
  accelerator: string;
  device: string;
  memory_gb: number;
  tokens_per_second: number | null;
}

const unique = (values: string[]) => [...new Set(values)].sort();

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function groupEvals(runs: EvalRun[]): EvalGroup[] {
  const buckets = new Map<string, EvalRun[]>();
  for (const run of runs) {
    const key = JSON.stringify([run.model, run.benchmark, run.benchmark_version, run.setup.format, run.setup.quantization]);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }

  return [...buckets.entries()]
    .map(([key, members]) => {
      const [first] = members;
      const scores = members.map((m) => m.score);
      const speeds = members
        .map((m) => m.perf?.tokens_per_second)
        .filter((value): value is number => typeof value === 'number');
      return {
        key,
        model: first.model,
        benchmark: first.benchmark,
        benchmark_version: first.benchmark_version,
        format: first.setup.format,
        quantization: first.setup.quantization,
        score: median(scores),
        score_min: Math.min(...scores),
        score_max: Math.max(...scores),
        runs: members.length,
        n: Math.min(...members.map((m) => m.n)),
        submitters: unique(members.map((m) => m.run.submitter)),
        runtimes: unique(members.map((m) => m.setup.runtime)),
        accelerators: unique(members.map((m) => m.setup.hardware.accelerator)),
        tokens_per_second: speeds.length ? median(speeds) : null,
        latest: members.map((m) => m.run.date).sort().at(-1) as string,
        run_ids: members.map((m) => m.id).sort(),
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Groups for the benchmark's current version, best first; ties go to the more reproduced group,
 * then to model id, then to group key, so the order never depends on the input order.
 */
export function leaderboard(groups: EvalGroup[], benchmark: BenchmarkRef): EvalGroup[] {
  const direction = benchmark.higher_is_better ? -1 : 1;
  return groups
    .filter((g) => g.benchmark === benchmark.id && g.benchmark_version === benchmark.version)
    .sort((a, b) =>
      direction * (a.score - b.score)
      || b.submitters.length - a.submitters.length
      || a.model.localeCompare(b.model)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Results are self-reported; independent submitters are the trust signal, however many runs one of them made. */
export function reproductionLabel(group: EvalGroup): string {
  const others = group.submitters.length - 1;
  return others > 0 ? `reproduced by ${others}` : 'not yet reproduced';
}

/** Distinct setups a model has been run on, each with its best measured speed. */
export function localSetups(runs: EvalRun[]): LocalSetup[] {
  const setups = new Map<string, LocalSetup>();
  for (const run of runs) {
    const { runtime, format, quantization, hardware } = run.setup;
    const key = JSON.stringify([runtime, format, quantization, hardware.accelerator, hardware.device, hardware.memory_gb]);
    const speed = run.perf?.tokens_per_second ?? null;
    const existing = setups.get(key);
    if (!existing) {
      setups.set(key, {
        runtime,
        format,
        quantization,
        accelerator: hardware.accelerator,
        device: hardware.device,
        memory_gb: hardware.memory_gb,
        tokens_per_second: speed,
      });
    } else if (speed !== null && (existing.tokens_per_second === null || speed > existing.tokens_per_second)) {
      existing.tokens_per_second = speed;
    }
  }
  return [...setups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}
