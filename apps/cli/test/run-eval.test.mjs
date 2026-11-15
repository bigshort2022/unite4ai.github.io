import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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

/**
 * `speedDefinition` adds the measured benchmark that publishes the suite's decode speed; its
 * fields replace the valid ones, so `{}` is a definition the schema accepts.
 */
function makeWorkspace({ source = SOURCE, sourceSha = sha256(source), speedDefinition } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-eval-'));
  temps.push(root);
  const contentRoot = join(root, 'content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  const definition = {
    name: 'GSM8K fixture',
    summary: 'Three items for tests.',
    category: 'quality',
    version: '2',
    metric: { name: 'accuracy', unit: '%', higher_is_better: true, min: 0, max: 100 },
    scoring: 'exact-match',
    items: 3,
    source_url: 'https://example.org/test.jsonl',
    source_sha256: sourceSha,
    license: 'mit',
    updated: '2026-11-14',
  };
  const frontmatter = (fields) => `---\n${JSON.stringify(fields, null, 2)}\n---\n\n## Method\n\nFixture.\n`;
  writeFileSync(join(contentRoot, 'benchmarks/gsm8k-200.md'), frontmatter(definition));
  if (speedDefinition) {
    writeFileSync(join(contentRoot, 'benchmarks/decode-speed-gsm8k-200.md'), frontmatter({
      name: 'Decode speed fixture',
      summary: 'Tokens per second during the fixture run.',
      category: 'efficiency',
      version: '2',
      metric: { name: 'decode speed', unit: 'tok/s', higher_is_better: true, min: 0 },
      scoring: 'measured',
      items: 0,
      measured_on: 'gsm8k-200',
      source_url: 'https://example.org/run.ts',
      license: 'apache-2.0',
      updated: '2026-11-14',
      ...speedDefinition,
    }));
  }
  const sourceFile = join(root, 'test.jsonl');
  writeFileSync(sourceFile, source);
  return { root, contentRoot, workDir: join(root, 'work'), sourceFile };
}

const INSTRUCTION = 'Solve this step by step. Finish with the final answer as a number on its own line.';

/** What a completion request gets wrong against the benchmark page's method; null when nothing. */
function requestProblem(body, question) {
  const fixed = { model: 'stub-model', temperature: 0, max_tokens: 2048, stream: true };
  for (const [key, value] of Object.entries(fixed)) {
    if (body[key] !== value) return `${key} must be ${JSON.stringify(value)}, got ${JSON.stringify(body[key])}`;
  }
  const wanted = JSON.stringify([{ role: 'user', content: `${question}\n\n${INSTRUCTION}` }]);
  if (JSON.stringify(body.messages) !== wanted) return `messages must be ${wanted}, got ${JSON.stringify(body.messages)}`;
  return null;
}

/**
 * OpenAI-compatible stub. `replies` maps a question to the reply text, to a status code, to
 * `{ text, finishReason, completionTokens }` (how that reply ends: `finishReason` defaults to
 * "stop" and null sends none, only [DONE]; `completionTokens` defaults to 10 and null sends no
 * usage), to `{ error }` (an error event inside a 200 stream), to `{ truncate }` (one content
 * chunk, then the response ends with neither a finish_reason nor [DONE]) or to `{ hang: true }`
 * (no answer at all). A completion request that departs from the published method gets a 500
 * that says how. `delayMs` is how long a reply takes after its first chunk. `status` is what
 * /_omp/status answers, as an omp-managed server does (a string is sent as it is); without
 * it the route is a 404, as on plain mlx-lm and Ollama. With `usage: false` the server never
 * says how many tokens it generated.
 */
