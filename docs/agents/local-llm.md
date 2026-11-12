# Running a local-LLM coding agent against this repo

Host-only setup (no containers). Covers the hub monorepo and `sites/ai-sustainability`; not the Cloudflare Workers.

## 1. One-time setup

```bash
bash scripts/agent/setup.sh   # same as `bun run agent:setup`, but works before Bun is installed
```

It installs Node 24 through nvm only if missing (it never changes your nvm default), installs Bun if missing, runs `bun install --frozen-lockfile` and `npm ci` in `sites/ai-sustainability`, creates `.agent/logs` and `.agent/requests`, and copies `.env.agent.example` to `.env.agent` (gitignored) if absent.

Node 24 is put first on `PATH` only inside the script. In the shell you run `omp local` or the gate from, do it yourself:

```bash
source scripts/agent/activate-node.sh   # Node 24 first on PATH for this shell
```

## 2. Serve one model

The 35B model wires ~20–24 GB, so run exactly one model server.

| Server | Start | `AGENT_MODEL_BASE_URL` | `AGENT_MODEL` |
|---|---|---|---|
| mlx-lm managed by `omp local` (default) | `omp local` reuses its server if one is running, otherwise starts `mlx-community/Qwen3.6-35B-A3B-4bit-DWQ` on `127.0.0.1:18082` (32,768-token context, 4,096-token output) | `http://127.0.0.1:18082/v1` | `mlx-community/Qwen3.6-35B-A3B-4bit-DWQ` |
| Ollama, for other OpenAI-compatible agent clients | `ollama serve` (or the desktop app), only while no `omp local` server is running | `http://127.0.0.1:11434/v1` | the loaded tag (`ollama ps`) |

Do not start an `mlx_lm.server` of your own next to the `omp local` one: it loads a second copy of the weights. `omp local --run` always talks to its own server on port 18082; the Ollama row is only for other clients.

`AGENT_MODEL` in `.env.agent` must name the model the server **already has loaded**. Posting any other id to `/chat/completions` makes mlx-lm or Ollama load that model, and both list more than the loaded one (mlx-lm lists every MLX model in the Hugging Face cache; Ollama lists every pulled tag). Leaving it empty only works when the server lists exactly one model.

Readiness check: a real one-message completion, because `GET /v1/models` is cached metadata and proves nothing:

```bash
bun run agent:model
# {"status":"ready","base_url":"http://127.0.0.1:18082/v1","model":"mlx-community/Qwen3.6-35B-A3B-4bit-DWQ","reply":"OK","latency_s":…}
```

The last line is JSON; anything but `ready` exits 1 and carries a `detail`:

- `unreachable`: `GET /models` at `AGENT_MODEL_BASE_URL` fails, times out (10 s), or returns an error status.
- `no_model`: `AGENT_MODEL` is empty and the server lists zero or several models, or `AGENT_MODEL` is missing from the server's non-empty list. The probe never guesses and never posts an id the server does not list. Fix `.env.agent`.
- `not_ready`: the completion failed or did not finish within `AGENT_MODEL_TIMEOUT` seconds (default 120; also reported when that value is not a positive number): loading, busy, or weights paged out. Wait and retry; do not restart the server.

## 3. Give the agent a task

`omp local --run` takes a strict-JSON request. Render one from `docs/agents/requests/` so `cwd` is this checkout's absolute path and the composed prompt fits the runner's 16,384-byte cap:

```bash
bun run agent:request inspect "Read apps/web/src/pages/contribute.astro and apps/web/src/pages/blog/[...id].astro; list every link, whether it is internal, and whether it goes through href(). Do not modify files."
bun run agent:request hub-loop "In apps/web/src/pages/blog/[...id].astro, add an 'All posts' link next to 'Jump to comments' that points at href('/community'). Edit no other file."
bun run agent:request sustain-loop "Add sites/ai-sustainability/test/sustainable-places-evidence-service.test.mjs (node:test + node:assert/strict) for mergeEvidenceResults in sites/ai-sustainability/src/lib/sustainable-places/evidence-service.mjs: when all three feeds reject, every health value is 'unavailable' and evidence deep-equals fallbackEvidence(observedAt). Do not change src/."
# stdout: /abs/path/.agent/requests/<name>-<ms>.json   stderr: omp local --run /abs/path/.agent/requests/<name>-<ms>.json
```

| Template | Mode | Tools | Limits | Acceptance check |
|---|---|---|---|---|
| `inspect` | task | read, glob, grep | 1 iteration, 300 s | none: ends `completed_unverified` |
| `hub-loop` | loop | + write, edit | 3 iterations, 1,800 s | `node scripts/agent/verify.mjs --only hub` |
| `sustain-loop` | loop | + write, edit | 3 iterations, 1,800 s | `node scripts/agent/verify.mjs --only sustain` |

