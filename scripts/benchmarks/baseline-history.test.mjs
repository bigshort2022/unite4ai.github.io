import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineHistoryProblems as checkHistory } from './baseline-history.ts';
import { result } from '../../packages/core/test/fixtures/evals.mjs';

const setup = {
  ...result().setup,
  served_model: 'example/model-4bit',
};
const run = result({ setup });
const entry = {
  id: 'm5', model: run.model, submitter: run.run.submitter, runtime: setup.runtime,
  format: setup.format, quantization: setup.quantization, hardware: setup.hardware,
  served_model: setup.served_model, registered_on: run.run.date,
};
const manifest = (entries = [entry]) => ({ benchmark: run.benchmark, benchmark_version: run.benchmark_version, entries });
const registries = (value) => value === undefined ? new Map() : new Map([['benchmarks-v1.md', value]]);
const baselineHistoryProblems = (base, candidate, results, published = results) => checkHistory(base, candidate, results, published);

test('must preregister a setup in an earlier pull request', () => {
  assert.deepEqual(baselineHistoryProblems(registries(), registries(manifest()), []), []);
  assert.match(baselineHistoryProblems(registries(), registries(manifest()), [run]).join(), /already has results/);
  const original = manifest([{ ...entry, id: 'other', served_model: 'another-model' }]);
  assert.match(baselineHistoryProblems(registries(original), registries(manifest([...original.entries, entry])), [run]).join(), /already has a result/);
  assert.deepEqual(baselineHistoryProblems(registries(manifest()), registries(manifest()), [run]), []);
});

test('a merged baseline can be withdrawn but cannot disappear or change identity', () => {
  const base = registries(manifest());
  const withdrawn = registries(manifest([{ ...entry, withdrawal: { date: '2026-11-23', reason: 'Machine unavailable' } }]));
  assert.deepEqual(baselineHistoryProblems(base, withdrawn, [run]), []);
  assert.match(baselineHistoryProblems(base, registries(), []).join(), /manifest was removed/);
  assert.match(baselineHistoryProblems(base, registries(manifest([{ ...entry, quantization: 'different' }])), []).join(), /changed setup/);
  assert.match(baselineHistoryProblems(base, registries({ ...manifest(), benchmark: 'another-bench' }), []).join(), /benchmark or version changed/);
  const tooEarly = registries(manifest([{ ...entry, registered_on: '2026-11-01', withdrawal: { date: '2026-11-09', reason: 'Machine unavailable' } }]));
  const previouslyRegistered = registries(manifest([{ ...entry, registered_on: '2026-11-01' }]));
  assert.match(baselineHistoryProblems(previouslyRegistered, tooEarly, [run]).join(), /would unlink a published result/);
  assert.deepEqual(baselineHistoryProblems(previouslyRegistered, tooEarly, [run], []), []);
  assert.match(baselineHistoryProblems(withdrawn, base, []).join(), /withdrawal changed/);
});
