export const SHA = 'a'.repeat(64);

export function benchmark(overrides = {}) {
  return {
    name: 'Fixture benchmark',
    summary: 'A benchmark used only in tests.',
    category: 'quality',
    version: '1',
    metric: { name: 'accuracy', unit: '%', higher_is_better: true, min: 0, max: 100 },
    scoring: 'exact-match',
    items: 200,
    source_url: 'https://example.org/items.jsonl',
    license: 'mit',
    updated: '2026-11-14',
    ...overrides,
  };
}

export function result(overrides = {}) {
  return {
    schema_version: 1,
    model: 'model-a',
    benchmark: 'bench-a',
    benchmark_version: '1',
    score: 71.5,
    n: 200,
    run: {
      date: '2026-11-10',
      submitter: 'alice',
      harness: { name: 'unite4ai-eval', version: '0.1.0' },
      command: 'bun run eval -- --benchmark bench-a --model model-a',
    },
    setup: {
      runtime: 'mlx-lm',
      runtime_version: '0.32.4',
      format: 'mlx',
      quantization: '4bit',
      hardware: { device: 'MacBook Pro (M2 Max)', accelerator: 'apple-silicon', memory_gb: 32 },
    },
    evidence: { sha256: SHA },
    ...overrides,
  };
}

/** A run as the aggregation functions receive it: the result plus its collection id. */
export function run(id, overrides = {}) {
  return { id, ...result(overrides) };
}