function stubServer(replies, { models = ['stub-model'], delayMs = 15, status, usage = true } = {}) {
  const requests = [];
  const bodies = [];
  let active = 0;
  let maxActive = 0;
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push(`${req.method} ${req.url}`);
        const json = (code, payload) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
        };
        if (req.url === '/v1/models') return json(200, { data: models.map((id) => ({ id })) });
        if (req.url === '/_omp/status' && status !== undefined) return json(200, status);
        if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(404, { error: 'not found' });
        const parsed = JSON.parse(body);
        bodies.push(parsed);
        const question = String(parsed.messages?.[0]?.content).split('\n')[0];
        const reply = replies[question];
        const problem = reply === undefined ? `no reply for ${JSON.stringify(question)}` : requestProblem(parsed, question);
        if (problem) return json(500, { error: { message: `stub: ${problem}` } });
        if (typeof reply === 'number') return json(reply, { error: { message: 'stub failure' } });
        if (reply.hang) return undefined;

        active += 1;
        maxActive = Math.max(maxActive, active);
        const finish = () => {
          active -= 1;
          res.end();
        };
        res.setHeader('content-type', 'text/event-stream');
        const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
        const content = (text) => event({ choices: [{ delta: { content: text }, finish_reason: null }] });
        const stream = typeof reply === 'string' ? { text: reply } : reply;
        if (!('text' in stream)) {
          res.write('error' in stream ? event({ error: { message: stream.error } }) : content(stream.truncate));
          return finish();
        }
        const { text, finishReason = 'stop', completionTokens = 10 } = stream;
        const half = Math.ceil(text.length / 2);
        res.write(content(text.slice(0, half)));
        setTimeout(() => {
          res.write(content(text.slice(half)));
          if (finishReason !== null) res.write(event({ choices: [{ delta: {}, finish_reason: finishReason }] }));
          if (usage && completionTokens !== null) {
            res.write(event({ choices: [], usage: { prompt_tokens: 20, completion_tokens: completionTokens, total_tokens: 20 + completionTokens } }));
          }
          res.write('data: [DONE]\n\n');
          finish();
        }, delayMs);
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      requests,
      bodies,
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

/** The parsed lines of the workspace's only transcript. */
function transcriptLines(workspace) {
  const [file] = readdirSync(workspace.workDir).filter((name) => name.endsWith('.jsonl'));
  return readFileSync(join(workspace.workDir, file), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}
const itemLines = (workspace) => transcriptLines(workspace).filter((line) => line.type === 'item');
/** The item indexes recorded in the workspace's only transcript. */
const transcriptItems = (workspace) => itemLines(workspace).map((line) => line.index);

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
  // 0.2.0 is the runner with per-suite token limits and the cut-off rule; 0.1.0 ran version 1.
  assert.deepEqual(result.run.harness, { name: 'unite4ai-eval', version: '0.2.0' });
  assert.deepEqual(result.setup.hardware, { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 });
  const transcript = readFileSync(outcome.transcriptPath);
  assert.equal(result.evidence.sha256, sha256(transcript));
  assert.equal(result.evidence.bytes, transcript.length);
  // The transcript is named for the configuration, not the day, and ends by saying when it completed.
  assert.match(basename(outcome.transcriptPath), /^model-a--gsm8k-200--alice--[a-f0-9]{8}\.jsonl$/);
  assert.deepEqual(transcriptLines(workspace).at(-1), { type: 'complete', date: '2026-11-10' });
  // The header records the benchmark version, the prompt version and the token limit of the run.
  const [header] = transcriptLines(workspace);
  assert.deepEqual(
    [header.type, header.benchmark_version, header.prompt_version, header.max_tokens],
    ['header', '2', 'gsm8k-2', 2048],
  );

  // The published speed, recomputed from the transcript with the runner's rounding: tokens
  // per second after the first token, and the median time to the first token.
  const lines = itemLines(workspace);
  const tokens = lines.reduce((sum, line) => sum + line.completion_tokens, 0);
  const decodeSeconds = lines.reduce((sum, line) => sum + (line.seconds - line.ttft_ms / 1000), 0);
  assert.equal(tokens, 30);
  assert.ok(decodeSeconds > 0);
  assert.equal(result.perf.tokens_per_second, Number((tokens / decodeSeconds).toFixed(1)));
  const [, medianTtft] = lines.map((line) => line.ttft_ms).sort((a, b) => a - b);
  assert.ok(medianTtft > 0);
  assert.equal(result.perf.time_to_first_token_ms, Number(medianTtft.toFixed(1)));

  // Each line says how its reply ended and pins the prompt that produced it.
  assert.deepEqual(lines.map((line) => line.finish_reason), ['stop', 'stop', 'stop']);
  assert.deepEqual(lines.map((line) => line.prompt_sha256), stub.bodies.map((body) => sha256(JSON.stringify(body.messages))));

  // Every request is exactly what the benchmark page promises, sent one at a time.
  assert.deepEqual(stub.bodies, ['Q1?', 'Q2?', 'Q3?'].map((question) => ({
    model: 'stub-model',
    messages: [{ role: 'user', content: `${question}\n\n${INSTRUCTION}` }],
    max_tokens: 2048,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  })));

  assert.equal(stub.posts(), 3);
  assert.equal(stub.maxActive(), 1, 'requests must be sequential');
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a served model the server does not list is refused before any completion', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD }, { models: ['loaded-model', 'other-model'] });
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

test('the source is pinned by its bytes: a byte-order mark counts for the hash and is dropped before parsing', async () => {
  const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SOURCE)]);
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(makeWorkspace({ source: marked }), stub));
  assert.equal(outcome.n, 3);
  assert.equal(outcome.correct, 2);

  // A byte that is not valid UTF-8 would change if the text were decoded before hashing.
  const undecodable = Buffer.concat([Buffer.from(SOURCE), Buffer.from([0xff, 0x0a])]);
  assert.equal((await runEval(options(makeWorkspace({ source: undecodable }), stub))).n, 3);

  // The marked file's pin does not fit the unmarked text, nor the unmarked text's pin the marked file.
  const posts = stub.posts();
  await assert.rejects(runEval(options(makeWorkspace({ sourceSha: sha256(marked) }), stub)), /source hash mismatch/);
  await assert.rejects(runEval(options(makeWorkspace({ source: marked, sourceSha: sha256(SOURCE) }), stub)), /source hash mismatch/);
  assert.equal(stub.posts(), posts);
});

