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

The design is `docs/superpowers/specs/2026-11-20-observed-markets-design.md`. Read it before
dispatching anything. Settled by the captain:

- Real-money behaviour is **observed** from public data. Nothing is bought.
- Evidence is both checked facts and measurements, kept clearly apart.
- The first world is **x402 on Base**, built end to end before any other. Olas and Virtuals
  follow.
- Predictions cover transaction cost, credibility and real usage, and are scored in public
  against baselines.
- No revenue mechanism now. No running cost, ever.

## Before starting

- **Pull request #25** (the Global Exchange directory) must be merged first. This work
  attaches to its entries and their ids. If it is still open, tell the captain and wait.
- The research exchange's records, gate, identity check and publication workflow are on
  `main`. Reuse them; do not build parallel ones.

## Work, in order

Task 0 is a scout. The rest are ship tasks, each its own pull request, and none starts
before the scout's report has been read by the captain.

0. **Feasibility scout.** Report only; publish nothing. Establish, by reading public sources
   and nothing else:
   - whether the whole x402 Bazaar catalogue can be read within free limits, and how long
     it takes;
   - whether a week of payments to listed addresses can be read from a free Base endpoint,
     and for how many addresses;
   - how an x402 settlement can be recognised on-chain;
   - how far the catalogue's reported calls can be compared with observed payments, given
     batched settlement and other facilitators;
   - a recommended sample rule and a final list of measures with exact definitions.
   If the chain half is not feasible for free, say so plainly: the captain decides whether
   to ship reported figures alone.
1. **Records and catalogue collector.**
2. **Chain collector**, as the scout recommends.
3. **Pages and feeds.**
4. **Forecasts**, baselines and scoring.
5. **Weekly schedule.**
6. **Link to the research exchange.**
7. **Second and third worlds**, each with its own scout first.

Acceptance for each is the matching section of the design, plus: the repository gate
passes, new behaviour has tests that would fail on a plausible bug, and no page or feed
shows a number the data does not support.

## Rules that are not negotiable

- **Observe, never spend.** No wallet, no private key, no purchase, no call to any tool
  that can move money or place an order. This machine has Coinbase's hosted MCP and wallet
  tools available; they are out of bounds for this work.
- **No running cost.** Free tiers only; no paid data provider, indexer or endpoint.
- **Never fabricate, never estimate.** A gap is published as a gap.
- **Reported and observed stay separate**, on every page and in every feed.
- **No overall score, no credibility verdict, no token prices, no investment advice, no
  referral links.**
- **Tests never touch the network.** They use recorded fixtures that are unmistakably
  fixtures and never reach the built site.
- **Say what wrote it.** Records disclose the model and harness that wrote them.
- **Be polite to public endpoints.** Respect rate limits; back off; never work around a
  limit by rotating addresses or keys.

## Decisions that need the captain

- Whether to ship reported figures alone if the scout finds the chain half infeasible.
- The identity under which the weekly scheduled job opens pull requests, and whether those
  pull requests merge themselves.
- Any wording on a page that could read as a verdict on a marketplace or its operator.
- Anything about money. A `funded_by` field exists and stays empty.

## Known loose ends

- The catalogue's figures are the operator's own and cannot be re-fetched after the fact.
- GitHub's API reports no recognised licence for `coinbase/agentkit` and
  `coinbase/payments-mcp`; do not state a licence for them without reading the files.
- Published model speeds on this site are floors; that is unrelated to this work.
