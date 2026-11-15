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

function makeWorkspace({ source = SOURCE, sourceSha = sha256(source) } = {}) {
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
  writeFileSync(sourceFile, source);
  return { root, contentRoot, workDir: join(root, 'work'), sourceFile };
}

const INSTRUCTION = 'Solve this step by step. Finish with the final answer as a number on its own line.';

/** What a completion request gets wrong against the benchmark page's method; null when nothing. */
function requestProblem(body, question) {
  const fixed = { model: 'stub-model', temperature: 0, max_tokens: 512, stream: true };
  for (const [key, value] of Object.entries(fixed)) {
    if (body[key] !== value) return `${key} must be ${JSON.stringify(value)}, got ${JSON.stringify(body[key])}`;
  }
  const wanted = JSON.stringify([{ role: 'user', content: `${question}\n\n${INSTRUCTION}` }]);
  if (JSON.stringify(body.messages) !== wanted) return `messages must be ${wanted}, got ${JSON.stringify(body.messages)}`;
  return null;
}

/**
 * OpenAI-compatible stub. `replies` maps a question to the reply text, to a status code, to
 * `{ error }` (an error event inside a 200 stream), to `{ truncate }` (one content chunk, then
 * the response ends with neither a finish_reason nor [DONE]) or to `{ hang: true }` (no answer
 * at all). A completion request that departs from the published method gets a 500 that says
 * how. `delayMs` is how long a reply takes after its first chunk.
 */
function stubServer(replies, { models = ['stub-model'], delayMs = 15 } = {}) {
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
        const json = (status, payload) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.url === '/v1/models') return json(200, { data: models.map((id) => ({ id })) });
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
        if (typeof reply === 'object') {
          res.write('error' in reply ? event({ error: { message: reply.error } }) : content(reply.truncate));
          return finish();
        }
        const half = Math.ceil(reply.length / 2);
        res.write(content(reply.slice(0, half)));
        setTimeout(() => {
          res.write(content(reply.slice(half)));
          res.write(event({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
          res.write(event({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
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
  assert.deepEqual(result.setup.hardware, { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 });
  const transcript = readFileSync(outcome.transcriptPath);
  assert.equal(result.evidence.sha256, sha256(transcript));
  assert.equal(result.evidence.bytes, transcript.length);

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
    max_tokens: 512,
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

test('the stub refuses a request that departs from the published method', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  await assert.rejects(runEval(options(workspace, stub, { maxTokens: 256 })), /item 1 failed: .*stub: max_tokens must be 512, got 256/);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});

test('a request the server never answers fails the item at the request timeout', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD, 'Q2?': { hang: true } });
  await assert.rejects(runEval(options(workspace, stub, { requestTimeoutMs: 100 })), /item 2 failed: request timed out after 100 ms/);
  assert.equal(stub.posts(), 2);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
  assert.deepEqual(transcriptItems(workspace), [0]);
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
