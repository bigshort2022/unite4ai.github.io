import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarkSchema, evalResultSchema, type EvalResult } from '@unite4ai/schema';
import { listModels, streamChat } from './client.ts';
import { detectHardware, type Hardware } from './hardware.ts';
import { SUITES } from './suites.ts';

export const HARNESS = { name: 'unite4ai-eval', version: '0.1.0' };

export interface EvalOptions {
  benchmark: string;
  model: string;
  servedModel: string;
  submitter: string;
  runtime: string;
  runtimeVersion: string;
  format: string;
  quantization: string;
  baseUrl: string;
  contentRoot: string;
  workDir: string;
  command: string;
  maxSeconds?: number;
  requestTimeoutMs?: number;
  maxTokens?: number;
  sourceFile?: string;
  hardware?: Partial<Hardware>;
  today?: string;
  log?: (line: string) => void;
}

export interface EvalOutcome {
  resultPath: string;
  transcriptPath: string;
  score: number;
  correct: number;
  n: number;
}

interface TranscriptItem {
  type: 'item';
  index: number;
  reply: string;
  extracted: string | null;
  expected: string;
  correct: boolean;
  ttft_ms: number | null;
  seconds: number;
  completion_tokens: number | null;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function loadBenchmark(contentRoot: string, id: string) {
  const path = join(contentRoot, 'benchmarks', `${id}.md`);
  const suite = SUITES[id];
  if (!existsSync(path) || !suite) {
    throw new Error(`benchmark "${id}" cannot be run: it needs a definition in benchmarks/ and a suite (supported: ${Object.keys(SUITES).join(', ')})`);
  }
  const frontmatter = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error(`benchmarks/${id}.md has no frontmatter`);
  return { definition: benchmarkSchema.parse(Bun.YAML.parse(frontmatter[1])), suite };
}

async function loadSource(options: EvalOptions, url: string, pinned: string | undefined): Promise<string> {
  if (!pinned) throw new Error('the benchmark definition has no source_sha256; refusing to run against an unpinned source');
  const cached = join(options.workDir, 'cache', `${pinned}.txt`);
  let bytes: Uint8Array;
  if (options.sourceFile) {
    bytes = readFileSync(options.sourceFile);
  } else if (existsSync(cached)) {
    bytes = readFileSync(cached);
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`could not fetch the benchmark source: ${response.status} ${url}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  // The pin covers the file's bytes as published, so they are hashed before any decoding.
  const actual = sha256(bytes);
  if (actual !== pinned) throw new Error(`source hash mismatch: expected ${pinned}, got ${actual}`);
  if (!options.sourceFile && !existsSync(cached)) {
    mkdirSync(join(options.workDir, 'cache'), { recursive: true });
    writeFileSync(cached, bytes);
  }
  // TextDecoder drops a leading byte-order mark, which JSON.parse would reject.
  return new TextDecoder().decode(bytes);
}

/**
 * Runs one benchmark against one served model. Completed items are appended to a transcript
 * as they finish, so an interrupted run resumes; a result file is written only when every
 * item has been answered.
 */
export async function runEval(options: EvalOptions): Promise<EvalOutcome> {
  const log = options.log ?? (() => {});
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const maxSeconds = options.maxSeconds ?? 3600;

  // Preflight: everything that can fail without touching the model server fails here.
  const { definition, suite } = loadBenchmark(options.contentRoot, options.benchmark);
  if (!['md', 'mdx'].some((ext) => existsSync(join(options.contentRoot, 'models', `${options.model}.${ext}`)))) {
    throw new Error(`model "${options.model}" has no card in models/. Add the model card first.`);
  }
  const hardware = detectHardware(options.hardware);
  const source = await loadSource(options, definition.source_url, definition.source_sha256);
  const items = suite.items(source, definition.items);

  const listed = await listModels(options.baseUrl);
  if (!listed.includes(options.servedModel)) {
    throw new Error(
      `served model "${options.servedModel}" is not listed by the server (${listed.join(', ') || 'none'}); `
      + 'posting it would make the server load it',
    );
  }

  // Transcript: a header that identifies the configuration, then one line per finished item.
  // The file is named after the header's hash, so each configuration resumes only itself.
  const name = `${options.model}--${options.benchmark}--${options.submitter}--${today}`;
  const header = {
    type: 'header',
    benchmark: options.benchmark,
    benchmark_version: definition.version,
    source_sha256: definition.source_sha256,
    prompt_version: suite.promptVersion,
    model: options.model,
    served_model: options.servedModel,
    base_url: options.baseUrl,
    runtime: options.runtime,
    runtime_version: options.runtimeVersion,
    format: options.format,
    quantization: options.quantization,
    max_tokens: options.maxTokens ?? 512,
  };
  const transcriptPath = join(options.workDir, `${name}--${sha256(JSON.stringify(header)).slice(0, 8)}.jsonl`);
  const done: TranscriptItem[] = [];
  mkdirSync(options.workDir, { recursive: true });
  if (existsSync(transcriptPath)) {
    const [first, ...rest] = readFileSync(transcriptPath, 'utf8').split('\n').filter((line) => line !== '');
    if (first !== JSON.stringify(header)) {
      throw new Error(`the transcript at ${transcriptPath} does not start with this run's header; move or delete it to start over`);
    }
    done.push(...rest.map((line) => JSON.parse(line) as TranscriptItem));
    log(`resuming after ${done.length} of ${items.length} items`);
  } else {
    writeFileSync(transcriptPath, `${JSON.stringify(header)}\n`);
  }

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
        maxTokens: header.max_tokens,
        timeoutMs: options.requestTimeoutMs ?? 120_000,
      });
    } catch (error) {
      throw new Error(`item ${item.index + 1} failed: ${(error as Error).message}; rerun to resume`);
    }
    const verdict = item.judge(completion.text);
    const line: TranscriptItem = {
      type: 'item',
      index: item.index,
      reply: completion.text,
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

  const correct = done.filter((line) => line.correct).length;
  const score = Number(((100 * correct) / done.length).toFixed(2));

  // Decode speed: tokens generated per second after the first token arrived.
  const perf: NonNullable<EvalResult['perf']> = {};
  const timed = done.filter((line) => line.completion_tokens !== null && line.ttft_ms !== null);
  if (timed.length === done.length && done.length > 0) {
    const tokens = timed.reduce((sum, line) => sum + (line.completion_tokens as number), 0);
    const decodeSeconds = timed.reduce((sum, line) => sum + Math.max(line.seconds - (line.ttft_ms as number) / 1000, 0), 0);
    if (tokens > 0 && decodeSeconds > 0) perf.tokens_per_second = Number((tokens / decodeSeconds).toFixed(1));
    const ttft = Number(median(timed.map((line) => line.ttft_ms as number)).toFixed(1));
    if (ttft > 0) perf.time_to_first_token_ms = ttft;
  }

  const transcript = readFileSync(transcriptPath);
  const result = evalResultSchema.parse({
    schema_version: 1,
    model: options.model,
    benchmark: options.benchmark,
    benchmark_version: definition.version,
    score,
    n: done.length,
    run: { date: today, submitter: options.submitter, harness: HARNESS, command: options.command },
    setup: {
      runtime: options.runtime,
      runtime_version: options.runtimeVersion,
      format: options.format,
      quantization: options.quantization,
      hardware,
    },
    ...(Object.keys(perf).length > 0 ? { perf } : {}),
    evidence: { sha256: sha256(transcript), bytes: transcript.length },
  });

  // The filename carries the evidence prefix, as the content gate requires.
  const resultPath = join(options.contentRoot, 'evals', `${name}--${result.evidence.sha256.slice(0, 8)}.json`);
  mkdirSync(join(options.contentRoot, 'evals'), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return { resultPath, transcriptPath, score, correct, n: done.length };
}
