#!/usr/bin/env node
/**
 * Objective acceptance gate for agent runs. Runs each step with a timeout, writes one log,
 * and prints exactly one JSON summary line last so a small model (or omp's loop runner)
 * can read the outcome without parsing build output.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SUSTAIN = join(ROOT, 'sites/ai-sustainability');

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
if (sets.some((s) => !STEP_SETS[s])) {
  console.error('usage: verify.mjs [--only hub|sustain] [--list]');
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
const timeoutMs = Number(process.env.AGENT_STEP_TIMEOUT ?? 600) * 1000;
const logDir = join(ROOT, '.agent/logs');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `verify-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const sections = [];
const startedAt = Date.now();

for (const step of steps) {
  const t0 = Date.now();
  const r = spawnSync('bash', ['-c', step.cmd], { cwd: step.cwd, encoding: 'utf8', env, timeout: timeoutMs, killSignal: 'SIGTERM' });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  sections.push(`### ${step.name} (${step.cwd}) $ ${step.cmd}\n${output}\n`);
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const ok = !timedOut && r.status === 0;
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${step.name} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) {
    writeFileSync(log, sections.join('\n'));
    const tail = output.trim().split('\n').slice(-20).join('\n');
    console.log(JSON.stringify({
      status: 'fail', failed_step: step.name, exit_code: r.status, timed_out: timedOut, log, tail,
      seconds: (Date.now() - startedAt) / 1000,
    }));
    process.exit(1);
  }
}

writeFileSync(log, sections.join('\n'));
console.log(JSON.stringify({ status: 'pass', steps: steps.map((s) => s.name), log, seconds: (Date.now() - startedAt) / 1000 }));
