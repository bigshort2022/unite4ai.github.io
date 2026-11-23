import assert from 'node:assert/strict';
import test from 'node:test';
import { groupEvals, indistinguishableFrom, leaderboard, localSetups as setupsOfCurrent, median, submitterLabel } from '../src/evals.ts';
import { result, run } from './fixtures/evals.mjs';

const setup = (overrides = {}) => ({ ...result().setup, ...overrides });
const by = (submitter, date) => ({ ...result().run, submitter, date });
/** Fixture runs are of version "1" unless a test says otherwise, and here that is each benchmark's current version. */
const CURRENT = new Map([['bench-a', '1'], ['speed-a', '1']]);
const localSetups = (runs) => setupsOfCurrent(runs, CURRENT);

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

test('API accounts group by provider and served model, never by the client as local hardware', () => {
  const local = run('local', { setup: setup({ format: 'other', quantization: 'undisclosed' }) });
  const hosted = (id, provider, served_model = 'model-2026') => run(id, {
    setup: { ...local.setup, runtime: 'api', served_model },
    api: { provider, terms_url: 'https://example.org/terms', terms_checked_on: '2026-11-05', expected_usd: 1, approved_usd: 2 },
    perf: { tokens_per_second: 150 },
  });
  const runs = [local, hosted('a1', 'provider-a'), hosted('a2', 'provider-a'), hosted('b', 'provider-b'), hosted('c', 'provider-a', 'model-2025')];
  const groups = groupEvals(runs);
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.find((g) => g.api?.provider === 'provider-a' && g.api.served_model === 'model-2026').run_ids, ['a1', 'a2']);
  const alternateCard = hosted('a3', 'provider-a');
  alternateCard.api.model_card = 'https://example.org/different-model';
  assert.equal(groupEvals([...runs, alternateCard]).length, 5);
  const [paid] = groupEvals([hosted('hosted', 'provider-a')], { byHardware: new Set(['bench-a']) });
  assert.equal(paid.device, null);
  assert.equal(paid.tokens_per_second, null);
  assert.deepEqual(localSetups(runs), localSetups([local]));
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

/** A repeat block carrying only what grouping reads; the leaderboard does not recompute it. */
const repeatWith = (pass_k_ci) => ({ repeat: { pass_k_ci } });

test('a repeat-run group spans its members\' intervals; a group with a single-run member has none', () => {
  const [group] = groupEvals([
    run('a', repeatWith([60, 80])),
    run('b', repeatWith([70, 90])),
    run('c', repeatWith([65, 85])),
  ]);
  assert.deepEqual(group.pass_k_ci, [60, 90]);
  assert.equal(groupEvals([run('a', repeatWith([60, 80])), run('b')])[0].pass_k_ci, null);
  assert.equal(groupEvals([run('a')])[0].pass_k_ci, null);
});

test('a row is not distinguishable from the highest-ranked earlier row whose interval overlaps its own', () => {
  const rows = (...intervals) => intervals.map((pass_k_ci) => ({ pass_k_ci }));
  assert.deepEqual(indistinguishableFrom(rows([80, 90], [70, 85], [50, 60])), [null, 0, null]);
  // The highest-ranked overlapping row, not the nearest; touching intervals overlap.
  assert.deepEqual(indistinguishableFrom(rows([80, 90], [75, 88], [70, 80])), [null, 0, 0]);
  assert.deepEqual(indistinguishableFrom(rows([80, 90], null, [70, 85])), [null, null, 0]);
  assert.deepEqual(indistinguishableFrom(rows(null, [70, 85])), [null, null]);
  assert.deepEqual(indistinguishableFrom([]), []);
});

test('submitter labels describe submitting accounts, not independent reproduction', () => {
  const single = groupEvals([run('a'), run('b')])[0];
  assert.equal(single.runs, 2);
  assert.equal(submitterLabel(single), '1 submitting account');
  const multiple = groupEvals([run('a'), run('b', { run: by('bob', '2026-11-11') }), run('c', { run: by('carol', '2026-11-12') })])[0];
  assert.equal(submitterLabel(multiple), '3 submitting accounts');
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
  // localeCompare would put "a-quant" before "B-quant"; code units put the capital first.
  const setups = localSetups([run('a', { setup: setup({ quantization: 'a-quant' }) }), run('b', { setup: setup({ quantization: 'B-quant' }) })]);
  assert.deepEqual(setups.map((s) => s.quantization), ['B-quant', 'a-quant']);
});

const hardware = (overrides = {}) => ({ ...result().setup.hardware, ...overrides });

test('measured benchmarks are grouped per machine and runtime; other benchmarks are not', () => {
  const runs = [
    run('q1', { benchmark: 'bench-a', score: 60 }),
    run('q2', { benchmark: 'bench-a', score: 70, setup: setup({ hardware: hardware({ device: 'Other Box', accelerator: 'nvidia', memory_gb: 24 }) }) }),
    run('s1', { benchmark: 'speed-a', score: 40 }),
    run('s2', { benchmark: 'speed-a', score: 90, setup: setup({ hardware: hardware({ device: 'Other Box', accelerator: 'nvidia', memory_gb: 24 }) }) }),
    run('s3', { benchmark: 'speed-a', score: 44, run: by('bob', '2026-11-12') }),
  ];
  const groups = groupEvals(runs, { byHardware: new Set(['speed-a']) });

  const quality = groups.filter((g) => g.benchmark === 'bench-a');
  assert.equal(quality.length, 1, 'a score does not depend on the machine');
  assert.equal(quality[0].device, null);
  assert.equal(quality[0].memory_gb, null);

  const speed = groups.filter((g) => g.benchmark === 'speed-a');
  assert.equal(speed.length, 2);
  const laptop = speed.find((g) => g.device === 'MacBook Pro (M2 Max)');
  assert.deepEqual(laptop.run_ids, ['s1', 's3']);
  assert.equal(laptop.score, 42);
  assert.equal(laptop.memory_gb, 32);
  assert.deepEqual(laptop.submitters, ['alice', 'bob']);
  const box = speed.find((g) => g.device === 'Other Box');
  assert.equal(box.score, 90);
  assert.equal(box.memory_gb, 24);
});

test('devices that differ only in memory are separate measured groups', () => {
  const groups = groupEvals([
    run('a', { benchmark: 'speed-a', score: 40 }),
    run('b', { benchmark: 'speed-a', score: 50, setup: setup({ hardware: hardware({ memory_gb: 64 }) }) }),
  ], { byHardware: new Set(['speed-a']) });
  assert.deepEqual(groups.map((g) => g.memory_gb).sort((x, y) => x - y), [32, 64]);
});

test('without the option no benchmark is grouped by hardware', () => {
  const groups = groupEvals([
    run('a', { benchmark: 'speed-a', score: 40 }),
    run('b', { benchmark: 'speed-a', score: 50, setup: setup({ hardware: hardware({ device: 'Other Box' }) }) }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].device, null);
});

test('localSetups reports the lowest measured time to first token per setup', () => {
  const setups = localSetups([
    run('a', { perf: { tokens_per_second: 40, time_to_first_token_ms: 900 } }),
    run('b', { perf: { tokens_per_second: 55, time_to_first_token_ms: 650.5 } }),
    run('c', { setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
  ]);
  const mlx = setups.find((s) => s.format === 'mlx');
  assert.equal(mlx.time_to_first_token_ms, 650.5);
  assert.equal(mlx.tokens_per_second, 55);
  assert.equal(setups.find((s) => s.format === 'gguf').time_to_first_token_ms, null);
});

test('localSetups keeps the lowest time to first token when a later run is slower or did not measure it', () => {
  const [only, ...others] = localSetups([
    run('a', { perf: { tokens_per_second: 55, time_to_first_token_ms: 650.5 } }),
    run('b', { perf: { tokens_per_second: 40, time_to_first_token_ms: 900 } }),
    run('c'),
    run('d', { perf: { tokens_per_second: 60 } }),
  ]);
  assert.deepEqual(others, []);
  assert.equal(only.time_to_first_token_ms, 650.5);
  assert.equal(only.tokens_per_second, 60);
});

test('localSetups counts only runs of the current version of their benchmark', () => {
  const otherBox = setup({ hardware: { ...result().setup.hardware, device: 'Other Box' } });
  const runs = [
    // Version 1 of bench-a was faster and quicker to start, on a workload nobody runs any more.
    run('a-old', { benchmark_version: '1', perf: { tokens_per_second: 90, time_to_first_token_ms: 100 } }),
    run('b-current', { benchmark_version: '2', perf: { tokens_per_second: 30, time_to_first_token_ms: 700 } }),
    // A machine that only ever ran the old version.
    run('c-old-box', { benchmark_version: '1', setup: otherBox, perf: { tokens_per_second: 50 } }),
    // Another benchmark, still at its version 1, on the first machine.
    run('d-speed', { benchmark: 'speed-a', benchmark_version: '1', perf: { tokens_per_second: 35, time_to_first_token_ms: 800 } }),
  ];
  const current = new Map([['bench-a', '2'], ['speed-a', '1']]);
  const [only, ...others] = setupsOfCurrent(runs, current);
  assert.deepEqual(others, [], 'the machine with only an old-version run is not listed');
  assert.equal(only.device, 'MacBook Pro (M2 Max)');
  assert.equal(only.tokens_per_second, 35, 'the best current speed, from whichever benchmark');
  assert.equal(only.time_to_first_token_ms, 700);
  assert.deepEqual(setupsOfCurrent([...runs].reverse(), current), [only]);

  // The map decides, not the data: with version 1 current, the other three runs are the old ones.
  const before = setupsOfCurrent(runs, new Map([['bench-a', '1'], ['speed-a', '2']]));
  assert.deepEqual(before.map((s) => [s.device, s.tokens_per_second, s.time_to_first_token_ms]), [
    ['MacBook Pro (M2 Max)', 90, 100],
    ['Other Box', 50, null],
  ]);
});

test('localSetups leaves out a run whose benchmark has no current version, and spells the device as its first current run does', () => {
  assert.deepEqual(setupsOfCurrent([run('a')], new Map()), []);
  assert.deepEqual(setupsOfCurrent([run('a')], new Map([['bench-b', '1']])), []);

  const on = (device) => setup({ hardware: { ...result().setup.hardware, device } });
  const setups = setupsOfCurrent(
    [run('a', { benchmark_version: '1', setup: on('APPLE M5 (MAC17,2)') }), run('b', { benchmark_version: '2', setup: on('Apple M5 (Mac17,2)') })],
    new Map([['bench-a', '2']]),
  );
  assert.deepEqual(setups.map((s) => s.device), ['Apple M5 (Mac17,2)']);
});

const measured = (runs) => groupEvals(runs, { byHardware: new Set(['speed-a']) });
const speedRun = (id, overrides = {}) => run(id, { benchmark: 'speed-a', ...overrides });

test('a measured group is one runtime on one machine: a difference in exactly one of them separates two runs', () => {
  const separate = (other) => measured([speedRun('base'), speedRun('other', { setup: other })]).length;
  assert.equal(separate(setup({ runtime: 'transformers' })), 2, 'runtime');
  assert.equal(separate(setup({ hardware: hardware({ device: 'Mac Studio (M2 Ultra)' }) })), 2, 'device');
  assert.equal(separate(setup({ hardware: hardware({ accelerator: 'cpu' }) })), 2, 'accelerator');
  assert.equal(separate(setup({ hardware: hardware({ memory_gb: 64 }) })), 2, 'memory');
  assert.equal(separate(setup()), 1);

  const byRuntime = measured([speedRun('a', { score: 40 }), speedRun('b', { score: 90, setup: setup({ runtime: 'transformers' }) })]);
  assert.deepEqual(byRuntime.map((g) => [g.runtime, g.score]), [['mlx-lm', 40], ['transformers', 90]]);
});

test('a measured group pools the runs of one runtime on one machine: median score, every runtime version', () => {
  const [group, ...others] = measured([
    speedRun('a', { score: 40 }),
    speedRun('b', { score: 50, setup: setup({ runtime_version: '0.31.0' }), run: by('bob', '2026-11-12') }),
    speedRun('c', { score: 50 }),
  ]);
  assert.deepEqual(others, []);
  assert.equal(group.score, 50);
  assert.equal(group.score_min, 40);
  assert.equal(group.runs, 3);
  assert.deepEqual(group.submitters, ['alice', 'bob']);
  assert.equal(group.runtime, 'mlx-lm');
  assert.deepEqual(group.runtime_versions, ['0.31.0', '0.32.4']);

  // A score does not depend on the runtime, so other groups name neither it nor its versions.
  const [quality] = groupEvals([run('q')], { byHardware: new Set(['speed-a']) });
  assert.equal(quality.runtime, null);
  assert.equal(quality.runtime_versions, null);
});

test('spellings of one device that differ in case, spacing or character width are one machine', () => {
  const on = (device) => setup({ hardware: hardware({ device }) });
  const runs = [
    speedRun('b', { score: 50, setup: on('apple  m5 (mac17,2)') }),
    speedRun('a', { score: 40, setup: on('Apple M5 (Mac17,2)') }),
    speedRun('c', { score: 60, setup: on(' APPLE\u00a0M5 （Mac17,2） ') }),
  ];
  const [group, ...others] = measured(runs);
  assert.deepEqual(others, []);
  assert.deepEqual(group.run_ids, ['a', 'b', 'c']);
  assert.equal(group.score, 50);
  // The spelling shown is the one on the first run by id, whatever order the runs arrive in.
  assert.equal(group.device, 'Apple M5 (Mac17,2)');
  assert.deepEqual(measured([...runs].reverse()), measured(runs));

  const setups = localSetups(runs);
  assert.deepEqual(setups.map((s) => s.device), ['Apple M5 (Mac17,2)']);
  assert.deepEqual(localSetups([...runs].reverse()), setups);

  // A different machine is still a different machine.
  assert.equal(measured([...runs, speedRun('d', { setup: on('Apple M5 (Mac17,3)') })]).length, 2);
});
