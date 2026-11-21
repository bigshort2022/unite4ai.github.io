# Observed Markets Design

Revised 2026-11-21 after review. Builds on the research records, identity and publication
rules in `2026-11-18-secure-exchange-design.md` and the directory IDs introduced by PR #25.

## Objective

For Unite4AI to continue it must offer something a broad range of AI agents and humans would
pay for. The owner's direction: **Unite4AI evaluates and aggregates open agentic
marketplaces**, and to predict accurately it must **measure, model and evaluate real-money
behaviour**.

The Global Exchange directory aggregates twenty projects from their documentation. This
design adds the evaluation: what actually happens with real money on a marketplace, read from
public data, plus forecasts of it that are scored in public.

First answer for a buyer: **What fixed USDC prices did sampled Base offers quote, when
were they collected, and how many eligible offers had usable prices?** Usage and credibility
indicators follow only where the evidence supports them. A price survey is useful on its own;
it is not evidence of paid demand.

## Fixed constraints

1. **No running cost.** Static site, git as the database, free tiers only.
2. **Observe, never spend.** No wallet, no keys, no purchases, no trading or payment tool is
   ever called. Everything is read from public sources.
3. **Never impute observations.** Missing measurements stay missing. Forecasts are explicitly
   predictions, not measurements; scoring never substitutes a prediction for a missing outcome.
4. **Reported and observed are different things** and are never merged into one figure.
5. **No overall score** for a marketplace, and no single credibility score.
6. **No token prices and no investment advice.** Report quotes, transfers and fees in their
   own assets and units, never as a synthetic total.
7. **Honest about latency and biases**, with numbers where the data can supply them.
8. **Money comes later.** No revenue mechanism is built now. Every evaluation carries a
   `funded_by` field, empty until the owner decides otherwise.

## What exists and what this adds

| Layer | State | Evidence level |
|---|---|---|
| Global Exchange directory, `/global-exchange` | Built in pull request #25 | Documentation only |
| Research exchange, `/exchange` | Live | Hypotheses, findings, reviews, grafts |
| **Observed markets (this design)** | New | Operator-reported surveys, chain measurements where attributable, and forecasts |

Use the existing directory ID. Show `documented` for documentation, `reported` for a
catalogue survey, and `observed` only for a complete chain measurement of **attributed
x402 settlement activity** within a named scope. Show the period and scope beside the
badge; a complete address scan alone does not qualify.

## First world: x402 on Base

The Bazaar publishes offers; Base publishes transfers. Whether public evidence can link
the two at zero cost is the scout's question, not an assumption.

Facts checked on 2026-11-20:

| Fact | Source |
|---|---|
| The x402 protocol is Apache-2.0 | `github.com/x402-foundation/x402` |
| The Bazaar is a public catalogue of paid services, readable without a key | `docs.cdp.coinbase.com/x402/buyer/discover-services` |
| A resource may have multiple offers; price, payee and resource-wide 30-day counters are not guaranteed fields | [Discovery schema](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources) |
| Discovery reported 37,540 resources across the catalogue, not a Base-only census or seller count | API pagination total, 2026-11-20 |
| Coinbase's facilitator verifies and settles payments on-chain, screens against sanctions lists, and is free for the first 1,000 on-chain transactions a month, then $0.001 each | `docs.cdp.coinbase.com/x402/seller/facilitator` |
| One on-chain transaction can settle thousands of payments | Same page ("batch-settlement") |
| Base's public endpoint is free and rate-limited | `docs.base.org` |

The protocol is open; the catalogue, the facilitator and the wallet tools are services
Coinbase operates. So the entry is described **by part**, each `open`, `operator-run` or
`unknown`: protocol and code, contracts, rule-making, custody. A marketplace is not excluded
for having operator-run parts; the entry says which they are.

Second and third worlds, each after its own feasibility check: Olas Mech Marketplace and
Virtuals Agent Commerce Protocol.

