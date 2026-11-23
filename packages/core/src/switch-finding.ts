import type { EvalResult, RepeatResult } from '@unite4ai/schema';
import { deviceKey } from './evals.ts';

/** Identify inference setups without treating annotations or API clients as setup changes. */
export function sameSwitchSetup(a: EvalResult, b: EvalResult): boolean {
  const x = a.setup;
  const y = b.setup;
  if (x.runtime !== y.runtime) return false;
  if (x.runtime === 'api') {
    // A documentation URL may change without any change to the inference target.
    return a.api?.provider === b.api?.provider && x.served_model === y.served_model;
  }
  return a.model === b.model && x.runtime_version === y.runtime_version
    && x.format === y.format && x.quantization === y.quantization
    && x.hardware.accelerator === y.hardware.accelerator && x.hardware.memory_gb === y.hardware.memory_gb
    && deviceKey(x.hardware.device) === deviceKey(y.hardware.device);
}

type SwitchCost = { kind: 'local-seconds'; seconds_per_success?: number } | NonNullable<EvalResult['cost']>;

function switchEvidence(run: EvalResult, repeat: RepeatResult) {
  const cost: SwitchCost | undefined = run.setup.runtime === 'api' ? run.cost : {
    kind: 'local-seconds', seconds_per_success: repeat.seconds_per_success,
  };
  // Even with a cost source, a run without any correct attempt has no per-success value.
  const reported = cost?.kind === 'local-seconds' ? cost.seconds_per_success : cost?.usd_per_success;
  const hasSuccessfulAttempts = repeat.run_correct.some((correct) => correct > 0);
  return { repeat, cost, costPerSuccess: hasSuccessfulAttempts ? reported : undefined, hasSuccessfulAttempts };
}

/** Compare the recorded evidence, not a verdict. Overlap is not a test of equivalence. */
export function compareSwitch(incumbentRun: EvalResult, candidateRun: EvalResult) {
  if (!incumbentRun.repeat || !candidateRun.repeat) return null;
  const incumbent = switchEvidence(incumbentRun, incumbentRun.repeat);
  const candidate = switchEvidence(candidateRun, candidateRun.repeat);
  const [incumbentLow, incumbentHigh] = incumbent.repeat.pass_k_ci;
  const [candidateLow, candidateHigh] = candidate.repeat.pass_k_ci;
  const sameBasis = incumbent.cost?.kind === candidate.cost?.kind;
  return {
    incumbent, candidate,
    passKOverlap: incumbentLow <= candidateHigh && candidateLow <= incumbentHigh,
    candidateCheaper: sameBasis && incumbent.costPerSuccess !== undefined && candidate.costPerSuccess !== undefined
      ? candidate.costPerSuccess < incumbent.costPerSuccess
      : null,
  };
}
