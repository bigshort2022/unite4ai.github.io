import { evalResultSchema, type EvalResult } from '@unite4ai/schema';

/**
 * The speed measured during a run, published as its own result for a measured benchmark.
 * It is the same run: same command, setup and transcript evidence. Returns null when the
 * run did not measure decode speed, because nothing is ever estimated.
 */
export function speedResultFrom(main: EvalResult, speedBenchmark: { id: string; version: string }): EvalResult | null {
  const speed = main.perf?.tokens_per_second;
  if (typeof speed !== 'number') return null;
  return evalResultSchema.parse({
    ...main,
    benchmark: speedBenchmark.id,
    benchmark_version: speedBenchmark.version,
    score: speed,
  });
}
