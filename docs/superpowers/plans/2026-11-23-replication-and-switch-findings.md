# Replication and Switch Findings Implementation Plan

> **For agentic workers:** Use subagent-driven development or execute task-by-task. Tests use local fixtures; no model calls in this feature or its checks.

**Goal:** Show who independently reproduced a repeat-run result, where evidence disagreed, and what a cheaper setup would trade off.

**Architecture:** Compute evidence relationships deterministically from immutable result records. A switch finding adds one typed, directional pair to an ordinary finding and uses its existing reviews. Do not publish any new claims from fixture data.

**Tech stack:** Bun, TypeScript, Zod, Astro, GitHub Pages.

**Spec:** [Agent Evidence Design](../specs/2026-11-22-agent-evidence-design.md#replication). Plan 4 supplies immutable results, cost and hardware metadata. The first mini BFCL result travels in its own add-only PR, outside this feature.

## 1. Replication

**Files:** `packages/core/src/replication.ts`, `packages/core/src/index.ts`, `packages/core/test/replication.test.mjs`, `apps/web/src/lib/evals.ts`, `apps/web/src/pages/{evals/[benchmark],evals/index,registry/models/[...id]}.astro`, `apps/web/src/pages/data/evals.json.ts`.

- [ ] Add tests using at least two independent submitters, a same-owner cross-hardware run, a distinct version, and a peer whose pass@1 overlaps while pass@k does not. Boundaries are inclusive. Count an independent identity once even if multiple consistent peer records exist. If that same identity also has an inconsistent run, keep both signals. Do not group different hosted provider/served-model/card identities.
- [ ] Build a per-result index over records with repeat evidence. Match model card, benchmark, version, format and quantization; for hosted evidence also use provider, exact served-model ID and explicit upstream card, if supplied. Runtime/hardware can differ and remain visible. Pair every result with matching peers (no implicit "first result" privileged). A distinct submitter is consistent only if `a.low <= b.high && b.low <= a.high` for both intervals. Same owner with different local device, accelerator or memory is `repeated on other hardware`, never independent; same owner/same hardware is not an independent peer. Keep hosted client variations out of same-owner hardware labels.
- [ ] On repeat evals, remove contributor-count-as-reproduction badges from summary tables; link to per-result evidence. Each repeat result shows `replicated by N` or `not yet independently replicated`, and `contested` if any inconsistent peer exists. Link all consistent and inconsistent peers with equal prominence and disclose their runtime/hardware. Previous-version results get comparisons only within their version. Legacy leaderboards retain existing behavior. Add machine-readable result links/statuses to the static eval feed without moving raw text or replacing existing fields.
- [ ] Verify `bun test packages/core/test/replication.test.mjs` and fixture page tests; prove ordinary/legacy layout still works.

## 2. Switch findings

**Files:** `packages/schema/src/index.ts`, `apps/web/src/content.config.ts`, `packages/core/src/{exchange,switch-finding}.ts`, `packages/core/test/exchange.test.mjs`, `apps/web/src/pages/exchange/{findings,hypotheses}/[id].astro`, `CONTRIBUTING.md`.

- [ ] Add optional `switch: { incumbent: <result id>, candidate: <result id> }` to both finding schemas. This is a direction, not a verdict. Core gate requires distinct results cited in `results`, both from the hypothesis's exact scoring benchmark and same version, both with repeat evidence and distinct setups. Ownership, dates, revision lineage and review state follow the existing finding rules. If the hypothesis names an API-only model ID, require actual API result evidence for that ID on the hypothesis benchmark; don't add a proprietary registry card. Show the upstream link on evidence rows; hypothesis pages must not link to nonexistent registry pages.
- [ ] Use a pure `compareSwitch` over the pair. Report `pass_k` and its 95% interval plus `pass_1` and its interval. Local comparison uses `repeat.seconds_per_success`; API comparison uses `cost.usd_per_success`. Refuse to compare API money with local time or a list-price estimate with an invoice; no missing/zero-success cost may become zero. Show the individual values and sources even when no comparison is possible. If both share a cost basis, calculate strictly lower cost plus interval overlap on pass@k. A supporting verdict requires both; an unavailable comparison can be documented as inconclusive, not treated as refuting evidence. This is an overlap heuristic, not proof of equivalence or non-inferiority. Use existing review state even when numeric conditions hold.
- [ ] Preserve the pair in the structured data feed, not in untrusted text. Render an accessible incumbent/candidate table on the finding page with exact run links, model and setup, both uncertainty intervals, cost basis/source and the conditions met or unavailable. Keep generic findings unchanged. Document creating and reviewing a switch finding with two published run IDs.
- [ ] Test swapped roles, same/equal cost, mismatched versions, missing evidence, mixed cost bases and support versus inconclusive. Run `bun test packages/core/test/exchange.test.mjs` and the exchange page tests.
- [ ] Extend `apps/cli/src/exchange.ts` and `apps/cli/test/exchange.test.mjs`: `new-finding` and `graft --kind finding` take `--incumbent RESULT_ID --candidate RESULT_ID` together. Keep both in `--results`. Verify the CLI refuses a half-pair without creating a file and accepts a validated pair with roles preserved.

## Delivery

- [ ] Review both slices independently, run `source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs`, and verify the relevant pages in an isolated browser. Open a feature PR using `gh-axi`. Publish the real BFCL record and report in a separate PR only after validating their transcript and before making any claim of replication.
