import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const VERIFY = resolve(ROOT, 'scripts/agent/verify.mjs');

function run(script, args = [], env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
  const lines = r.stdout.trim().split('\n');
  return { ...r, last: lines[lines.length - 1] };
}

test('verify --list names the hub steps in order', () => {
  const r = run(VERIFY, ['--list', '--only', 'hub']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), ['hub-validate', 'hub-build', 'hub-test']);
});

test('verify rejects an unknown --only value', () => {
  assert.equal(run(VERIFY, ['--only', 'nope']).status, 2);
});

test('verify stops at the first failing step and reports it as JSON', () => {
  const steps = JSON.stringify([
    { name: 'ok', cwd: '.', cmd: 'echo fine' },
    { name: 'boom', cwd: '.', cmd: 'echo bad >&2; exit 3' },
    { name: 'never', cwd: '.', cmd: 'echo unreachable' },
  ]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps });
  assert.equal(r.status, 1);
  const summary = JSON.parse(r.last);
  assert.equal(summary.status, 'fail');
  assert.equal(summary.failed_step, 'boom');
  assert.equal(summary.exit_code, 3);
  assert.equal(summary.timed_out, false);
  assert.match(summary.tail, /bad/);
  assert.ok(existsSync(summary.log), `log missing: ${summary.log}`);
  assert.doesNotMatch(r.stderr, /never/);
});

test('verify kills a step that exceeds AGENT_STEP_TIMEOUT', () => {
  const steps = JSON.stringify([{ name: 'slow', cwd: '.', cmd: 'sleep 5' }]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps, AGENT_STEP_TIMEOUT: '1' });
  assert.equal(r.status, 1);
  const summary = JSON.parse(r.last);
  assert.equal(summary.failed_step, 'slow');
  assert.equal(summary.timed_out, true);
});

test('verify reports pass with the step list', () => {
  const steps = JSON.stringify([{ name: 'a', cwd: '.', cmd: 'true' }, { name: 'b', cwd: 'apps', cmd: 'test -d web' }]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps });
  assert.equal(r.status, 0, r.stderr);
  const summary = JSON.parse(r.last);
  assert.equal(summary.status, 'pass');
  assert.deepEqual(summary.steps, ['a', 'b']);
});
