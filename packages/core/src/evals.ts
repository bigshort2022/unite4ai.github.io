/**
 * Aggregation of evaluation runs. Pure functions over plain data, so pages, the feed and
 * tests share one definition of "a group" and "a ranking".
 */
import type { RepeatResult } from '@unite4ai/schema';

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
    notes?: string;
  };
  perf?: {
    tokens_per_second?: number;
    time_to_first_token_ms?: number;
    peak_memory_gb?: number;
    energy_wh_per_1k_tokens?: number;
  };
  /** Present on results of repeat-run benchmark versions. */
  repeat?: RepeatResult;
  evidence: { sha256: string; url?: string; bytes?: number };
}

/**
 * Runs of one model on one benchmark version in one format and quantization; for a benchmark
 * grouped by hardware, also with one runtime on one device, accelerator and memory size.
 */
export interface EvalGroup {
  /** Opaque identity of the group: JSON of its grouping fields, so no field value can collide with another's. */
  key: string;
  model: string;
  benchmark: string;
  benchmark_version: string;
  format: string;
  quantization: string;
  /** Set only for benchmarks grouped by hardware (measured quantities); null otherwise. */
  runtime: string | null;
  /** Every version of that runtime among the group's runs. */
  runtime_versions: string[] | null;
  /** As spelt on the group's first run by id. */
  device: string | null;
  memory_gb: number | null;
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
  /** Lowest measured; null when no run measured it. */
  time_to_first_token_ms: number | null;
}

/** Orders strings by UTF-16 code units, so every sort gives the same result in every locale. */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const unique = (values: string[]) => [...new Set(values)].sort();

/** Runs in id order, so "the first run" is the same whatever order they arrive in. */
const byId = (runs: EvalRun[]) => [...runs].sort((a, b) => byCodeUnit(a.id, b.id));

/** One machine however its name was typed: compatibility forms, case and spacing do not tell devices apart. */
function deviceKey(device: string): string {
  return device.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface GroupOptions {
  /** Benchmark ids whose results only compare on the same machine (measured quantities such as speed). */
  byHardware?: ReadonlySet<string>;
}

export function groupEvals(runs: EvalRun[], options: GroupOptions = {}): EvalGroup[] {
  const buckets = new Map<string, EvalRun[]>();
  for (const run of byId(runs)) {
    const fields: (string | number)[] = [run.model, run.benchmark, run.benchmark_version, run.setup.format, run.setup.quantization];
    if (options.byHardware?.has(run.benchmark)) {
      const { device, accelerator, memory_gb } = run.setup.hardware;
      fields.push(run.setup.runtime, deviceKey(device), accelerator, memory_gb);
    }
    const key = JSON.stringify(fields);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }

  return [...buckets.entries()]
    .map(([key, members]) => {
      const [first] = members;
      const byHardware = options.byHardware?.has(first.benchmark) ?? false;
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
        runtime: byHardware ? first.setup.runtime : null,
        runtime_versions: byHardware ? unique(members.map((m) => m.setup.runtime_version)) : null,
        device: byHardware ? first.setup.hardware.device : null,
        memory_gb: byHardware ? first.setup.hardware.memory_gb : null,
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
        run_ids: members.map((m) => m.id),
      };
    })
    .sort((a, b) => byCodeUnit(a.key, b.key));
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
      || byCodeUnit(a.model, b.model)
      || byCodeUnit(a.key, b.key));
}

/** Results are self-reported; independent submitters are the trust signal, however many runs one of them made. */
export function reproductionLabel(group: EvalGroup): string {
  const others = group.submitters.length - 1;
  return others > 0 ? `reproduced by ${others}` : 'not yet reproduced';
}

/**
 * Distinct setups a model has been run on, each with its best measured speed and time to first
 * token, from runs of the current version of their benchmark only: `currentVersions` maps a
 * benchmark id to that version. An earlier version is another workload, so its speed does not
 * belong beside these. The device is spelt as on the setup's first such run by id.
 */
export function localSetups(runs: EvalRun[], currentVersions: ReadonlyMap<string, string>): LocalSetup[] {
  const setups = new Map<string, LocalSetup>();
  for (const run of byId(runs)) {
    if (currentVersions.get(run.benchmark) !== run.benchmark_version) continue;
    const { runtime, format, quantization, hardware } = run.setup;
    const key = JSON.stringify([runtime, format, quantization, hardware.accelerator, deviceKey(hardware.device), hardware.memory_gb]);
    const speed = run.perf?.tokens_per_second ?? null;
    const firstToken = run.perf?.time_to_first_token_ms ?? null;
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
        time_to_first_token_ms: firstToken,
      });
      continue;
    }
    if (speed !== null && (existing.tokens_per_second === null || speed > existing.tokens_per_second)) {
      existing.tokens_per_second = speed;
    }
    if (firstToken !== null && (existing.time_to_first_token_ms === null || firstToken < existing.time_to_first_token_ms)) {
      existing.time_to_first_token_ms = firstToken;
    }
  }
  return [...setups.entries()].sort(([a], [b]) => byCodeUnit(a, b)).map(([, value]) => value);
}
