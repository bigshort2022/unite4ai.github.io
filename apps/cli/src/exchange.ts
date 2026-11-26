import { createHash } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CONTENT_ID, EXCHANGE_RECORD_MAX_BYTES, FINDING_VERDICTS, REVIEW_CHECKS, REVIEW_VERDICTS,
  graftSchema, hypothesisSchema, findingSchema, reviewSchema,
} from '@unite4ai/schema';
import { readExchangeRecords } from '@unite4ai/core/read-exchange';
import { validateEvals } from '@unite4ai/core/validate-evals';
import { validateExchange } from '@unite4ai/core/exchange';
import { UsageError } from './terminal.ts';

const EXCHANGE = 'bun run exchange --';
const hypothesisOptions = `--id ID --title TEXT --claim TEXT --benchmark ID --models ID[,ID]
  --prediction TEXT --author HANDLE --date YYYY-MM-DD`;
const findingOptions = `--id ID --hypothesis ID --results RESULT_ID[,RESULT_ID]
  --verdict ${FINDING_VERDICTS.join('|')} --summary TEXT --limitations TEXT
  --author HANDLE --date YYYY-MM-DD [--supersedes FINDING_ID]
  [--incumbent RESULT_ID --candidate RESULT_ID]`;
const commands = {
  'new-hypothesis': {
    summary: 'Scaffold a hypothesis using existing model and benchmark IDs',
    options: hypothesisOptions,
    notes: 'Models are comma-separated. The claim and prediction must describe your own work.',
    inspect: 'ls apps/web/src/content/benchmarks apps/web/src/content/models',
  },
  'new-finding': {
    summary: 'Scaffold a finding from recorded evaluation results',
    options: findingOptions,
    notes: 'Result IDs are comma-separated filenames without .json. For switch evidence, pass both flags together and include both IDs in --results. For a correction use a new ID and --supersedes OLD_ID.',
    inspect: 'ls apps/web/src/content/hypotheses apps/web/src/content/evals',
  },
  review: {
    summary: 'Record a different account’s review of exact finding bytes',
    options: `--finding ID --reviewer HANDLE --date YYYY-MM-DD
  --verdict ${REVIEW_VERDICTS.join('|')} --checks CHECK[,CHECK] --notes TEXT
  [--finding-sha256 EXPECTED_HASH]`,
    notes: `Checks: ${REVIEW_CHECKS.join(', ')}.
The reviewer must differ from the author. If provided, the hash must match the exact inspected bytes.`,
    inspect: 'shasum -a 256 apps/web/src/content/findings/"$FINDING_ID".json',
  },
  graft: {
    summary: 'Create a new hypothesis or finding that adopts a source finding',
    options: `--kind hypothesis|finding --source FINDING_ID --note TEXT
  [--source-sha256 EXPECTED_HASH] plus the flags for the kind:
  hypothesis: ${hypothesisOptions}
  finding: ${findingOptions}`,
    notes: 'Use a new adopting ID. The source is never edited; an expected hash must match its exact bytes. For switch evidence on an adopting finding, pass both flags together and include both IDs in --results.',
    inspect: 'shasum -a 256 apps/web/src/content/findings/"$SOURCE_FINDING_ID".json',
  },
};

type ExchangeCommand = keyof typeof commands;

export function isExchangeCommand(command: string | undefined): command is ExchangeCommand {
  return command !== undefined && Object.hasOwn(commands, command);
}

export function exchangeHelp(command?: ExchangeCommand): string {
  if (command === undefined) {
    return `usage: ${EXCHANGE} <command> [flags]

${Object.entries(commands).map(([name, help]) => `  ${name.padEnd(15)} ${help.summary}`).join('\n')}

Creation writes a new local record. It never overwrites, runs a model or opens a PR.
Examples:
  ${EXCHANGE} review --help
  ${EXCHANGE} graft --help`;
  }
  const help = commands[command];
  return `usage: ${EXCHANGE} ${command} ${help.options}
  [--content-dir PATH] [--agent-model TEXT --agent-harness TEXT] [--help]

${help.summary}. ${help.notes}
Content defaults to apps/web/src/content. No default date or identity. Supply both agent flags for agent-written records.
Creates a new local record only; no overwrite or publication. Guide: docs/exchange/agent-guide.md

Examples:
  ${EXCHANGE} ${command} --help
  ${help.inspect}`;
}

