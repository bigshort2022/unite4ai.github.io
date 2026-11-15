import { execFileSync } from 'node:child_process';
import { EVAL_ACCELERATORS } from '@unite4ai/schema';

export interface Hardware {
  device: string;
  accelerator: (typeof EVAL_ACCELERATORS)[number];
  memory_gb: number;
}

/** Detects the machine on macOS; anything passed in `overrides` wins. Other platforms must pass all three. */
export function detectHardware(overrides: Partial<Hardware> = {}): Hardware {
  const detected: Partial<Hardware> = {};
  if (process.platform === 'darwin') {
    const sysctl = (key: string) => execFileSync('sysctl', ['-n', key], { encoding: 'utf8' }).trim();
    detected.device = `${sysctl('machdep.cpu.brand_string')} (${sysctl('hw.model')})`;
    detected.accelerator = process.arch === 'arm64' ? 'apple-silicon' : 'cpu';
    detected.memory_gb = Math.round(Number(sysctl('hw.memsize')) / 2 ** 30);
  }
  const merged = { ...detected };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) Object.assign(merged, { [key]: value });
  }
  if (!merged.device || !merged.accelerator || !merged.memory_gb) {
    throw new Error('could not detect this machine; pass --device, --accelerator and --memory-gb');
  }
  return merged as Hardware;
}
