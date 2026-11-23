import type { BaselineData, EvalResult } from '@unite4ai/schema';

type BaselineEntry = BaselineData['entries'][number];
type BaselineSetup = Omit<BaselineEntry, 'id' | 'registered_on' | 'withdrawal'>;

export function baselineVersionKey(benchmark: string, version: string): string {
  return JSON.stringify([benchmark, version]);
}

/** The identity within a manifest; dates decide eligibility, not setup identity. */
export function baselineSetupKey(entry: BaselineSetup): string {
  return JSON.stringify([
    entry.model, entry.model_card ?? null, entry.served_model, entry.submitter,
    entry.runtime, entry.provider ?? null, entry.format, entry.quantization,
    entry.hardware.device, entry.hardware.accelerator, entry.hardware.memory_gb,
  ]);
}

/** Registration and withdrawal dates are inclusive. Withdrawal does not erase earlier evidence. */
export function matchingBaseline(
  manifest: BaselineData | undefined,
  result: EvalResult,
  hasLocalModel: boolean,
): BaselineEntry | undefined {
  const servedModel = result.setup.served_model;
  if (manifest === undefined || servedModel === undefined
    || manifest.benchmark !== result.benchmark || manifest.benchmark_version !== result.benchmark_version) return undefined;

  const isApi = result.setup.runtime === 'api';
  const provider = isApi ? result.api?.provider : undefined;
  const modelCard = isApi ? result.api?.model_card : undefined;
  if ((isApi && provider === undefined) || (!hasLocalModel && modelCard === undefined)) return undefined;
  const setupKey = baselineSetupKey({
    ...result.setup,
    served_model: servedModel,
    model: result.model,
    model_card: modelCard,
    provider,
    submitter: result.run.submitter,
  });
  const date = result.run.date;
  return manifest.entries.find((entry) => date >= entry.registered_on
    && (entry.withdrawal === undefined || date <= entry.withdrawal.date)
    && baselineSetupKey(entry) === setupKey);
}
