# Local Evaluation Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run eval` runs a benchmark against any OpenAI-compatible local endpoint and writes a result file that passes the content gate (milestone M2 of `2026-11-14-eval-hub-long-horizon.md`).

**Architecture:** A small TypeScript module tree in `apps/cli/src/eval/`: a benchmark *suite* (items, prompt, scoring), a streaming client, hardware detection, and one orchestrator that owns preflight, the resumable transcript and the result file. Everything is injectable through an options object so tests run the whole flow against an in-process stub server and temp directories.

**Tech Stack:** Bun 1.4 (TypeScript run directly, `fetch`, `Bun.YAML`), Zod 4 schemas from `@unite4ai/schema`, `node:test` API run by `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-14-evaluation-first-hub-design.md` (piece 2); design decisions in the long-horizon plan, section "M2: runner".

## Global constraints

- Never post a model id the server does not list: mlx-lm and Ollama load whatever is posted, evicting the loaded model.
- One request at a time. Temperature 0. A run that does not finish writes **no** result file.
- The raw transcript stays in `.agent/evals/` (git-ignored). The result carries its sha256 and byte count.
- Tests never contact a real model server.
- No new dependencies.
- Tests are `*.test.mjs` with the `node:test` API, run by `bun test`. Subprocess-free: the runner is called in-process.

## File map

| Path | Responsibility |
|---|---|
| `apps/cli/src/eval/gsm8k.ts` | GSM8K suite: parse items, build the prompt, extract and score the answer |
| `apps/cli/src/eval/suites.ts` | `Suite` interface and the registry of supported benchmark ids |
| `apps/cli/src/eval/client.ts` | `listModels`, `streamChat` (SSE, time to first token, usage) |
| `apps/cli/src/eval/hardware.ts` | `detectHardware` (macOS `sysctl`, overridable) |
| `apps/cli/src/eval/run.ts` | `runEval`: preflight, transcript with resume, scoring, result file |
| `apps/cli/src/eval/args.ts` | Flag parsing into `EvalOptions` |
| `apps/cli/src/index.ts` | `eval` command |
| `apps/cli/test/gsm8k.test.mjs`, `apps/cli/test/run-eval.test.mjs`, `apps/cli/test/args.test.mjs` | Tests |
| `package.json` | `eval` script; `test` script includes `apps/cli/test` |
| `CONTRIBUTING.md`, `README.md`, `AGENTS.md` | How to run the runner |

---

### Task 1: GSM8K suite

**Files:**
- Create: `apps/cli/src/eval/gsm8k.ts`, `apps/cli/src/eval/suites.ts`, `apps/cli/test/gsm8k.test.mjs`

- [ ] **Step 1: Write the failing tests**

`apps/cli/test/gsm8k.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessages, extractAnswer, isCorrect, parseItems } from '../src/eval/gsm8k.ts';
import { SUITES } from '../src/eval/suites.ts';

const line = (question, answer) => JSON.stringify({ question, answer });
const SOURCE = [
  line('Q1?', 'Working.\n#### 18'),
  line('Q2?', 'Working.\n#### 2,125'),
  line('Q3?', 'Working.\n#### -4'),
  line('Q4?', 'Working.\n#### 0.5'),
].join('\n') + '\n';

test('parseItems takes the first N items in file order and reads the number after ####', () => {
  const items = parseItems(SOURCE, 3);
  assert.deepEqual(items.map((i) => [i.index, i.question, i.expected]), [[0, 'Q1?', 18], [1, 'Q2?', 2125], [2, 'Q3?', -4]]);
});

test('parseItems refuses a source that is too short or malformed', () => {
  assert.throws(() => parseItems(SOURCE, 5), /has 4 items; the benchmark needs 5/);
  assert.throws(() => parseItems(line('Q?', 'no marker') + '\n', 1), /item 1/);
});

test('extractAnswer takes the last number in the reply', () => {
  assert.equal(extractAnswer('9 eggs at $2 each is 18.\n#### 18'), 18);
  assert.equal(extractAnswer('The total is $2,125.'), 2125);
  assert.equal(extractAnswer('So the answer is **3.50** dollars'), 3.5);
  assert.equal(extractAnswer('It drops to -4 degrees'), -4);
  assert.equal(extractAnswer('Between 2-5 items, so 5'), 5);
  assert.equal(extractAnswer('I cannot solve this.'), null);
});

test('extractAnswer ignores numbers inside a think block', () => {
  assert.equal(extractAnswer('<think>maybe 99</think>The answer is 7'), 7);
  assert.equal(extractAnswer('<think>only thoughts 5</think>'), null);
});

test('isCorrect compares numerically, so 18 and 18.0 match and a missing answer is wrong', () => {
  assert.equal(isCorrect('#### 18.0', 18), true);
  assert.equal(isCorrect('#### 19', 18), false);
  assert.equal(isCorrect('no idea', 18), false);
});

test('the prompt contains the question and the registry knows gsm8k-200', () => {
  const messages = buildMessages('How many?');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
  assert.match(messages[0].content, /^How many\?/);
  assert.equal(SUITES['gsm8k-200'].promptVersion, 'gsm8k-1');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test apps/cli/test/gsm8k.test.mjs`
