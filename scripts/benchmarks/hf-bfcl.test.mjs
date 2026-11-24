import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SUITES } from '../../apps/cli/src/eval/suites.ts';
import { writeHfBfclPackage, checkHfBfclPackage } from './hf-bfcl.ts';

const fixtures = new URL('../../apps/cli/test/fixtures/bfcl/', import.meta.url);
const read = (file) => readFileSync(new URL(file, fixtures), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function paths(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'hf-bfcl-fixture-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return [join(tmp, 'first'), join(tmp, 'second')];
}

test('dataset and metadata reproduce the pinned method without publishing any results', (t) => {
  const [first, second] = paths(t);
  const a = writeHfBfclPackage(first);
  const b = writeHfBfclPackage(second);
  assert.deepEqual(a, b);
  assert.deepEqual(checkHfBfclPackage(first), a);
  assert.deepEqual(readdirSync(first).sort(), ['LICENSE', 'README.md', 'data', 'eval.yaml', 'method.json']);
  assert.deepEqual(readdirSync(join(first, 'data')), ['test.jsonl']);
  assert.equal(readFileSync(join(first, 'LICENSE'), 'utf8'), read('LICENSE'));
  const config = Bun.YAML.parse(readFileSync(join(first, 'eval.yaml'), 'utf8'));
  assert.deepEqual(config.tasks, [{ id: 'bfcl-multiple-50-v1-all-runs-pass-at-5', config: 'default', split: 'test' }]);
  assert.equal(config.leaderboard.base_models_only, false);
  assert.equal(Object.hasOwn(config, 'evaluation_framework'), false);

  const data = readFileSync(join(first, 'data/test.jsonl'), 'utf8');
  assert.equal(data, readFileSync(join(second, 'data/test.jsonl'), 'utf8'));
  const method = JSON.parse(readFileSync(join(first, 'method.json'), 'utf8'));
  assert.deepEqual(method.dataset, { config: 'default', split: 'test', path: 'data/test.jsonl', items: 50, sha256: sha256(data) });
  assert.deepEqual(method.repeat, { runs: 5, temperature: 0.7, top_p: 1, order: 'run-major, file order within pass', seed: 'run * 50 + item' });
  assert.deepEqual(method.metric, { id: 'all-runs-pass-at-5', unit: '%', higher_is_better: true });
  assert.equal(method.max_tokens, 1024);
  assert.equal(method.prompt_version, 'bfcl-multiple-1');
  assert.equal(method.source.questions.sha256, 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a');
  assert.equal(method.source.answers.sha256, '244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047');

  const items = SUITES['bfcl-multiple-50'].items(read('BFCL_v4_multiple.json'), 50, read('BFCL_v4_multiple_possible_answer.json'));
  const rows = data.trimEnd().split('\n').map(JSON.parse);
  assert.equal(rows.length, 50);
  for (const [i, row] of rows.entries()) {
    const item = items[i];
    assert.deepEqual(Object.keys(row).sort(), ['answer_json', 'id', 'system', 'user']);
    assert.equal(row.id, `multiple_${i}`);
    const messages = [{ role: 'system', content: row.system }, { role: 'user', content: row.user }];
    assert.equal(sha256(JSON.stringify(messages)), sha256(JSON.stringify(item.messages)), row.id);
    assert.equal(row.answer_json, item.expected, row.id);
  }
});

test('build never overwrites an existing directory and the checker detects drift and missing files', (t) => {
  const [first, second] = paths(t);
  mkdirSync(second);
  writeFileSync(join(second, 'keep'), 'original');
  assert.throws(() => writeHfBfclPackage(second), /exist/i);
  assert.equal(readFileSync(join(second, 'keep'), 'utf8'), 'original');
  writeHfBfclPackage(first);
  const data = join(first, 'data/test.jsonl');
  const original = readFileSync(data, 'utf8');
  writeFileSync(data, original.replace('multiple_0', 'multiple_999'));
  assert.throws(() => checkHfBfclPackage(first), /data\/test\.jsonl/);
  writeFileSync(data, original);
  const config = join(first, 'eval.yaml');
  writeFileSync(config, 'tasks: []\n');
  assert.throws(() => checkHfBfclPackage(first), /eval\.yaml/);
  rmSync(config);
  assert.throws(() => checkHfBfclPackage(first), /eval\.yaml/);
});

test('check rejects symlink leaves and symlink data directories', (t) => {
  const [first, second] = paths(t);
  writeHfBfclPackage(first);
  writeHfBfclPackage(second);
  const dataDir = join(first, 'data');
  const data = join(dataDir, 'test.jsonl');
  rmSync(data);
  symlinkSync(join(second, 'data/test.jsonl'), data);
  assert.ok(lstatSync(data).isSymbolicLink());
  assert.throws(() => checkHfBfclPackage(first), /data\/test\.jsonl/);
  rmSync(data);
  rmSync(dataDir, { recursive: true });
  symlinkSync(join(second, 'data'), dataDir);
  assert.throws(() => checkHfBfclPackage(first), /data/);
});
