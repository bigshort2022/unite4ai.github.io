# Local LLM Agent Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coding agent backed by a locally hosted LLM (mlx-lm or Ollama, OpenAI-compatible HTTP) set up, edit, and objectively verify this repo on the developer's own machine, with no containers.

**Architecture:** Three small Node scripts under `scripts/agent/` (verify gate, model probe, request renderer) plus one bash setup script shared with the existing Cursor Cloud Agent config. A compact `AGENTS.md` repo card (small-context models get ~16 KiB of prompt) and ready-made `omp local --run` request templates whose acceptance check is the verify gate. Everything is plain Node 24 + bash, zero new dependencies.

**Tech Stack:** Bun 1.4 workspace (hub), npm + Node 24 (`sites/ai-sustainability`), `node:test`, `omp local` (mlx-lm managed server on `127.0.0.1:18082`), optional Ollama (`127.0.0.1:11434/v1`).

## Requirements (from the scoping answers)

- "Local agents" = agents whose model is a locally hosted LLM, not a hosted API.
- Run on the host (nvm Node 24 + Bun). No devcontainer.
- Cover the hub monorepo (`apps/web`, `apps/api`, `packages/*`) and `sites/ai-sustainability` (separate npm toolchain). Not Cloudflare Workers.

## Global constraints

- The composed task prompt for `omp local --run` is capped at 16,384 bytes and automatic context discovery is off, so repo instructions must be short and listed explicitly in `context_files`.
- The 35B model wires ~20–24 GB. Scripts must never start a second model server; they only probe the configured endpoint.
- `GET /v1/models` on mlx-lm is cached metadata, not readiness. The only readiness proof is a real completion.
- macOS has no `timeout(1)`; bounded execution uses async `child_process.spawn` with each step in its own process group (`detached: true`), killed as a group (`process.kill(-pid, 'SIGKILL')`) on step timeout or when the gate itself is signalled. `spawnSync` cannot be used: it blocks signal handlers, so a killed gate would orphan the step.
- Existing conventions: tests use `node:test` + `node:assert/strict` and are discovered by root `bun test`; scripts are ESM `.mjs`; commits are merge-based, no force-push.

## File map

| Path | Responsibility |
|---|---|
| `scripts/agent/activate-node.sh` | Put Node 24 first on `PATH` (moved from `.cursor/`) |
| `scripts/agent/setup.sh` | Idempotent host setup: Node 24, Bun, `bun install`, `npm ci` in the sustainability site, `.agent/` dirs, `.env.agent` |
| `scripts/agent/verify.mjs` | Objective acceptance gate; runs bounded steps, writes a log, prints one JSON line |
| `scripts/agent/model-check.mjs` | Probe the local model endpoint with a real completion |
| `scripts/agent/request.mjs` | Render an `omp local --run` request from a template with absolute `cwd` and the goal |
| `scripts/agent/agent-scripts.test.mjs` | Tests for the three scripts |
| `docs/agents/requests/{inspect,hub-loop,sustain-loop}.json` | Request templates |
| `docs/agents/local-llm.md` | How to run a local model and drive it against this repo |
| `AGENTS.md`, `sites/ai-sustainability/AGENTS.md` | Repo cards for small-context models |
| `.env.agent.example` | Endpoint/model variables |
| `.cursor/install.sh`, `.cursor/dev.sh` | Call the shared scripts instead of duplicating them |
| `package.json` | `agent:*` scripts; root `test` includes `scripts/agent` |
| `.gitignore` | Ignore `.agent/`, keep `.env.agent.example` |

---

### Task 1: Shared host setup script

**Files:**
- Move: `.cursor/activate-node.sh` → `scripts/agent/activate-node.sh`
- Create: `scripts/agent/setup.sh`
- Create: `.env.agent.example`
- Modify: `.cursor/install.sh`, `.cursor/dev.sh`, `.gitignore`, `package.json`

- [ ] **Step 1: Move the Node activation script and make it tolerate a host without nvm**

```bash
git mv .cursor/activate-node.sh scripts/agent/activate-node.sh
```

Replace its contents with:

```bash
#!/usr/bin/env bash
# Put the Node.js 24 toolchain this project requires (package.json "engines") first on PATH.
# Source this file; do not execute it. Works with nvm, or with a host that already has Node 24.
# PATH is prepended instead of `nvm use` because Cursor's Cloud Agent image ships an older Node
# on PATH (via /exec-daemon) that would otherwise shadow nvm's.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm which 24 >/dev/null 2>&1 || nvm install 24 >/dev/null
  export PATH="$(dirname "$(nvm which 24)"):$PATH"
elif node --version 2>/dev/null | grep -q '^v24\.'; then
  :
else
  echo "Node.js 24 is required. Install nvm (https://github.com/nvm-sh/nvm) or Node 24." >&2
  return 1 2>/dev/null || exit 1
fi
```

- [ ] **Step 2: Create `scripts/agent/setup.sh`**

```bash
#!/usr/bin/env bash
# Idempotent host setup for coding agents (local-LLM or Cloud). Installs only under $HOME.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/agent/activate-node.sh
source "$ROOT/scripts/agent/activate-node.sh"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"

echo "node $(node --version) · bun $(bun --version) · npm $(npm --version)"

bun install --frozen-lockfile
( cd sites/ai-sustainability && npm ci )

mkdir -p .agent/logs .agent/requests
[ -f .env.agent ] || cp .env.agent.example .env.agent

echo "setup complete"
```

- [ ] **Step 3: Create `.env.agent.example`**

```bash
# Local model endpoint (OpenAI-compatible). Copied to .env.agent by scripts/agent/setup.sh.
# mlx-lm managed server (omp local):  http://127.0.0.1:18082/v1
# Ollama:                              http://127.0.0.1:11434/v1
AGENT_MODEL_BASE_URL=http://127.0.0.1:18082/v1
# Must name the model the server already has loaded: posting any other id makes mlx-lm/Ollama
# load it (mlx-lm lists every MLX model in the HF cache, not just the loaded one).
# Empty only works when the server lists exactly one model.
AGENT_MODEL=mlx-community/Qwen3.6-35B-A3B-4bit-DWQ
# Seconds to wait for the readiness completion (cold weights can take 30-130 s).
AGENT_MODEL_TIMEOUT=120
# Seconds per verify step before it is killed.
AGENT_STEP_TIMEOUT=600
```

- [ ] **Step 4: Point the Cursor scripts at the shared ones**

`.cursor/install.sh`:

```bash
#!/usr/bin/env bash
# Cloud Agent dependency setup — delegates to the shared agent setup.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/agent/setup.sh"
```

`.cursor/dev.sh`:

```bash
#!/usr/bin/env bash
# Launch the Astro dev server (apps/web) on port 4321.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=scripts/agent/activate-node.sh
source scripts/agent/activate-node.sh
export PATH="$HOME/.bun/bin:$PATH"

cd apps/web
exec bun run dev --host 0.0.0.0
```

- [ ] **Step 5: `.gitignore` and `package.json`**

Append to `.gitignore`:

```
.agent/
!.env.agent.example
```

(`.env.*` is already ignored, so `.env.agent` stays private and the example must be re-included.)

In root `package.json` `scripts`, add and change:

```json
"test": "bun test apps/web/test apps/api/test packages/core/test scripts/agent",
"agent:setup": "bash scripts/agent/setup.sh",
"agent:verify": "node scripts/agent/verify.mjs",
"agent:model": "node scripts/agent/model-check.mjs",
"agent:request": "node scripts/agent/request.mjs"
```

- [ ] **Step 6: Run setup and confirm it is idempotent**

Run: `bash scripts/agent/setup.sh && bash scripts/agent/setup.sh`
Expected: both runs print `node v24.x · bun 1.4.x · npm …` and `setup complete`; second run makes no changes (`git status --short` shows only the files above; `.agent/` and `.env.agent` are untracked-ignored).

- [ ] **Step 7: Commit**

```bash
git add scripts/agent/activate-node.sh scripts/agent/setup.sh .env.agent.example .cursor/install.sh .cursor/dev.sh .gitignore package.json
git commit -m "Add shared agent host setup; Cursor scripts delegate to it"
```

---

### Task 2: Verify gate (`verify.mjs`)

**Files:**
- Create: `scripts/agent/verify.mjs`
- Create: `scripts/agent/agent-scripts.test.mjs`

