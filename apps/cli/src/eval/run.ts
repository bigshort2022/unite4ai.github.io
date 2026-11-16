import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarkSchema, evalResultSchema, type EvalResult } from '@unite4ai/schema';
import { listModels, serverStatus, streamChat, withoutCredentials } from './client.ts';
import { detectHardware, type Hardware } from './hardware.ts';
import { speedResultFrom } from './speed.ts';
import { SUITES } from './suites.ts';

export const HARNESS = { name: 'unite4ai-eval', version: '0.2.0' };

/**
 * Seconds one invocation may run: four hours, because a 2048-token benchmark can take hours on
 * a slow machine. Checked between replies, so a run can overrun it by one reply timeout.
 */
export const DEFAULT_MAX_SECONDS = 14_400;
/** Seconds one reply may take: a reply of a few thousand tokens fits even on a slow machine. */
export const DEFAULT_REQUEST_TIMEOUT_SECONDS = 600;

export interface EvalOptions {
  benchmark: string;
  model: string;
  servedModel: string;
  submitter: string;
  runtime: string;
  runtimeVersion: string;
  format: string;
  quantization: string;
  /** One line about the setup that the other fields cannot express, e.g. "thinking disabled". */
  notes?: string;
  baseUrl: string;
  contentRoot: string;
  workDir: string;
  command: string;
  maxSeconds?: number;
  requestTimeoutMs?: number;
  sourceFile?: string;
  hardware?: Partial<Hardware>;
  today?: string;
  log?: (line: string) => void;
}

export interface EvalOutcome {
  resultPath: string;
  /** The decode-speed result of the same run; absent when no speed benchmark is defined or no speed was measured. */
  speedResultPath?: string;
  transcriptPath: string;
  score: number;
  correct: number;
  n: number;
}

interface TranscriptItem {
  type: 'item';
  index: number;
  /** sha256 of the JSON of the messages that were sent, so a reader can check the prompt. */
  prompt_sha256: string;
  reply: string;
  /** Why the server stopped; "length" means the reply was cut at the token limit. */
  finish_reason: string | null;
  extracted: string | null;
  expected: string;
  correct: boolean;
  ttft_ms: number | null;
  seconds: number;
  completion_tokens: number | null;
}

