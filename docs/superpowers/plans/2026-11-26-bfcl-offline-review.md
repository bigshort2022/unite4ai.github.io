# BFCL Offline Result Review Implementation Plan

> **For agentic workers:** Use TDD. No inference, syncing private transcripts, GitHub result submissions, or payment. A green check compares evidence; it does not certify independence or authorize publication.

**Goal:** Give a BFCL reviewer one offline command to determine whether a complete private transcript supports the submitted BFCL v1 result.

**Architecture:** Add `review-result` to the existing Python cross-check CLI. Reuse its LF/header/order/footer validation and the Bun worker that checks the canonical per-attempt verdicts. In review mode, compare the submitted result with the same canonical repeat aggregation used by the runner; do not fetch or run the upstream checker. Preserve the legacy calibration commands and output.

**Tech stack:** Python standard library, Bun, existing eval schema and `repeatSummary`/`tallyAttempts`, Node 24 gate.

**Implements:** [Offline evidence review](../specs/2026-11-22-agent-evidence-design.md#offline-evidence-review).

**Depends on:** [Plan 11](2026-11-25-bfcl-replication-task-feed.md). [Volunteer issue #59](https://github.com/bigshort2022/unite4ai.github.io/issues/59) was open with no replies at planning time. The historical transcript replay proved the port's agreement with BFCL for that transcript; it did not bind a proposed result's aggregate or certify an independent replication.

## 1. Test the review contract

- [ ] Extend `scripts/benchmarks/baseline-floors.test.mjs` with a local synthetic result and 250-answer transcript using existing pinned prompt hashes and a private reply marker. Run `python3 scripts/benchmarks/bfcl_crosscheck.py review-result RESULT TRANSCRIPT` through the test. Observe the missing subcommand failure before coding.
- [ ] Check a valid result, then a recomputed but false result that differs from the transcript, a mismatched digest or size, mismatched setup or date, and an altered transcript with an updated hash that still fails canonical replay. Neither success nor failure outputs transcript contents or submitted free text. No live model or checker network call.

## 2. Bind result to the private evidence

- [ ] In `scripts/benchmarks/bfcl_crosscheck.py`, keep the existing parser as the sole transcript shape check. Return parsed header and completion date alongside the hash, byte count and attempts. In the new subcommand, launch the same `bfcl-replay.ts` worker with result JSON, metadata and parsed attempts; use raw-file counts and SHA-256. Preserve the `transcript` operation's existing wire output.
- [ ] In `scripts/benchmarks/bfcl-replay.ts`, keep canonical prompt and reply replay first. In review mode, use `evalResultSchema` on the supplied JSON and accept only BFCL multiple 50 v1 with a local repeat result, no paid API/cost evidence and a SHA-256 and byte count that match. Compare completion date plus model, served artifact, runtime, runtime version, format, quantization and notes against the transcript header. Do not infer a host, checkout, approval, independent identity or real wall clock from a header.
- [ ] Validate per-attempt timing and token fields before aggregating, then recompute and compare the score and entire runner-derived repeat block using `repeatSummary` and `tallyAttempts`; report the first mismatched field, not its value. Reject optional energy evidence because this transcript cannot support it. Print one JSON report with audit scope, checked result digest, the transcript hash/size, attempt count, scores, intervals and an unchecked list; failures emit no JSON, only bounded diagnostics safe to share. The report is evidence consistency, not BFCL upstream agreement, provenance attestation, hardware verification, or acceptance.

## 3. Document and hand off

- [ ] Add the offline command to the BFCL reviewer step in `docs/exchange/agent-guide.md`, naming checks that still require a human. The pinned upstream comparison remains separate and optional. No feed/schema additions and no reference result edits.
- [ ] Run targeted fixtures and the Node 24 acceptance gate. Smoke the CLI on the historical reference if the retained transcript is available on its existing host; only the safe review output may leave it. Open a review PR without marking #59 complete or submitting a new result.

## Historical smoke check

On the mini, the offline command matched the exact published result to the retained 162,405-byte transcript and recomputed 88.8% pass@1 and 76% all-five accuracy from all 250 attempts. Only the JSON report left the host. This is not a result from the open volunteer pilot.