**Interface:** `node scripts/agent/verify.mjs [--only hub|sustain] [--list]`. Exit 0 on pass, 1 on a failed step, 2 on usage error (unknown `--only`, or `AGENT_STEP_TIMEOUT` not a finite number > 0). Last stdout line is one JSON object: `{status:"pass", steps, log, seconds}` or `{status:"fail", failed_step, exit_code, timed_out, error, log, tail, seconds}`, where `error` is the spawn error code (`ETIMEDOUT`, `ENOENT`, …) or `null`. Steps run asynchronously, each in its own process group; verify kills that whole group on step timeout, and on SIGINT/SIGTERM/SIGHUP to verify itself (then exits 130/143/129 with no summary line). A timed-out step is reported at its deadline even if a descendant that left the group still holds the output pipes. Each stream keeps at most its last 32 Mi characters; a final `[verify] stdout|stderr truncated…` line marks that, so it shows in `tail`. `tail` is the last 20 output lines, then at most their last 4096 characters, prefixed `…` when cut. The log is appended step by step. Env: `AGENT_STEP_TIMEOUT` (seconds, default 600; empty means unset), `AGENT_VERIFY_STEPS` (JSON array `[{name,cwd,cmd}]` overriding the step list; for tests).

- [ ] **Step 1: Write the failing tests**

`scripts/agent/agent-scripts.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail because the script is absent**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: 11 failing tests (`Cannot find module … verify.mjs` / status mismatch).

- [ ] **Step 3: Implement `scripts/agent/verify.mjs`**

```js
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
```

- [ ] **Step 4: Run the tests and confirm they pass under both runners**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: `pass 11`.
Run: `bun test scripts/agent`
Expected: `11 pass`.

- [ ] **Step 5: Run the real gate once**

Run: `node scripts/agent/verify.mjs`
Expected (stderr): `ok   hub-validate`, `ok   hub-build`, `ok   hub-test`, `ok   sustain-test`, `ok   sustain-check`, `ok   sustain-build`; last stdout line `{"status":"pass",…}`. Takes roughly 1–2 minutes.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/verify.mjs scripts/agent/agent-scripts.test.mjs
git commit -m "Add bounded verify gate for agent runs"
```

---

### Task 3: Model readiness probe (`model-check.mjs`)

**Files:**
- Create: `scripts/agent/model-check.mjs`
- Modify: `scripts/agent/agent-scripts.test.mjs`

**Interface:** `node scripts/agent/model-check.mjs`. Reads `.env.agent` (without overriding real env; accepts `export `, strips unquoted ` #` comments), validates `AGENT_MODEL_TIMEOUT` before any request, GETs `/models`, then POSTs one 8-token chat completion naming `AGENT_MODEL`. If `AGENT_MODEL` is empty it uses the listed model only when exactly one is listed; with several it fails `no_model` without posting. A set `AGENT_MODEL` that the server does not list (when it lists at least one) also fails `no_model` without posting; when the server lists nothing, a set `AGENT_MODEL` is posted as-is. Reason: mlx-lm lists every cached MLX model and a POST naming a different one makes it (or Ollama) swap the loaded model. Prints one JSON line: `{status:"ready", base_url, model, reply, latency_s}` (exit 0) or `{status:"unreachable"|"no_model"|"not_ready", base_url, detail}` (exit 1).

- [ ] **Step 1: Add failing tests with an in-process stub server**

Append to `scripts/agent/agent-scripts.test.mjs`:

```js
// `spawn` is already imported at the top of this file (Task 2).
import { createServer } from 'node:http';

const MODEL_CHECK = resolve(ROOT, 'scripts/agent/model-check.mjs');

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
```

- [ ] **Step 2: Run the tests and confirm the eight new ones fail**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: `pass 11`, `fail 8`.

- [ ] **Step 3: Implement `scripts/agent/model-check.mjs`**

