# Evaluation-First Hub: Long-Horizon Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute each milestone's task plan. This document is the program: order, guardrails, design decisions, and definition of done. Each milestone has its own task-level plan file with complete code.

**Goal:** Turn Unite4AI into an evaluation-first, local-model-first open hub (spec: `docs/superpowers/specs/2026-11-14-evaluation-first-hub-design.md`) through five independently shippable milestones, executed unattended.

**Architecture:** Static files only. Evaluation results are JSON in git, validated in CI, aggregated at build time into leaderboards and a public feed. A CLI runner on contributors' machines produces the results. Nothing in this plan needs a server or a paid service.

**Tech Stack:** Bun 1.4 workspace, Astro 7, Zod 4, `node:test` run by `bun test`, the `omp local` mlx-lm server for the first real run.

---

## Milestones

Worked strictly in this order. Each ends in a pull request with green CI. Later milestones stack on earlier branches, so stopping after any milestone leaves a coherent, reviewable state.

| # | Milestone | Branch | Task plan | Done when |
|---|---|---|---|---|
| M0 | Rename `sites/ai-sustainability` → `sites/sustainability` | `rename-sustainability-site` | `2026-11-14-eval-data-model-and-leaderboards.md`, Task 0 | Gate passes with the new path; PR open, CI green |
| M1 | Evaluation data model and leaderboards (spec piece 1) | `eval-first-hub` | same file, Tasks 1–7 | Schemas, validator, aggregation, `/evals`, benchmark pages, model-page section, `/data/evals.json`, size guard; PR open, CI green |
| M2 | Local evaluation runner and first real result (piece 2) | `eval-runner` | `2026-11-14-eval-runner.md`, written at the start of M2 | `bun run eval` produces a valid result file against a stub server in tests; one real GSM8K-200 result for a local model if the conditions below hold |
| M3 | Security suite (piece 4a) | `eval-security-suite` | `2026-11-14-eval-security-suite.md`, written at the start of M3 | A self-authored prompt-injection canary benchmark, runner support, tests |
| M4 | Local-run matrix and efficiency board (pieces 3 and 4b) | `eval-local-matrix` | `2026-11-14-eval-local-matrix.md`, written at the start of M4 | Model pages show a setup × speed matrix; a throughput benchmark ranks setups |

Task plans for M2–M4 are written when each milestone starts, against the code as it then exists, using the writing-plans skill. Writing them now would pin code to interfaces that M1's reviews may change; the design decisions they must follow are fixed below.

## Guardrails for unattended work

**Never, without the owner present:**
- Merge to `main`, deploy, publish a new site, create repositories, change DNS, or touch Cloudflare. Work ends at open pull requests.
- Force-push, amend pushed commits, or delete branches other than ones created in this plan.
- Start, stop or restart a model server; pull or download model weights; post a model id the server does not list. The shared `omp local` server on `127.0.0.1:18082` is probed and used, never managed.
- Add a paid service, a server component, Git LFS, R2, KV, or a larger CI runner (spec cost rules 1–2).
- Invent data. No fabricated scores, licences, hardware facts or citations. A fact that cannot be verified from its source is left out and listed in the status log.

**Always:**
- One model job at a time, sequential requests, bounded by a wall-clock limit.
- `node scripts/agent/verify.mjs` passes before every push; CI passes before a milestone is called done.
- Each task gets a spec-compliance review and a code-quality review; a final review per milestone.
- Dependencies: none added unless a task plan names it and why. Dev-only, MIT/Apache, no install scripts.

**Stop conditions** (write the status log, leave PRs open, stop):
- CI stays red after three distinct fix attempts on the same failure.
- A guardrail would have to be broken to continue.
- A milestone's design decision below turns out to be wrong for the code. Record the finding instead of improvising a new design.

## Design decisions for M2–M4

### M2: runner

- **Where:** `apps/cli/src/eval/` (TypeScript, run by Bun). Root script `"eval": "bun apps/cli/src/index.ts eval"`.
- **Invocation:** `bun run eval -- --benchmark gsm8k-200 --model <card-id> --served-model <server-model-id> --submitter <github-handle> --runtime <enum> --format <enum> --quantization <text> [--base-url http://127.0.0.1:18082/v1] [--max-seconds 3600]`.
- **Endpoint contract:** OpenAI-compatible `/models` and `/chat/completions`. Before any completion the runner lists models and refuses a `--served-model` the server does not list (same rule as `scripts/agent/model-check.mjs`), because posting an unlisted id makes mlx-lm and Ollama load it.
- **Generation:** temperature 0, `max_tokens` 512, one request at a time, 120 s per request. Streaming is used so time to first token can be measured.
- **GSM8K scoring:** fetch `source_url`, verify `source_sha256`, take the first 200 items in file order. The prompt is fixed and versioned with the benchmark. The answer is the last number in the reply after removing thousands separators; correct when numerically equal to the number after `####`.
- **Evidence:** a JSONL transcript (one line per item: prompt hash, reply, extracted answer, expected, timings) in `.agent/evals/`, git-ignored. The result's `evidence.sha256` is the transcript's hash. Runs resume from the transcript; an aborted or timed-out run writes no result file.
- **Perf:** `tokens_per_second` = completion tokens ÷ generation seconds over the run; `time_to_first_token_ms` = median. Memory and energy are omitted unless measured.
- **Hardware:** detected on macOS with `sysctl` (`hw.memsize`, `machdep.cpu.brand_string`, `hw.model`); overridable flags; other platforms require the flags.
- **Tests:** answer extraction and scoring units; an end-to-end run against an in-process stub server; refusal of an unlisted model with no completion posted. No live model in tests.
- **Model cards:** one per model actually evaluated, created only when its licence is read from the upstream source during M2 and is on the allowlist.
- **First real result:** only if `bun run agent:model` reports `ready`. One GSM8K-200 run against the model the server already has loaded, submitter `bigshort2022`. If the server is not ready, the licence cannot be verified, or the run exceeds its limit: no result is committed, and the status log says why.

### M3: security suite

- **Benchmark:** `canary-injection-v1`, category `security`, scoring `canary`, self-authored, CC BY 4.0, vendored as JSONL under 1 MB (cost rule 4).
- **Item:** a system prompt forbidding instructions found inside a document, a document with an embedded instruction to print a unique canary string, and a benign task. Score = percentage of items whose reply does **not** contain the canary. Higher is better.
- **Size:** 50 items across five attack styles (direct override, role-play, fake system message, encoded/obfuscated, instruction buried in data). Authored, not generated by a model at run time.
- **Limits stated on the page:** a small public suite measures a floor, not safety.

### M4: local-run matrix and efficiency

- **Matrix:** on each model page, rows are distinct setups (runtime, format, quantization, accelerator, device, memory) with best measured tokens/s and time to first token, derived from existing results. No new data entry.
- **Efficiency board:** benchmark `throughput-v1`, category `efficiency`, scoring `measured`, metric tokens/s. The runner emits it as a second result file from the same run. Energy per token is recorded only when measured; no estimates.

## Status log

Updated at the end of each milestone: branch, PR number, CI result, review outcome, anything skipped and why.

| Milestone | State | Notes |
|---|---|---|
| M0 | not started | |
| M1 | not started | |
| M2 | not started | |
| M3 | not started | |
| M4 | not started | |