Expected: FAIL: cannot find module `../src/eval/gsm8k.ts`.

- [ ] **Step 3: Implement**

`apps/cli/src/eval/gsm8k.ts`:

```ts
/**
 * GSM8K suite. The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/gsm8k-200.md); change them together and bump the version.
 */

/** Recorded in every transcript; bump when the prompt or the extraction rule changes. */
export const PROMPT_VERSION = 'gsm8k-1';

export interface Gsm8kItem {
  index: number;
  question: string;
  expected: number;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// A minus sign counts only when it does not follow a digit, so "2-5" reads as 2 and 5.
const NUMBER = /(?<!\d)-?\d[\d,]*(?:\.\d+)?/g;
const toNumber = (text: string) => Number(text.replace(/,/g, ''));

export function parseItems(source: string, limit: number): Gsm8kItem[] {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < limit) throw new Error(`source has ${lines.length} items; the benchmark needs ${limit}`);
  return lines.slice(0, limit).map((line, index) => {
    const row = JSON.parse(line) as { question?: unknown; answer?: unknown };
    const marker = typeof row.answer === 'string' ? row.answer.match(/####\s*(-?[\d,]*\.?\d+)\s*$/) : null;
    if (typeof row.question !== 'string' || !marker) {
      throw new Error(`item ${index + 1}: expected {question, answer ending in "#### <number>"}`);
    }
    return { index, question: row.question, expected: toNumber(marker[1]) };
  });
}

export function buildMessages(question: string): ChatMessage[] {
  return [{
    role: 'user',
    content: `${question}\n\nSolve this step by step. Finish with the final answer as a number on its own line.`,
  }];
}

/** The last number in the visible reply, with thousands separators removed. */
export function extractAnswer(reply: string): number | null {
  const visible = reply.replace(/<think>[\s\S]*?<\/think>/g, ' ');
  const numbers = visible.match(NUMBER);
  if (!numbers) return null;
  const value = toNumber(numbers[numbers.length - 1]);
  return Number.isFinite(value) ? value : null;
}

export function isCorrect(reply: string, expected: number): boolean {
  const answer = extractAnswer(reply);
  return answer !== null && Math.abs(answer - expected) < 1e-6;
}
```

`apps/cli/src/eval/suites.ts`:

