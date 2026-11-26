import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SUITES } from '../../apps/cli/src/eval/suites.ts';
import { repeatSummary } from '../../packages/core/src/repeat.ts';
import { baselineFloors } from './baseline-floors.ts';

const pages = new URL('../../apps/web/src/content/benchmarks/', import.meta.url);
const checker = fileURLToPath(new URL('./bfcl_crosscheck.py', import.meta.url));
const bfclFixtures = new URL('../../apps/cli/test/fixtures/bfcl/', import.meta.url);
const promptHashes = SUITES['bfcl-multiple-50'].items(
  readFileSync(new URL('BFCL_v4_multiple.json', bfclFixtures), 'utf8'),
  50,
  readFileSync(new URL('BFCL_v4_multiple_possible_answer.json', bfclFixtures), 'utf8'),
).map(({ messages }) => createHash('sha256').update(JSON.stringify(messages)).digest('hex'));

const percent = (value) => `${Number(value.toFixed(6))}%`;

for (const [benchmark, [items, first, pass1, pass5]] of Object.entries({
  'tool-selection-v1': [100, 15, 7.9634999804, 0.0004856859],
  'bfcl-multiple-50': [50, 19, 41, 1.6597222222],
})) {
  test(`${benchmark} documents the tool-only floors from the checked source bytes`, () => {
    const floor = baselineFloors()[benchmark];
    assert.equal(floor.items, items);
    assert.equal(floor.firstCorrect, first);
    assert.ok(Math.abs(floor.randomPass1Pct - pass1) < 1e-10);
    assert.ok(Math.abs(floor.randomPass5Pct - pass5) < 1e-10);

    const page = readFileSync(new URL(`${benchmark}.md`, pages), 'utf8');
    assert.ok(page.split('\n').includes(
      `| Uniform random | ${percent(floor.randomPass1Pct)} | ${percent(floor.randomPass5Pct)} |`,
    ));
    const firstRate = `${first}/${items} (${percent(100 * first / items)})`;
    assert.ok(page.split('\n').includes(`| Always first listed tool | ${firstRate} | ${firstRate} |`));
  });
}

function transcriptRecords() {
  return [
    {
      type: 'header',
      benchmark: 'bfcl-multiple-50',
      benchmark_version: '1',
      prompt_version: 'bfcl-multiple-1',
      source_sha256: 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a',
      answers_sha256: '244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047',
      repeat: { runs: 5, temperature: 0.7, top_p: 1 },
      max_tokens: 1024,
    },
    ...Array.from({ length: 250 }, (_, seed) => {
      const extracted = seed === 51 ? JSON.stringify({ private: 'never print this' }) : null;
      return {
        type: 'item', run: Math.floor(seed / 50), index: seed % 50, seed,
        reply: `private reply\u2028with a line separator${extracted ?? ''}`,
        prompt_sha256: promptHashes[seed % 50], finish_reason: 'stop', completion_tokens: null,
        extracted, correct: false,
      };
    }),
    { type: 'complete', date: '2026-11-22' },
  ];
}

function crosscheck(t, records, json = true) {
  const dir = mkdtempSync(join(tmpdir(), 'u4ai-bfcl-crosscheck-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const transcript = join(dir, 'transcript.jsonl');
  const bytes = Buffer.from(records.map((record) => `${JSON.stringify(record)}\n`).join(''));
  writeFileSync(transcript, bytes);
  const result = spawnSync('python3', [checker, 'transcript', transcript, ...(json ? ['--json'] : [])], {
    encoding: 'utf8', timeout: 120_000,
  });
  assert.ifError(result.error);
  return { ...result, digest: createHash('sha256').update(bytes).digest('hex') };
}

// A no-call answer needs no upstream checker; both graders mark it wrong.
test('BFCL JSON report is bound to the exact bytes and has one boolean per attempt', { timeout: 120_000 }, (t) => {
  const result = crosscheck(t, transcriptRecords());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    transcript_sha256: result.digest,
    agreement: Array(250).fill(true),
  });
});

test('BFCL defaults to a text summary that omits private replies', { timeout: 120_000 }, (t) => {
  const result = crosscheck(t, transcriptRecords(), false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /250 of 250 answers/);
  assert.doesNotMatch(result.stdout, /private reply|never print this/);
});

function reviewFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'u4ai-bfcl-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const records = transcriptRecords();
  const setup = {
    runtime: 'mlx-lm', runtime_version: '1.0', served_model: 'fixture/mlx',
    format: 'mlx', quantization: '4bit', notes: 'private setup note',
    hardware: { device: 'Fixture Mac', accelerator: 'apple-silicon', memory_gb: 64 },
  };
  const { hardware, ...headerSetup } = setup;
  Object.assign(records[0], headerSetup, { model: 'fixture-model' });
  for (const attempt of records.slice(1, -1)) Object.assign(attempt, { seconds: 0.5, prompt_tokens: 10 });
  const repeat = repeatSummary(records[0].repeat, {
    item_pass_histogram: [50, 0, 0, 0, 0, 0], run_correct: [0, 0, 0, 0, 0], seconds_total: 125, prompt_tokens_total: 2500,
  });
  return (change = () => {}) => {
    const rows = structuredClone(records);
    const result = {
      schema_version: 1, model: 'fixture-model', benchmark: 'bfcl-multiple-50', benchmark_version: '1', n: 50, score: 0,
      run: { date: '2026-11-22', submitter: 'fixture-user', harness: { name: 'unite4ai-eval', version: '0.3.0' }, command: 'private command' },
      setup: structuredClone(setup), repeat: structuredClone(repeat), evidence: {},
    };
    const mutateResult = change(rows, result);
    const transcript = Buffer.from(rows.map((record) => `${JSON.stringify(record)}\n`).join(''));
    result.evidence = { sha256: createHash('sha256').update(transcript).digest('hex'), bytes: transcript.length };
    mutateResult?.();
    const bytes = JSON.stringify(result);
    const resultPath = join(dir, 'result.json');
    const transcriptPath = join(dir, 'transcript.jsonl');
    writeFileSync(resultPath, bytes);
    writeFileSync(transcriptPath, transcript);
    const execution = spawnSync('python3', [checker, 'review-result', resultPath, transcriptPath], { encoding: 'utf8', timeout: 120_000 });
    assert.ifError(execution.error);
    assert.doesNotMatch(execution.stdout + execution.stderr, /private (?:reply|setup note|command)|never print this/);
    return { ...execution, result, resultSha: createHash('sha256').update(bytes).digest('hex') };
  };
}