Context files are explicit (the runner's context discovery is off): `AGENTS.md`, plus `sites/ai-sustainability/AGENTS.md` for `sustain-loop`. `agent:request` exits 2 on a bad template name or empty goal and 3 when the prompt would not fit; for loops it also reserves room for the failed-check feedback that iteration 2 appends.

Then run the printed command from a shell with Node 24 first on `PATH`:

```bash
source scripts/agent/activate-node.sh
omp local --run /abs/path/.agent/requests/hub-loop-<ms>.json
```

The check runs `node` from the runner's inherited `PATH`, and the gate puts the directory of the `node` that runs it first on its steps' `PATH`, so an older default Node would build and test the sustainability site (which requires Node 24) with the wrong runtime.

The run talks JSONL: events on stderr, replies on stdin, one terminal JSON result on stdout. Keep stdin open. Each native edit approval and the one-time authorization of each command check arrives as an `input_request` that needs a reply; listing `write`/`edit` in the template is not approval, and closing stdin while a request is pending ends the job `blocked_approval`. A loop stops at the first iteration whose checks all pass. Exit 0 means `verified` (every check passed) or `completed_unverified` (a task without checks); anything else (`iteration_limit`, `timed_out`, `blocked_approval`, `busy`, `failed`, …) exits non-zero and may leave edits behind; there is no rollback.

Prefer a worktree for loops so a failed run cannot leave your branch dirty. Dependencies are per checkout, and the request's `cwd` is the checkout that renders it:

```bash
git worktree add ../unite4ai-agent -b agent/<topic>
cd ../unite4ai-agent && bash scripts/agent/setup.sh
bun run agent:request hub-loop "…"
```

## 4. Verify yourself

```bash
bun run agent:verify                   # hub then sustainability, ~20–35 s warm; last stdout line is JSON
bun run agent:verify -- --only hub     # or --only sustain; --list prints the step names
```

| Set | Steps |
|---|---|
| `hub` | `bun run validate`, `bun run build`, `bun test` (repo root) |
| `sustain` | `npm test`, `npx astro check`, `npm run build` (in `sites/ai-sustainability`) |

It stops at the first failing step. Pass: `{"status":"pass","steps":[…],"log":"…","seconds":…}`. Fail: `{"status":"fail","failed_step":"…","exit_code":…,"timed_out":…,"error":…,"log":"…","tail":"…","seconds":…}`, exit 1, where `tail` is the last 20 lines of the step's output, capped at 4 KiB. Exit 2 is a usage error. The full output of every step is in `.agent/logs/verify-<timestamp>.log`.

CI (`.github/workflows/validate.yml`) runs `sync:d1`, `validate`, `build`, `verify-artifacts` (allowed to fail) and a bare `bun test`. The hub set runs the same validate/build/test commands. A bare `bun test` also picks up the sustainability site's unit tests under Bun, but CI never runs that site's `npm test` under Node, `astro check`, or build; the `sustain` set does.

### Timeouts

- Each gate step is killed after `AGENT_STEP_TIMEOUT` seconds (default 600). It is an environment variable, not a `.env.agent` setting: `AGENT_STEP_TIMEOUT=1200 bun run agent:verify`. For loop checks, export it in the shell before `omp local --run`, since checks inherit the runner's environment.
- Each check in the loop templates has `timeout_seconds: 900`. If the runner stops the gate at 900 s, the gate kills its current step's process group and exits 143 without a JSON summary; read the newest `.agent/logs/verify-*.log` for that run.
- The full gate currently takes ~20–35 s, so either limit firing means something hung.

## Writing goals a 35B model can finish

- One behaviour per request; name the files when you know them.
- Make the acceptance something the gate can see: a test that must pass, a build that must succeed.
- Keep goals short. From this checkout the fixed parts leave roughly 12–14 KB for the goal, depending on the template; `agent:request` prints the byte count when it refuses.
- Do not ask it to commit, push, deploy, or add dependencies; `AGENTS.md` forbids it for local-model runs and the gate does not need it.

## Memory and contention

- Under memory pressure macOS pages out and compresses the model's weights, and the first completion afterwards can take minutes (`agent:model` then reports `not_ready` after `AGENT_MODEL_TIMEOUT`). `omp local --run` also reports a `host_pressure` band.
- Never restart the server to fix that: it reloads the same weights into the same pressure. Find the other large consumers with `/usr/bin/top -o mem` and close or pause them.
- Do not run `agent:verify` in a checkout while a loop's own check is running there: both build into the same `dist/` directories.
