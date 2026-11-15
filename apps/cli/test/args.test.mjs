import assert from 'node:assert/strict';
import test from 'node:test';
import { EVAL_USAGE, parseEvalArgs } from '../src/eval/args.ts';

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

test('--notes carries one line about the setup into the options and the recorded command', () => {
  const options = parseEvalArgs([...REQUIRED, '--notes', 'thinking disabled'], { root: '/repo', env });
  assert.equal(options.notes, 'thinking disabled');
  assert.match(options.command, /--notes 'thinking disabled'/);
});

test('the usage text names --notes and says the time limit is per invocation', () => {
  assert.match(EVAL_USAGE, /\[--notes <[^>]+>\]/);
  assert.match(EVAL_USAGE, /--max-seconds 3600[^\n]*per invocation[^\n]*resumed run gets a fresh limit/);
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
