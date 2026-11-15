import assert from 'node:assert/strict';
import test from 'node:test';
import { evalResultSchema } from '@unite4ai/schema';
import { speedResultFrom } from '../src/eval/speed.ts';

const SPEED = { id: 'decode-speed-gsm8k-200', version: '1' };

const main = (overrides = {}) => ({
  schema_version: 1,
  model: 'model-a',
  benchmark: 'gsm8k-200',
  benchmark_version: '1',
  score: 71.5,
  n: 200,
  run: { date: '2026-11-10', submitter: 'alice', harness: { name: 'unite4ai-eval', version: '0.1.0' }, command: 'bun run eval -- --benchmark gsm8k-200' },
  setup: { runtime: 'mlx-lm', runtime_version: '0.32.2', format: 'mlx', quantization: '4bit', hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 } },
  perf: { tokens_per_second: 88.4, time_to_first_token_ms: 412.5 },
  evidence: { sha256: 'a'.repeat(64), bytes: 1234 },
  ...overrides,
});

test('the speed result repeats the run, setup and evidence, with the measured speed as its score', () => {
  const speed = speedResultFrom(main(), SPEED);
  assert.equal(evalResultSchema.safeParse(speed).success, true);
  assert.equal(speed.benchmark, 'decode-speed-gsm8k-200');
  assert.equal(speed.benchmark_version, '1');
  assert.equal(speed.score, 88.4);
  assert.equal(speed.n, 200);
  assert.deepEqual(speed.run, main().run);
  assert.deepEqual(speed.setup, main().setup);
  assert.deepEqual(speed.evidence, main().evidence);
  assert.deepEqual(speed.perf, main().perf);
});

test('a note about the setup is repeated on the speed result', () => {
  const noted = main();
  noted.setup.notes = 'thinking disabled';
  assert.equal(speedResultFrom(noted, SPEED).setup.notes, 'thinking disabled');
  assert.equal('notes' in speedResultFrom(main(), SPEED).setup, false);
});

test('a run that did not measure speed has no speed result', () => {
  assert.equal(speedResultFrom(main({ perf: undefined }), SPEED), null);
  assert.equal(speedResultFrom(main({ perf: { time_to_first_token_ms: 400 } }), SPEED), null);
});
