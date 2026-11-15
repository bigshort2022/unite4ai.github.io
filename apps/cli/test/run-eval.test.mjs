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

/**
 * OpenAI-compatible stub. `replies` maps a question's first line to the reply text, to a status
 * code, to `{ error }` (an error event inside a 200 stream) or to `{ truncate }` (one content
 * chunk, then the response ends with neither a finish_reason nor [DONE]).
 */
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
        const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
        const content = (text) => event({ choices: [{ delta: { content: text }, finish_reason: null }] });
        if (typeof reply === 'object') {
          res.write('error' in reply ? event({ error: { message: reply.error } }) : content(reply.truncate));
          finish();
          return res.end();
        }
        const half = Math.ceil(reply.length / 2);
        res.write(content(reply.slice(0, half)));
        setTimeout(() => {
          res.write(content(reply.slice(half)));
          res.write(event({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
          res.write(event({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
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

/** The item indexes recorded in the workspace's only transcript. */
function transcriptItems(workspace) {
  const [file] = readdirSync(workspace.workDir).filter((name) => name.endsWith('.jsonl'));
  const [, ...items] = readFileSync(join(workspace.workDir, file), 'utf8').trim().split('\n');
  return items.map((line) => JSON.parse(line).index);
}

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

test('the run stops at its time limit without writing a result', async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer({ ...GOOD });
  await assert.rejects(runEval(options(workspace, stub, { maxSeconds: 0 })), /time limit/);
  assert.deepEqual(readdirSync(join(workspace.contentRoot, 'evals')), []);
});