/** The last line of a finished transcript. */
interface TranscriptEnd {
  type: 'complete';
  /** The UTC date on which the last item was answered; it becomes the result's `run.date`. */
  date: string;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const definitionPath = (contentRoot: string, id: string) => join(contentRoot, 'benchmarks', `${id}.md`);

/** A benchmark definition's frontmatter, checked against the schema. */
function loadDefinition(contentRoot: string, id: string) {
  const frontmatter = readFileSync(definitionPath(contentRoot, id), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error(`benchmarks/${id}.md has no frontmatter`);
  const parsed = benchmarkSchema.safeParse(Bun.YAML.parse(frontmatter[1]));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
    throw new Error(`benchmarks/${id}.md is not a valid benchmark definition: ${problems.join('; ')}`);
  }
  return parsed.data;
}

/**
 * The definition and suite of the benchmark to run, and the measured benchmark that publishes
 * the run's decode speed: null when the suite names none or this content root does not define it.
 */
function loadBenchmark(contentRoot: string, id: string) {
  const suite = SUITES[id];
  if (!existsSync(definitionPath(contentRoot, id)) || !suite) {
    throw new Error(`benchmark "${id}" cannot be run: it needs a definition in benchmarks/ and a suite (supported: ${Object.keys(SUITES).join(', ')})`);
  }
  const definition = loadDefinition(contentRoot, id);
  const speedId = suite.speedBenchmark;
  if (speedId === undefined || !existsSync(definitionPath(contentRoot, speedId))) {
    return { definition, suite, speedBenchmark: null };
  }
  const speed = loadDefinition(contentRoot, speedId);
  // The content gate accepts a speed result only beside the result of the run it was measured on.
  if (speed.measured_on !== id) {
    const measuredOn = speed.measured_on === undefined ? 'no benchmark' : `"${speed.measured_on}"`;
    throw new Error(`benchmarks/${speedId}.md is measured on ${measuredOn}, not on "${id}"`);
  }
  return { definition, suite, speedBenchmark: { id: speedId, version: speed.version } };
}

/**
 * The benchmark's source text, from the first of: a file the caller names, the copy vendored in
 * the repository, the cache, the network. Whatever the origin, the bytes must match the pin.
 */
async function loadSource(
  options: EvalOptions,
  url: string,
  pinned: string | undefined,
  localSource: string | undefined,
): Promise<string> {
  if (!pinned) throw new Error('the benchmark definition has no source_sha256; refusing to run against an unpinned source');
  const vendored = localSource === undefined ? null : join(options.contentRoot, localSource);
  const cached = join(options.workDir, 'cache', `${pinned}.txt`);
  let bytes: Uint8Array;
  let fetched = false;
  if (options.sourceFile) {
    bytes = readFileSync(options.sourceFile);
  } else if (vendored !== null && existsSync(vendored)) {
    bytes = readFileSync(vendored);
  } else if (existsSync(cached)) {
    bytes = readFileSync(cached);
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`could not fetch the benchmark source: ${response.status} ${url}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    fetched = true;
  }
  // The pin covers the file's bytes as published, so they are hashed before any decoding.
  const actual = sha256(bytes);
  if (actual !== pinned) throw new Error(`source hash mismatch: expected ${pinned}, got ${actual}`);
  if (fetched) {
    mkdirSync(join(options.workDir, 'cache'), { recursive: true });
    writeFileSync(cached, bytes);
  }
  // TextDecoder drops a leading byte-order mark, which JSON.parse would reject.
  return new TextDecoder().decode(bytes);
}

/**
 * A listed id is a weak guard: mlx-lm and Ollama also list models they have not loaded, and
 * posting one of those makes them swap models. An omp-managed server says what is loaded.
 */
async function checkServer(baseUrl: string, servedModel: string): Promise<void> {
  const listed = await listModels(baseUrl);
  if (!listed.includes(servedModel)) {
    throw new Error(
      `served model "${servedModel}" is not listed by the server (${listed.join(', ') || 'none'}); `
      + 'posting it would make the server load it',
    );
  }
  const status = await serverStatus(baseUrl);
  if (status && status.model !== servedModel) {
    throw new Error(`the server has "${status.model}" loaded; --served-model must name it`);
  }
  if (status && status.activeRequests > 0) {
    throw new Error(`the server is busy with ${status.activeRequests} request(s); try again when it is idle`);
  }
}

/** A transcript line that is the item at this position; the fields the runner wrote are trusted beyond that. */
function isItemAt(line: unknown, index: number): line is TranscriptItem {
  return typeof line === 'object' && line !== null
    && 'type' in line && line.type === 'item'
    && 'index' in line && line.index === index
    && 'correct' in line && typeof line.correct === 'boolean';
}

/** The date on a transcript's completion line; null for any other line. */
function completionDate(line: unknown): string | null {
  if (typeof line !== 'object' || line === null) return null;
  if (!('type' in line) || line.type !== 'complete') return null;
  return 'date' in line && typeof line.date === 'string' ? line.date : null;
}

/**
 * Reads this configuration's transcript, creating it when there is none: the finished items,
 * and the completion date once every item has been answered. A last line that a killed run
 * left cut short is dropped; any other damage is refused, because the file is the evidence.
 */
function readTranscript(path: string, header: string, total: number): { done: TranscriptItem[]; completedOn: string | null } {
  const damaged = (problem: string) => new Error(`${path}: ${problem}; move or delete the file to start over`);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();

  const parsed: unknown[] = [];
  for (const [index, line] of lines.entries()) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Lines are appended whole, so only the last one can be a fragment.
      if (index < lines.length - 1) throw damaged(`line ${index + 1} is not valid JSON`);
    }
  }
  const kept = lines.slice(0, parsed.length);
  if (kept.length > 0 && kept[0] !== header) throw damaged("it does not start with this run's header");

  const records = parsed.slice(1);
  const completedOn = completionDate(records.at(-1));
  if (completedOn !== null) records.pop();
  const done = records.filter((record, index): record is TranscriptItem => isItemAt(record, index));
  if (done.length !== records.length) throw damaged('its item lines are not items 0, 1, 2, … in order');
  if (done.length > total) throw damaged('it has more items than the benchmark');
  if (completedOn !== null && done.length !== total) {
    throw damaged(`it is marked complete with ${done.length} of ${total} items`);
  }

  // Rewritten without the fragment, and with the newline a kept last line may have lost.
  const intact = [header, ...kept.slice(1)].map((line) => `${line}\n`).join('');
  if (text !== intact) writeFileSync(path, intact);
  return { done, completedOn };
}

/** Decode speed (tokens per second after the first token) and the median time to the first token. */
function measure(done: TranscriptItem[]): NonNullable<EvalResult['perf']> {
  const timed = done.flatMap((line) => (line.completion_tokens === null || line.ttft_ms === null
    ? []
    : [{ tokens: line.completion_tokens, ttftMs: line.ttft_ms, seconds: line.seconds }]));
  // One untimed item would make the totals describe a different set of replies than the score.
  if (timed.length === 0 || timed.length !== done.length) return {};
  const perf: NonNullable<EvalResult['perf']> = {};
  const tokens = timed.reduce((sum, line) => sum + line.tokens, 0);
  const decodeSeconds = timed.reduce((sum, line) => sum + Math.max(line.seconds - line.ttftMs / 1000, 0), 0);
  if (tokens > 0 && decodeSeconds > 0) perf.tokens_per_second = Number((tokens / decodeSeconds).toFixed(1));
  const ttft = Number(median(timed.map((line) => line.ttftMs)).toFixed(1));
  if (ttft > 0) perf.time_to_first_token_ms = ttft;
  return perf;
}

/** Whether a process with this id exists; one that belongs to another user counts. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

/**
 * Takes the lock that keeps two runs from appending to one transcript, and returns the function
 * that releases it. The lock names its holder, so one left behind by a killed run is taken over.
 */
function lockTranscript(path: string): () => void {
  try {
    writeFileSync(path, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    const holder = Number(readFileSync(path, 'utf8'));
    if (Number.isInteger(holder) && holder > 0 && isRunning(holder)) {
      throw new Error(`another run of this configuration is active (pid ${holder})`);
    }
    writeFileSync(path, String(process.pid));
  }
  return () => rmSync(path, { force: true });
}

/** The flag behind each result field a contributor sets, so a schema complaint can name it. */
const FLAG_OF: Record<string, string> = {
  model: '--model',
  benchmark: '--benchmark',
  'run.submitter': '--submitter',
  'run.command': 'the command line',
  'setup.runtime': '--runtime',
  'setup.runtime_version': '--runtime-version',
  'setup.format': '--format',
  'setup.quantization': '--quantization',
  'setup.notes': '--notes',
  'setup.hardware.device': '--device',
  'setup.hardware.accelerator': '--accelerator',
  'setup.hardware.memory_gb': '--memory-gb',
};

/**
 * Runs one benchmark against one served model. Completed items are appended to a transcript
 * as they finish, so an interrupted run resumes; a result file is written only when every
 * item has been answered.
 */
export async function runEval(options: EvalOptions): Promise<EvalOutcome> {
  const log = options.log ?? (() => {});
  const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;

  // Preflight: everything that can fail without touching the model server fails here.
  const { definition, suite, speedBenchmark } = loadBenchmark(options.contentRoot, options.benchmark);
  if (!['md', 'mdx'].some((ext) => existsSync(join(options.contentRoot, 'models', `${options.model}.${ext}`)))) {
    throw new Error(`model "${options.model}" has no card in models/. Add the model card first.`);
  }
  const hardware = detectHardware(options.hardware);
  const resultWith = (measured: {
    score: number;
    n: number;
    date: string;
    perf: NonNullable<EvalResult['perf']>;
    evidence: EvalResult['evidence'];
  }) => ({
    schema_version: 1,
    model: options.model,
    benchmark: options.benchmark,
    benchmark_version: definition.version,
    score: measured.score,
    n: measured.n,
    run: { date: measured.date, submitter: options.submitter, harness: HARNESS, command: options.command },
    setup: {
      runtime: options.runtime,
      runtime_version: options.runtimeVersion,
      format: options.format,
      quantization: options.quantization,
      hardware,
      ...(options.notes === undefined ? {} : { notes: options.notes }),
    },
    ...(Object.keys(measured.perf).length > 0 ? { perf: measured.perf } : {}),
    evidence: measured.evidence,
  });
  // A value the schema rejects would otherwise surface only after every item had been answered.
  const dry = evalResultSchema.safeParse(resultWith({
    score: 0,
    n: definition.items,
    date: options.today ?? new Date().toISOString().slice(0, 10),
    perf: {},
    evidence: { sha256: '0'.repeat(64) },
  }));
  if (!dry.success) {
    const problems = dry.error.issues.map((issue) => {
      const field = issue.path.map(String).join('.');
      return `${FLAG_OF[field] ?? field}: ${issue.message}`;
    });
    throw new Error(`this run could not be published: ${problems.join('; ')}`);
  }
  const source = await loadSource(options, definition.source_url, definition.source_sha256, suite.localSource);
  const items = suite.items(source, definition.items);

  // Transcript: a header that identifies the configuration, one line per finished item, and a
  // last line with the completion date. The file is named after the header's hash and not the
  // day, so a configuration resumes only itself, on whatever day it is picked up again.
  const header = JSON.stringify({
    type: 'header',
    benchmark: options.benchmark,
    benchmark_version: definition.version,
    source_sha256: definition.source_sha256,
    prompt_version: suite.promptVersion,
    model: options.model,
    served_model: options.servedModel,
    // The transcript is evidence that may be hosted in public.
    base_url: withoutCredentials(options.baseUrl),
    runtime: options.runtime,
    runtime_version: options.runtimeVersion,
    format: options.format,
    quantization: options.quantization,
    notes: options.notes ?? null,
    max_tokens: suite.maxTokens,
  });
  const name = `${options.model}--${options.benchmark}--${options.submitter}`;
  const transcriptPath = join(options.workDir, `${name}--${sha256(header).slice(0, 8)}.jsonl`);
  mkdirSync(options.workDir, { recursive: true });
  const unlock = lockTranscript(`${transcriptPath}.lock`);
  try {
    const { done, completedOn } = readTranscript(transcriptPath, header, items.length);
    if (completedOn !== null) {
      log(`this configuration completed on ${completedOn}; move ${transcriptPath} away to run it again`);
    } else if (done.length > 0) {
      log(`resuming after ${done.length} of ${items.length} items`);
    }

    if (done.length < items.length) await checkServer(options.baseUrl, options.servedModel);
    const started = Date.now();
    for (const item of items.slice(done.length)) {
      if ((Date.now() - started) / 1000 >= maxSeconds) {
        throw new Error(`time limit of ${maxSeconds}s reached after ${done.length} of ${items.length} items; rerun to resume`);
      }
      let completion;
      try {
        completion = await streamChat({
          baseUrl: options.baseUrl,
          model: options.servedModel,
          messages: item.messages,
          maxTokens: suite.maxTokens,
          timeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_SECONDS * 1000,
        });
      } catch (error) {
        throw new Error(`item ${item.index + 1} failed: ${(error as Error).message}; rerun to resume`);
      }
      const end = { finishReason: completion.finishReason, completionTokens: completion.completionTokens, maxTokens: suite.maxTokens };
      if (suite.needsEndSignal && end.finishReason === null && end.completionTokens === null) {
        // Running it again would get the same answer from the same server, so nothing says to.
        throw new Error(
          `item ${item.index + 1} failed: the server reported neither why the reply ended nor its token count; `
          + `${options.benchmark} version ${definition.version} cannot be scored against it`,
        );
      }
      const verdict = item.judge(completion.text, end);
      const line: TranscriptItem = {
        type: 'item',
        index: item.index,
        prompt_sha256: sha256(JSON.stringify(item.messages)),
        reply: completion.text,
        finish_reason: completion.finishReason,
        extracted: verdict.extracted,
        expected: item.expected,
        correct: verdict.correct,
        ttft_ms: completion.ttftMs === null ? null : Number(completion.ttftMs.toFixed(1)),
        seconds: Number(completion.seconds.toFixed(3)),
        completion_tokens: completion.completionTokens,
      };
      appendFileSync(transcriptPath, `${JSON.stringify(line)}\n`);
      done.push(line);
      log(`${done.length}/${items.length} ${verdict.correct ? 'correct' : 'wrong'}`);
    }

    // The run is dated when its last item is answered, and the transcript records that date:
    // running a finished configuration again rewrites the same result instead of a newer copy.
    const date = completedOn ?? options.today ?? new Date().toISOString().slice(0, 10);
    if (completedOn === null) {
      const end: TranscriptEnd = { type: 'complete', date };
      appendFileSync(transcriptPath, `${JSON.stringify(end)}\n`);
    }

    const correct = done.filter((line) => line.correct).length;
    const score = Number(((100 * correct) / done.length).toFixed(2));
    const transcript = readFileSync(transcriptPath);
    const result = evalResultSchema.parse(resultWith({
      score,
      n: done.length,
      date,
      perf: measure(done),
      evidence: { sha256: sha256(transcript), bytes: transcript.length },
    }));
    const speed = speedBenchmark === null ? null : speedResultFrom(result, speedBenchmark);

    // One file per benchmark, written together from the one transcript. Each filename carries
    // the evidence prefix, as the content gate requires.
    const evalsDir = join(options.contentRoot, 'evals');
    const pathOf = (published: EvalResult) => join(evalsDir, [
      published.model,
      published.benchmark,
      published.run.submitter,
      published.run.date,
      `${published.evidence.sha256.slice(0, 8)}.json`,
    ].join('--'));
    mkdirSync(evalsDir, { recursive: true });
    for (const published of speed === null ? [result] : [result, speed]) {
      writeFileSync(pathOf(published), `${JSON.stringify(published, null, 2)}\n`);
    }
    return {
      resultPath: pathOf(result),
      transcriptPath,
      score,
      correct,
      n: done.length,
      ...(speed === null ? {} : { speedResultPath: pathOf(speed) }),
    };
  } finally {
    unlock();
  }
}
