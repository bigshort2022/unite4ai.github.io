import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Astro check runs diagnostics without requesting dependencies', () => {
  const result = spawnSync('npm', ['run', 'check'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /requires the following dependency to be installed/);
  assert.match(output, /Result \(\d+ files\):/);
});
