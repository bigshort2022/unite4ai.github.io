# BFCL Replication Task Feed Implementation Plan

> **For agentic workers:** Use test-driven development. Exercise the deployed and local static surfaces without touching an inference endpoint or submitting a result.

**Goal:** Let an agent discover and preflight the same BFCL replication task a person sees without scraping prose or mistaking the original result for an assignment.

**Architecture:** Add `/data/replication-tasks.json` as a prerendered, versioned listing. The existing BFCL card and the JSON feed share a projection from the pinned benchmark and result; use the evidence receipt for observed scores, setup, intervals and original transcript digest. No new storage or runtime service.

**Tech stack:** Astro, TypeScript, `node:test`, Bun, Node 24; no new dependencies.

## Pilot evidence

- The deployed [card](https://unite4ai.com/evals/bfcl-multiple-50#replication-task) already links the exact reference and its evidence receipt. Public evidence reports 88.8% pass@1 (95% interval 82.4–94.4%) and 76% all five (62.59–85.7%). It does not host a raw transcript.
- Contributor preflight stopped before inference: the available GitHub login, `bigshort2022`, matches the reference. A different machine or agent under that account would not count. [Issue #59](https://github.com/bigshort2022/unite4ai.github.io/issues/59) solicits one genuinely independent volunteer. No volunteer result was observed or submitted.
- Reviewer walkthrough against the historical transcript on the mini: its 162,405 bytes and SHA-256 matched the public receipt, and BFCL's checker and the port agreed on all 250 attempts. No raw transcript left the host; no model was called. This proves scorer agreement on that transcript, not independent replication or an attested checkout/artifact.
- Design consequence: publish the reference submitter and the constraints as typed fields so an agent can stop before probing or running a model. Link the receipt instead of duplicating observed metrics or evidence. Describe the independent volunteer outcome in the issue, not in the static feed.

## 1. Specify and test the feed

Implements [Machine-readable task](../specs/2026-11-22-agent-evidence-design.md#machine-readable-task). Depends on [Plan 10](2026-11-24-bfcl-replication-task.md) and [evaluation evidence receipts](2026-11-24-eval-exports.md).

- [ ] Extend `apps/web/test/deployment.test.mjs` to read `/data/replication-tasks.json` using its existing production build. Assert `schema_version: 1`, one `bfcl-multiple-50-v1-replication` task, an exact join to the published evidence, and the independent submitter, no-permission and typed budget/deliverable fields below. Check the card's feed link and `llms.txt` discovery. Run `node --test --test-name-pattern='production build' apps/web/test/deployment.test.mjs` under Node 24 and observe the missing feed failure first.
- [ ] Extend the existing fixture build in `apps/web/test/evals-pages.test.mjs`: a missing reference must omit the card and emit `tasks: []`, rather than substitute a different result or omit the endpoint.

## 2. Share the task projection and expose it

- [ ] In `apps/web/src/lib/replication-task.ts`, move the existing BFCL validity checks out of `apps/web/src/pages/evals/[benchmark].astro`. `bfclReplicationTask(benchmarkId, benchmark, reference)` returns `undefined` unless the exact published result ID, current v1, source digest, artifact name, format, quantization and repeat method all match. Do not search for a different run. Use canonical run and evidence path helpers. `card_url`, `method_url`, `reference.result_url` and `reference.evidence_url` are base-aware site paths; `guide_url` is the manual GitHub checklist.
- [ ] Emit a single task with `id`, `kind: "independent_replication"`, those links, `reference` (`result_id`, `submitter`, result/evidence URLs), `benchmark` (`id`, `version`, `source_sha256`, `items`, `repeat`, `expected_attempts`), `artifact` (`model_card_id`, `served_model`, `format`, `quantization`, `already_loaded: true`, `thinking: false`), `requirements` (Apple Silicon, 64 GB minimum, idle local host, independent contributor, separate run and submission approvals), `budget` (`max_paid_usd: 0`, `max_wall_seconds: 3600`, `runner_max_seconds: 3300`, `request_timeout_seconds: 90`, `payout_usd: 0`), and `deliverable` (one new result in an add-only draft PR with a private transcript and enumerated review checks). No endpoint credentials, command, transcript, score target, assignment or mutable pilot state.
- [ ] Add `apps/web/src/pages/data/replication-tasks.json.ts`: load the single benchmark and result with Astro content, call the projection, and send `{schema_version: 1, notice, tasks}` with the existing JSON exporter. Call the same projection in `[benchmark].astro`; let `BfclReplicationTask.astro` render the method, artifact and limits from its result. Keep observed scores and time tied to the historical record. Link the feed from the card and `apps/web/src/lib/ax-index.mjs`; document field and approval semantics in `docs/exchange/agent-guide.md` without changing the generated AX rule section.

## 3. Verify and hand off

- [ ] Verify the targeted build tests, then run the Node 24 acceptance gate and verify the local page and JSON, including base-prefixed links. Open one review PR. Do not change scoring, AX commands, result schemas, Hugging Face bindings, queues, assignments, automatic submission or payments.
- [ ] For the independent pilot, wait for a real volunteer from [#59](https://github.com/bigshort2022/unite4ai.github.io/issues/59). Have them preflight and run under their own account with machine-owner approval; review one complete result and its private evidence. Record any real friction in the issue. This external step does not block shipping the read-only task feed and is not satisfied by the historical replay.
