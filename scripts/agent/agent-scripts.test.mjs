import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

/** Waits (bounded) until `pid` no longer exists; returns false if it is still alive. */
async function gone(pid, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      assert.equal(error.code, 'ESRCH');
      return true;
    }
    await sleep(20);
  }
  return false;
}

/** Polls `pidFile` until it holds a pid written by the step (bounded). */
async function readPid(pidFile, attempts = 100) {
  for (let i = 0; i < attempts; i++) {
    const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0;
    if (pid > 0) return pid;
    await sleep(20);
  }
  assert.fail(`no pid recorded in ${pidFile}`);
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
    const pid = await readPid(pidFile);
    assert.ok(await gone(pid), `orphaned grandchild ${pid} survived the timeout`);
  } finally {
    rmSync(pidFile, { force: true });
  }
});

test('verify kills the step group and exits 143 when it receives SIGTERM', async () => {
  const pidFile = join(tmpdir(), `verify-signal-${process.pid}-${Date.now()}.pid`);
  try {
    const steps = JSON.stringify([{ name: 'slow', cwd: '.', cmd: `sleep 30 & echo $! > '${pidFile}'; wait` }]);
    const child = spawn(process.execPath, [VERIFY], {
      cwd: ROOT, env: { ...process.env, AGENT_VERIFY_STEPS: steps, AGENT_STEP_TIMEOUT: '60' }, stdio: 'ignore',
    });
    const exited = new Promise((settle) => child.on('exit', (code, signal) => settle({ code, signal })));
    const pid = await readPid(pidFile);
    child.kill('SIGTERM');
    const { code, signal } = await exited;
    assert.equal(code, 143, `verify exited with code ${code}, signal ${signal}`);
    assert.ok(await gone(pid), `step process ${pid} survived SIGTERM to verify`);
  } finally {
    rmSync(pidFile, { force: true });
  }
});

test('verify returns at the step deadline even if an escaped descendant holds the pipe', async () => {
  const pidFile = join(tmpdir(), `verify-escaped-${process.pid}-${Date.now()}.pid`);
  try {
    // perl leaves the step's process group (setsid) but keeps the inherited stdout/stderr pipes open.
    const escape = `perl -MPOSIX -e 'POSIX::setsid() or die; open my $f, ">", $ARGV[0] or die; print $f $$; close $f; sleep 30' '${pidFile}'`;
    const steps = JSON.stringify([{ name: 'held', cwd: '.', cmd: `${escape} & wait` }]);
    const t0 = Date.now();
    const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps, AGENT_STEP_TIMEOUT: '1' });
    const elapsed = Date.now() - t0;
    assert.equal(r.status, 1, r.stderr);
    const summary = JSON.parse(r.last);
    assert.equal(summary.failed_step, 'held');
    assert.equal(summary.timed_out, true);
    assert.equal(summary.error, 'ETIMEDOUT');
    assert.equal(summary.exit_code, null);
    assert.ok(elapsed < 3000, `verify took ${elapsed} ms`);
    const pid = await readPid(pidFile);
    assert.equal(await gone(pid, 1), false, `escaped process ${pid} should still be alive (test setup)`);
  } finally {
    const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0;
    if (pid > 0) try { process.kill(pid, 'SIGKILL'); } catch {}
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