```ts
import { PROMPT_VERSION, buildMessages, extractAnswer, isCorrect, parseItems, type ChatMessage } from './gsm8k.ts';

/** What the runner needs from a benchmark: its items, its prompt, and a deterministic verdict. */
export interface SuiteItem {
  index: number;
  messages: ChatMessage[];
  /** Stored in the transcript so a reader can check the verdict by hand. */
  expected: string;
  judge(reply: string): { correct: boolean; extracted: string | null };
}

export interface Suite {
  promptVersion: string;
  /** Builds the items from the pinned source text; throws when the source does not fit. */
  items(source: string, count: number): SuiteItem[];
}

const gsm8k: Suite = {
  promptVersion: PROMPT_VERSION,
  items: (source, count) => parseItems(source, count).map((item) => ({
    index: item.index,
    messages: buildMessages(item.question),
    expected: String(item.expected),
    judge: (reply) => {
      const answer = extractAnswer(reply);
      return { correct: isCorrect(reply, item.expected), extracted: answer === null ? null : String(answer) };
    },
  })),
};

/** Benchmark ids the runner can execute. A definition without a suite here cannot be run. */
export const SUITES: Record<string, Suite> = {
  'gsm8k-200': gsm8k,
};
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test apps/cli/test/gsm8k.test.mjs`
Expected: `6 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/eval/gsm8k.ts apps/cli/src/eval/suites.ts apps/cli/test/gsm8k.test.mjs
git commit -m "Add the GSM8K evaluation suite"
```

---

### Task 2: Client, hardware, orchestrator

**Files:**
- Create: `apps/cli/src/eval/client.ts`, `apps/cli/src/eval/hardware.ts`, `apps/cli/src/eval/run.ts`, `apps/cli/test/run-eval.test.mjs`

**Interface:**

```ts
interface EvalOptions {
  benchmark: string; model: string; servedModel: string; submitter: string;
  runtime: string; runtimeVersion: string; format: string; quantization: string;
  baseUrl: string;            // e.g. http://127.0.0.1:18082/v1
  contentRoot: string;        // apps/web/src/content
  workDir: string;            // .agent/evals
  command: string;            // recorded verbatim in the result
  maxSeconds?: number;        // default 3600
  requestTimeoutMs?: number;  // default 120000
  maxTokens?: number;         // default 512
  sourceFile?: string;        // use a local copy of the source (still hash-checked)
  hardware?: Partial<Hardware>;
  today?: string;             // YYYY-MM-DD, default current UTC date
  log?: (line: string) => void;
}
interface EvalOutcome { resultPath: string; transcriptPath: string; score: number; correct: number; n: number }
runEval(options: EvalOptions): Promise<EvalOutcome>
```

- [ ] **Step 1: Write the failing tests**

`apps/cli/test/run-eval.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { evalResultSchema } from '@unite4ai/schema';
import { validateContent } from '@unite4ai/core/validate';
import { runEval } from '../src/eval/run.ts';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const SOURCE = [
  { question: 'Q1?', answer: 'w\n#### 18' },
  { question: 'Q2?', answer: 'w\n#### 2,125' },
  { question: 'Q3?', answer: 'w\n#### 7' },
].map((row) => JSON.stringify(row)).join('\n') + '\n';

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const temps = [];
const servers = [];
after(() => {
  servers.forEach((server) => server.close());
  temps.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function makeWorkspace({ sourceSha = sha256(SOURCE) } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-eval-'));
  temps.push(root);
  const contentRoot = join(root, 'content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  const definition = {
    name: 'GSM8K fixture',
    summary: 'Three items for tests.',
    category: 'quality',
    version: '1',
    metric: { name: 'accuracy', unit: '%', higher_is_better: true, min: 0, max: 100 },
    scoring: 'exact-match',
    items: 3,
    source_url: 'https://example.org/test.jsonl',
    source_sha256: sourceSha,
    license: 'mit',
    updated: '2026-11-14',
  };
  writeFileSync(join(contentRoot, 'benchmarks/gsm8k-200.md'), `---\n${JSON.stringify(definition, null, 2)}\n---\n\n## Method\n\nFixture.\n`);
  const sourceFile = join(root, 'test.jsonl');
  writeFileSync(sourceFile, SOURCE);
  return { root, contentRoot, workDir: join(root, 'work'), sourceFile };
}

