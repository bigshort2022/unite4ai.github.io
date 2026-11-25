# BFCL Replication Task Card Implementation Plan

> **For agentic workers:** Use subagent-driven development for independent slices or inline execution for the coupled page/test change. Verify offline; the card is not approval to use a model server, spend, or submit a result.

**Goal:** Offer one assignable, zero-paid-spend replication task from the BFCL benchmark page, with a concrete deliverable and reviewer checklist.

**Architecture:** Add a prerendered Astro card to `/evals/bfcl-multiple-50#replication-task`, fed by the exact existing current-version result and benchmark metadata. The Exchange and agent guide point to the benchmark workflow. Use the existing runner and add-only submission path; no task API, claim, reservation, model probe, payout, or change to replication scoring.

**Tech stack:** Astro, existing `@unite4ai/schema` types, Node 24, `node:test`, Bun. No dependencies.

**Implements:** [BFCL replication task card](../specs/2026-11-22-agent-evidence-design.md#bfcl-replication-task-card). Depends on [replication labels](2026-11-23-replication-and-switch-findings.md), [AX handoff](2026-11-24-ax-task-handoff.md), and [export receipts](2026-11-24-eval-exports.md). [Plan 9](2026-11-24-hf-bfcl-task.md) does not gate the task on Hub approval.

## 1. Write executable acceptance checks

- [ ] In `apps/web/test/deployment.test.mjs`, reuse the deployed production build. Isolate `section#replication-task`, assert the exact run-anchor and evidence-receipt links, served artifact, local hardware/time and paid-spend policy, and the review of all 250 attempts. Ensure a non-BFCL benchmark does not expose the card. Run `node --test --test-name-pattern='production build' apps/web/test/deployment.test.mjs` under Node 24 with Bun on `PATH`; expect the missing-card assertion to fail before implementation.
- [ ] In the existing fixture build in `apps/web/test/evals-pages.test.mjs`, assert that a site with no pinned BFCL run does not expose the replication card. Do not create a fake run in production content.

## 2. Render the task from the existing record

- [ ] Add `apps/web/src/components/BfclReplicationTask.astro`. Take the validated reference result, its run anchor, and a base-prefixed receipt URL. Show the reference sample and scores from the result, not from hardcoded score prose. Label the 76% all-five score and the 88.8% pass@1 as observed values only; neither is an acceptance threshold. Show the 33-minute observation separately from the proposed time cap.
- [ ] In `apps/web/src/pages/evals/[benchmark].astro`, render the component before the leaderboard only for `bfcl-multiple-50` v1 and the exact current run `qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8`. Require the loaded artifact `mlx-community/Qwen3.8-27B-4bit`, MLX 4-bit, and BFCL v1 repeat setup (50 items, five passes, temperature 0.7, top-p 1). Use existing `evalRunAnchor` and evidence export path functions; never choose a different result when the pin is unavailable.
- [ ] The card must guide preflight, execution and submission: independent real account; idle Apple Silicon at least 64 GB and exact already-loaded artifact, thinking off; disclose any runtime or hardware differences. Explicit owner approval for the run, $0 paid spend, 60 minutes overall (enforced by the operator), 3,300-second runner cutoff and 90-second reply timeout. Start in a fresh checkout/work directory, record actual data, do not run tool calls, and stop on a blocker without swapping, spending, or retrying. Staging a partial run or copying the historical contributor's command is not allowed.
- [ ] The reviewer checks the exact runner/benchmark and artifact, all 250 attempts and result/intervals, actual time/setup, and the SHA-256 and size of the private transcript. Retain disagreement; intervals overlapping are not proof of equivalence. Link the manual handoff from the card; only one add-only draft PR after separate submission approval. No bounty and no verified-identity or model-weight claims.
- [ ] In `apps/web/src/pages/exchange/index.astro` add discovery via the BFCL benchmark page (this URL remains valid when the card is absent). Add the run-template and reviewer handoff in `docs/exchange/agent-guide.md` outside its generated AX rules. Keep the AX CLI pin, HF binding, runner, schema, and evidence records unchanged.

## 3. Verify and hand off

- [ ] Run the runner's `bun run eval -- --help` without a model, run the Node 24 repository gate (`source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs`), and verify the production card and both exact evidence links in an isolated local Chrome tab. Also check that the card is absent on another benchmark. Open one site review PR and quote the gate's JSON result. Do not do the replication, open a result PR, or deploy.