test('a cached copy of the source is checked and parsed the same way, without fetching', async () => {
  const marked = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SOURCE)]);
  const workspace = makeWorkspace({ source: marked });
  mkdirSync(join(workspace.workDir, 'cache'), { recursive: true });
  writeFileSync(join(workspace.workDir, 'cache', `${sha256(marked)}.txt`), marked);
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub, { sourceFile: undefined }));
  assert.equal(outcome.n, 3);
  assert.equal(outcome.correct, 2);
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

test('an error event inside the stream fails the item, which the next run requests again', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q2?': { error: 'boom' } });
  await assert.rejects(runEval(options(workspace, stub)), /item 2 failed: server error in stream: boom/);
  assert.equal(stub.posts(), 2);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  assert.deepEqual(transcriptItems(workspace), [0]);

  stub.setReplies({ 'Q2?': 'Total 2,125' });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4, 'only items 2 and 3 are requested again');
  assert.equal(outcome.correct, 2);
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
});

test('a stream that ends before the reply is complete fails the item instead of scoring partial text', async () => {
  const workspace = makeWorkspace();
  // The partial text ends in the right answer, so scoring it would count the item as correct.
  const stub = await stubServer({ ...GOOD, 'Q3?': { truncate: 'So far 7' } });
  await assert.rejects(runEval(options(workspace, stub)), /item 3 failed: stream ended before the reply was complete/);
  assert.equal(stub.posts(), 3);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  assert.deepEqual(transcriptItems(workspace), [0, 1]);

  stub.setReplies({ 'Q3?': 'I think 9' });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4, 'only item 3 is requested again');
  assert.equal(outcome.correct, 2);
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
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

test('the run stops at its time limit between items, and the next run finishes it', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD }, { delayMs: 80 });
  await assert.rejects(runEval(options(workspace, stub, { maxSeconds: 0.05 })), /time limit of 0\.05s reached after 1 of 3 items/);
  assert.equal(stub.posts(), 1, 'the first item is answered; the limit stops the second');
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);

  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 3);
  assert.ok(existsSync(outcome.resultPath));
});

test('without a limit of its own a run stops four hours after it started, at the next gap between replies', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  // The clock jumps ahead after each reply: to a minute short of four hours, then past them.
  const hours = 4 * 3600 * 1000;
  const realNow = Date.now;
  let ahead = 0;
  Date.now = () => realNow() + ahead;
  const log = (line) => {
    if (line.startsWith('1/3')) ahead = hours - 60_000;
    if (line.startsWith('2/3')) ahead = hours;
  };
  try {
    await assert.rejects(runEval(options(workspace, stub, { log })), /time limit of 14400s reached after 2 of 3 items; rerun to resume/);
  } finally {
    Date.now = realNow;
  }
  assert.equal(stub.posts(), 2, 'the limit is checked between replies, never during one');
  assert.deepEqual(transcriptItems(workspace), [0, 1]);

  // The same command again resumes, with a fresh limit.
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 3);
  assert.equal(outcome.n, 3);
});

