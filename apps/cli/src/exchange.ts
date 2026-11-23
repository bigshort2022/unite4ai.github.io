import { createHash } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CONTENT_ID, EXCHANGE_RECORD_MAX_BYTES, hypothesisSchema, findingSchema, reviewSchema,
} from '@unite4ai/schema';
import { readExchangeRecords } from '@unite4ai/core/read-exchange';
import { validateEvals } from '@unite4ai/core/validate-evals';
import { validateExchange } from '@unite4ai/core/exchange';

export const EXCHANGE_USAGE = `usage: bun run exchange -- <command> [flags]

new-hypothesis --id ID --title TEXT --claim TEXT --benchmark ID --models ID[,ID]
  --prediction TEXT --author HANDLE --date YYYY-MM-DD
new-finding --id ID --hypothesis ID --results RESULT_ID[,RESULT_ID]
  --verdict supports|refutes|inconclusive --summary TEXT --limitations TEXT
  --author HANDLE --date YYYY-MM-DD [--supersedes FINDING_ID]
  [--incumbent RESULT_ID --candidate RESULT_ID] (switch evidence; include both in --results)
review --finding ID --reviewer HANDLE --date YYYY-MM-DD
  --verdict accept|reject|needs-work --checks CHECK[,CHECK] --notes TEXT
  [--finding-sha256 EXPECTED_HASH]
  CHECK: reran, read-transcript, read-results, read-page-only
  Hashes the exact finding bytes; an expected hash must match those bytes.
graft --kind hypothesis|finding --source FINDING_ID --note TEXT
  [--source-sha256 EXPECTED_HASH] plus ALL new-hypothesis/new-finding flags above.
  Creates a NEW adopting record (--id); never edits an existing record.
  To correct a finding, use a new id and --supersedes OLD_ID.

Common: [--agent-model TEXT --agent-harness TEXT] [--content-dir PATH] [--help]
  Disclose the actual model and harness for agent-written records; no attribution is inferred.
  Content defaults to apps/web/src/content in this repository. Lists are comma-separated.
  Dates and identities are explicit; no verdict, claim or result is invented.
  Result ids are complete filenames without .json. All flags take one value, no repeats.
  Schemas, references, review identity and exact-byte pins are checked before creation.
  Existing records are never overwritten. No model, git, PR or merge is run.
  Prints the created path/hash and manual pull request steps. Automatic publication stays disabled.
  Guide: docs/exchange/agent-guide.md`;

const common = ['content-dir', 'agent-model', 'agent-harness'];
const authorFields = ['author', 'date'];
const hypothesisFields = ['title', 'claim', 'benchmark', 'models', 'prediction', ...authorFields];
const findingFields = ['hypothesis', 'results', 'verdict', 'summary', 'limitations', ...authorFields];
const reviewFields = ['finding', 'reviewer', 'date', 'verdict', 'checks', 'notes'];

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (!name.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`expected --flag VALUE, got ${name}`);
    }
    const key = name.slice(2);
    if (flags.has(key)) throw new Error(`duplicate flag ${name}`);
    flags.set(key, value);
  }
  return flags;
}

function requireId(value: string, field: string): string {
  if (!CONTENT_ID.test(value)) throw new Error(`${field} must be a lowercase id with single hyphens`);
  return value;
}

