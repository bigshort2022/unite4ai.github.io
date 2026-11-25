import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReplicationIndex, repeatSummary } from '../src/index.ts';
import { run } from './fixtures/evals.mjs';

const evidence = repeatSummary({ runs: 2, temperature: 0.7, top_p: 1 }, {
  item_pass_histogram: [30, 10, 60], run_correct: [65, 65], seconds_total: 100,
});

function candidate(id, submitter, { pass1 = [60, 70], passK = [50, 65], ...overrides } = {}) {
  const result = run(id, overrides);
  if (overrides.setup === undefined) result.setup.served_model = 'fixture/model-a-4bit';
  result.run.submitter = submitter;
  result.repeat = { ...evidence, pass_1_ci: pass1, pass_k_ci: passK };
  return result;
}

const peer = (result, relationship) => ({ result, relationship });

test('both intervals must overlap inclusively; count each reported handle once and retain conflicting runs', () => {
  const origin = candidate('a', 'alice');
  const edge = candidate('b', 'bob', { pass1: [70, 80], passK: [65, 70] });
  const another = candidate('c', 'bob');
  const otherSubmitter = candidate('d', 'charlie');
  const wrongK = candidate('e', 'bob', { pass1: [60, 70], passK: [20, 49] });
  const wrong1 = candidate('f', 'diane', { pass1: [71, 80], passK: [50, 65] });
  const runs = [origin, edge, another, otherSubmitter, wrongK, wrong1];
  const index = buildReplicationIndex(runs);
  assert.deepEqual(index, buildReplicationIndex([...runs].reverse()));
  assert.deepEqual(index.get('a'), {
    consistent_submitters: 2,
    independent_replicators: 0,
    contested: true,
    peers: [
      peer('b', 'consistent'), peer('c', 'consistent'), peer('d', 'consistent'),
      peer('e', 'inconsistent'), peer('f', 'inconsistent'),
    ],
  });
  assert.ok(index.get('e').peers.some(({ result, relationship }) => result === 'a' && relationship === 'inconsistent'));
  assert.ok(index.get('d').peers.some(({ result, relationship }) => result === 'b' && relationship === 'consistent'));
});

test('same-handle local repeats count only as other hardware, not as consistent submissions or contested', () => {
  const origin = candidate('a', 'alice');
  const { setup } = origin;
  const changes = [
    { device: 'Other model' },
    { accelerator: 'nvidia' },
    { memory_gb: 64 },
  ];
  const sameOwner = changes.map((change, i) => candidate(`other-${i}`, 'alice', {
    pass1: [0, 10], passK: [0, 10], setup: { ...setup, hardware: { ...setup.hardware, ...change } },
  }));
  const sameHardware = candidate('unchanged', 'alice', {
    setup: {
      ...setup, runtime_version: 'different',
      hardware: { ...setup.hardware, device: '  ｍａｃｂｏｏｋ\t PRO   (m2  MAX)  ' },
    },
  });
  const index = buildReplicationIndex([origin, ...sameOwner, sameHardware]);
  assert.deepEqual(index.get('a'), {
    consistent_submitters: 0, independent_replicators: 0, contested: false,
    peers: sameOwner.map(({ id }) => peer(id, 'repeated_on_other_hardware')),
  });
  assert.ok(index.get('other-0').peers.some(({ result, relationship }) => result === 'a' && relationship === 'repeated_on_other_hardware'));
});

test('replication peers must match the benchmark, version, model and reported artifact', () => {
  const origin = candidate('a', 'alice');
  const olderA = candidate('old-a', 'bob', { benchmark_version: '0' });
  const olderB = candidate('old-b', 'charlie', { benchmark_version: '0' });
  const { setup } = origin;
  const index = buildReplicationIndex([
    origin, olderA, olderB, run('legacy'),
    candidate('other-benchmark', 'bob', { benchmark: 'bench-b' }),
    candidate('other-model', 'bob', { model: 'model-b' }),
    candidate('other-format', 'bob', { setup: { ...setup, format: 'gguf' } }),
    candidate('other-quantization', 'bob', { setup: { ...setup, quantization: '8bit' } }),
    candidate('other-artifact', 'diane', { setup: { ...setup, served_model: 'different/model-a-4bit' } }),
    candidate('unknown-artifact-a', 'diane', { setup: { ...setup, served_model: undefined } }),
    candidate('unknown-artifact-b', 'bob', { setup: { ...setup, served_model: undefined } }),
    candidate('other-runtime', 'diane', { setup: { ...setup, runtime: 'mlx-lm-go' } }),
  ]);
  assert.equal(index.has('legacy'), false);
  assert.deepEqual(index.get('a').peers, [peer('other-runtime', 'consistent')]);
  assert.deepEqual(index.get('unknown-artifact-a').peers, []);
  assert.deepEqual(index.get('unknown-artifact-b').peers, []);
  assert.deepEqual(index.get('old-a').peers, [peer('old-b', 'consistent')]);
  assert.deepEqual(index.get('old-b').peers, [peer('old-a', 'consistent')]);
});

test('historical repeat results for different item counts or sampling methods do not compare', () => {
  const older = candidate('old-a', 'alice', { benchmark_version: '0' });
  const withChanges = (id, repeatChanges, overrides = {}) => {
    const other = candidate(id, 'bob', { benchmark_version: '0', ...overrides });
    other.repeat = { ...other.repeat, ...repeatChanges };
    return other;
  };
  const index = buildReplicationIndex([
    older,
    withChanges('other-n', {}, { n: 100 }),
    withChanges('other-runs', { runs: 3 }),
    withChanges('other-temperature', { temperature: 0.9 }),
    withChanges('other-top-p', { top_p: 0.8 }),
  ]);
  for (const result of index.values()) assert.deepEqual(result.peers, []);
});

test('hosted checkpoints require exact provider, served ID and optional upstream card; clients are not inference hardware', () => {
  const local = candidate('local', 'alice');
  const api = { provider: 'example', model_card: 'https://example.org/model', terms_url: 'https://example.org/terms', terms_checked_on: '2026-11-10', expected_usd: 0, approved_usd: 0 };
  const setup = { ...local.setup, runtime: 'api', served_model: 'checkpoint-A' };
  const otherClient = { ...setup, hardware: { ...setup.hardware, device: 'Other client' } };
  const index = buildReplicationIndex([
    local,
    candidate('a', 'alice', { api, setup }),
    candidate('b', 'bob', { api, setup: otherClient }),
    candidate('same-owner', 'alice', { api, setup: otherClient }),
    candidate('other-provider', 'bob', { api: { ...api, provider: 'other' }, setup }),
    candidate('other-checkpoint', 'bob', { api, setup: { ...setup, served_model: 'checkpoint-a' } }),
    candidate('other-card', 'bob', { api: { ...api, model_card: 'https://example.org/other' }, setup }),
    candidate('no-card-a', 'alice', { api: { ...api, model_card: undefined }, setup }),
    candidate('no-card-b', 'bob', { api: { ...api, model_card: undefined }, setup }),
  ]);
  assert.deepEqual(index.get('a'), {
    consistent_submitters: 1, independent_replicators: 0, contested: false, peers: [peer('b', 'consistent')],
  });
  assert.deepEqual(index.get('local').peers, []);
  assert.deepEqual(index.get('no-card-a').peers, [peer('no-card-b', 'consistent')]);
});