test('the stub refuses a request that departs from the published method', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD }, { models: ['stub-model', 'other-model'] });
  await assert.rejects(
    runEval(options(workspace, stub, { servedModel: 'other-model' })),
    /item 1 failed: .*stub: model must be \\?"stub-model\\?", got \\?"other-model\\?"/,
  );
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});

test('the token limit is the suite\'s: a caller cannot run the benchmark with another one', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub, { maxTokens: 256 }));
  assert.equal(outcome.n, 3);
  assert.deepEqual(stub.bodies.map((body) => body.max_tokens), [2048, 2048, 2048]);
  assert.equal(transcriptLines(workspace)[0].max_tokens, 2048);
});

test('a request the server never answers fails the item at the request timeout', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q2?': { hang: true } });
  await assert.rejects(runEval(options(workspace, stub, { requestTimeoutMs: 100 })), /item 2 failed: request timed out after 100 ms/);
  assert.equal(stub.posts(), 2);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  assert.deepEqual(transcriptItems(workspace), [0]);
});

test('a reply slower than the request timeout fails the item, and a run with the default limit resumes', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD }, { delayMs: 250 });
  await assert.rejects(runEval(options(workspace, stub, { requestTimeoutMs: 100 })), /item 1 failed: request timed out after 100 ms; rerun to resume/);
  assert.equal(stub.posts(), 1);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  assert.deepEqual(transcriptItems(workspace), [], 'a reply that did not finish in time is not scored');

  // Without the option each reply gets ten minutes, so the same slow replies complete.
  const realTimeout = AbortSignal.timeout;
  const limits = [];
  AbortSignal.timeout = (ms) => {
    limits.push(ms);
    return realTimeout.call(AbortSignal, ms);
  };
  let outcome;
  try {
    outcome = await runEval(options(workspace, stub));
  } finally {
    AbortSignal.timeout = realTimeout;
  }
  assert.deepEqual(limits.filter((ms) => ms > 60_000), [600_000, 600_000, 600_000], 'one ten-minute limit per reply');
  assert.equal(outcome.n, 3);
  assert.equal(outcome.correct, 2);
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
});

test('a reply cut off at the token limit is wrong in the transcript and in the score, whatever it contains', async () => {
  const workspace = makeWorkspace();
  // Cut off, the first reply still ends in the right answer: version 1 scored it as correct.
  const stub = await stubServer({ ...GOOD, 'Q1?': { text: 'Nine eggs at $2 each is 18', finishReason: 'length' } });
  const outcome = await runEval(options(workspace, stub));

  assert.equal(outcome.n, 3);
  assert.equal(outcome.correct, 1, 'only the second item counts');
  assert.equal(outcome.score, 33.33);
  const [first, second] = itemLines(workspace);
  assert.deepEqual(
    [first.reply, first.finish_reason, first.extracted, first.expected, first.correct],
    ['Nine eggs at $2 each is 18', 'length', null, '18', false],
  );
  assert.deepEqual([second.finish_reason, second.extracted, second.correct], ['stop', '2125', true]);
  assert.equal(JSON.parse(readFileSync(outcome.resultPath, 'utf8')).score, 33.33);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);

  // A finished configuration is rescored from the verdicts stored in its transcript.
  const requests = stub.requests.length;
  assert.deepEqual(await runEval(options(workspace, stub)), outcome);
  assert.equal(stub.requests.length, requests);
});

