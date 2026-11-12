import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(import.meta.dirname, '../..');
const VERIFY = resolve(ROOT, 'scripts/agent/verify.mjs');
const MODEL_CHECK = resolve(ROOT, 'scripts/agent/model-check.mjs');

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

test('verify keeps the tail of oversized output and caps the summary tail at 4 KiB', { timeout: 120_000 }, () => {
  // 70e6 characters on one line: more than twice the 32 Mi per-stream cap, so the stream is truncated.
  const steps = JSON.stringify([{ name: 'big', cwd: '.', cmd: `head -c 70000000 /dev/zero | tr '\\0' a; echo; exit 4` }]);
  const r = run(VERIFY, [], { AGENT_VERIFY_STEPS: steps });
  assert.equal(r.status, 1, r.stderr);
  const summary = JSON.parse(r.last);
  assert.equal(summary.exit_code, 4);
  assert.ok(summary.tail.length <= 4097, `tail is ${summary.tail.length} characters`);
  assert.ok(summary.tail.startsWith('…a'), summary.tail.slice(0, 20));
  assert.match(summary.tail, /\n\[verify\] stdout truncated to its last \d+ characters$/);
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

// The stub server lives in this process, so the child must run without blocking the event loop.
function runAsync(script, args = [], env = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => {
      const lines = stdout.trim().split('\n');
      done({ status, stdout, stderr, last: lines[lines.length - 1] });
    });
  });
}

/** In-process OpenAI-style stub. Records `METHOD url` per request; a throwing handler answers 500 with the error. */
function stubServer(handler) {
  const requests = [];
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requests.push(`${req.method} ${req.url}`);
        try {
          handler(req, res, body);
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error?.message ?? error));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => done({ server, requests, url: `http://127.0.0.1:${server.address().port}/v1` }));
  });
}

function listModels(ids) {
  return (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: ids.map((id) => ({ id })) }));
    res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  };
}

test('model-check reports ready after a real completion', async () => {
  const { server, url } = await stubServer((req, res, body) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'stub-model' }] }));
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(JSON.parse(body).model, 'stub-model');
    res.end(JSON.stringify({ choices: [{ message: { content: ' OK ' } }] }));
  });
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '5' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'ready');
    assert.equal(out.model, 'stub-model');
    assert.equal(out.reply, 'OK');
    assert.equal(typeof out.latency_s, 'number');
  } finally {
    server.close();
  }
});

test('model-check reports unreachable when nothing listens', async () => {
  const { server, url } = await stubServer(() => {});
  server.close();
  const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '5' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.last).status, 'unreachable');
});

test('model-check reports not_ready when the completion fails', async () => {
  const { server, url } = await stubServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'm' }] }));
    res.statusCode = 503;
    res.end('loading');
  });
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '5' });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'not_ready');
    assert.match(out.detail, /503/);
  } finally {
    server.close();
  }
});

test('model-check refuses to pick among several listed models and never posts', async () => {
  const { server, url, requests } = await stubServer(listModels(['big-model', 'small-model']));
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '5' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'no_model');
    assert.match(out.detail, /big-model/);
    assert.match(out.detail, /small-model/);
    assert.deepEqual(requests, ['GET /v1/models']);
  } finally {
    server.close();
  }
});

test('model-check refuses an AGENT_MODEL the server does not list and never posts', async () => {
  const { server, url, requests } = await stubServer(listModels(['a', 'b']));
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: 'c', AGENT_MODEL_TIMEOUT: '5' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'no_model');
    assert.match(out.detail, /"c"/);
    assert.deepEqual(requests, ['GET /v1/models']);
  } finally {
    server.close();
  }
});

test('model-check reports no_model when the server lists none', async () => {
  const { server, url, requests } = await stubServer(listModels([]));
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '5' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.last).status, 'no_model');
    assert.deepEqual(requests, ['GET /v1/models']);
  } finally {
    server.close();
  }
});

test('model-check rejects a non-numeric AGENT_MODEL_TIMEOUT before any request', async () => {
  const { server, url, requests } = await stubServer(listModels(['m']));
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: 'abc' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'not_ready');
    assert.match(out.detail, /AGENT_MODEL_TIMEOUT/);
    assert.deepEqual(requests, []);
  } finally {
    server.close();
  }
});

test('model-check reports not_ready with a plain message when the completion times out', async () => {
  const { server, url } = await stubServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'm' }] }));
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: 'late' } }] })), 3_000);
  });
  try {
    const r = await runAsync(MODEL_CHECK, [], { AGENT_MODEL_BASE_URL: url, AGENT_MODEL: '', AGENT_MODEL_TIMEOUT: '0.5' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = JSON.parse(r.last);
    assert.equal(out.status, 'not_ready');
    assert.match(out.detail, /no completion within 0\.5s/);
  } finally {
    server.close();
  }
});

const REQUEST = resolve(ROOT, 'scripts/agent/request.mjs');

/** Renders a request, returns the parsed file, and removes it so tests leave `.agent/` clean. */
function render(template, goal) {
  const r = run(REQUEST, [template, goal]);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim();
  try {
    return { r, out, request: JSON.parse(readFileSync(out, 'utf8')) };
  } finally {
    rmSync(out, { force: true });
  }
}

test('request renders a loop template with absolute cwd and the goal', () => {
  const { r, out, request } = render('hub-loop', 'Make /contribute link to /submit.');
  assert.ok(out.startsWith(resolve(ROOT, '.agent/requests/hub-loop-')), out);
  assert.equal(request.cwd, ROOT);
  assert.equal(request.goal, 'Make /contribute link to /submit.');
  assert.equal(request.mode, 'loop');
  assert.equal(request.checks[0].cwd, ROOT);
  assert.deepEqual(request.checks[0].argv, ['node', 'scripts/agent/verify.mjs', '--only', 'hub']);
  assert.match(r.stderr, new RegExp(`omp local --run ${out}`));
});

test('request renders the read-only task and the sustainability loop', () => {
  const inspect = render('inspect', 'Explain the hub layout.').request;
  assert.equal(inspect.mode, 'task');
  assert.equal(inspect.cwd, ROOT);
  assert.deepEqual(inspect.capabilities, ['read', 'glob', 'grep']);
  assert.equal(inspect.checks, undefined);
  const sustain = render('sustain-loop', 'Fix the footer year.').request;
  assert.deepEqual(sustain.context_files, ['AGENTS.md', 'sites/ai-sustainability/AGENTS.md']);
  assert.equal(sustain.checks[0].cwd, ROOT);
  assert.deepEqual(sustain.checks[0].argv, ['node', 'scripts/agent/verify.mjs', '--only', 'sustain']);
});

test('request refuses a goal that would blow the prompt budget', () => {
  const r = run(REQUEST, ['inspect', 'x'.repeat(15_000)]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /16384/);
  assert.equal(r.stdout, '');
});

test('request rejects a missing template or goal', () => {
  assert.equal(run(REQUEST, ['hub-loop']).status, 2);
  assert.equal(run(REQUEST, ['hub-loop', '  ']).status, 2);
  assert.equal(run(REQUEST, ['nope', 'goal']).status, 2);
  assert.equal(run(REQUEST, ['../../package', 'goal']).status, 2);
});
