import assert from 'node:assert/strict';
import test from 'node:test';
import { groupEvals, leaderboard, localSetups, median, reproductionLabel } from '../src/evals.ts';
import { result, run } from './fixtures/evals.mjs';

const setup = (overrides = {}) => ({ ...result().setup, ...overrides });
const by = (submitter, date) => ({ ...result().run, submitter, date });

test('median handles odd and even counts without mutating its input', () => {
  const values = [9, 1, 5];
  assert.equal(median(values), 5);
  assert.deepEqual(values, [9, 1, 5]);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
});

test('runs are grouped by model, benchmark, version, format and quantization, not by runtime', () => {
  const groups = groupEvals([
    run('a', { score: 60 }),
    run('b', { score: 64, setup: setup({ runtime: 'transformers' }) }),
    run('c', { score: 70, setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
    run('d', { score: 50, benchmark_version: '0' }),
    run('e', { score: 55, model: 'model-b' }),
  ]);
  assert.equal(groups.length, 4);
  const mlx = groups.find((g) => g.model === 'model-a' && g.format === 'mlx' && g.benchmark_version === '1');
  assert.deepEqual(mlx.run_ids, ['a', 'b']);
  assert.deepEqual(mlx.runtimes, ['mlx-lm', 'transformers']);
});

test('a group reports median, range, run count, distinct submitters, latest date and median speed', () => {
  const [group] = groupEvals([
    run('a', { score: 60, run: by('alice', '2026-11-01'), perf: { tokens_per_second: 40 } }),
    run('b', { score: 70, run: by('bob', '2026-11-05'), perf: { tokens_per_second: 60 } }),
    run('c', { score: 62, run: by('alice', '2026-11-03') }),
  ]);
  assert.equal(group.score, 62);
  assert.equal(group.score_min, 60);
  assert.equal(group.score_max, 70);
  assert.equal(group.runs, 3);
  assert.equal(group.n, 200);
  assert.deepEqual(group.submitters, ['alice', 'bob']);
  assert.equal(group.latest, '2026-11-05');
  assert.equal(group.tokens_per_second, 50);
  assert.deepEqual(group.accelerators, ['apple-silicon']);
});

test('speed is null when no run measured it', () => {
  assert.equal(groupEvals([run('a')])[0].tokens_per_second, null);
});

test('reproduction label counts submitters other than the first', () => {
  const single = groupEvals([run('a'), run('b')])[0];
  assert.equal(reproductionLabel(single), 'single run');
  const reproduced = groupEvals([run('a'), run('b', { run: by('bob', '2026-11-11') }), run('c', { run: by('carol', '2026-11-12') })])[0];
  assert.equal(reproductionLabel(reproduced), 'reproduced by 2');
});

test('leaderboard keeps only the current version and ranks by the metric direction', () => {
  const groups = groupEvals([
    run('low', { model: 'm-low', score: 40 }),
    run('high', { model: 'm-high', score: 90 }),
    run('old', { model: 'm-old', score: 99, benchmark_version: '0' }),
    run('other', { model: 'm-other', score: 95, benchmark: 'bench-b' }),
  ]);
  const up = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: true });
  assert.deepEqual(up.map((g) => g.model), ['m-high', 'm-low']);
  const down = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: false });
  assert.deepEqual(down.map((g) => g.model), ['m-low', 'm-high']);
});

test('equal scores rank the more widely reproduced group first, then by model id', () => {
  const groups = groupEvals([
    run('z1', { model: 'zeta', score: 80 }),
    run('a1', { model: 'alpha', score: 80 }),
    run('r1', { model: 'repro', score: 80 }),
    run('r2', { model: 'repro', score: 80, run: by('bob', '2026-11-11') }),
  ]);
  const ranked = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: true });
  assert.deepEqual(ranked.map((g) => g.model), ['repro', 'alpha', 'zeta']);
});

test('localSetups lists each distinct setup once with its best measured speed', () => {
  const setups = localSetups([
    run('a', { perf: { tokens_per_second: 40 } }),
    run('b', { perf: { tokens_per_second: 55 } }),
    run('c', { setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
  ]);
  assert.equal(setups.length, 2);
  const mlx = setups.find((s) => s.format === 'mlx');
  assert.equal(mlx.tokens_per_second, 55);
  assert.equal(mlx.device, 'MacBook Pro (M2 Max)');
  assert.equal(setups.find((s) => s.format === 'gguf').tokens_per_second, null);
});
