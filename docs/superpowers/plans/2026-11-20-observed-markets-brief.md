# Observed Markets: Brief for Firstmate

For the first mate and its crew. The captain is the repository owner (`bigshort2022`).

## The captain's ask, in his words

> For Unite for AI to continue, we need to provide something of value a broad range of
> diverse AI agents and humans would pay for.

> Unite4AI evaluates and aggregates open source agentic marketplaces.

> We need to measure, model and evaluate real-money behaviour in order to make accurate
> predictions.

> We should also include prediction for transaction cost and marketplace credibility and
> real usage.

> Take a look at Coinbase MCP and Base, this seems like a good example of a world.

## What is already decided

Read the [Observed Markets design](../specs/2026-11-20-observed-markets-design.md)
before dispatching anything. It defines the measurement and scoring rules. Your first job
is to find what the available evidence can support, not to produce a leaderboard.

- Real-money behaviour is **observed** from public data. Nothing is bought.
- Evidence is both checked facts and measurements, kept clearly apart.
- The first world is **x402 on Base**, built end to end before any other. Olas and Virtuals
  follow.
- First buyer question: what fixed USDC prices did the sampled Base offers quote, when,
  and how many eligible offers had a usable quote? It is a price survey, not paid demand.
- Forecast named quantities only. No usage forecast without a defensible usage outcome;
  no credibility verdict. Test predictive claims against like-for-like baselines.
- No revenue mechanism now. No running cost, ever.

## Before starting

- **Pull request #25** (the Global Exchange directory) must be merged first. This work
  attaches to its entries and their ids. If it is still open, tell the captain and wait.
- The research exchange's records, gate, identity check and publication workflow are on
  `main`. Reuse them; do not build parallel ones.

## Work, in order

0. **Feasibility scout — report only, publish nothing.** Use public reads and labelled
   offline examples. Deliver the following evidence, including failures:

   | Demonstration | What the captain needs to see |
   |---|---|
   | Buyer value and coverage | One dated fixed-price Base mainnet USDC survey: eligible, measured and missing counts, sample rule, median and 90th percentile where supported. Separate `upto` caps, amounts paid and facilitator-paid settlement gas. No cross-asset totals. |
   | Attribution | Walk through a shared payee, an unrelated transfer and a batch settlement. Show exactly what is counted once, at which level, and when the answer is “not attributable.” Resource-wide trailing 30-day calls are not Base-only calls or weekly demand. No cross-source gap unless route, network, population, unit and window all match. |
   | Budget and recovery | Set request, retry, concurrency and elapsed-time caps before reading. Report actual requests, retries, duration, coverage and storage for the tested scope; mark projections as projections. Record crawl interval, offsets, totals and duplicates. Pin finalized block bounds/hashes, batch filters, interrupt and resume without counting logs twice. |
   | Replay and gaps | Identify which bytes/checkpoints persist across runs, for how long and at what free-tier cost. Replay retained input; distinguish replay from a later witness. A lost historical catalogue capture stays missing. No churn or returning-payer measure without comparable prior sets. |
   | Forecast integrity | Walk through a late merge, a late backfill, two witnesses on opposite sides of a threshold and a method version change. Show which forecast is ineligible, which frozen baseline stays unchanged and which outcome stays unresolved. No live forecast or board is needed for the scout. |

   Recommend a versioned metric list and sample, including what to **omit**. Stop until
   the captain reviews the report and approves the scope. If free reads cannot support
   settlement attribution, offer a labelled catalogue-only price survey or no release.
   Do not promote a transfer proxy or a completed catalogue crawl to `observed`.

   After approval, ship each of the following as its own PR, in order:

1. **Records and catalogue collector.** Fix the target population, UTC weeks, atomic
   amount units, per-measure completeness and evidence manifest. Missing is not zero.
   Keep operator-reported metrics distinct from observed activity in machine-readable data.
2. **Chain collector**, only if approved. Count attributed settlements separately from
   transfers to sampled addresses. Record uncovered ranges and unknown attribution.
3. **Pages and feeds.** Ship the buyer's quote survey with scope, freshness, coverage,
   limits and evidence labels. Index appearances/disappearances are not business launches/closures.
4. **Weekly schedule and publication proof.** Get captain approval for the PR identity
   and merge policy. Demonstrate one genuine aggregate through the trusted-base gate to
   the deployed feed before building a board. Preserve the ten-record automatic PR cap,
   validate the actual bot identity, and verify the trigger or use an explicit trusted
   handoff. A retry reuses the period key; a failed deploy republishes the existing merge.
   Show expected, captured, merged, deployed and missed periods.
5. **Forecasts.** Start with one versioned target and a predeclared resolving observation.
   Verify exact revision merge time against the UTC cutoff; freeze baseline input IDs
   or repository revision. Compare the forecast median, last period and the mean of four
   consecutive periods using mean absolute error on the same paired weeks.
   Report pinball loss and interval coverage separately from Brier loss for a fixed event.
   Show unavailable baselines and missing submissions. Eight paired periods permit a
   descriptive comparison only, not a general claim of skill.
6. **Research exchange.** Link hypotheses and findings to versioned observations; reuse
   the existing review and graft rules.
7. **Olas, then Virtuals.** Each starts with its own feasibility scout.

Acceptance for each is the matching section of the design, plus: the repository gate
passes, new behaviour has tests that would fail on a plausible bug, and no page or feed
shows a number the data does not support.

## Rules that are not negotiable

- **Observe, never spend.** No wallet, no private key, no purchase, no call to any tool
  that can move money or place an order. This machine has Coinbase's hosted MCP and wallet
  tools available; they are out of bounds for this work.
- **No running cost.** Free tiers only; no paid data provider, indexer or endpoint.
- **No imputed measurements.** Publish gaps as gaps and label forecasts as predictions.
- **Reported and observed stay separate**, on every page and in every feed.
- **No overall score, no credibility verdict, no token prices, no investment advice, no
  referral links.**
- **Tests never touch the network.** They use recorded fixtures that are unmistakably
  fixtures and never reach the built site.
- **Say what wrote it.** Name the collector/version; disclose model and harness when an
  agent wrote a record. Do not attribute a scheduled deterministic run to a model.
- **Be polite to public endpoints.** Respect rate limits; back off; never work around a
  limit by rotating addresses or keys.

## Decisions that need the captain

- Whether to ship a reported-only quote survey if attribution or free collection fails.
- The identity under which the weekly scheduled job opens pull requests, and whether those
  pull requests merge themselves.
- Any wording on a page that could read as a verdict on a marketplace or its operator.
- Anything about money. A `funded_by` field exists and stays empty.

## Known loose ends

- The catalogue selects for recent settlement and its counters can lag. A later read
  cannot restore a past crawl. Never treat listings with missing counters as inactive.
- GitHub's API reports no recognised licence for `coinbase/agentkit` and
  `coinbase/payments-mcp`; do not state a licence for them without reading the files.
- Published model speeds on this site are floors; that is unrelated to this work.