test('BFCL review binds the complete replay to both exact files without publishing dialogue', { timeout: 120_000 }, (t) => {
  // BFCL can complete on [DONE] without a finish reason or token count.
  const { status, stderr, stdout, result, resultSha } = reviewFixture(t)((rows) => { rows[1].finish_reason = null; });
  assert.equal(status, 0, stderr);
  const report = JSON.parse(stdout);
  assert.equal(report.scope, 'bfcl-v1-local-consistency');
  assert.equal(report.result_sha256, resultSha);
  assert.deepEqual(report.transcript, result.evidence);
  assert.equal(report.attempts, 250);
  assert.deepEqual(report.scores, {
    pass_1: 0, pass_1_ci: result.repeat.pass_1_ci, pass_k: 0, pass_k_ci: result.repeat.pass_k_ci,
  });
  assert.ok(report.unchecked.includes('independent_identity'));
});

test('BFCL review refuses mismatches even when the submitted repeat math is coherent', { timeout: 120_000 }, (t) => {
  const review = reviewFixture(t);
  for (const [change, diagnostic] of [
    [(_, result) => () => {
      result.repeat = repeatSummary(result.repeat, {
        item_pass_histogram: [49, 0, 0, 0, 0, 1], run_correct: [1, 1, 1, 1, 1], seconds_total: 125, prompt_tokens_total: 2500,
      });
      result.score = result.repeat.pass_k;
    }, /repeat\.item_pass_histogram/],
    [(_, result) => () => { result.evidence.bytes -= 1; }, /evidence\.bytes/],
    [(_, result) => () => { result.evidence.sha256 = 'a'.repeat(64); }, /evidence\.sha256/],
    [(_, result) => () => { result.setup.notes = 'different'; }, /setup\.notes/],
    [(_, result) => () => { result.run.date = '2026-11-23'; }, /run\.date/],
    [(rows) => { rows[1].correct = true; }, /correct does not match the replayed verdict/],
    [(rows) => { rows[1].seconds = null; }, /seconds/],
    [(_, result) => () => { result.perf = { energy_wh_per_1k_tokens: 0.1 }; }, /perf\.energy_wh_per_1k_tokens/],
  ]) {
    const result = review(change);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, diagnostic);
    assert.equal(result.stdout, '');
  }
});

for (const [name, change, error] of [
  ['an empty transcript', (rows) => rows.splice(0), /not a .*transcript|header/],
  ['a different question pin', (rows) => { rows[0].source_sha256 = '0'.repeat(64); }, /source_sha256/],
  ['a different answer pin', (rows) => { rows[0].answers_sha256 = '0'.repeat(64); }, /answers_sha256/],
  ['a different benchmark version', (rows) => { rows[0].benchmark_version = '2'; }, /benchmark_version/],
  ['different repeat settings', (rows) => { rows[0].repeat.temperature = 0; }, /repeat/],
  ['an out-of-order attempt', (rows) => { [rows[1], rows[2]] = [rows[2], rows[1]]; }, /run 0.*item 0.*seed 0/],
  ['a duplicate attempt', (rows) => { rows[2] = rows[1]; }, /run 0.*item 1.*seed 1/],
  ['a seed different from the position', (rows) => { rows[51].seed = 0; }, /run 1.*item 0.*seed 50/],
  ['an answer without its raw reply', (rows) => { delete rows[52].reply; }, /reply.*run 1 item 1 seed 51/],
  ['an answer without a finish reason', (rows) => { delete rows[52].finish_reason; }, /finish_reason.*run 1 item 1 seed 51/],
  ['an answer without a token count field', (rows) => { delete rows[52].completion_tokens; }, /completion_tokens.*run 1 item 1 seed 51/],
  ['an invalid prompt hash', (rows) => { rows[52].prompt_sha256 = 'g'.repeat(64); }, /prompt_sha256.*run 1 item 1 seed 51/],
  ['a stale prompt hash', (rows) => { rows[52].prompt_sha256 = promptHashes[0]; }, /run 1 item 1 seed 51.*prompt_sha256/],
  ['a stale extraction', (rows) => { rows[52].extracted = null; }, /run 1 item 1 seed 51.*extracted/],
  ['a stale correctness verdict', (rows) => { rows[52].correct = true; }, /run 1 item 1 seed 51.*correct/],
  ['a missing answer', (rows) => rows.splice(1, 1), /250 answers/],
  ['no completion footer', (rows) => rows.pop(), /250 answers|complete footer/],
  ['an invalid completion date', (rows) => { rows.at(-1).date = '2026-11-31'; }, /complete footer/],
]) {
  test(`BFCL rejects ${name} before reporting`, { timeout: 120_000 }, (t) => {
    const records = transcriptRecords();
    change(records);
    const result = crosscheck(t, records);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, error);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /private reply|never print this/);
  });
}
