import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../../..');
const entry = 'apps/cli/src/index.ts';
const run = (root, ...args) => spawnSync(process.execPath, [entry, ...args], {
  cwd: root, encoding: 'utf8', timeout: 120_000,
});

function localCheckout(t) {
  const root = mkdtempSync(join(tmpdir(), 'unite4ai-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'apps/cli'), { recursive: true });
  cpSync(join(repo, 'apps/cli/src'), join(root, 'apps/cli/src'), { recursive: true });
  symlinkSync(join(repo, 'apps/cli/node_modules'), join(root, 'apps/cli/node_modules'), 'dir');
  return root;
}

test('no arguments count local source files and distinguish empty from missing collections', (t) => {
  const root = localCheckout(t);
  const content = join(root, 'apps/web/src/content');
  mkdirSync(join(content, 'models', 'subdirectory.md'), { recursive: true });
  mkdirSync(join(content, 'reviews'));
  const model = join(content, 'models/unvalidated.md');
  writeFileSync(model, 'The inventory counts files, not schema-validated cards.');
  symlinkSync(model, join(content, 'models/linked.md'));
  writeFileSync(join(content, 'reviews/.gitkeep'), '');
  const result = run(root);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^content_dir: apps\/web\/src\/content$/m);
  assert.match(result.stdout, /^collections\[7\]\{name,count,state\}:$/m);
  assert.match(result.stdout, /^  models,1,present$/m);
  assert.match(result.stdout, /^  reviews,0,empty$/m);
  assert.match(result.stdout, /^  evals,null,missing$/m);
  assert.match(result.stdout, /^help\[[234]\]\{command,purpose\}:$/m);
  assert.match(result.stdout, /exchange review --help/);
});

test('help and invalid arguments never dispatch a child, even for valid-looking scaffold slugs', (t) => {
  const root = localCheckout(t);
  const web = join(root, 'apps/web');
  mkdirSync(join(web, 'scripts'), { recursive: true });
  writeFileSync(join(web, 'scripts/new-model.ts'), `await Bun.write('invoked', 'Unexpected scaffold')`);

  for (const command of ['', 'new-model', 'new-dataset', 'validate', 'sync', 'eval']) {
    const args = command ? [command, '--help'] : ['--help'];
    const result = run(root, ...args);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /usage:/);
    assert.match(result.stdout, /Examples:/);
  }
  for (const args of [['--unknown'], ['new-model'], ['new-model', '--unknown'], ['new-model', 'valid-slug', '--unknown'],
    ['validate', 'unexpected'], ['sync', '--remote']]) {
    const result = run(root, ...args);
    assert.equal(result.status, 2, result.stdout);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^kind: usage$/m);
    assert.match(result.stdout, /^hint: .*--help/m);
  }
  const escaped = run(root, '--unknown\nstatus: forged');
  assert.equal(escaped.status, 2, escaped.stdout);
  assert.match(escaped.stdout, /^message: .*\\nstatus: forged"$/m);
  assert.doesNotMatch(escaped.stdout, /^status: forged$/m);
  assert.deepEqual(readdirSync(web), ['scripts']);
});

test('sync propagates a failed child status and reports its diagnostics on stdout', (t) => {
  const root = localCheckout(t);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'sync:d1': 'bun fail-sync.ts' } }));
  writeFileSync(join(root, 'fail-sync.ts'), 'console.error("Cannot write fixture snapshot"); process.exit(7);');

  const result = run(root, 'sync');
  assert.equal(result.status, 7, result.stdout);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^kind: domain$/m);
  assert.match(result.stdout, /^message: .*Cannot write fixture snapshot/m);
});