```js
#!/usr/bin/env node
/**
 * Probe the local model endpoint. `/models` on mlx-lm is cached metadata, so readiness is
 * proven only by a real (tiny) completion. Never starts a server, and never guesses a model:
 * posting an id the server has not loaded makes mlx-lm/Ollama swap to it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const envFile = join(ROOT, '.env.agent');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    const quoted = m[2].match(/^(["'])(.*?)\1/);
    process.env[m[1]] = quoted ? quoted[2] : m[2].replace(/(?:^|\s)#.*$/, '').trim();
  }
}

const base = (process.env.AGENT_MODEL_BASE_URL || 'http://127.0.0.1:18082/v1').replace(/\/$/, '');

function fail(status, detail) {
  console.log(JSON.stringify({ status, base_url: base, detail }));
  process.exit(1);
}

const timeoutS = Number(process.env.AGENT_MODEL_TIMEOUT || 120);
if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
  fail('not_ready', `AGENT_MODEL_TIMEOUT must be a positive number of seconds, got ${JSON.stringify(process.env.AGENT_MODEL_TIMEOUT)}`);
}

let model = process.env.AGENT_MODEL || '';
let ids = [];
try {
  const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) fail('unreachable', `GET /models → ${res.status}`);
  const body = await res.json();
  ids = (Array.isArray(body?.data) ? body.data : []).map((m) => m?.id).filter(Boolean);
} catch (error) {
  fail('unreachable', error.cause?.message || error.message);
}
if (!model) {
  if (ids.length > 1) fail('no_model', `server lists ${ids.length} models (${ids.join(', ')}); set AGENT_MODEL in .env.agent`);
  if (ids.length === 0) fail('no_model', 'server lists no models; set AGENT_MODEL in .env.agent');
  model = ids[0];
} else if (ids.length > 0 && !ids.includes(model)) {
  fail('no_model', `AGENT_MODEL "${model}" is not listed by the server (${ids.join(', ')}); posting it would make the server load it`);
}

const t0 = Date.now();
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 8, temperature: 0 }),
    signal: AbortSignal.timeout(Math.round(timeoutS * 1000)),
  });
  if (!res.ok) fail('not_ready', `POST /chat/completions → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const reply = body.choices?.[0]?.message?.content?.trim() ?? '';
  console.log(JSON.stringify({ status: 'ready', base_url: base, model, reply, latency_s: (Date.now() - t0) / 1000 }));
} catch (error) {
  if (error.name === 'TimeoutError') fail('not_ready', `no completion within ${timeoutS}s (server busy, loading, or weights paged out)`);
  fail('not_ready', error.cause?.message || error.message);
}
```

- [ ] **Step 4: Run the tests and confirm all pass**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: `pass 19`.

- [ ] **Step 5: Probe the real server (only if `omp local` has it running; do not start one)**

Run: `node scripts/agent/model-check.mjs`
Expected: `{"status":"ready","base_url":"http://127.0.0.1:18082/v1","model":"mlx-community/Qwen3.6-35B-A3B-4bit-DWQ","reply":"OK","latency_s":…}`; or `{"status":"unreachable",…}` / `{"status":"not_ready",…}` with exit 1 if it is not running or busy. All prove the script; do not launch or restart a server to turn the others into the first.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/model-check.mjs scripts/agent/agent-scripts.test.mjs
git commit -m "Add local model readiness probe"
```

---

### Task 4: Request templates and renderer (`request.mjs`)

**Files:**
- Create: `docs/agents/requests/inspect.json`, `docs/agents/requests/hub-loop.json`, `docs/agents/requests/sustain-loop.json`
- Create: `scripts/agent/request.mjs`
- Modify: `scripts/agent/agent-scripts.test.mjs`

**Interface:** `node scripts/agent/request.mjs <inspect|hub-loop|sustain-loop> "<goal>"`. Copies the template, sets `cwd` (and every command check's `cwd`) to the absolute repo root, sets `goal`, writes `.agent/requests/<name>-<timestamp>.json`, prints that path on stdout and the `omp local --run …` command on stderr. Exit 2 on usage error, 3 if goal + context files would exceed the 16 KiB prompt budget (threshold 14,000 bytes to leave room for the runner's framing).

`cwd` and `goal` are empty strings in the templates by design; the renderer fills them. `AGENTS.md` (Task 5) is the only context file, so templates stay under budget.

- [ ] **Step 1: Write the templates**

`docs/agents/requests/inspect.json`:

```json
{
  "schema_version": 1,
  "mode": "task",
  "cwd": "",
  "goal": "",
  "capabilities": ["read", "glob", "grep"],
  "context_files": ["AGENTS.md"],
  "limits": { "max_iterations": 1, "wall_seconds": 300 }
}
```

`docs/agents/requests/hub-loop.json`:

```json
{
  "schema_version": 1,
  "mode": "loop",
  "cwd": "",
  "goal": "",
  "capabilities": ["read", "glob", "grep", "write", "edit"],
  "context_files": ["AGENTS.md"],
  "limits": { "max_iterations": 3, "wall_seconds": 1800, "max_prompt_bytes": 16384 },
  "checks": [
    { "id": "hub", "kind": "command", "argv": ["node", "scripts/agent/verify.mjs", "--only", "hub"], "cwd": "", "timeout_seconds": 900 }
  ]
}
```

`docs/agents/requests/sustain-loop.json`:

```json
{
  "schema_version": 1,
  "mode": "loop",
  "cwd": "",
  "goal": "",
  "capabilities": ["read", "glob", "grep", "write", "edit"],
  "context_files": ["AGENTS.md", "sites/ai-sustainability/AGENTS.md"],
  "limits": { "max_iterations": 3, "wall_seconds": 1800, "max_prompt_bytes": 16384 },
  "checks": [
    { "id": "sustain", "kind": "command", "argv": ["node", "scripts/agent/verify.mjs", "--only", "sustain"], "cwd": "", "timeout_seconds": 900 }
  ]
}
```

- [ ] **Step 2: Add failing tests**

Append to `scripts/agent/agent-scripts.test.mjs`:

```js
const REQUEST = resolve(ROOT, 'scripts/agent/request.mjs');

test('request renders a loop template with absolute cwd and the goal', () => {
  const r = run(REQUEST, ['hub-loop', 'Make /contribute link to /submit.']);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim();
  assert.ok(out.startsWith(resolve(ROOT, '.agent/requests/hub-loop-')), out);
  const request = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(request.cwd, ROOT);
  assert.equal(request.goal, 'Make /contribute link to /submit.');
  assert.equal(request.mode, 'loop');
  assert.equal(request.checks[0].cwd, ROOT);
  assert.deepEqual(request.checks[0].argv, ['node', 'scripts/agent/verify.mjs', '--only', 'hub']);
  assert.match(r.stderr, new RegExp(`omp local --run ${out}`));
});

test('request refuses a goal that would blow the prompt budget', () => {
  const r = run(REQUEST, ['inspect', 'x'.repeat(15_000)]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /16384/);
});

test('request rejects a missing template or goal', () => {
  assert.equal(run(REQUEST, ['hub-loop']).status, 2);
  assert.equal(run(REQUEST, ['nope', 'goal']).status, 2);
});
```

- [ ] **Step 3: Run the tests and confirm the three new ones fail**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: `pass 19`, `fail 3`.

- [ ] **Step 4: Implement `scripts/agent/request.mjs`**