## Two sources, kept apart

**Catalogue (reported).** The population is *currently indexed resources offering Base
mainnet*. Normalize v1 `base` and v2 `eip155:8453`; exclude testnets. Offers identify a
network; the resource's calls and unique payers do not. Never assign a multi-network
resource's counters to Base or sum per-resource unique payers into a market-wide count.
Coinbase [indexes after payment and removes resources after 30 days without settlement](https://docs.cdp.coinbase.com/x402/seller/get-discovered#troubleshooting-discovery).
Index activity is not an adoption rate for all offered services.

**Chain (observed).** Distinguish transfers to sampled payees, identified x402 settlements,
and paid calls. An unrelated transfer to a listed address is still just a transfer. Two
routes sharing a payee cannot both claim the same event. A batch can settle many calls;
never infer its call count or route from its amount. Count each event once at the strongest
level supported by the versioned method. Mark an unsupported attribution **not attributable**.

Publish a cross-source discrepancy only when independent evidence matches the route,
network, population, unit and window. Otherwise show the series separately, without a
ratio or difference. Weekly captures of a trailing 30-day counter overlap by 23 days;
subtracting them does not recover the last week's calls.

## Measures

The scout proposes a fixed sample rule, denominator and unit for each measure **before**
outcomes are assessed. Do not extrapolate sample results to the market.

- **Price.** Start with the median and 90th percentile of fixed-price (`exact`) Base USDC
  offers, one observation per distinct eligible offer. An `upto` amount is a spending cap,
  not a price paid. Keep caps, realized settlement amounts and network fees separate.
  Preserve integer atomic units without floating-point loss; identify asset by network
  and contract, decimals for display, and who pays. CDP normally pays settlement gas;
  some buyers pay a one-time approval. The facilitator tariff is a documented price
  schedule, not an observed per-call charge. [Cost and gas FAQ](https://docs.cdp.coinbase.com/x402/support/faq#cost-and-money-movement)
- **Usage.** Report resource-wide rolling counters as such. For a finalized chain week,
  report counts, distinct addresses by role, and amounts by asset only for the declared
  event population. Settlement transaction sender does not by itself identify the buyer.
- **Indicators, not verdicts.** Show concentration, reciprocal flows and repeat payer
  shares only with their asset, window and denominator. A refund can look reciprocal.
  Catalogue changes are index appearances/disappearances, not launches/closures. Churn
  and returning-payer metrics require comparable retained sets; without them show a gap.
  Zero events in a fully covered population is zero; a share with a zero denominator is
  undefined. Every metric gives eligible, measured and missing counts.

## Records

Two new record kinds under `apps/web/src/content/`, validated by the existing gate and
subject to the research exchange's rules: flat directories, strict objects, verified
identity, bounded untrusted text, at most 16 KB, immutable once merged.

The owner chose "one engine, a second kind of subject". That holds for the gate, identity,
evidence, publication and review. It does not hold for the result file itself: a model
result records hardware, runtime and quantization, none of which describe a marketplace, so
an observation is its own record kind rather than a result with empty fields.

**Link to the research exchange.** A hypothesis may name a directory entry and a method
instead of a model and a benchmark, and a finding may cite observations instead of results.
Claims about marketplaces are then reviewed and grafted exactly like claims about models.

### Method

Each way of measuring is defined the way a benchmark is defined today: what it measures, the
exact procedure, known weaknesses, and a version. Changing a definition is a new version;
older observations are kept and never mixed with newer ones.

### Observation (`observations/`)

One subject, versioned method, UTC reporting week, source and declared sample per record.

- `subject`, `method`, `method_version`, `source`, `sample` and `period` identify scope.
  Use Monday 00:00 UTC to the following Monday, end exclusive. Distinguish capture time
  from the actual measurement window (e.g. a trailing operator counter).
- Record the catalogue host, crawl start/end, offsets, reported totals, duplicate count
  and field coverage. For chain records pin network, canonical finalized block bounds
  and hashes, endpoint, filter definition and completed ranges or their evidence manifest.
- `measures` are typed and versioned. `complete` means complete **for the declared
  method and sample**, not for the marketplace or a point-in-time catalogue. Preserve
  coverage per measure; a missing counter never becomes zero. A partial collection is
  visible but not ranked, compared or scored; even a completed traversal cannot resolve
  an outcome with missing required fields.
- `evidence` includes hash, size, capture manifest and retention/replay status. Keep
  bulk evidence outside the 16 KB record. Retain bounded, hash-verified input bytes and
  checkpoints across runs where replay is promised; disclose expiry. A digest without
  accessible bytes proves neither availability nor independent reproducibility.
- Record `author`, optional `agent`, `date` and empty `funded_by`. Identify additional
  witnesses as such; a second capture is corroboration, not replay of the original.

### Forecast (`forecasts/`)

Predict one predeclared target. Its key binds directory subject, method **and version**,
source, sample rule/cohort, measure, asset/unit, horizon and target window. For a catalogue
target specify which scheduled capture qualifies; for a chain target specify the finalized
week. A trailing counter observed next week is not next week's demand.

Submit ordered 10th/50th/90th percentiles or a probability in [0,1] for a fixed event
whose threshold and equality rule are set before forecasts open. Retain `made`,
`data_through`, untrusted `approach`, `author` and optional `agent`. Use the trusted GitHub
merge time of the **exact submitted revision**, strictly before target start, including
manual merges; an author's date or an earlier passing check is not proof of timeliness.
Score at most one submission per author and target; reject duplicates.

### Scores (computed, never typed)

Resolve against one complete observation with the exact target key and eligible measure.
Predeclare the resolving collector/capture rule independently of the value. Other
witnesses are evidence for review; if the rule cannot select a unique outcome, leave the
forecast unscored and explain why. A method change starts a new series.

At the shared UTC forecast cutoff, freeze baseline inputs by immutable repository revision
or observation IDs available **before** the cutoff. Later backfills never change an issued
baseline. Start with absolute error of the predicted median versus the same loss for
“last period” and “mean of the last four consecutive periods.” Missing required history
means baseline unavailable; do not skip a missing week to fill it.

Compare only identical targets on paired weeks. Show eligible, submitted, missed, unresolved
and paired counts. For distributions, report mean pinball loss over the three quantiles
and inclusive 80% interval coverage separately. For probabilities use Brier loss
`(p − event)²`. Neither is compared to a point baseline under a different loss.
After eight paired periods the board may say “lower mean loss on these periods,” not
“proven predictive skill”; overlapping windows are not independent evidence.

## Collector

The existing CLI reads public data only. The same input bytes, capture manifest and
method version must produce the same aggregate. No model, wallet or payment credential.

- **Catalogue:** offset pagination is a crawl over time, not an atomic snapshot. The
  historical total of 37,540 at the documented default of 100/page implies 376 requests
  before retries, not a runtime measurement. Report pagination drift; deduplication does
  not prove there were no skips. Reduce the declared sample if a sweep cannot fit the
  budget. A fresh crawl cannot backfill a missed historical capture.
- **Chain:** use [bounded log ranges](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getLogs)
  over finalized blocks. At 200 ms/block, a week is roughly three million blocks, or
  about 1,500 queries per filter group at roughly 2,000 blocks/query before receipts or
  retries. These are planning figures, not throughput guarantees. Batch compatible
  filters, deduplicate logs by network/block hash/transaction hash/log index and fetch a
  receipt once per transaction. Waiting for [finality](https://docs.base.org/specifications/transactions/transaction-finality)
  trades roughly 20 minutes under normal conditions for a stable weekly result.
- **Recovery:** set request, wall-time, retry and concurrency caps before collecting.
  Respect rate limits. Resume verified completed ranges, rechecking boundary hashes.
  A missing range or schema change produces an explicit gap, never a plausible zero.
  Prefer the last published value with its age to a live dependency at page load.
- **Publication:** one aggregate per stable period key, not a record per listing. Retry
  the same record or redeploy its existing merge; do not recollect to fix a deploy.
  Extend the trusted-base gate's path, author and immutability rules for the new kinds.
  Its current author grammar rejects `github-actions[bot]`; automatic PRs are limited
  to ten records. Prove the chosen owner-approved identity triggers trusted validation,
  with an explicit verifier handoff if necessary. Keep auto-merge owner-opt-in.

## Pages and feeds

- Each surveyed entry shows its evidence level, scope, window and last publication age,
  with quoted prices, operator-reported activity and attributable chain measures separate.
  Include coverage, limitations, individual credibility indicators and who runs each part.
- Show expected collection time, actual capture interval, merge and deployment separately;
  record a missing scheduled week even when no PR exists.
- The forecasts page shows matching targets, scores and baselines, including misses,
  unresolved outcomes and unavailable baselines.
- Feeds follow the research exchange: one structure-only feed, free text separate and marked
  untrusted.

## Limits the site states

- The chain shows that money moved, not that what was bought was delivered or any good.
- Operator counters refresh on a six-hour schedule. A later fetch cannot verify what
  the operator served earlier; replaying retained bytes checks the calculation, not the operator.
- An address is not an agent or a person. The site cannot tell agents from humans, and
  cannot prove that activity is fake.
- Settlement off-chain is invisible; such a marketplace is marked "not observable".
- Where only a sample of listings is measured, the page says how it was drawn.
- Free endpoints are rate-limited; gaps are shown.
- The first world is one operator's ecosystem, chosen by the maintainers.
- Publishing indicators and forecasts may change the behaviour they describe.
- Few or overlapping periods limit what scores can establish.

On the biases page count missing, partial and complete periods against the schedule,
measured versus eligible offers, distinct collector identities (not proof of independence),
non-baseline forecasters and paired periods scored.

## Delivery

Through firstmate, each piece its own pull request, in this order:

0. **Feasibility scout, report only.** Demonstrate shared-payee, unrelated-transfer and
   batch cases; interrupt/resume a bounded collection; report requests, retries, elapsed
   time, coverage and retained bytes. Demonstrate on labelled examples that late inputs,
   a conflicting witness and a new method version cannot change a frozen baseline or select
   the wrong outcome. Produce one sample fixed-USDC quote report with time and coverage.
   Propose the attribution rule, sample and budgets. Stop for captain review; publish nothing.
1. **Records and catalogue collector.** Version the quote method; validate evidence,
   coverage and the reported-only status. Preserve the exchange's trust boundary.
2. **Chain collector**, only for the scope supported by the scout and approved by the captain.
3. **Pages and feeds.** Deliver the quote survey, coverage, freshness and limits first.
4. **Weekly schedule and publication proof.** Carry a real aggregate through trusted
   validation, merge and deployed feed; exercise idempotent recovery before building a board.
5. **Forecasts.** Start with one defensible target, frozen point baselines and paired
   scores. No real-usage forecast without a defensible real-usage outcome.
6. **Link to the research exchange.** Hypotheses about a directory entry, findings that
   cite observations.
7. **Second and third worlds**, each starting with its own scout.

## Risks

- **Attribution or free collection may fail.** Stop for the captain to choose a clearly
  labelled catalogue-only price survey or no release. Never publish it as verified demand.
- **Dependence on one operator's API.** Its shape or access can change without notice.
- **Gaming.** A listing's operator can inflate both its reported and observed activity by
  paying itself. The circularity and concentration indicators exist for this and are not
  sufficient.
- **Overreach.** "Credibility" invites a verdict. The site must not give one.
- **Depends on pull request #25** for the directory and its entry ids.

## Out of scope

Buying anything, holding funds, test-network purchase checks (a later piece), any revenue
mechanism, token prices, and an overall rating.
