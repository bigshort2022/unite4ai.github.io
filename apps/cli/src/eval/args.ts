import { basename, join } from 'node:path';
import { EVAL_ACCELERATORS, EVAL_FORMATS, EVAL_RUNTIMES, evalResultSchema } from '@unite4ai/schema';
import { withoutCredentials } from './client.ts';
import type { Hardware } from './hardware.ts';
import type { EvalOptions } from './run.ts';

const REQUIRED = ['benchmark', 'model', 'served-model', 'submitter', 'runtime', 'runtime-version', 'format', 'quantization'];
const OPTIONAL = ['notes', 'base-url', 'max-seconds', 'source-file', 'device', 'accelerator', 'memory-gb'];

export const EVAL_USAGE = `usage: bun run eval -- --benchmark <id> --model <model-card-id> --served-model <id of the model the server has loaded>
  --submitter <github-handle> --runtime <${EVAL_RUNTIMES.join('|')}> --runtime-version <version>
  --format <${EVAL_FORMATS.join('|')}> --quantization <text, e.g. 4bit or Q4_K_M or none>
  [--notes <one line about the setup, e.g. "thinking disabled">]
  [--base-url <url>] [--source-file <path>]
  [--max-seconds 3600] (per invocation: a resumed run gets a fresh limit)
  [--device <text>] [--accelerator <${EVAL_ACCELERATORS.join('|')}>] [--memory-gb <number>]`;

const quote = (arg: string) => (/^[\w./:@=,+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);

function oneOf(flag: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) throw new Error(`--${flag} must be one of: ${allowed.join(', ')}`);
}

function positive(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${flag} must be a positive number`);
  return parsed;
}

export function parseEvalArgs(
  argv: string[],
  context: { root: string; env: Record<string, string | undefined> },
): EvalOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || ![...REQUIRED, ...OPTIONAL].includes(name)) throw new Error(`unknown flag ${argv[i]}\n${EVAL_USAGE}`);
    if (argv[i + 1] === undefined) throw new Error(`--${name} needs a value\n${EVAL_USAGE}`);
    flags.set(name, argv[i + 1]);
  }
  const missing = REQUIRED.filter((name) => !flags.has(name));
  if (missing.length > 0) throw new Error(`missing: ${missing.map((name) => `--${name}`).join(', ')}\n${EVAL_USAGE}`);
  const get = (name: string) => flags.get(name) as string;

  oneOf('runtime', get('runtime'), EVAL_RUNTIMES);
  oneOf('format', get('format'), EVAL_FORMATS);
  // The same pattern the content gate applies to run.submitter.
  if (!evalResultSchema.shape.run.shape.submitter.safeParse(get('submitter')).success) {
    throw new Error('--submitter must be a lowercase GitHub handle');
  }

  const hardware: Partial<Hardware> = {};
  if (flags.has('device')) hardware.device = get('device');
  if (flags.has('accelerator')) {
    oneOf('accelerator', get('accelerator'), EVAL_ACCELERATORS);
    hardware.accelerator = get('accelerator') as Hardware['accelerator'];
  }
  if (flags.has('memory-gb')) hardware.memory_gb = positive('memory-gb', get('memory-gb'));

  const baseUrl = (flags.get('base-url') ?? context.env.AGENT_MODEL_BASE_URL ?? 'http://127.0.0.1:18082/v1').replace(/\/$/, '');
  if (!/^https?:\/\//.test(baseUrl) || !URL.canParse(baseUrl)) {
    throw new Error('--base-url must be a URL like http://127.0.0.1:18082/v1');
  }
  // The command is published with the result: it always says which server the run used, and
  // it gives away neither a local path nor a password.
  const published = argv.map((arg, index) => {
    const flag = index % 2 === 1 ? argv[index - 1] : null;
    if (flag === '--source-file') return basename(arg);
    if (flag === '--base-url') return withoutCredentials(baseUrl);
    return arg;
  });
  if (!flags.has('base-url')) published.push('--base-url', withoutCredentials(baseUrl));
  return {
    benchmark: get('benchmark'),
    model: get('model'),
    servedModel: get('served-model'),
    submitter: get('submitter'),
    runtime: get('runtime'),
    runtimeVersion: get('runtime-version'),
    format: get('format'),
    quantization: get('quantization'),
    baseUrl,
    contentRoot: join(context.root, 'apps/web/src/content'),
    workDir: join(context.root, '.agent/evals'),
    command: `bun run eval -- ${published.map(quote).join(' ')}`,
    maxSeconds: flags.has('max-seconds') ? positive('max-seconds', get('max-seconds')) : 3600,
    ...(flags.has('notes') ? { notes: get('notes') } : {}),
    ...(flags.has('source-file') ? { sourceFile: get('source-file') } : {}),
    hardware,
  };
}