const common = ['content-dir', 'agent-model', 'agent-harness'];
const authorFields = ['author', 'date'];
const hypothesisFields = ['title', 'claim', 'benchmark', 'models', 'prediction', ...authorFields];
const findingFields = ['hypothesis', 'results', 'verdict', 'summary', 'limitations', ...authorFields];
const reviewFields = ['finding', 'reviewer', 'date', 'verdict', 'checks', 'notes'];

const reviewDraftSchema = reviewSchema.omit({ finding_sha256: true });
const graftDraftSchema = graftSchema.omit({ sha256: true });

function draftValue<T>(parsed: { success: true; data: T } | {
  success: false; error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> };
}): T {
  if (!parsed.success) {
    throw new UsageError(parsed.error.issues.map(({ path, message }) => `${path.map(String).join('.')}: ${message}`).join('; '));
  }
  return parsed.data;
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (!name.startsWith('--')) throw new UsageError(`expected --flag VALUE, got ${name}`);
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${name} needs a value`);
    const key = name.slice(2);
    if (flags.has(key)) throw new UsageError(`duplicate flag ${name}`);
    flags.set(key, value);
  }
  return flags;
}

function requireId(value: string, field: string): string {
  if (!CONTENT_ID.test(value)) throw new UsageError(`${field} must be a lowercase id with single hyphens`);
  return value;
}

/** No content text is ever evaluated or used as instructions. New records only, even for grafts. */
export async function runExchange(argv: string[], repoRoot: string) {
  const [command, ...args] = argv;
  if (!isExchangeCommand(command)) throw new UsageError(command === undefined ? 'missing exchange command' : `unknown command ${command}`);
  const flags = parseFlags(args);
  const kind = command === 'graft' ? flags.get('kind')
    : command === 'new-hypothesis' ? 'hypothesis' : command === 'new-finding' ? 'finding' : 'review';
  if ((kind !== 'hypothesis' && kind !== 'finding' && kind !== 'review') || (command === 'graft' && kind === 'review')) {
    throw new UsageError('graft requires --kind hypothesis|finding');
  }
  const fields = kind === 'hypothesis' ? hypothesisFields : kind === 'finding' ? findingFields : reviewFields;
  const required = [...fields, ...(kind === 'review' ? [] : ['id']),
    ...(command === 'graft' ? ['kind', 'source', 'note'] : [])];
  const allowed = new Set([...required, ...common,
    ...(kind === 'finding' ? ['supersedes', 'incumbent', 'candidate'] : []),
    ...(kind === 'review' ? ['finding-sha256'] : []),
    ...(command === 'graft' ? ['source-sha256'] : [])]);
  for (const key of flags.keys()) if (!allowed.has(key)) throw new UsageError(`unknown flag --${key} for ${command}`);
  const missing = required.filter((key) => !flags.has(key));
  if (missing.length) throw new UsageError(`missing: ${missing.map((key) => `--${key}`).join(', ')}`);
  if (flags.has('agent-model') !== flags.has('agent-harness')) {
    throw new UsageError('--agent-model and --agent-harness must be supplied together');
  }
  if (flags.has('incumbent') !== flags.has('candidate')) {
    throw new UsageError('--incumbent and --candidate must be supplied together');
  }
  const get = (name: string) => flags.get(name)!;
  const data: Record<string, unknown> = Object.fromEntries(fields.map((name) => [name, get(name)]));
  for (const field of ['models', 'results', 'checks']) {
    if (fields.includes(field)) data[field] = get(field).split(',');
  }
  if (flags.has('agent-model')) data.agent = { model: get('agent-model'), harness: get('agent-harness') };
  if (flags.has('supersedes')) data.supersedes = get('supersedes');
  if (flags.has('incumbent')) data.switch = { incumbent: get('incumbent'), candidate: get('candidate') };
  if (flags.has('content-dir') && !get('content-dir').trim()) throw new UsageError('--content-dir needs a nonblank path');
  const draft = kind === 'hypothesis' ? { kind, data: draftValue(hypothesisSchema.safeParse(data)) } as const
    : kind === 'finding' ? { kind, data: draftValue(findingSchema.safeParse(data)) } as const
    : { kind, data: draftValue(reviewDraftSchema.safeParse(data)) } as const;
  const id = draft.kind === 'review' ? `${draft.data.finding}--${draft.data.reviewer}--${draft.data.date}`
    : requireId(get('id'), 'record id');
  const graft = command === 'graft' ? draftValue(graftDraftSchema.safeParse({ finding: get('source'), note: get('note') }))
    : undefined;
  const pinFlag = graft ? 'source-sha256' : 'finding-sha256';
  const expected = flags.get(pinFlag);
  if (expected !== undefined && !reviewSchema.shape.finding_sha256.safeParse(expected).success) {
    throw new UsageError(`--${pinFlag} must be a 64-character lowercase hex sha256`);
  }

  const root = resolve(flags.get('content-dir') ?? join(repoRoot, 'apps/web/src/content'));
  if (!(await lstat(root)).isDirectory()) throw new Error('content root must be a real directory, not a link');
  const { records, errors } = await readExchangeRecords(root);
  const warnings: string[] = [];
  const catalog = await validateEvals(root, errors, warnings);

  const pin = (id: string) => {
    const source = records.findings.find((entry) => entry.id === id);
    if (!source) throw new Error(`unknown finding ${id}`);
    if (expected !== undefined && expected !== source.sha256) throw new Error(`sha256 does not match exact finding bytes for ${id}`);
    return source.sha256;
  };
  let record;
  if (draft.kind === 'review') {
    const { finding, ...details } = draft.data;
    record = { kind: draft.kind, data: { finding, finding_sha256: pin(finding), ...details } } as const;
  } else {
    if (graft) draft.data.grafts = [{ finding: graft.finding, sha256: pin(graft.finding), note: graft.note }];
    record = draft;
  }
  const directory = kind === 'hypothesis' ? 'hypotheses' : kind === 'finding' ? 'findings' : 'reviews';
  const json = JSON.stringify(record.data, null, 2);
  // JSON is YAML 1.2: quoted source-date strings and arbitrary plain text round-trip without interpolation.
  const bytes = kind === 'hypothesis' ? `---\n${json}\n---\n` : `${json}\n`;
  if (Buffer.byteLength(bytes) > EXCHANGE_RECORD_MAX_BYTES) throw new UsageError(`record exceeds the ${EXCHANGE_RECORD_MAX_BYTES}-byte limit`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (record.kind === 'hypothesis') records.hypotheses.push({ id, data: record.data, sha256 });
  else if (record.kind === 'finding') records.findings.push({ id, data: record.data, sha256 });
  else records.reviews.push({ id, data: record.data, sha256 });
  errors.push(...validateExchange(records, catalog));
  if (errors.length) throw new Error(errors.join('\n'));

  const targetDirectory = join(root, directory);
  try { await mkdir(targetDirectory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  if (!(await lstat(targetDirectory)).isDirectory()) throw new Error(`${directory} must be a real directory, not a link`);
  const path = join(targetDirectory, `${id}.${kind === 'hypothesis' ? 'md' : 'json'}`);
  // Exclusive creation also refuses dangling symlinks and a writer racing this command.
  await writeFile(path, bytes, { flag: 'wx' });
  return { path, id, sha256 };
}