/** OpenAI-compatible stub. `replies` maps a question's first line to the reply, or to a status code. */
function stubServer(replies, models = ['stub-model']) {
  const requests = [];
  let active = 0;
  let maxActive = 0;
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push(`${req.method} ${req.url}`);
        if (req.url === '/v1/models') {
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
        }
        active += 1;
        maxActive = Math.max(maxActive, active);
        const parsed = JSON.parse(body);
        const question = parsed.messages.at(-1).content.split('\n')[0];
        const reply = replies[question];
        const finish = () => { active -= 1; };
        if (typeof reply === 'number') {
          res.statusCode = reply;
          finish();
          return res.end('stub failure');
        }
        res.setHeader('content-type', 'text/event-stream');
        const half = Math.ceil(reply.length / 2);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(0, half) } }] })}\n\n`);
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(half) } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`);
          res.write('data: [DONE]\n\n');
          finish();
          res.end();
        }, 15);
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      requests,
      posts: () => requests.filter((r) => r.startsWith('POST')).length,
      maxActive: () => maxActive,
      setReplies: (next) => { Object.assign(replies, next); },
    }));
  });
}

const options = (workspace, stub, overrides = {}) => ({
  benchmark: 'gsm8k-200',
  model: 'model-a',
  servedModel: 'stub-model',
  submitter: 'alice',
  runtime: 'mlx-lm',
  runtimeVersion: '0.32.2',
  format: 'mlx',
  quantization: '4bit',
  baseUrl: stub.baseUrl,
  contentRoot: workspace.contentRoot,
  workDir: workspace.workDir,
  sourceFile: workspace.sourceFile,
  command: 'bun run eval -- --benchmark gsm8k-200 --model model-a',
  hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 },
  today: '2026-11-10',
  ...overrides,
});

const GOOD = { 'Q1?': 'It is 18', 'Q2?': 'Total 2,125', 'Q3?': 'I think 9' };

test('a complete run writes a result the content gate accepts, with evidence for its transcript', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub));

  assert.equal(outcome.n, 3);
  assert.equal(outcome.correct, 2);
  assert.equal(outcome.score, 66.67);
  const prefix = sha256(readFileSync(outcome.transcriptPath)).slice(0, 8);
  assert.equal(outcome.resultPath, join(workspace.contentRoot, `evals/model-a--gsm8k-200--alice--2026-11-10--${prefix}.json`));

  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  assert.equal(evalResultSchema.safeParse(result).success, true);
  assert.equal(result.score, 66.67);
  assert.equal(result.run.command, 'bun run eval -- --benchmark gsm8k-200 --model model-a');
  assert.deepEqual(result.setup.hardware, { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 });
  const transcript = readFileSync(outcome.transcriptPath);
  assert.equal(result.evidence.sha256, sha256(transcript));
  assert.equal(result.evidence.bytes, transcript.length);
  assert.ok(result.perf.tokens_per_second > 0);
  assert.ok(result.perf.time_to_first_token_ms > 0);

  assert.equal(stub.posts(), 3);
  assert.equal(stub.maxActive(), 1, 'requests must be sequential');
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a served model the server does not list is refused before any completion', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD }, ['loaded-model', 'other-model']);
  await assert.rejects(runEval(options(workspace, stub)), /"stub-model" is not listed by the server \(loaded-model, other-model\)/);
  assert.equal(stub.posts(), 0);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});

test('a source that does not match the pinned hash is refused before any request', async () => {
  const workspace = makeWorkspace({ sourceSha: 'f'.repeat(64) });
  const stub = await stubServer({ ...GOOD });
  await assert.rejects(runEval(options(workspace, stub)), /source hash mismatch/);
  assert.deepEqual(stub.requests, []);
});

test('a missing model card or an unsupported benchmark stops the run before any request', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  await assert.rejects(runEval(options(workspace, stub, { model: 'ghost' })), /model "ghost" has no card/);
  await assert.rejects(runEval(options(workspace, stub, { benchmark: 'nope' })), /benchmark "nope"/);
  assert.deepEqual(stub.requests, []);
});

