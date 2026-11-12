import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

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

test('verify --list without --only names all six steps in order', () => {
  const r = run(VERIFY, ['--list']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'hub-validate', 'hub-build', 'hub-test', 'sustain-test', 'sustain-check', 'sustain-build',
  ]);
});

test('verify rejects an unknown --only value', () => {
  assert.equal(run(VERIFY, ['--only', 'nope']).status, 2);
});

test('verify rejects a non-numeric AGENT_STEP_TIMEOUT', () => {
  assert.equal(run(VERIFY, ['--list'], { AGENT_STEP_TIMEOUT: 'abc' }).status, 2);
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

test('verify kills the whole process group of a step that exceeds AGENT_STEP_TIMEOUT', async () => {
  const pidFile = join(tmpdir(), `verify-orphan-${process.pid}-${Date.now()}.pid`);
  try {
    const steps = JSON.stringify([{ name: 'slow', cwd: '.', cmd: `sleep 30 & echo $! > '${pidFile}'; wait` }]);
    const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps, AGENT_STEP_TIMEOUT: '1' });
    assert.equal(r.status, 1);
    const summary = JSON.parse(r.last);
    assert.equal(summary.failed_step, 'slow');
    assert.equal(summary.exit_code, null);
    assert.equal(summary.timed_out, true);
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    assert.ok(pid > 0, `no pid recorded in ${pidFile}`);
    let alive = true;
    for (let i = 0; i < 10 && alive; i++) {
      try {
        process.kill(pid, 0);
        await sleep(20);
      } catch (error) {
        assert.equal(error.code, 'ESRCH');
        alive = false;
      }
    }
    assert.equal(alive, false, `orphaned grandchild ${pid} survived the timeout`);
  } finally {
    rmSync(pidFile, { force: true });
  }
});

test('verify reports a spawn error such as a missing cwd', () => {
  const steps = JSON.stringify([{ name: 'nowhere', cwd: 'does-not-exist', cmd: 'true' }]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps });
  assert.equal(r.status, 1);
  const summary = JSON.parse(r.last);
  assert.equal(summary.failed_step, 'nowhere');
  assert.equal(summary.error, 'ENOENT');
});

test('verify reports pass with the step list', () => {
  const steps = JSON.stringify([{ name: 'a', cwd: '.', cmd: 'true' }, { name: 'b', cwd: 'apps', cmd: 'test -d web' }]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps });
  assert.equal(r.status, 0, r.stderr);
  const summary = JSON.parse(r.last);
  assert.equal(summary.status, 'pass');
  assert.deepEqual(summary.steps, ['a', 'b']);
});