test('a reply that used the whole token limit is cut off, whatever finish reason the server gives or omits', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({
    // Not every server calls it "length", and some send no finish reason at all.
    'Q1?': { text: 'Nine eggs at $2 each is 18', finishReason: 'max_tokens', completionTokens: 2048 },
    'Q2?': { text: 'Total 2,125', finishReason: null, completionTokens: 2048 },
    // One token short of the limit, the reply ended by itself and is judged as it stands.
    'Q3?': { text: 'It is 7', finishReason: null, completionTokens: 2047 },
  });
  const outcome = await runEval(options(workspace, stub));

  assert.equal(outcome.correct, 1);
  assert.equal(outcome.score, 33.33);
  assert.deepEqual(
    itemLines(workspace).map((line) => [line.finish_reason, line.completion_tokens, line.extracted, line.correct]),
    [['max_tokens', 2048, null, false], [null, 2048, null, false], [null, 2047, '7', true]],
  );
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a reply with neither a finish reason nor a token count cannot be scored: the item fails and nothing is written for it', async () => {
  const workspace = makeWorkspace();
  // The text ends in the right answer; whether the server cut it off there is unknowable.
  const stub = await stubServer({ ...GOOD, 'Q2?': { text: 'Total 2,125', finishReason: null, completionTokens: null } });
  await assert.rejects(
    runEval(options(workspace, stub)),
    /^Error: item 2 failed: the server reported neither why the reply ended nor its token count; gsm8k-200 version 2 cannot be scored against it$/,
  );
  assert.equal(stub.posts(), 2);
  assert.deepEqual(transcriptItems(workspace), [0], 'the unscorable reply is not in the transcript');
  assert.deepEqual(transcriptLines(workspace).map((line) => line.type), ['header', 'item']);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);

  // Either signal is enough: a finish reason without a token count, or the reverse.
  stub.setReplies({ 'Q2?': { text: 'Total 2,125', completionTokens: null }, 'Q3?': { text: 'I think 9', finishReason: null } });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4, 'the run resumes at the item that failed');
  assert.equal(outcome.correct, 2);
  assert.deepEqual(
    itemLines(workspace).map((line) => [line.finish_reason, line.completion_tokens, line.correct]),
    [['stop', 10, true], ['stop', null, true], [null, 10, false]],
  );
});

