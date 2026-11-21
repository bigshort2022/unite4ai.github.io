# Observed Markets Design

Records the owner's decisions made in conversation on 2026-11-19 and 2026-11-20; the
document itself awaits his review. Builds on `2026-11-18-secure-exchange-design.md`
(research records, identity, publication) and on the Global Exchange directory designed in
`2026-11-19-global-exchange-pages-design.md` (pull request #25, not yet merged when this was
written).

## Objective

For Unite4AI to continue it must offer something a broad range of AI agents and humans would
pay for. The owner's direction: **Unite4AI evaluates and aggregates open agentic
marketplaces**, and to predict accurately it must **measure, model and evaluate real-money
behaviour**.

The Global Exchange directory aggregates twenty projects from their documentation. This
design adds the evaluation: what actually happens with real money on a marketplace, read from
public data, plus forecasts of it that are scored in public.

The product is the answer, for an agent or its owner, to three questions about a
marketplace: what will a transaction cost, is its activity credible, and is it really used.
With a published record of how well those answers predicted what happened next.

## Fixed constraints

1. **No running cost.** Static site, git as the database, free tiers only.
2. **Observe, never spend.** No wallet, no keys, no purchases, no trading or payment tool is
   ever called. Everything is read from public sources.
3. **Never fabricate, never estimate.** A number is measured or it is absent. A gap in the
   data is shown as a gap.
4. **Reported and observed are different things** and are never merged into one figure.
5. **No overall score** for a marketplace, and no single credibility score.
6. **No token prices and no investment advice.** Amounts are stated in the settlement
   currency.
7. **Honest about latency and biases**, with numbers where the data can supply them.
8. **Money comes later.** No revenue mechanism is built now. Every evaluation carries a
   `funded_by` field, empty until the owner decides otherwise.

## What exists and what this adds

| Layer | State | Evidence level |
|---|---|---|
| Global Exchange directory, `/global-exchange` | Built in pull request #25 | Documentation only |
| Research exchange, `/exchange` | Live | Hypotheses, findings, reviews, grafts |
| **Observed markets (this design)** | New | Observed from public data, and forecast |

A directory entry gains an evidence level: `documented` (today) or `observed` (has at least
one complete observation). Entry ids come from the directory; this design adds none.

## First world: x402 on Base

One world end to end before any other. Chosen because both what is for sale and the payments
are public and free to read.

Facts checked on 2026-11-20:

| Fact | Source |
|---|---|
| The x402 protocol is Apache-2.0 | `github.com/x402-foundation/x402` |
| The Bazaar is a public catalogue of paid services, readable without a key | `docs.cdp.coinbase.com/x402/buyer/discover-services` |
| Each listing gives a price, the address paid, and calls and distinct payers over the last 30 days | Read from the public discovery API |
| The catalogue held 37,540 listings | Read from the public discovery API on 2026-11-20 |
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

| Source | What it gives | How far it can be trusted |
|---|---|---|
| **Catalogue (reported)** | Listings, prices, and per-listing calls and distinct payers over 30 days | Reported by the operator. Cannot be re-fetched later: a snapshot is witnessed once and committed to by hash. |
| **Chain (observed)** | Payments arriving at listed addresses in a block range | Anyone can re-run the same query over the same blocks and get the same answer. |

Where both cover the same listing, the gap between them is itself published. It is an
indicator, not proof: batched settlement and other facilitators mean the two legitimately
differ.

## Measures

Final list and exact definitions are fixed by the feasibility scout. Intended:

**Transaction cost**
- Listed price per call: median and ninetieth percentile, in the settlement currency
- Network fee paid by settlement transactions: median and ninetieth percentile
- Facilitator fee: a documented fact, not a measure

**Real usage**
- Listings, and listings with at least one call in the last 30 days (reported)
- Calls over 30 days (reported)
- Payments, distinct payers, distinct payees and amount in the week (observed)

**Credibility indicators** (shown individually, labelled "indicators, not a verdict")
- Share of activity in the ten largest listings and the ten largest paid addresses
- Share of observed amount moving between addresses that also pay each other
- Share of payers seen in an earlier week
- Listings added and removed since the last snapshot
- Reported calls against observed payments, for listings where both exist

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

One subject, one method, one period, one source.

- `subject` (directory entry id), `method` and `method_version`
- `period` (start and end dates; a week)
- `source`: `catalogue` with the endpoint host and fetch time, or `chain` with the network
  identifier, block range and endpoint host
- `measures`: typed numbers from the method's fixed list; no free-form keys
- `coverage`: `complete`, or `partial` with the reason. A partial observation is shown and
  never ranked, compared or used to score a forecast.
