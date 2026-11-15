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

test('runs that differ in exactly one grouping field land in separate groups', () => {
  const base = run('base');
  const separate = (other) => groupEvals([base, other]).length;
  assert.equal(separate(run('format', { setup: setup({ format: 'gguf' }) })), 2);
  assert.equal(separate(run('quantization', { setup: setup({ quantization: '8bit' }) })), 2);
  assert.equal(separate(run('benchmark', { benchmark: 'bench-b' })), 2);
  assert.equal(separate(run('same')), 1);
});

test('a separator character inside a field cannot merge two groups', () => {
  const groups = groupEvals([
    run('a', { benchmark_version: '1', setup: setup({ quantization: 'mlx|4bit' }) }),
    run('b', { benchmark_version: '1|mlx', setup: setup({ quantization: '4bit' }) }),
  ]);
  assert.equal(groups.length, 2);
  assert.notEqual(groups[0].key, groups[1].key);
});

test('a group reports the smallest item count among its runs', () => {
  const [group] = groupEvals([run('a', { n: 200 }), run('b', { n: 150 }), run('c', { n: 180 })]);
  assert.equal(group.n, 150);
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

test('reproduction label counts submitters other than the first, not runs', () => {
  const single = groupEvals([run('a'), run('b')])[0];
  assert.equal(single.runs, 2);
  assert.equal(reproductionLabel(single), 'not yet reproduced');
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

test('the ranking is total: full ties order by group key, whatever order the groups arrive in', () => {
  const groups = groupEvals([
    run('z1', { model: 'zeta', score: 80 }),
    run('s8', { model: 'same', score: 80, setup: setup({ quantization: '8bit' }) }),
    run('s4', { model: 'same', score: 80, setup: setup({ quantization: '4bit' }) }),
    run('a1', { model: 'alpha', score: 80 }),
  ]);
  const benchmark = { id: 'bench-a', version: '1', higher_is_better: true };
  const expected = [['alpha', '4bit'], ['same', '4bit'], ['same', '8bit'], ['zeta', '4bit']];
  const order = (input) => leaderboard(input, benchmark).map((g) => [g.model, g.quantization]);
  assert.deepEqual(order(groups), expected);
  assert.deepEqual(order([...groups].reverse()), expected);
  assert.deepEqual(groups.map((g) => g.model), ['alpha', 'same', 'same', 'zeta'], 'leaderboard does not reorder its input');
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

test('localSetups keeps setups apart when they differ only in runtime, device or memory', () => {
  const hardware = (overrides) => setup({ hardware: { ...result().setup.hardware, ...overrides } });
  const distinct = (other) => localSetups([run('base'), run('other', { setup: other })]).length;
  assert.equal(distinct(setup({ runtime: 'transformers' })), 2);
  assert.equal(distinct(hardware({ device: 'Mac Studio (M2 Ultra)' })), 2);
  assert.equal(distinct(hardware({ memory_gb: 64 })), 2);
  assert.equal(distinct(setup()), 1);
});

test('a separator character inside a field cannot merge two setups', () => {
  const hardware = (device) => ({ ...result().setup.hardware, device });
  const setups = localSetups([
    run('a', { setup: setup({ quantization: 'q|apple-silicon', hardware: hardware('D') }) }),
    run('b', { setup: setup({ quantization: 'q', hardware: hardware('apple-silicon|D') }) }),
  ]);
  assert.equal(setups.length, 2);
});

test('groups are ordered by code units, so the order is the same in every locale', () => {
  // localeCompare would put "a-model" before "B-model"; code units put the capital first.
  const groups = groupEvals([run('x', { model: 'a-model' }), run('y', { model: 'B-model' })]);
  assert.deepEqual(groups.map((g) => g.model), ['B-model', 'a-model']);
});

test('a full tie on score and reproduction ranks models by code units, not by locale', () => {
  // localeCompare would put "alpha" before "Zeta"; code units put the capital first.
  const groups = groupEvals([run('a', { model: 'alpha', score: 80 }), run('z', { model: 'Zeta', score: 80 })]);
  const ranked = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: true });
  assert.deepEqual(ranked.map((g) => g.model), ['Zeta', 'alpha']);
});

test('localSetups orders setups by code units, not by locale', () => {
  const on = (device) => setup({ hardware: { ...result().setup.hardware, device } });
  const setups = localSetups([run('a', { setup: on('apple box') }), run('z', { setup: on('Zen box') })]);
  assert.deepEqual(setups.map((s) => s.device), ['Zen box', 'apple box']);
});