test('the tokens and the time of a cut-off reply still count in the decode speed', async () => {
  const workspace = makeWorkspace({ speedDefinition: {} });
  const stub = await stubServer({ ...GOOD, 'Q1?': { text: 'Nine eggs at $2 each is 18', finishReason: 'length', completionTokens: 2048 } });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(outcome.correct, 1);

  const lines = itemLines(workspace);
  assert.deepEqual(lines.map((line) => [line.correct, line.completion_tokens]), [[false, 2048], [true, 10], [false, 10]]);
  // Recomputed over all three replies, with the runner's rounding: leaving the cut-off reply
  // out would drop 2048 of the 2068 tokens.
  const tokens = lines.reduce((sum, line) => sum + line.completion_tokens, 0);
  const decodeSeconds = lines.reduce((sum, line) => sum + (line.seconds - line.ttft_ms / 1000), 0);
  assert.equal(tokens, 2068);
  assert.ok(lines[0].seconds - lines[0].ttft_ms / 1000 > 0);
  const speed = Number((tokens / decodeSeconds).toFixed(1));
  assert.equal(JSON.parse(readFileSync(outcome.resultPath, 'utf8')).perf.tokens_per_second, speed);
  assert.equal(JSON.parse(readFileSync(outcome.speedResultPath, 'utf8')).score, speed);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a note about the setup is published with the result and is part of the configuration', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const plain = await runEval(options(workspace, stub));
  assert.equal('notes' in JSON.parse(readFileSync(plain.resultPath, 'utf8')).setup, false);

  const noted = await runEval(options(workspace, stub, { notes: 'thinking disabled' }));
  assert.equal(JSON.parse(readFileSync(noted.resultPath, 'utf8')).setup.notes, 'thinking disabled');
  assert.equal(JSON.parse(readFileSync(noted.transcriptPath, 'utf8').split('\n')[0]).notes, 'thinking disabled');
  assert.notEqual(noted.transcriptPath, plain.transcriptPath);
  assert.equal(stub.posts(), 6, 'the noted run answers every item itself');
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('an omp-managed server that has another model loaded, or is busy, is refused before any completion', async () => {
  const workspace = makeWorkspace();
  const other = await stubServer({ ...GOOD }, {
    models: ['stub-model', 'other-model'],
    status: { version: 1, model: 'other-model', active_requests: 0 },
  });
  await assert.rejects(runEval(options(workspace, other)), /the server has "other-model" loaded; --served-model must name it/);
  assert.equal(other.posts(), 0);

  const busy = await stubServer({ ...GOOD }, { status: { version: 1, model: 'stub-model', active_requests: 2 } });
  await assert.rejects(runEval(options(workspace, busy)), /the server is busy with 2 request\(s\); try again when it is idle/);
  assert.equal(busy.posts(), 0);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});

test('a status that agrees, one in another shape, and a server without the endpoint all let the run proceed', async () => {
  const statuses = [
    { version: 1, model: 'stub-model', active_requests: 0 },
    { version: 2, model: 'other-model', active_requests: 5 },
    'not json',
    undefined,
  ];
  for (const status of statuses) {
    const stub = await stubServer({ ...GOOD }, { status });
    const outcome = await runEval(options(makeWorkspace(), stub));
    assert.equal(outcome.n, 3, JSON.stringify(status));
    assert.ok(stub.requests.includes('GET /_omp/status'), 'the server is asked what it has loaded');
  }
});

test('the run is dated when it completes, and a finished configuration keeps that date', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q3?': 500 });
  await assert.rejects(runEval(options(workspace, stub, { today: '2026-11-10' })), /item 3/);
  assert.equal(stub.posts(), 3);

  stub.setReplies({ 'Q3?': 'I think 9' });
  const outcome = await runEval(options(workspace, stub, { today: '2026-11-11' }));
  assert.equal(stub.posts(), 4, 'the resumed run requests only the missing item');
  assert.match(basename(outcome.resultPath), /^model-a--gsm8k-200--alice--2026-11-11--[a-f0-9]{8}\.json$/);
  assert.equal(JSON.parse(readFileSync(outcome.resultPath, 'utf8')).run.date, '2026-11-11');

  // Run again later, the finished configuration asks the server nothing and rewrites the same result.
  const requests = stub.requests.length;
  const again = await runEval(options(workspace, stub, { today: '2026-11-12' }));
  assert.equal(stub.requests.length, requests);
  assert.deepEqual(again, outcome);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), [basename(outcome.resultPath)]);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('with its speed benchmark defined, a complete run also publishes the decode speed it measured', async () => {
  const workspace = makeWorkspace({ speedDefinition: {} });
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub, { notes: 'thinking disabled' }));

  // Same run, so the same date and evidence prefix as the main result, under the speed benchmark's id.
  const evals = join(workspace.contentRoot, 'evals');
  assert.equal(outcome.speedResultPath, outcome.resultPath.replace('--gsm8k-200--', '--decode-speed-gsm8k-200--'));
  assert.match(basename(outcome.speedResultPath), /^model-a--decode-speed-gsm8k-200--alice--2026-11-10--[a-f0-9]{8}\.json$/);
  assert.deepEqual(readdirSync(evals).sort(), [basename(outcome.speedResultPath), basename(outcome.resultPath)]);

  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  const speed = JSON.parse(readFileSync(outcome.speedResultPath, 'utf8'));
  assert.equal(evalResultSchema.safeParse(speed).success, true);
  assert.ok(result.perf.tokens_per_second > 0);
  assert.deepEqual(speed, {
    ...result,
    benchmark: 'decode-speed-gsm8k-200',
    benchmark_version: '2',
    score: result.perf.tokens_per_second,
  });
  assert.equal(speed.evidence.sha256, sha256(readFileSync(outcome.transcriptPath)));
  assert.equal(speed.setup.notes, 'thinking disabled');
  assert.equal(stub.posts(), 3, 'the speed comes from the same three requests');
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);

  // Run again, the finished configuration asks the server nothing and writes both files as they were.
  const written = [outcome.resultPath, outcome.speedResultPath].map((path) => readFileSync(path, 'utf8'));
  rmSync(outcome.resultPath);
  rmSync(outcome.speedResultPath);
  const requests = stub.requests.length;
  const again = await runEval(options(workspace, stub, { notes: 'thinking disabled', today: '2026-11-12' }));
  assert.equal(stub.requests.length, requests);
  assert.deepEqual(again, outcome);
  assert.deepEqual([again.resultPath, again.speedResultPath].map((path) => readFileSync(path, 'utf8')), written);
  assert.equal(readdirSync(evals).length, 2);
});

test('without a definition of its speed benchmark, a complete run writes only the main result', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(outcome.speedResultPath, undefined);
  assert.equal('speedResultPath' in outcome, false);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), [basename(outcome.resultPath)]);
});