- `sample`: how the measured listings were chosen, when not all were measured
- `evidence`: hash and size of the raw data; the raw data is not hosted
- `author`, optional `agent`, `date`, `funded_by` (optional)

### Forecast (`forecasts/`)

A prediction of one measure for one subject in one future period.

- `subject`, `method`, `method_version`, `measure`, `period`
- one of: `range` (tenth, fiftieth and ninetieth percentile), or `probability` with the
  threshold it refers to
- `made` (date), `data_through` (the last period the forecaster used)
- `approach` (one line, untrusted text), `author`, optional `agent`

Rule: a forecast must be merged before its period begins. The gate compares `made` with the
period; the publication workflow refuses one that arrives late.

### Scores (computed, never typed)

When a complete observation exists for a forecast's subject, method, measure and period:

- a range is scored by its quantile error, and by whether the outcome fell inside the range
- a probability is scored by its squared error

Per forecaster and measure the site shows mean error and how often the stated ranges held
the outcome. Two **baselines** are computed at build time from the observations alone and
always appear: "same as last period" and "mean of the last four periods".

No statement that anyone beats a baseline is shown until at least eight periods have been
scored. Until then the board says how many periods exist.

## Collector

A read-only command in the existing CLI. Given a method and a period it reads the public
sources, writes the observation file, and keeps the raw data locally with its hash. It holds
no key and no wallet and runs no model. Given the same raw data it always produces the same
file.

A free scheduled GitHub Action runs it weekly and opens a pull request that adds only
records. Anyone can run it for the same period; a second, independently fetched catalogue
snapshot on the same day is how a reported observation gets reproduced.

Failure handling: a rate limit, an incomplete page or an unreachable endpoint produces a
`partial` observation naming the gap, or no observation. It never fills in.

## Pages and feeds

- Each observed directory entry gets a page: the parts and who runs them, the weekly
  measures with reported and observed in separate columns, the credibility indicators, the
  forecasts and their record, and the limits.
- A forecasts page: every forecaster against the baselines, per measure, misses included.
- The directory shows each entry's evidence level.
- Feeds follow the research exchange: one structure-only feed, free text separate and marked
  untrusted.

## Limits the site states

- The chain shows that money moved, not that what was bought was delivered or any good.
- Catalogue figures are the operator's own, and a snapshot cannot be checked after the fact.
- An address is not an agent or a person. The site cannot tell agents from humans, and
  cannot prove that activity is fake.
- Settlement off-chain is invisible; such a marketplace is marked "not observable".
- Where only a sample of listings is measured, the page says how it was drawn.
- Free endpoints are rate-limited; gaps are shown.
- The first world is one operator's ecosystem, chosen by the maintainers.
- Publishing indicators and forecasts may change the behaviour they describe.
- With few periods of history, forecasts will be poor.

Computed bias numbers, added to the existing biases page: share of observations that are
partial, share of listings measured, number of independent collectors, number of forecasters
other than the baselines, and number of periods scored.

## Delivery

Through firstmate, each piece its own pull request, in this order:

0. **Feasibility scout** (report only, nothing published). Can a full catalogue snapshot be
   read within free limits? Can a week of payments to listed addresses be read from a free
   Base endpoint, and for how many addresses? How can x402 settlements be recognised
   on-chain, and how far can reported calls be compared with observed payments given batched
   settlement? Recommend the sample rule and the final measure list.
1. **Records and catalogue collector.** Method, observation and their gate rules; the
   catalogue half of the collector; evidence level on directory entries.
2. **Chain collector**, as the scout recommends.
3. **Pages and feeds**, with the limits and bias numbers.
4. **Forecasts.** The record, the timing rule, baselines, scoring, the forecasts page.
5. **Weekly schedule.** The free scheduled job that opens record-only pull requests.
6. **Link to the research exchange.** Hypotheses about a directory entry, findings that
   cite observations.
7. **Second and third worlds**, each starting with its own scout.

## Risks

- **The scout may find the chain half infeasible for free.** Then the first world ships with
  reported figures only, labelled as such, and the design's central claim is weaker.
- **Dependence on one operator's API.** Its shape or access can change without notice.
- **Gaming.** A listing's operator can inflate both its reported and observed activity by
  paying itself. The circularity and concentration indicators exist for this and are not
  sufficient.
- **Overreach.** "Credibility" invites a verdict. The site must not give one.
- **Depends on pull request #25** for the directory and its entry ids.

## Out of scope

Buying anything, holding funds, test-network purchase checks (a later piece), any revenue
mechanism, token prices, and an overall rating.
