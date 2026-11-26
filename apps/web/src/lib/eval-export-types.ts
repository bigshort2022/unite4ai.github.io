import type { BenchmarkData, EvalResult } from '@unite4ai/schema';

export interface EvalExportInput {
  run: EvalResult & { id: string };
  benchmark: Pick<BenchmarkData, 'name' | 'summary' | 'version' | 'metric' | 'scoring' | 'measured_on' | 'source_url' | 'source_sha256'>;
  model?: { name: string; openWeights?: boolean };
  /** Exact recorded served ID corroborated by the local card's HF weights list. */
  hfModel?: string;
  resultUrl: string;
  evidenceUrl: string;
}