test('a server that reports no token count gives no speed, so only the main result is written', async () => {
  const workspace = makeWorkspace({ speedDefinition: {} });
  const stub = await stubServer({ ...GOOD }, { usage: false });
  const outcome = await runEval(options(workspace, stub));
  assert.equal(outcome.n, 3);
  assert.equal('speedResultPath' in outcome, false);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), [basename(outcome.resultPath)]);
  // Nothing is estimated: without a token count there is no speed to publish, anywhere.
  assert.equal('perf' in JSON.parse(readFileSync(outcome.resultPath, 'utf8')), false);
  assert.deepEqual(itemLines(workspace).map((line) => line.completion_tokens), [null, null, null]);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a speed benchmark definition that could not publish this run stops it before any request', async () => {
  const stub = await stubServer({ ...GOOD });
  const refused = async (speedDefinition, problem) => {
    const workspace = makeWorkspace({ speedDefinition });
    await assert.rejects(runEval(options(workspace, stub)), problem);
    assert.equal(existsSync(workspace.workDir), false, 'no transcript is started');
    assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  };
  await refused({ items: 200 }, /benchmarks\/decode-speed-gsm8k-200\.md.*must be 0 when scoring is \\?"measured\\?"/s);
  await refused({ category: 'speed' }, /benchmarks\/decode-speed-gsm8k-200\.md.*category/s);
  await refused({ measured_on: undefined }, /benchmarks\/decode-speed-gsm8k-200\.md.*measured_on: is required/s);
  // The gate would look for a result of that other benchmark from the same run, and find none.
  await refused(
    { measured_on: 'canary-injection-v1' },
    /benchmarks\/decode-speed-gsm8k-200\.md is measured on "canary-injection-v1", not on "gsm8k-200"/,
  );
  assert.deepEqual(stub.requests, []);
});

/** A workspace whose run stopped at the third item, and the path of its transcript: a header and two items. */
async function interrupted() {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q3?': 500 });
  await assert.rejects(runEval(options(workspace, stub)), /item 3/);
  stub.setReplies({ 'Q3?': 'I think 9' });
  const [file] = readdirSync(workspace.workDir).filter((name) => name.endsWith('.jsonl'));
  return { workspace, stub, path: join(workspace.workDir, file) };
}

// What version 1 wrote in each header field that version 2 changed. One difference is enough.
for (const [field, old] of [['benchmark_version', '1'], ['prompt_version', 'gsm8k-1'], ['max_tokens', 512]]) {
  test(`a transcript whose header differs only in ${field} is not resumed, and is refused under this run's name`, async () => {
    const { workspace, stub, path } = await interrupted();
    const [header, first, second] = readFileSync(path, 'utf8').trimEnd().split('\n');
    assert.notEqual(JSON.parse(header)[field], old);
    const oldHeader = JSON.stringify({ ...JSON.parse(header), [field]: old });
    const third = JSON.stringify({ ...JSON.parse(second), index: 2, expected: '7', extracted: '7', correct: true });
    const finished = [oldHeader, first, second, third, JSON.stringify({ type: 'complete', date: '2026-11-09' })]
      .map((line) => `${line}\n`).join('');

    // Under its own name (the header's hash) it is another configuration's file: left alone, not read.
    const oldPath = join(workspace.workDir, `model-a--gsm8k-200--alice--${sha256(oldHeader).slice(0, 8)}.jsonl`);
    assert.notEqual(oldPath, path);
    writeFileSync(oldPath, finished);
    const outcome = await runEval(options(workspace, stub));
    assert.equal(outcome.transcriptPath, path);
    assert.equal(stub.posts(), 4, 'this run answers its own third item');
    assert.equal(outcome.correct, 2, "the other transcript's three correct verdicts are not counted");
    assert.equal(readFileSync(oldPath, 'utf8'), finished);

    // Renamed to this run's file, it is refused by its header, and its verdicts publish nothing.
    rmSync(outcome.resultPath);
    writeFileSync(path, finished);
    await assert.rejects(runEval(options(workspace, stub)), /does not start with this run's header/);
    assert.equal(stub.posts(), 4);
    assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  });
}

test('a last line cut short by a killed run is dropped, and the run continues', async () => {
  const { workspace, stub, path } = await interrupted();
  appendFileSync(path, '{"type":"item","index":2,"prompt_sha');
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4, 'only the item whose line was cut is requested again');
  assert.equal(outcome.correct, 2);
  // transcriptLines parses every line, so the fragment is gone from the evidence.
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});

test('a last line that lost only its newline is kept, and the next line starts on its own', async () => {
  const { workspace, stub, path } = await interrupted();
  writeFileSync(path, readFileSync(path, 'utf8').trimEnd());
  await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4);
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
});

