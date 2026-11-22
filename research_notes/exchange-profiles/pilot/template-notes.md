<!-- Pilot record for Task 8 of docs/superpowers/plans/2026-11-22-exchange-profiles.md. Written by omp agents (claude-opus-5-5); controller notes. -->

# Pilot template notes (for Task 8 Step 4)

1. **All-time metrics** (Olas usage): operators publish cumulative "all time, as of <date>" totals with no start date. The schema requires `window.start`, so these are `not-published`. Option: allow `window: {start: null, end}` labelled "all time to <end>".
2. **Unpublished fee amounts can't cite existence evidence** (x402 costs): `{amount: null, searched}` has no `evidence`, so the quote showing the fee exists (e.g. Permit2 approval gas) can't be attached. Option: allow optional `evidence` on the not-published cost shape.
3. **Zero fees** are recorded as basis `percent`, amount `"0"` when sources say "0 fees" without a unit. Fine for scoring; note it in the protocol.
4. **Facilitator-specific fees** (x402): fees belong to named facilitators, not the protocol. Scope text carries this; the cost score then mixes protocol and one facilitator's fees. Decide whether x402's cost score should use the protocol only or the reference facilitator.
5. **Parallel agents must not share one file**: the pilot used per-section fragment files merged by the controller. Update protocol step 2 accordingly.
6. **Validator too strict on token symbol** (Olas): `validateProfiles` requires every `marketData` value to be `reported`, but the token symbol is legitimately `stated` by the operator. Fix: apply the rule to `marketCapUsd` and `tokenPriceUsd` only. (Code fix, made before the merge.)
7. **Weekly users vs published metrics** (Olas): Olas publishes "daily active agents, 7-day average", not weekly active users. Recorded as not-published. Decide whether the template should allow the operator's own active-user definition with its label.
8. **Point-in-time prices vary within one page** (Olas, CoinMarketCap): $0.03688 / $0.03687 / $0.036875 on the same page. The quoted sentence is used; the retrieval date is the only timestamp. Consider an `asOf` time for market data.
9. **Abbreviated numbers** (x402 usage): x402scan shows "16.91K" buyers and "$1.74M" volume; the agent wrote 16910 and 1740000, which adds precision the page doesn't state. Options: allow a displayed-precision text value (e.g. "16.91K") alongside the number, or treat abbreviated figures as not-published.
10. **Derived windows** (Akash, x402 usage): pages say "per day" / "Past 7 Days" / "Past 30 Days"; agents computed start/end dates from the retrieval date. The schema needs dates the page never states. Option: allow a relative window label ("past 7 days as of 2026-11-22").
11. **JavaScript-rendered dashboards** (stats.akash.network, x402scan): quotes only exist after scripts run, and x402scan's 7-day view needs a menu selection, so `profile:verify` cannot confirm them. These need manual confirmation in owner review, or a browser-based verifier.
12. **Mapping choices** (x402): "Buyers" used as weekly active users; Akash "USD paid to providers per day" used as volume. Field meaning should be defined per category in the template.
13. **Measured costs vs set fees** (Olas): gas "roughly $0.0115 per request on Polygon", measured over July–August 2026, is recorded as a fixed USD network-gas fee, so it counts in the cost score. Decide whether measured or approximate costs may count, or only fees the operator sets.
14. **No "not published" shape for price quotes** (Olas, x402): an empty `priceQuotes` can't record where prices were searched for. Option: add a `priceQuotesSearched` list.
15. **Custody definition** (Olas): the agent first scored contract escrow as custodial. Ruling sent to all security agents: custodial means the operator (company, foundation, admin key) holds or can control funds; immutable contract escrow is not custodial. Put this definition into the rubric labels (rubric v1 label "Holds customer funds" is ambiguous).
16. **Statistic vocabulary** (Akash prices): "start at $2.73" was recorded as `min`, but it matches the page's weighted average (console API shows min 2.55, median 2.56). The RTX 4090 "$0.36/hr" is a weighted average of recent bids and was dropped because `average` isn't an allowed statistic. Option: add `average` and a `from` ("starts at") statistic.
17. **Fee kinds missing** (Akash): "no egress or bandwidth fees" has no fee kind to record. Option: add `egress`.
18. **Unstable evidence URLs** (Akash): the Console terms only exist in a hashed Next.js chunk (`_next/static/chunks/pages/terms-of-service-<hash>.js`), which changes on redeploy. Evidence should cite the human page URL plus a "rendered" marker, verified in a browser.
19. **Self-contradicting official sources** (Akash custody): terms 3.2 say "purely non-custodial", docs describe Console-managed wallets that Console signs for. custodial-funds = fail; conflicting-terms only covers payment terms by definition. Consider widening conflicting-terms to custody and fees.
20. **PDF and rendered-only evidence** (x402 audit PDF, GitHub-rendered SECURITY.md, Mech Terms PDF): `profile:verify` text-matches raw bytes, so PDFs fail. Option: extract PDF text in the verifier, or mark kind `pdf` as manual.
21. **Process**: two agents made one plain curl GET each outside the brief's tool rule (passive, no evidence taken from it). Brief should allow plain GETs explicitly or forbid them clearly.
22. **Cost score from too few fees** (Akash): the only countable fee is a 0% take rate (gas is in uakt, excluded), so the score is 100/A. A perfect score from one zero fee overstates cheapness. Option: withhold the cost score unless the buyer side has at least one countable component, or show "partial: N of M fee components counted".
23. **Per-unit USD fees make the score not computable** (x402: CDP facilitator $0.001 per transaction). Option: convert per-transaction fees on the USD 100 reference as one transaction (no FX needed).

## Owner rulings (2026-11-22)

- **Developer-company statements about a DAO-run product** (Valory AG on the Olas Marketplace) count as `reported`: a named third party's statement, labelled as such.
- **A disclaimer linked from the product's own footer** (olas.network Disclaimer & Privacy Policy) counts fully for governing law, jurisdiction and as published terms of service.
- These become protocol rules for the remaining 17 profiles.
