#!/usr/bin/env node
/**
 * Objective acceptance gate for agent runs. Runs each step with a timeout, writes one log,
 * and prints exactly one JSON summary line last so a small model (or omp's loop runner)
 * can read the outcome without parsing build output.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SUSTAIN = join(ROOT, 'sites/ai-sustainability');
const USAGE = 'usage: verify.mjs [--only hub|sustain] [--list]  (env: AGENT_STEP_TIMEOUT=<seconds > 0>)';

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
const timeoutSeconds = Number(process.env.AGENT_STEP_TIMEOUT ?? 600);
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

// The runner may call us with a minimal PATH: put this Node and Bun first.
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.HOME}/.bun/bin:${process.env.PATH ?? ''}` };
const logDir = join(ROOT, '.agent/logs');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
writeFileSync(log, '');
const startedAt = Date.now();

for (const step of steps) {
  const t0 = Date.now();
  // detached: the step leads its own process group, so a timeout can kill its whole tree.
  const r = spawnSync('bash', ['-c', step.cmd], {
    cwd: step.cwd, encoding: 'utf8', env, timeout: timeoutSeconds * 1000, killSignal: 'SIGTERM',
    detached: true, maxBuffer: 32 * 1024 * 1024,
  });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  if (timedOut) {
    try { process.kill(-r.pid, 'SIGKILL'); } catch {} // ESRCH: the group is already gone.
  }
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const spawnError = r.error ? `\n[verify] ${r.error.message}\n` : '';
  appendFileSync(log, `### ${step.name} (${step.cwd}) $ ${step.cmd}\n${output}${spawnError}\n`);
  const ok = !r.error && r.status === 0;
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${step.name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) {
    const tail = output.trim().split('\n').slice(-20).join('\n');
    console.log(JSON.stringify({
      status: 'fail', failed_step: step.name, exit_code: r.status, timed_out: timedOut, error: r.error?.code ?? null, log, tail,
      seconds: (Date.now() - startedAt) / 1000,
    }));
    process.exit(1);
  }
}

console.log(JSON.stringify({ status: 'pass', steps: steps.map((s) => s.name), log, seconds: (Date.now() - startedAt) / 1000 }));
