import assert from 'node:assert/strict';
import test from 'node:test';
import { EVAL_USAGE, parseEvalArgs } from '../src/eval/args.ts';
import { DEFAULT_MAX_SECONDS, DEFAULT_REQUEST_TIMEOUT_SECONDS } from '../src/eval/run.ts';

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
  // Four hours for the run and ten minutes for one reply: the runner's own defaults.
  assert.equal(DEFAULT_MAX_SECONDS, 14_400);
  assert.equal(DEFAULT_REQUEST_TIMEOUT_SECONDS, 600);
  assert.equal(options.maxSeconds, 14_400);
  assert.equal(options.requestTimeoutMs, 600_000);
  // Only what was typed is recorded: a default is not written into the command.
  assert.equal(options.command, `bun run eval -- ${REQUIRED.join(' ')} --base-url http://127.0.0.1:18082/v1`);
  assert.deepEqual(options.hardware, {});
  assert.equal('notes' in options, false);
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

test('--request-timeout is seconds per reply, at least one, and is recorded in the command only when given', () => {
  const options = parseEvalArgs([...REQUIRED, '--request-timeout', '900'], { root: '/repo', env });
  assert.equal(options.requestTimeoutMs, 900_000);
  assert.equal(options.command, `bun run eval -- ${REQUIRED.join(' ')} --request-timeout 900 --base-url http://127.0.0.1:18082/v1`);
  assert.equal(parseEvalArgs([...REQUIRED, '--request-timeout', '1'], { root: '/repo', env }).requestTimeoutMs, 1000);
  assert.equal(parseEvalArgs([...REQUIRED, '--request-timeout', '1.5'], { root: '/repo', env }).requestTimeoutMs, 1500);

  // Below a second no reply could finish, and a value that rounds to nothing would fail every item.
  for (const value of ['0.999', '0.5', '0.0001', '0', '-5', 'soon', '', 'Infinity', '10s']) {
    assert.throws(
      () => parseEvalArgs([...REQUIRED, '--request-timeout', value], { root: '/repo', env }),
      /--request-timeout must be a number of seconds, at least 1/,
      JSON.stringify(value),
    );
  }
  assert.throws(() => parseEvalArgs([...REQUIRED, '--request-timeout'], { root: '/repo', env }), /--request-timeout needs a value/);
});

test('--notes carries one line about the setup into the options and the recorded command', () => {
  const options = parseEvalArgs([...REQUIRED, '--notes', 'thinking disabled'], { root: '/repo', env });
  assert.equal(options.notes, 'thinking disabled');
  assert.match(options.command, /--notes 'thinking disabled'/);
});

test('the recorded command carries no local path and no credentials, and always names the server', () => {
  const fromEnv = parseEvalArgs(
    [...REQUIRED, '--source-file', '/Users/carol/private dir/test.jsonl'],
    { root: '/repo', env: { AGENT_MODEL_BASE_URL: 'http://carol:hunter2@10.0.0.5:11434/v1/' } },
  );
  assert.equal(fromEnv.command, `bun run eval -- ${REQUIRED.join(' ')} --source-file test.jsonl --base-url http://10.0.0.5:11434/v1`);
  // What the run itself uses is untouched.
  assert.equal(fromEnv.sourceFile, '/Users/carol/private dir/test.jsonl');
  assert.equal(fromEnv.baseUrl, 'http://carol:hunter2@10.0.0.5:11434/v1');

  const fromFlag = parseEvalArgs(
    [...REQUIRED, '--base-url', 'https://carol:hunter2@models.example.org/v1/', '--notes', 'thinking disabled'],
    { root: '/repo', env: { AGENT_MODEL_BASE_URL: 'http://127.0.0.1:11434/v1' } },
  );
  assert.equal(fromFlag.command, `bun run eval -- ${REQUIRED.join(' ')} --base-url https://models.example.org/v1 --notes 'thinking disabled'`);
  assert.equal(fromFlag.baseUrl, 'https://carol:hunter2@models.example.org/v1');

  assert.throws(() => parseEvalArgs([...REQUIRED, '--base-url', 'not a url'], { root: '/repo', env }), /--base-url must be a URL/);
  assert.throws(() => parseEvalArgs(REQUIRED, { root: '/repo', env: { AGENT_MODEL_BASE_URL: 'localhost' } }), /--base-url must be a URL/);
});

test('the usage text names --notes and --request-timeout, and says how the time limit works', () => {
  assert.match(EVAL_USAGE, /\[--notes <[^>]+>\]/);
  assert.match(EVAL_USAGE, /--max-seconds 14400[^\n]*per invocation[^\n]*resumed run gets a fresh limit/);
  const usage = EVAL_USAGE.replace(/\s+/g, ' ');
  assert.match(usage, /a 2048-token benchmark can take hours on a slow machine/);
  assert.match(usage, /checked between replies, so a run can overrun it by one reply timeout/);
  assert.match(usage, /re-running the same command resumes/);
  assert.match(EVAL_USAGE, /\[--request-timeout 600\][^\n]*seconds[^\n]*one reply[^\n]*at least 1/);
});

test('missing flags are all named at once', () => {
  assert.throws(() => parseEvalArgs(['--benchmark', 'gsm8k-200'], { root: '/repo', env }), /missing: --model, --served-model, --submitter, --runtime, --runtime-version, --format, --quantization/);
});

test('eval parser rejects duplicate flags and a flag occupying another flag’s value as usage errors', () => {
  const parse = (args) => parseEvalArgs([...REQUIRED, ...args], { root: '/repo', env });
  assert.throws(() => parse(['--runtime', 'ollama']), { name: 'UsageError', message: /duplicate flag --runtime/ });
  assert.throws(() => parse(['--notes', '--base-url', 'http://127.0.0.1:18082/v1']),
    { name: 'UsageError', message: /--notes needs a value/ });
});

test('enumerated values, the handle and numbers are checked before anything runs', () => {
  const swap = (flag, value) => REQUIRED.map((arg, i) => (REQUIRED[i - 1] === flag ? value : arg));
  assert.throws(() => parseEvalArgs(swap('--runtime', 'lmstudio'), { root: '/repo', env }), /--runtime/);
  assert.equal(parseEvalArgs(swap('--runtime', 'mlx-lm-go'), { root: '/repo', env }).runtime, 'mlx-lm-go');
  assert.throws(() => parseEvalArgs(swap('--format', 'onnx'), { root: '/repo', env }), /--format must be one of/);
  assert.throws(() => parseEvalArgs(swap('--submitter', 'not a handle'), { root: '/repo', env }), /--submitter must be a lowercase GitHub handle/);
  assert.throws(() => parseEvalArgs(swap('--submitter', 'Alice'), { root: '/repo', env }), /--submitter must be a lowercase GitHub handle/);
  assert.throws(() => parseEvalArgs([...REQUIRED, '--max-seconds', 'soon'], { root: '/repo', env }), /--max-seconds must be a positive number/);
  assert.throws(() => parseEvalArgs([...REQUIRED, '--bogus', '1'], { root: '/repo', env }), /unknown flag --bogus/);
});
