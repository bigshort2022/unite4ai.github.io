#!/usr/bin/env node
/**
 * Objective acceptance gate for agent runs. Runs each step with a timeout, writes one log,
 * and prints exactly one JSON summary line last so a small model (or omp's loop runner)
 * can read the outcome without parsing build output.
 *
 * Each step runs in its own process group. verify kills that whole group when the step
 * times out and when verify itself receives SIGINT, SIGTERM or SIGHUP (then exits 128+signo
 * without a summary), so no build or test process outlives the gate.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SUSTAIN = join(ROOT, 'sites/ai-sustainability');
const USAGE = 'usage: verify.mjs [--only hub|sustain] [--list]  (env: AGENT_STEP_TIMEOUT=<seconds > 0>)';
// Per stream, keep at most the last 32 Mi characters of output (the tail is what matters).
const MAX_OUTPUT = 32 * 1024 * 1024;
// The summary's tail: last 20 lines, then at most the last 4 Ki characters (prefixed "…" when cut).
const TAIL_CHARS = 4096;

const STEP_SETS = {
  hub: [
    { name: 'hub-validate', cwd: ROOT, cmd: 'bun run validate' },
    { name: 'hub-build', cwd: ROOT, cmd: 'bun run build' },
    { name: 'hub-test', cwd: ROOT, cmd: 'bun test' },
  ],
  sustain: [
    { name: 'sustain-test', cwd: SUSTAIN, cmd: 'npm test' },
    { name: 'sustain-check', cwd: SUSTAIN, cmd: 'npx astro check' },
    { name: 'sustain-build', cwd: SUSTAIN, cmd: 'npm run build' },
  ],
};

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex === -1 ? 'all' : args[onlyIndex + 1];
const sets = only === 'all' ? ['hub', 'sustain'] : [only];
const timeoutSeconds = Number(process.env.AGENT_STEP_TIMEOUT || 600);
if (sets.some((s) => !STEP_SETS[s]) || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error(USAGE);
  process.exit(2);
}

let steps = sets.flatMap((s) => STEP_SETS[s]);
if (process.env.AGENT_VERIFY_STEPS) {
  steps = JSON.parse(process.env.AGENT_VERIFY_STEPS).map((s) => ({ ...s, cwd: resolve(ROOT, s.cwd ?? '.') }));
}

if (args.includes('--list')) {
  for (const step of steps) console.log(step.name);
  process.exit(0);
}

let current = null;
function killGroup(child) {
  if (!(child?.pid > 0)) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch {} // ESRCH: the group is already gone.
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    killGroup(current);
    process.exit(128 + constants.signals[signal]);
  });
}

/** Collects one stream's text, keeping only the last MAX_OUTPUT characters (trimmed lazily). */
function collector(stream) {
  const sink = { text: '', truncated: false };
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    sink.text += chunk;
    if (sink.text.length > 2 * MAX_OUTPUT) {
      sink.text = sink.text.slice(-MAX_OUTPUT);
      sink.truncated = true;
    }
  });
  return sink;
}

function runStep(step, env, timeoutMs) {
  return new Promise((settle) => {
    let child;
    try {
      child = spawn('bash', ['-c', step.cmd], { cwd: step.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      settle({ status: null, timedOut: false, error, stdout: '', stderr: '' });
      return;
    }
    current = child;
    const out = collector(child.stdout);
    const err = collector(child.stderr);
    let timedOut = false;
    let done = false;
    const finish = (status, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      current = null;
      // The marker goes last so it shows up in the summary's tail.
      const trim = (sink, name) => {
        if (sink.text.length <= MAX_OUTPUT && !sink.truncated) return sink.text;
        const kept = sink.text.slice(-MAX_OUTPUT);
        return `${kept}${kept.endsWith('\n') ? '' : '\n'}[verify] ${name} truncated to its last ${MAX_OUTPUT} characters\n`;
      };
      settle({ status, timedOut, error, stdout: trim(out, 'stdout'), stderr: trim(err, 'stderr') });
    };
    // At the deadline, kill the group and return now: a descendant that left the group
    // (setsid, daemon) may hold the pipes open, so 'close' might never fire.
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
      child.stdout.destroy();
      child.stderr.destroy();
      finish(null, Object.assign(new Error(`step timed out after ${timeoutMs / 1000}s`), { code: 'ETIMEDOUT' }));
    }, timeoutMs);
    // A failed spawn (missing cwd, no bash) has no pid; a running child reports via 'close'.
    child.on('error', (error) => { if (!(child.pid > 0)) finish(null, error); });
    child.on('close', (status) => finish(status, null));
  });
}

// The runner may call us with a minimal PATH: put this Node and Bun first.
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.HOME}/.bun/bin:${process.env.PATH ?? ''}` };
const logDir = join(ROOT, '.agent/logs');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
writeFileSync(log, '');
const startedAt = Date.now();

for (const step of steps) {
  const t0 = Date.now();
  const r = await runStep(step, env, timeoutSeconds * 1000);
  const output = `${r.stdout}${r.stderr}`;
  const spawnError = r.error ? `\n[verify] ${r.error.message} (cwd ${step.cwd})\n` : '';
  appendFileSync(log, `### ${step.name} (${step.cwd}) $ ${step.cmd}\n${output}${spawnError}\n`);
  const ok = !r.error && r.status === 0;
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${step.name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) {
    let tail = output.trim().split('\n').slice(-20).join('\n');
    if (tail.length > TAIL_CHARS) tail = `…${tail.slice(-TAIL_CHARS)}`;
    console.log(JSON.stringify({
      status: 'fail', failed_step: step.name, exit_code: r.status, timed_out: r.timedOut, error: r.error?.code ?? null, log, tail,
      seconds: (Date.now() - startedAt) / 1000,
    }));
    process.exit(1);
  }
}

console.log(JSON.stringify({ status: 'pass', steps: steps.map((s) => s.name), log, seconds: (Date.now() - startedAt) / 1000 }));