test('a failed request writes no result, and the next run resumes after the completed items', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q2?': 500 });
  await assert.rejects(runEval(options(workspace, stub)), /item 2.*500/s);
  assert.equal(stub.posts(), 2);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);

  stub.setReplies({ 'Q2?': 'Total 2,125' });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4, 'only items 2 and 3 are requested again');
  assert.equal(outcome.correct, 2);
  assert.ok(existsSync(outcome.resultPath));
});

test('a different configuration gets its own transcript instead of reusing another one', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q3?': 500 });
  await assert.rejects(runEval(options(workspace, stub)), /item 3/);
  assert.equal(stub.posts(), 3);

  stub.setReplies({ 'Q3?': 'I think 9' });
  const other = await runEval(options(workspace, stub, { quantization: '8bit' }));
  assert.equal(stub.posts(), 6, 'the 8bit run answers all three items itself');
  assert.equal(JSON.parse(readFileSync(other.resultPath, 'utf8')).setup.quantization, '8bit');

  const resumed = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 7, 'the 4bit run resumes with only its third item');
  assert.notEqual(resumed.transcriptPath, other.transcriptPath);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('the run stops at its time limit without writing a result', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  await assert.rejects(runEval(options(workspace, stub, { maxSeconds: 0 })), /time limit/);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test apps/cli/test/run-eval.test.mjs`
Expected: FAIL: cannot find module `../src/eval/run.ts`.

- [ ] **Step 3: Client**

`apps/cli/src/eval/client.ts`:

```ts
import type { ChatMessage } from './gsm8k.ts';

export interface Completion {
  text: string;
  /** Milliseconds until the first content token; null when the reply was empty. */
  ttftMs: number | null;
  seconds: number;
  /** From the stream's usage chunk; null when the server does not send one. */
  completionTokens: number | null;
}

export async function listModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GET /models → ${response.status}`);
  const body = (await response.json()) as { data?: { id?: unknown }[] };
  return (body.data ?? []).map((model) => model?.id).filter((id): id is string => typeof id === 'string' && id !== '');
}

/** One streamed chat completion at temperature 0. */
export async function streamChat(request: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
}): Promise<Completion> {
  const started = performance.now();
  const response = await fetch(`${request.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
  });
  if (!response.ok || !response.body) {
    throw new Error(`POST /chat/completions → ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  let text = '';
  let ttftMs: number | null = null;
  let completionTokens: number | null = null;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '' || payload === '[DONE]') continue;
      const event = JSON.parse(payload) as {
        choices?: { delta?: { content?: unknown } }[];
        usage?: { completion_tokens?: unknown };
      };
      const delta = event.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta !== '') {
        if (ttftMs === null) ttftMs = performance.now() - started;
        text += delta;
      }
      if (typeof event.usage?.completion_tokens === 'number') completionTokens = event.usage.completion_tokens;
    }
  }
  return { text, ttftMs, seconds: (performance.now() - started) / 1000, completionTokens };
}
```

- [ ] **Step 4: Hardware**

`apps/cli/src/eval/hardware.ts`:

```ts
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
```

- [ ] **Step 5: Orchestrator**

`apps/cli/src/eval/run.ts`:

```ts
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
  let text: string;
  if (options.sourceFile) {
    text = readFileSync(options.sourceFile, 'utf8');
  } else if (existsSync(cached)) {
    text = readFileSync(cached, 'utf8');
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`could not fetch the benchmark source: ${response.status} ${url}`);
    text = await response.text();
  }
  const actual = sha256(text);
  if (actual !== pinned) throw new Error(`source hash mismatch: expected ${pinned}, got ${actual}`);
  if (!options.sourceFile && !existsSync(cached)) {
    mkdirSync(join(options.workDir, 'cache'), { recursive: true });
    writeFileSync(cached, text);
  }
  return text;
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
      ttft_ms: completion.ttftMs === null ? null : Math.round(completion.ttftMs),
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
    const ttft = median(timed.map((line) => line.ttft_ms as number));
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
```

- [ ] **Step 6: Run and confirm pass**

Run: `bun test apps/cli/test/run-eval.test.mjs`
Expected: `7 pass, 0 fail`.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/eval/client.ts apps/cli/src/eval/hardware.ts apps/cli/src/eval/run.ts apps/cli/test/run-eval.test.mjs
git commit -m "Add the evaluation runner with a resumable transcript"
```

---

### Task 3: Command line, scripts, docs

**Files:**
- Create: `apps/cli/src/eval/args.ts`, `apps/cli/test/args.test.mjs`
- Modify: `apps/cli/src/index.ts`, `package.json`, `CONTRIBUTING.md`, `README.md`, `AGENTS.md`

- [ ] **Step 1: Write the failing tests**

`apps/cli/test/args.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEvalArgs } from '../src/eval/args.ts';

const REQUIRED = [
  '--benchmark', 'gsm8k-200', '--model', 'model-a', '--served-model', 'org/model-a-4bit',
  '--submitter', 'alice', '--runtime', 'mlx-lm', '--runtime-version', '0.32.2',
  '--format', 'mlx', '--quantization', '4bit',
];
const env = {};

test('required flags map onto options, with defaults for the rest', () => {
  const options = parseEvalArgs(REQUIRED, { root: '/repo', env });
  assert.equal(options.benchmark, 'gsm8k-200');
  assert.equal(options.servedModel, 'org/model-a-4bit');
  assert.equal(options.runtimeVersion, '0.32.2');
  assert.equal(options.baseUrl, 'http://127.0.0.1:18082/v1');
  assert.equal(options.contentRoot, '/repo/apps/web/src/content');
  assert.equal(options.workDir, '/repo/.agent/evals');
  assert.equal(options.maxSeconds, 3600);
  assert.equal(options.command, `bun run eval -- ${REQUIRED.join(' ')}`);
  assert.deepEqual(options.hardware, {});
});

test('optional flags and the environment override defaults', () => {
  const options = parseEvalArgs(
    [...REQUIRED, '--max-seconds', '900', '--device', 'My Box', '--accelerator', 'nvidia', '--memory-gb', '24', '--source-file', '/tmp/x.jsonl'],
    { root: '/repo', env: { AGENT_MODEL_BASE_URL: 'http://127.0.0.1:11434/v1/' } },
  );
  assert.equal(options.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(options.maxSeconds, 900);
  assert.deepEqual(options.hardware, { device: 'My Box', accelerator: 'nvidia', memory_gb: 24 });
  assert.equal(options.sourceFile, '/tmp/x.jsonl');
  assert.match(options.command, /--device 'My Box'/);
});

test('missing flags are all named at once', () => {
  assert.throws(() => parseEvalArgs(['--benchmark', 'gsm8k-200'], { root: '/repo', env }), /missing: --model, --served-model, --submitter, --runtime, --runtime-version, --format, --quantization/);
});

test('enumerated values, the handle and numbers are checked before anything runs', () => {
  const swap = (flag, value) => REQUIRED.map((arg, i) => (REQUIRED[i - 1] === flag ? value : arg));
  assert.throws(() => parseEvalArgs(swap('--runtime', 'lmstudio'), { root: '/repo', env }), /--runtime must be one of: mlx-lm, ollama, llama\.cpp, vllm, transformers, other/);
  assert.throws(() => parseEvalArgs(swap('--format', 'onnx'), { root: '/repo', env }), /--format must be one of/);
  assert.throws(() => parseEvalArgs(swap('--submitter', 'not a handle'), { root: '/repo', env }), /--submitter must be a lowercase GitHub handle/);
  assert.throws(() => parseEvalArgs(swap('--submitter', 'Alice'), { root: '/repo', env }), /--submitter must be a lowercase GitHub handle/);
  assert.throws(() => parseEvalArgs([...REQUIRED, '--max-seconds', 'soon'], { root: '/repo', env }), /--max-seconds must be a positive number/);
  assert.throws(() => parseEvalArgs([...REQUIRED, '--bogus', '1'], { root: '/repo', env }), /unknown flag --bogus/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test apps/cli/test/args.test.mjs`
Expected: FAIL: cannot find module `../src/eval/args.ts`.

- [ ] **Step 3: Implement `apps/cli/src/eval/args.ts`**

```ts
import { join } from 'node:path';
import { EVAL_ACCELERATORS, EVAL_FORMATS, EVAL_RUNTIMES, evalResultSchema } from '@unite4ai/schema';
import type { Hardware } from './hardware.ts';
import type { EvalOptions } from './run.ts';

const REQUIRED = ['benchmark', 'model', 'served-model', 'submitter', 'runtime', 'runtime-version', 'format', 'quantization'];
const OPTIONAL = ['base-url', 'max-seconds', 'source-file', 'device', 'accelerator', 'memory-gb'];

export const EVAL_USAGE = `usage: bun run eval -- --benchmark <id> --model <model-card-id> --served-model <id the server lists>
  --submitter <github-handle> --runtime <${EVAL_RUNTIMES.join('|')}> --runtime-version <version>
  --format <${EVAL_FORMATS.join('|')}> --quantization <text, e.g. 4bit or Q4_K_M or none>
  [--base-url <url>] [--max-seconds 3600] [--source-file <path>]
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
    command: `bun run eval -- ${argv.map(quote).join(' ')}`,
    maxSeconds: flags.has('max-seconds') ? positive('max-seconds', get('max-seconds')) : 3600,
    ...(flags.has('source-file') ? { sourceFile: get('source-file') } : {}),
    hardware,
  };
}
```

- [ ] **Step 4: Wire the command**

In `apps/cli/src/index.ts`, add to the imports:

```ts
import { EVAL_USAGE, parseEvalArgs } from './eval/args.ts';
import { runEval } from './eval/run.ts';
```

add this case before `default:`:

```ts
  case 'eval': {
    try {
      const options = parseEvalArgs(process.argv.slice(3), { root: ROOT, env: process.env });
      const outcome = await runEval({ ...options, log: (line) => console.error(line) });
      console.log(JSON.stringify({ status: 'complete', ...outcome }));
      console.error(`\n${outcome.correct}/${outcome.n} correct (${outcome.score}). Result: ${outcome.resultPath}\nRun \`bun run validate\`, then open a pull request with that file.`);
    } catch (error) {
      console.error(`eval failed: ${(error as Error).message}`);
      process.exit(1);
    }
    break;
  }
```

and add to the help text, after the `new-dataset` line:

```
  eval <flags>          Run a benchmark against a local model (bun run eval -- --help)
```

Make `--help` work: at the top of the `eval` case, before the `try`:

```ts
    if (process.argv.includes('--help')) {
      console.log(EVAL_USAGE);
      break;
    }
```

Root `package.json` scripts: add `"eval": "bun apps/cli/src/index.ts eval",` and change `test` to

```json
"test": "bun test apps/web/test apps/api/test apps/cli/test packages/core/test scripts/agent",
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test apps/cli/test`
Expected: `17 pass, 0 fail` (6 + 7 + 4).

Run: `bun run eval -- --help | head -2`
Expected: the usage text.

Run: `bun run eval -- --benchmark gsm8k-200; echo "exit=$?"`
Expected: `eval failed: missing: --model, …` and `exit=1`. No request is made.

- [ ] **Step 6: Docs**

`CONTRIBUTING.md`, in "Submitting an evaluation result", insert after the bullet list:

````markdown
The runner does the bookkeeping for you. Point it at any OpenAI-compatible local server
(mlx-lm, Ollama, llama.cpp, vLLM):

```bash
bun run eval -- --benchmark gsm8k-200 --model <model-card-id> \
  --served-model <the id your server lists for the model it has loaded> \
  --submitter <your-github-handle> \
  --runtime mlx-lm --runtime-version 0.32.2 --format mlx --quantization 4bit \
  --base-url http://127.0.0.1:18082/v1
```

It refuses a `--served-model` the server does not list (posting one makes mlx-lm and Ollama
swap models), sends one request at a time at temperature 0, and keeps a transcript in
`.agent/evals/` so an interrupted run resumes. When every item is answered it writes the
result file into `apps/web/src/content/evals/` with the transcript's hash. Keep the transcript:
it is your evidence.
````

`README.md` Quick start block: add the line

```bash
bun run eval -- --help   # run a benchmark against a local model
```

`AGENTS.md`, Commands section: add

```markdown
- `bun run eval -- --help` evaluation runner; **never run it against a live model server unless asked**
```

Run: `wc -c AGENTS.md`
Expected: under 3072.

- [ ] **Step 7: Full verification and commit**

Run: `node scripts/agent/verify.mjs && bun test 2>&1 | tail -4`
Expected: gate passes; `0 fail`; total = 77 + 17 = 94.

```bash
git add apps/cli/src/eval/args.ts apps/cli/test/args.test.mjs apps/cli/src/index.ts package.json CONTRIBUTING.md README.md AGENTS.md
git commit -m "Add the eval command and document running a benchmark locally"
```

---

### Task 4: First real result (controller only, conditions apply)

This task touches the shared model server and publishes a measurement. It is done by the controller, not delegated, and every condition must hold. If any fails, skip the task, commit nothing, and record the reason in the status log.

- [ ] **Step 1: Conditions**

1. `bun run agent:model` prints `"status":"ready"`.
2. The loaded model's licence is read from its upstream source today and is on the allowlist in `packages/schema/src/index.ts` (`OPEN_LICENSES`). Record the URL read.
3. `curl -s http://127.0.0.1:18082/_omp/status` shows `"active_requests": 0`.

- [ ] **Step 2: Model card**

Create `apps/web/src/content/models/<id>.md` for the loaded model using `bun run new:model <id>` as the scaffold. Fill in only facts read from the upstream model page: name, licence, maintainers, artifact URL. Openness axes are graded from what the upstream page documents; where it says nothing, grade `closed` and say so in the card. `bun run validate` must pass.

- [ ] **Step 3: Run**

```bash
source scripts/agent/activate-node.sh
bun run eval -- --benchmark gsm8k-200 --model <id> --served-model <id from /v1/models that agent:model reported> \
  --submitter bigshort2022 --runtime mlx-lm --runtime-version <mlx_lm version of the server's venv> \
  --format mlx --quantization <from the model name> --max-seconds 2700
```

Expected: 200 progress lines, then `{"status":"complete",…}`. If it stops at the time limit, do **not** rerun unattended more than once; record the partial state.

- [ ] **Step 4: Verify and commit**

Run: `bun run validate && bun test apps/web/test/deployment.test.mjs`
Expected: both pass; `/evals` now shows one row.

```bash
git add apps/web/src/content/models/<id>.md apps/web/src/content/evals/<file>.json
git commit -m "Add the first evaluation result: <model> on GSM8K-200"
```

The transcript stays in `.agent/evals/` on this machine.

---

## Self-review

**Design coverage (long-horizon plan, M2).** Location and invocation → Task 3. Endpoint contract and unlisted-model refusal → Task 2 test 2. Generation settings, streaming, sequential requests → `client.ts`, Task 2 test 1. GSM8K scoring and pinned source → Task 1, Task 2 test 3. Evidence, resume, per-configuration transcripts, no result on failure → Task 2 tests 1, 5, 6, 7. Perf definition → `run.ts`. Hardware → `hardware.ts`, Task 3 test 2. Model card and first result with conditions → Task 4. The result filename and submitter rule follow M1's post-review content gate.

**Placeholder scan.** `<id>` and `<file>` in Task 4 are values that exist only once the conditions are checked at run time; the steps say how each is obtained.

**Type consistency.** `EvalOptions`/`EvalOutcome` are defined in `run.ts` and consumed by `args.ts` and `index.ts` with the same field names (`servedModel`, `runtimeVersion`, `contentRoot`, `workDir`, `sourceFile`, `maxSeconds`). `Suite`/`SuiteItem` (`promptVersion`, `items`, `messages`, `expected`, `judge`) are defined in `suites.ts` and used by `run.ts`. `Hardware` fields (`device`, `accelerator`, `memory_gb`) match `evalResultSchema.setup.hardware`.