/** No content text is ever evaluated or used as instructions. New records only, even for grafts. */
export async function runExchange(argv: string[], repoRoot: string) {
  const [command, ...args] = argv;
  if (!['new-hypothesis', 'new-finding', 'review', 'graft'].includes(command)) {
    throw new Error(`unknown command ${command}; use --help`);
  }
  const flags = parseFlags(args);
  const kind = command === 'graft' ? flags.get('kind')
    : command === 'new-hypothesis' ? 'hypothesis' : command === 'new-finding' ? 'finding' : 'review';
  if (!kind || !['hypothesis', 'finding', 'review'].includes(kind) || (command === 'graft' && kind === 'review')) {
    throw new Error('graft requires --kind hypothesis|finding');
  }
  const fields = kind === 'hypothesis' ? hypothesisFields : kind === 'finding' ? findingFields : reviewFields;
  const required = [...fields, ...(kind === 'review' ? [] : ['id']),
    ...(command === 'graft' ? ['kind', 'source', 'note'] : [])];
  const allowed = new Set([...required, ...common,
    ...(kind === 'finding' ? ['supersedes', 'incumbent', 'candidate'] : []),
    ...(kind === 'review' ? ['finding-sha256'] : []),
    ...(command === 'graft' ? ['source-sha256'] : [])]);
  for (const key of flags.keys()) if (!allowed.has(key)) throw new Error(`unknown flag --${key} for ${command}`);
  for (const key of required) if (!flags.has(key)) throw new Error(`missing --${key}`);
  if (flags.has('agent-model') !== flags.has('agent-harness')) {
    throw new Error('--agent-model and --agent-harness must be supplied together');
  }
  if (flags.has('incumbent') !== flags.has('candidate')) {
    throw new Error('--incumbent and --candidate must be supplied together');
  }
  const get = (name: string) => flags.get(name)!;
  const data: Record<string, unknown> = Object.fromEntries(fields.map((name) => [name, get(name)]));
  for (const field of ['models', 'results', 'checks']) {
    if (fields.includes(field)) data[field] = get(field).split(',');
  }
  if (flags.has('agent-model')) data.agent = { model: get('agent-model'), harness: get('agent-harness') };
  if (flags.has('supersedes')) data.supersedes = get('supersedes');
  if (flags.has('incumbent')) data.switch = { incumbent: get('incumbent'), candidate: get('candidate') };
  const root = resolve(flags.get('content-dir') ?? join(repoRoot, 'apps/web/src/content'));
  if (!(await lstat(root)).isDirectory()) throw new Error('content root must be a real directory, not a link');
  const { records, errors } = await readExchangeRecords(root);
  const warnings: string[] = [];
  const catalog = await validateEvals(root, errors, warnings);

  const pin = (id: string, expected: string | undefined) => {
    requireId(id, 'finding id');
    const source = records.findings.find((entry) => entry.id === id);
    if (!source) throw new Error(`unknown finding ${id}`);
    if (expected !== undefined && expected !== source.sha256) throw new Error(`sha256 does not match exact finding bytes for ${id}`);
    return source.sha256;
  };
  if (kind === 'review') data.finding_sha256 = pin(get('finding'), flags.get('finding-sha256'));
  if (command === 'graft') {
    data.grafts = [{ finding: get('source'), sha256: pin(get('source'), flags.get('source-sha256')), note: get('note') }];
  }
  const id = kind === 'review' ? `${get('finding')}--${get('reviewer')}--${get('date')}` : requireId(get('id'), 'record id');
  const directory = kind === 'hypothesis' ? 'hypotheses' : kind === 'finding' ? 'findings' : 'reviews';
  const parsed = kind === 'hypothesis' ? hypothesisSchema.parse(data)
    : kind === 'finding' ? findingSchema.parse(data) : reviewSchema.parse(data);
  // JSON is YAML 1.2: quoted source-date strings and arbitrary plain text round-trip without interpolation.
  const json = JSON.stringify(parsed, null, 2);
  const bytes = kind === 'hypothesis' ? `---\n${json}\n---\n` : `${json}\n`;
  if (Buffer.byteLength(bytes) > EXCHANGE_RECORD_MAX_BYTES) throw new Error('record exceeds the 16384-byte limit');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Parse per kind to keep the schema-validated collection types correlated.
  if (kind === 'hypothesis') records.hypotheses.push({ id, data: hypothesisSchema.parse(data), sha256 });
  else if (kind === 'finding') records.findings.push({ id, data: findingSchema.parse(data), sha256 });
  else records.reviews.push({ id, data: reviewSchema.parse(data), sha256 });
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