test('a transcript damaged anywhere but its last line is refused, naming the file', async () => {
  const { workspace, stub, path } = await interrupted();
  const [header, first, second] = readFileSync(path, 'utf8').trimEnd().split('\n');
  const refuses = async (lines, problem) => {
    writeFileSync(path, lines.map((line) => `${line}\n`).join(''));
    await assert.rejects(runEval(options(workspace, stub)), (error) => {
      assert.ok(error.message.includes(path), error.message);
      assert.match(error.message, problem);
      return true;
    });
  };
  await refuses([header, '{"type":"item","index":0,"prom', second], /line 2 is not valid JSON/);
  await refuses([header, second], /its item lines are not items 0, 1, 2, … in order/);
  await refuses([header, first, first], /its item lines are not items 0, 1, 2, … in order/);
  await refuses([header, first, second, second.replace('"index":1', '"index":2'), first.replace('"index":0', '"index":3')], /more items than the benchmark/);
  await refuses([header, first, JSON.stringify({ type: 'complete', date: '2026-11-10' })], /marked complete with 1 of 3 items/);
  await refuses([first, second], /does not start with this run's header/);
  assert.equal(stub.posts(), 3, 'nothing is requested while the transcript is refused');
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});

test('a value the result file could not carry is refused, naming its flag, before any request', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const refused = (overrides, problem) => assert.rejects(runEval(options(workspace, stub, overrides)), problem);
  await refused({ quantization: '' }, /^Error: this run could not be published: --quantization: /);
  await refused({ runtimeVersion: '1'.repeat(101) }, /--runtime-version: /);
  await refused({ runtime: 'lmstudio' }, /--runtime: /);
  await refused({ notes: 'two\nlines' }, /--notes: must be a single line/);
  await refused({ submitter: 'Alice' }, /--submitter: must be a lowercase GitHub handle/);
  await refused({ command: 'x'.repeat(2001) }, /the command line: /);
  await refused({ hardware: { device: 'd'.repeat(201), accelerator: 'cpu', memory_gb: 16 } }, /--device: /);
  await refused({ quantization: '', notes: '' }, /--quantization: [^;]+; --notes: /);
  assert.deepEqual(stub.requests, []);
  assert.equal(existsSync(workspace.workDir), false, 'no transcript is started');
});

test('a configuration that a live run holds is refused, and a lock left by a dead run is taken over', async () => {
  const { workspace, stub, path } = await interrupted();
  const lock = `${path}.lock`;
  assert.equal(existsSync(lock), false, 'a failed run releases its lock');

  writeFileSync(lock, String(process.pid));
  await assert.rejects(
    runEval(options(workspace, stub)),
    new RegExp(`another run of this configuration is active \\(pid ${process.pid}\\)`),
  );
  assert.equal(stub.posts(), 3);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid), 'the holder keeps its lock');

  // No process has this id, so whatever wrote it is gone.
  writeFileSync(lock, '2147483646');
  const outcome = await runEval(options(workspace, stub));
  assert.equal(stub.posts(), 4);
  assert.equal(outcome.n, 3);
  assert.equal(existsSync(lock), false, 'a finished run releases its lock');
});

test('of two runs of one configuration at the same time, one answers the items and the other is refused', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const runs = await Promise.allSettled([runEval(options(workspace, stub)), runEval(options(workspace, stub))]);
  assert.deepEqual(runs.map((run) => run.status).sort(), ['fulfilled', 'rejected']);
  assert.match(runs.find((run) => run.status === 'rejected').reason.message, /another run of this configuration is active/);
  assert.equal(stub.posts(), 3);
  assert.equal(stub.maxActive(), 1);
  assert.deepEqual(transcriptItems(workspace), [0, 1, 2]);
  assert.deepEqual(readdirSync(workspace.workDir).filter((name) => name.endsWith('.lock')), []);
});

test('credentials in the base URL reach the server but not the transcript', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  const outcome = await runEval(options(workspace, stub, { baseUrl: stub.baseUrl.replace('http://', 'http://carol:hunter2@') }));
  assert.equal(outcome.n, 3);
  assert.doesNotMatch(readFileSync(outcome.transcriptPath, 'utf8'), /carol|hunter2/);
  assert.equal(transcriptLines(workspace)[0].base_url, stub.baseUrl);
});
