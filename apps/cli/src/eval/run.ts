import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarkSchema, evalResultSchema, type EvalResult, type RepeatResult } from '@unite4ai/schema';
import { apiCostProblems, apiWeightProblem, estimatedApiCost } from '@unite4ai/core/eval-cost';
import { repeatSummary, tallyAttempts } from '@unite4ai/core/repeat';
import { containsApiKey, prepareApiRun, type ApiRequestOptions } from './api.ts';
import { listModels, publicBaseUrl, serverStatus, streamChat } from './client.ts';
import { detectHardware, type Hardware } from './hardware.ts';
import { speedResultFrom } from './speed.ts';
import { SUITES } from './suites.ts';

/** 0.3.0 adds repeat runs; 0.2.0 had per-suite token limits and the cut-off rule. */
export const HARNESS = { name: 'unite4ai-eval', version: '0.3.0' };

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
  apiRequest?: ApiRequestOptions;
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
  /** Runs per item: 1 for a single-run benchmark. */
  runs: number;
}

interface TranscriptItem {
  type: 'item';
  /** Repeat runs only: which run the answer belongs to, counted from 0, and the seed it was sent with. */
  run?: number;
  seed?: number;
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
  /** Repeat runs only: the server's prompt token count. */
  prompt_tokens?: number | null;
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
function loadBenchmark(contentRoot: string, id: string, includeSpeed: boolean) {
  const suite = SUITES[id];
  if (!existsSync(definitionPath(contentRoot, id)) || !suite) {
    throw new Error(`benchmark "${id}" cannot be run: it needs a definition in benchmarks/ and a suite (supported: ${Object.keys(SUITES).join(', ')})`);
  }
  const definition = loadDefinition(contentRoot, id);
  const speedId = includeSpeed ? suite.speedBenchmark : undefined;
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
  what = 'benchmark source',
): Promise<string> {
  if (!pinned) throw new Error('the benchmark definition has no source_sha256; refusing to run against an unpinned source');
  const vendored = localSource === undefined ? null : join(options.contentRoot, localSource);
  const cached = join(options.workDir, 'cache', `${pinned}.txt`);
  let bytes: Uint8Array;
  let origin: string;
  let fetched = false;
  if (options.sourceFile) {
    origin = options.sourceFile;
  } else if (vendored !== null && existsSync(vendored)) {
    origin = vendored;
  } else if (existsSync(cached)) {
    origin = cached;
  } else {
    origin = url;
    fetched = true;
  }
  if (fetched) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`could not fetch the ${what} from ${url}: ${message}; a run needs it once, then it is kept in ${cached}`);
    }
    if (!response.ok) throw new Error(`could not fetch the ${what}: ${response.status} ${url}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    bytes = readFileSync(origin);
  }
  // The pin covers the file's bytes as published, so they are hashed before any decoding.
  const actual = sha256(bytes);
  if (actual !== pinned) throw new Error(`${what} hash mismatch in ${origin}: expected ${pinned}, got ${actual}`);
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

/**
 * A transcript line that is the answer at this position; the fields the runner wrote are
 * trusted beyond that. In a repeat run, position p is item p mod n of run p div n, sent with seed p.
 */
function isAttemptAt(line: unknown, position: number, itemCount: number, repeated: boolean): line is TranscriptItem {
  if (typeof line !== 'object' || line === null) return false;
  if (!('type' in line) || line.type !== 'item' || !('correct' in line) || typeof line.correct !== 'boolean') return false;
  const index = 'index' in line ? line.index : undefined;
  const run = 'run' in line ? line.run : undefined;
  const seed = 'seed' in line ? line.seed : undefined;
  return repeated
    ? index === position % itemCount && run === Math.floor(position / itemCount) && seed === position
    : index === position && run === undefined;
}

/** The date on a transcript's completion line; null for any other line. */
function completionDate(line: unknown): string | null {
  if (typeof line !== 'object' || line === null) return null;
  if (!('type' in line) || line.type !== 'complete') return null;
  return 'date' in line && typeof line.date === 'string' ? line.date : null;
}

/**
 * Reads this configuration's transcript, creating it when there is none: the finished answers,
 * and the completion date once every answer has been given. A last line that a killed run
 * left cut short is dropped; any other damage is refused, because the file is the evidence.
 */
function readTranscript(
  path: string,
  header: string,
  itemCount: number,
  repeated: boolean,
  total: number,
  storedText?: string,
): { done: TranscriptItem[]; completedOn: string | null } {
  const damaged = (problem: string) => new Error(`${path}: ${problem}; move or delete the file to start over`);
  const text = storedText ?? (existsSync(path) ? readFileSync(path, 'utf8') : '');
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
  const done = records.filter((record, index): record is TranscriptItem => isAttemptAt(record, index, itemCount, repeated));
  if (done.length !== records.length) {
    throw damaged(repeated
      ? `its answer lines are not run 0 items 0 to ${itemCount - 1}, then run 1, and so on, in order`
      : 'its item lines are not items 0, 1, 2, … in order');
  }
  if (done.length > total) {
    throw damaged(repeated
      ? `it has more answers than ${total / itemCount} runs of ${itemCount} items`
      : 'it has more items than the benchmark');
  }
  if (completedOn !== null && done.length !== total) {
    throw damaged(`it is marked complete with ${done.length} of ${total} ${repeated ? 'answers' : 'items'}`);
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
  'setup.served_model': '--served-model',
  'setup.runtime_version': '--runtime-version',
  'setup.format': '--format',
  'setup.quantization': '--quantization',
  'setup.notes': '--notes',
  'setup.hardware.device': '--device',
  'setup.hardware.accelerator': '--accelerator',
  'setup.hardware.memory_gb': '--memory-gb',
};

/**
 * Runs one benchmark against one served model. Completed answers are appended to a transcript
 * as they finish, so an interrupted run resumes; a result file is written only when every
 * answer has been given.
 */
export async function runEval(options: EvalOptions): Promise<EvalOutcome> {
  const log = options.log ?? (() => {});
  const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;

  // Preflight: everything that can fail without touching the model server fails here.
  const paid = options.runtime === 'api';
  const key = paid ? options.apiRequest?.key : undefined;
  if (key && [...Object.values(options), ...Object.values(options.hardware ?? {})].some((value) => containsApiKey(value, key))) {
    throw new Error('the API key must not appear in run options or public evidence');
  }
  if (!options.servedModel.trim()) throw new Error('--served-model must not be blank');
  if (paid) {
    const weights = apiWeightProblem(options.format, options.quantization);
    if (weights !== undefined) throw new Error(weights);
  }
  const { definition, suite, speedBenchmark } = loadBenchmark(options.contentRoot, options.benchmark, !paid);
  const method = definition.repeat;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (paid && method === undefined) throw new Error('--runtime api requires a repeat-run benchmark');
  const api = paid ? prepareApiRun(options, definition.version, today) : undefined;
  if (api?.metadata.model_card === undefined
    && !['md', 'mdx'].some((ext) => existsSync(join(options.contentRoot, 'models', `${options.model}.${ext}`)))) {
    throw new Error(paid
      ? 'an API-only model needs an HTTPS model_card in the API approval'
      : `model "${options.model}" has no card in models/. Add the model card first.`);
  }
  const { device, accelerator, memory_gb } = detectHardware(options.hardware);
  const hardware = { device, accelerator, memory_gb };
  if (key && containsApiKey(device, key)) throw new Error('the API key must not appear in public hardware evidence');
  const resultWith = (measured: {
    score: number;
    n: number;
    date: string;
    perf: NonNullable<EvalResult['perf']>;
    evidence: EvalResult['evidence'];
    repeat?: RepeatResult;
    cost?: EvalResult['cost'];
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
      served_model: options.servedModel,
      format: options.format,
      quantization: options.quantization,
      hardware,
      ...(options.notes === undefined ? {} : { notes: options.notes }),
    },
    ...(Object.keys(measured.perf).length > 0 ? { perf: measured.perf } : {}),
    ...(measured.repeat === undefined ? {} : { repeat: measured.repeat }),
    ...(api === undefined ? {} : { api: api.metadata }),
    ...(measured.cost === undefined ? {} : { cost: measured.cost }),
    evidence: measured.evidence,
  });
  // A value the schema rejects would otherwise surface only after every item had been answered.
  const dry = evalResultSchema.safeParse(resultWith({
    score: 0,
    n: definition.items,
    date: today,
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
  const loadItems = async () => {
    if (key && [definition.source_url, suite.answers?.url].some((url) => containsApiKey(url, key))) {
      throw new Error('the API key must not appear in benchmark source URLs');
    }
    const source = await loadSource(options, definition.source_url, definition.source_sha256, suite.localSource);
    // A file the caller names stands in for the source only; the answers come from the cache or network.
    const answers = suite.answers === undefined
      ? undefined
      : await loadSource({ ...options, sourceFile: undefined }, suite.answers.url, suite.answers.sha256, undefined, 'answers file');
    const items = suite.items(source, definition.items, answers);
    if (key && items.some((item) => containsApiKey(item.expected, key)
      || item.messages.some((message) => containsApiKey(message.content, key)))) {
      throw new Error('the API key must not appear in benchmark items');
    }
    return items;
  };
  const localItems = paid ? undefined : await loadItems();
  const runs = method?.runs ?? 1;
  const unit = method === undefined ? 'items' : 'answers';

  // Transcript: a header that identifies the configuration, one line per answer, and a
  // last line with the completion date. Client hardware is evidence, not a new paid configuration:
  // changing it must collide with the original basename and be refused, not buy another run.
  const configuration = {
    type: 'header',
    benchmark: options.benchmark,
    benchmark_version: definition.version,
    source_sha256: definition.source_sha256,
    // Only a suite with an answers file adds this, so other transcripts keep their names and resume.
    ...(suite.answers === undefined ? {} : { answers_sha256: suite.answers.sha256 }),
    prompt_version: suite.promptVersion,
    model: options.model,
    served_model: options.servedModel,
    // The transcript is evidence that may be hosted in public.
    base_url: paid ? options.baseUrl : publicBaseUrl(options.baseUrl),
    runtime: options.runtime,
    runtime_version: options.runtimeVersion,
    format: options.format,
    quantization: options.quantization,
    notes: options.notes ?? null,
    max_tokens: suite.maxTokens,
    // Bind paid evidence to its public approval, not the credential, local file or catalog.
    ...(api === undefined ? {} : { api: api.metadata }),
    // Only a repeat-run benchmark adds this, so a single-run configuration keeps its file name and resumes.
    ...(method === undefined ? {} : { repeat: method }),
  };
  const identity = JSON.stringify(configuration);
  const header = paid ? JSON.stringify({ ...configuration, hardware }) : identity;
  if (key && containsApiKey(header, key)) throw new Error('the API key must not appear in the transcript header');
  const name = `${options.model}--${options.benchmark}--${options.submitter}`;
  const transcriptPath = join(options.workDir, `${name}--${sha256(identity).slice(0, 8)}.jsonl`);
  mkdirSync(options.workDir, { recursive: true });
  const unlock = lockTranscript(`${transcriptPath}.lock`);
  try {
    const stored = paid ? (existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '') : undefined;
    if (stored) {
      const newline = stored.indexOf('\n');
      const firstLine = newline === -1 ? stored : stored.slice(0, newline);
      if (firstLine !== header) throw new Error('cannot resume paid run: the stored header or client hardware does not match');
    }
    const items = localItems ?? await loadItems();
    const attemptCount = items.length * runs;
    const { done, completedOn } = readTranscript(
      transcriptPath, header, items.length, method !== undefined, attemptCount, stored,
    );
    if (key && done.some((line) => [line.reply, line.finish_reason, line.expected, line.extracted]
      .some((value) => containsApiKey(value, key)))) {
      throw new Error('the saved transcript contains the API key; refusing to use it as evidence');
    }
    if (completedOn !== null) {
      log(paid
        ? `this approved configuration completed on ${completedOn}; no API requests sent`
        : `this configuration completed on ${completedOn}; move ${transcriptPath} away to run it again`);
    } else if (done.length > 0) {
      log(`resuming after ${done.length} of ${attemptCount} ${unit}`);
    }

    if (api === undefined && done.length < attemptCount) await checkServer(options.baseUrl, options.servedModel);
    const started = Date.now();
    const resumeAdvice = paid ? 'check charges and remaining approval before resuming' : 'rerun to resume';
    // Each run is one full pass over the same items.
    for (let position = done.length; position < attemptCount; position += 1) {
      const run = Math.floor(position / items.length);
      const item = items[position % items.length];
      const label = method === undefined ? `item ${item.index + 1}` : `run ${run + 1} item ${item.index + 1}`;
      if ((Date.now() - started) / 1000 >= maxSeconds) {
        throw new Error(`time limit of ${maxSeconds}s reached after ${done.length} of ${attemptCount} ${unit}; ${resumeAdvice}`);
      }
      let completion;
      try {
        completion = await streamChat({
          ...(api === undefined ? { baseUrl: options.baseUrl, model: options.servedModel } : { api: api.endpoint }),
          messages: item.messages,
          maxTokens: suite.maxTokens,
          timeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_SECONDS * 1000,
          // The seed is the answer's position: each answer of each run has its own, and a resumed run sends the same.
          ...(method === undefined ? {} : { sampling: { temperature: method.temperature, topP: method.top_p, seed: position } }),
        });
      } catch (error) {
        throw new Error(`${label} failed: ${(error as Error).message}; ${resumeAdvice}`);
      }
      const end = { finishReason: completion.finishReason, completionTokens: completion.completionTokens, maxTokens: suite.maxTokens };
      if (suite.needsEndSignal && end.finishReason === null && end.completionTokens === null) {
        // Running it again would get the same answer from the same server, so nothing says to.
        throw new Error(
          `${label} failed: the server reported neither why the reply ended nor its token count; `
          + `${options.benchmark} version ${definition.version} cannot be scored against it`,
        );
      }
      const verdict = item.judge(completion.text, end);
      const line: TranscriptItem = {
        type: 'item',
        ...(method === undefined ? {} : { run, seed: position }),
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
        ...(method === undefined ? {} : { prompt_tokens: completion.promptTokens }),
      };
      appendFileSync(transcriptPath, `${JSON.stringify(line)}\n`);
      done.push(line);
      const word = verdict.correct ? 'correct' : 'wrong';
      log(method === undefined
        ? `${done.length}/${items.length} ${word}`
        : `run ${run + 1}/${runs} item ${item.index + 1}/${items.length} ${word}`);
    }

    // The run is dated when its last answer is given, and the transcript records that date:
    // running a finished configuration again rewrites the same result instead of a newer copy.
    const date = completedOn ?? options.today ?? new Date().toISOString().slice(0, 10);
    if (completedOn === null) {
      const end: TranscriptEnd = { type: 'complete', date };
      appendFileSync(transcriptPath, `${JSON.stringify(end)}\n`);
    }

    const n = items.length;
    const repeat = method === undefined ? undefined : repeatSummary(method, tallyAttempts(done.map((line) => ({
      run: line.run ?? 0,
      index: line.index,
      correct: line.correct,
      seconds: line.seconds,
      promptTokens: line.prompt_tokens ?? null,
      completionTokens: line.completion_tokens,
    })), n, runs));
    // A repeat run's score is the share of items answered correctly on every run.
    const correct = repeat === undefined ? done.filter((line) => line.correct).length : repeat.item_pass_histogram[runs];
    const score = repeat === undefined ? Number(((100 * correct) / n).toFixed(2)) : repeat.pass_k;
    const cost = repeat === undefined || api?.prices === undefined ? undefined : estimatedApiCost(repeat, api.prices);
    const transcript = readFileSync(transcriptPath);
    const result = evalResultSchema.parse(resultWith({
      score,
      n,
      date,
      perf: measure(done),
      evidence: { sha256: sha256(transcript), bytes: transcript.length },
      repeat,
      cost,
    }));
    const costProblems = apiCostProblems(result);
    if (costProblems.length > 0) throw new Error(`this run could not be published: ${costProblems.join('; ')}`);
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
    const resultPath = pathOf(result);
    if (paid && existsSync(resultPath)) {
      // Invoices are attached by the contributor after the run, not derived from the transcript.
      let existing: EvalResult | null;
      try {
        existing = JSON.parse(readFileSync(resultPath, 'utf8')) as EvalResult | null;
      } catch {
        throw new Error(`refusing to overwrite an unreadable API result: ${resultPath}`);
      }
      if (existing?.cost?.kind === 'invoice') {
        throw new Error(`refusing to overwrite invoice evidence: ${resultPath}`);
      }
      if (existing?.cost?.kind === 'models-dev' && cost === undefined) {
        throw new Error(`refusing to overwrite a models.dev estimate without usable pinned replacement pricing: ${resultPath}`);
      }
    }
    mkdirSync(evalsDir, { recursive: true });
    for (const published of speed === null ? [result] : [result, speed]) {
      writeFileSync(pathOf(published), `${JSON.stringify(published, null, 2)}\n`);
    }
    return {
      resultPath,
      transcriptPath,
      score,
      correct,
      n,
      runs,
      ...(speed === null ? {} : { speedResultPath: pathOf(speed) }),
    };
  } finally {
    unlock();
  }
}