```js
#!/usr/bin/env node
/**
 * Render an `omp local --run` request from docs/agents/requests/<name>.json with this repo as
 * absolute cwd and the given goal. Fails early if the composed prompt would exceed the 16 KiB cap.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const PROMPT_CAP = 16384;
const PROMPT_BUDGET = 14_000; // leave room for the runner's framing and check evidence

const [name, goal] = process.argv.slice(2);
const templatePath = name ? join(ROOT, 'docs/agents/requests', `${name}.json`) : '';
if (!name || !goal || !existsSync(templatePath)) {
  console.error('usage: request.mjs <inspect|hub-loop|sustain-loop> "<goal>"');
  process.exit(2);
}

const request = { ...JSON.parse(readFileSync(templatePath, 'utf8')), cwd: ROOT, goal };
for (const check of request.checks ?? []) {
  if (check.kind === 'command') check.cwd = ROOT;
}

const contextBytes = (request.context_files ?? []).reduce((total, file) => total + statSync(join(ROOT, file)).size, 0);
const promptBytes = Buffer.byteLength(goal, 'utf8') + contextBytes;
if (promptBytes > PROMPT_BUDGET) {
  console.error(`goal + context files ≈ ${promptBytes} bytes; the runner caps the composed prompt at ${PROMPT_CAP}. Narrow the goal.`);
  process.exit(3);
}

const outDir = join(ROOT, '.agent/requests');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${name}-${Date.now()}.json`);
writeFileSync(out, `${JSON.stringify(request, null, 2)}\n`);
console.log(out);
console.error(`omp local --run ${out}`);
```

- [ ] **Step 5: Run the tests and confirm all pass**

Run: `node --test scripts/agent/agent-scripts.test.mjs`
Expected: `pass 22`.
(The prompt-budget test depends on `AGENTS.md` existing; if Task 5 has not run yet, `statSync` throws for the missing file. Create `AGENTS.md` first or run Task 5 before this step.)

- [ ] **Step 6: Commit**

```bash
git add docs/agents/requests scripts/agent/request.mjs scripts/agent/agent-scripts.test.mjs
git commit -m "Add omp local request templates and renderer"
```

---

### Task 5: Repo cards for small-context models

**Files:**
- Create: `AGENTS.md`
- Create: `sites/ai-sustainability/AGENTS.md`

Budget: root card ≤ 3 KiB, site card ≤ 1 KiB (both are sent verbatim in every request).

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# Unite4AI — agent card

Open-source AI education platform + federated model registry. Static Astro site on GitHub Pages.

## Layout
- `apps/web/` Astro site (unite4ai.com). Content: `apps/web/src/content/{models,datasets,compute,courses,events,posts,comments}/*.md`
- `apps/api/` Hono Cloudflare Worker (registry API). `apps/api/src/generated/` and `apps/web/public/data/registry-index.json` are generated by `bun run sync:d1`: never hand-edit.
- `apps/cli/` publish CLI. `packages/schema` Zod schemas. `packages/core` openness score, validation.
- `sites/ai-sustainability/` separate npm/Astro site (Sustainable Places). Not in the Bun workspace; see its own AGENTS.md.
- `scripts/agent/` setup, verify gate, model probe, request renderer.

## Toolchain
Bun 1.4 workspace + Node 24. `bun install --frozen-lockfile`. Never edit `bun.lock` or `package-lock.json` by hand; never add dependencies without being asked.

## Commands (repo root)
- `bun run validate` content gate (schemas, licence allowlist)
- `bun run build` site + Pagefind index → `apps/web/dist`
- `bun test` all tests (`*.test.mjs` use `node:test`; `apps/api/test/*.test.ts` use `bun:test`)
- `bun run check` `astro check`
- `node scripts/agent/verify.mjs [--only hub|sustain]` the acceptance gate (hub: same validate/build/test as CI); last line is JSON

## Rules
- Pages use `const base = import.meta.env.BASE_URL.replace(/\/$/, '');` and `` const href = (p: string) => `${base}${p}` || '/'; `` for internal links.
- New `.mjs` tests: `node:test` + `node:assert/strict`; subprocess tests pass `{ timeout: 120_000 }`.
- Content frontmatter must satisfy `apps/web/src/content.config.ts`; `bun run validate` tells you what is missing.
- Keep CSP in `apps/web/src/layouts/Base.astro` minimal: add a host only when the code calls it.
- Local-model runs: do not run `git commit`, `git push`, deploys, or `rm -rf`.
- Finish by running the verify gate, quote its JSON line, then report changes and stop.
```

- [ ] **Step 2: Write `sites/ai-sustainability/AGENTS.md`**

```markdown
# Sustainable Places — agent card

Astro site for sustainability.unite4ai.com. npm + Node 24, **not** Bun. Run commands in this directory.

- `npm ci` · `npm test` (node:test) · `npx astro check` · `npm run build` (→ `dist/`) · `npm run dev` (port 4321)
- Page: `src/pages/index.astro`. Client: `src/lib/sustainable-places/places-client.mjs` (lazy MapLibre; worker via `?worker&url` + `setWorkerUrl`).
- Feeds: `evidence-service.mjs` (NASA POWER, Open-Meteo, PVWatts), `feeds.mjs` (edge API first, upstream fallback), `evidence-cache.mjs` (memory + sessionStorage, 15 min).
- Deterministic: `tea.mjs`, `catalog.mjs`, `demo-sites.mjs` (tests in `test/`).
- Optional worker: `workers/evidence-api/` (`/api/evidence`, `/api/geocode`). `PUBLIC_API_BASE` adds its origin to the `src/layouts/Base.astro` CSP.
- Rules: label data live/modeled/cached/unavailable truthfully; add any new host to the CSP; never hand-edit `package-lock.json`.
- Gate: `node ../../scripts/agent/verify.mjs --only sustain`.
```

- [ ] **Step 3: Check the sizes**

Run: `wc -c AGENTS.md sites/ai-sustainability/AGENTS.md`
Expected: root < 3072, site < 1024. Trim prose, not commands, if over.

- [ ] **Step 4: Confirm the templates still fit the budget**

Run: `node scripts/agent/request.mjs sustain-loop "Smoke goal" && node --test scripts/agent/agent-scripts.test.mjs`
Expected: a path under `.agent/requests/`; `pass 11`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md sites/ai-sustainability/AGENTS.md
git commit -m "Add agent cards for small-context models"
```

---

### Task 6: Runbook, docs links, and CI parity

**Files:**
- Create: `docs/agents/local-llm.md`
- Modify: `README.md` (after the "Quick start" section), `CONTRIBUTING.md` ("Local development" section)

- [ ] **Step 1: Write `docs/agents/local-llm.md`**

```markdown
# Running a local-LLM coding agent against this repo

Host-only setup (no containers). Covers the hub monorepo and `sites/ai-sustainability`.

## 1. One-time setup

```bash
bun run agent:setup        # Node 24 (nvm), Bun, bun install, npm ci in the sustainability site, .agent/, .env.agent
```

`.env.agent` (gitignored) holds the endpoint. Defaults target the mlx-lm managed server that `omp local` runs.

## 2. Serve a model (pick one; never run two)

| Server | Start | `AGENT_MODEL_BASE_URL` | Notes |
|---|---|---|---|
| mlx-lm via `omp local` | `omp local` (recovers/starts `mlx-community/Qwen3.6-35B-A3B-4bit-DWQ` on `127.0.0.1:18082`) | `http://127.0.0.1:18082/v1` | ~20–24 GB wired; 32k context / 4k output |
| mlx-lm directly | `mlx_lm.server --model mlx-community/Qwen3.6-35B-A3B-4bit-DWQ --port 18082` | same | Use only when `omp local` is not managing a server |
| Ollama | `ollama pull <model>` then it listens on 11434 | `http://127.0.0.1:11434/v1` | Pick a coding model that fits RAM; set `AGENT_MODEL` to its tag |

Readiness check (does a real completion; `/v1/models` alone proves nothing):

```bash
bun run agent:model
# {"status":"ready","base_url":"http://127.0.0.1:18082/v1","model":"mlx-community/Qwen3.6-35B-A3B-4bit-DWQ","reply":"OK","latency_s":0.4}
```

`unreachable` → the server is not up. `not_ready` → it is loading weights or overloaded; wait, do not restart it. `no_model` → set `AGENT_MODEL` in `.env.agent` to the model the server already has loaded; the probe never guesses among several listed models, because posting a different id makes mlx-lm/Ollama load it.

## 3. Give the agent a task

Requests are strict JSON for `omp local --run`. Render one from a template so `cwd` is absolute and the goal fits the 16 KiB prompt cap:

```bash
bun run agent:request inspect   "Read AGENTS.md and apps/web/src/pages/contribute.astro; list every internal link and whether it uses href()."
bun run agent:request hub-loop  "Add a 'Suggest an edit' link to the bottom of every blog post pointing at the post's GitHub source URL."
bun run agent:request sustain-loop "Show 'Unavailable' instead of the modeled value when all three feeds fail."
# each prints: omp local --run /abs/path/.agent/requests/<name>-<ts>.json
```

- `inspect`: read-only, one iteration, 5 minutes.
- `hub-loop` / `sustain-loop`: edit capabilities, up to 3 iterations / 30 minutes, acceptance = `scripts/agent/verify.mjs`. The loop stops at the first passing gate.

Edits still go through `omp`'s native approval prompts; listing `write`/`edit` in the template is not approval. Prefer running loops in a `git worktree` so a failed run cannot leave `main` dirty.

## 4. Verify yourself

```bash
bun run agent:verify                 # hub + sustainability, ~2 min; last line is JSON
bun run agent:verify -- --only hub
```

Logs land in `.agent/logs/`. For the hub the gate runs the same commands as CI (`validate`, `build`, `test`); it also runs the site's `test`, `astro check`, `build`, which CI does not run.

## Writing goals a 35B model can finish

- One behaviour per request; name the files when you know them.
- State the acceptance in observable terms ("`bun test` passes and `/contribute` contains `href="/submit"`").
- Keep goal + `AGENTS.md` under ~14 KB; `agent:request` exits 3 when it will not fit.
- Do not ask it to commit, push, or add dependencies; `AGENTS.md` forbids it and the gate does not need it.

## Memory and contention

The 35B needs ~20 GB resident. If a run is slow, check what else holds memory before blaming the model; never restart the server to "fix" slowness (it reloads the same weights into the same pressure). Do not run `agent:verify` while a loop's own check is running: both write `apps/web/dist`.
```

- [ ] **Step 2: Link it from the human docs**

`README.md`, after the Quick start block, add:

```markdown
## Coding agents

`bun run agent:setup` prepares the host; `bun run agent:verify` is the acceptance gate: the same validate/build/test commands as CI for the hub, plus the sustainability site's test/check/build (which CI does not run). For agents on a locally hosted LLM see [docs/agents/local-llm.md](docs/agents/local-llm.md). `AGENTS.md` is the repo card models receive.
```

`CONTRIBUTING.md`, at the end of "Local development", add:

```markdown
Using a coding agent (hosted or local LLM)? Run `bun run agent:setup` once and point it at `AGENTS.md`; `bun run agent:verify` runs the same validate/build/test commands as CI for the hub, plus the sustainability site's test/check/build (which CI does not run). Details in `docs/agents/local-llm.md`.
```

- [ ] **Step 3: Full gate and test run**

Run: `bun run agent:verify`
Expected: six `ok` lines and `{"status":"pass",…}`.
Run: `bun test`
Expected: previous 26 + 11 new = `37 pass`, `0 fail`.

- [ ] **Step 4: Commit, push a branch, open the PR**

```bash
git add docs/agents/local-llm.md README.md CONTRIBUTING.md
git commit -m "Document local-LLM agent workflow"
git push -u origin agent-dev-env
npx -y gh-axi pr create --title "Dev environment for local-LLM coding agents" --body-file /tmp/agent-env-pr.md -R bigshort2022/unite4ai.github.io
```

PR body (`/tmp/agent-env-pr.md`):

```markdown
## Summary
Host-only dev environment for coding agents backed by a locally hosted LLM (mlx-lm via `omp local`, or Ollama).

- `scripts/agent/setup.sh`: one idempotent setup for the Bun workspace and the npm sustainability site; `.cursor/` now delegates to it.
- `scripts/agent/verify.mjs`: bounded acceptance gate (CI's validate/build/test for the hub, plus the sustainability site's test/check/build, which CI does not run), JSON summary line, logs in `.agent/logs/`.
- `scripts/agent/model-check.mjs`: readiness probe that does a real completion.
- `scripts/agent/request.mjs` + `docs/agents/requests/*.json`: `omp local --run` templates (inspect, hub-loop, sustain-loop) with the gate as the check and a prompt-budget guard.
- `AGENTS.md` (root, sustainability site): repo cards sized for a 16 KiB prompt.
- `docs/agents/local-llm.md`: runbook.

## Test plan
- [ ] `bun test`: 37 pass (11 new: gate ordering, failure/timeout JSON, model probe against a stub server, request rendering and budget guard)
- [ ] `bun run agent:verify` passes end to end
- [ ] `bun run agent:model` against the running 35B returns `ready`
- [ ] One `hub-loop` request completed `verified` on a trivial goal
```

Expected: CI `Validate pull request` green (it runs `bun test` bare, which now includes `scripts/agent`).

---

## Self-review

**Spec coverage.** Local-LLM agents: Tasks 3, 4, 6 (probe, requests, runbook). Host-only: Task 1 (nvm/Bun, no containers). Hub + sustainability: Task 2 step sets and both `AGENTS.md` (Task 5). Workers excluded: nothing in the plan runs `wrangler`.

**Placeholder scan.** Templates carry empty `cwd`/`goal` by design and the renderer fills them; the plan states this. No TBD/TODO.

**Type consistency.** `verify.mjs` flags: `--only hub|sustain`, `--list`; env `AGENT_STEP_TIMEOUT`, `AGENT_VERIFY_STEPS` (array of `{name,cwd,cmd}`): matched in tests, templates (`argv` uses `--only`), `AGENTS.md`, and the runbook. `model-check.mjs` statuses `ready|unreachable|no_model|not_ready` and env `AGENT_MODEL_BASE_URL|AGENT_MODEL|AGENT_MODEL_TIMEOUT`: matched in `.env.agent.example`, tests, runbook. `request.mjs` exits `2|3`, output dir `.agent/requests/`: matched in tests.

**Ordering note.** Task 4 step 5 needs `AGENTS.md`; execute Task 5 before Task 4 step 5, or create `AGENTS.md` first. Both are independent otherwise.
