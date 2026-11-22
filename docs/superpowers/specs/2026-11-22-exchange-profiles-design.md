# Exchange Profiles Design

Approved choices by the owner on 2026-11-22. Builds on the Global Exchange directory
(`2026-11-19-global-exchange-pages-design.md`), the citation-support pilot findings
(`experiment/jev-citation-pilot`, `ADJUDICATION-REPORT.md`) and the Observed Markets design
(`2026-11-20-observed-markets-design.md`), which this document amends.

## Objective

Give each of the 20 Global Exchange entries a researched **profile**: identity, legal
jurisdiction facts, usage and market data, price quotes, transaction-cost components and
three rubric scores (Security, Risk, Transaction Cost). Research is performed by an agent
team; every profile is published only after the owner reviews it.

## Owner decisions

| Question | Decision |
|---|---|
| Security scorecard | **Numeric score**, computed from a published, versioned criterion rubric |
| Market cap / token data | **Included**, labelled "reported market data" with source and date |
| Autonomy | Agent team researches and drafts; **owner review before publication**; refresh on demand |
| Rollout | **Pilot three** (Akash, Olas, x402), review the template, then the other 17 |
| Legal section | **Cited facts only**, marked "informational, not legal advice" |
| Required fields | URL, headquarters, date of formation, market cap, average weekly users, trading volume, number of traders, Risk Score, Security Score, Transaction Cost Score |
| Letter grades | Each computed score is also shown as a letter: **A** 90+, **B** 80–89, **C** 70–79, **D** 50–69, **F** below 50; the Risk letter uses 100 − Risk Score so A is always best |
| Active testing | **Kali** may run automated tests only against assets a project's published bug-bounty scope explicitly opens to automated testing; findings go privately to that programme |

## Amendment to Observed Markets

The owner amends two Observed Markets constraints **for profiles only**:

- Constraint 5 ("no overall score"): profiles carry three rubric scores. They are still
  **computed, never typed**, each shown with its rubric version, criterion breakdown and
  evidence coverage. There is still no single overall score or "credibility" verdict.
- Constraint 6 ("no token prices"): profiles may show a token's market cap and price as
  `reported` market data from a named public source with a timestamp. They never sum
  across assets, convert currencies, or say anything that reads as investment advice.

All other Observed Markets constraints stand: no running cost, observe never spend,
never impute, reported and observed kept separate, no referral links, honest about gaps.

## Principles

- **Literal sourcing.** Every stated fact cites evidence whose quote states it. This is the
  standard the owner applied when adjudicating the citation pilot (24 of 33 claims failed
  it); profile text is written close to the source's own words.
- **Missing stays missing.** A value that is not published is `not-published`, never zero,
  never estimated. Scores are computed only over criteria with known outcomes and are
  withheld when evidence coverage is too low.
- **Scores are arithmetic over published criteria.** Weights and thresholds live in one
  versioned file. Changing them is a new rubric version; old scores are recomputed, not
  edited.
- **Three evidence levels**, never merged into one figure: `stated` (the operator's own
  documentation or terms), `reported` (an operator dashboard, a regulator, or a named public
  data aggregator), `observed` (a measurement produced by the Observed Markets collector).
- **Public, passive research by default.** Reading public pages, registries, APIs, block
  explorers, certificate and DNS records. No credential use, purchases or wallet
  connections. The only exception is in-scope active testing from Kali (below), under a
  bug-bounty programme the owner has personally joined.
- **Agents draft; people publish.** Agent output is untrusted text until it passes the
  validator, the evidence verifier and owner review.

## Profile record

One strict JSON file per entry: `apps/web/src/content/exchange-profiles/<directory-id>.json`,
at most 32 KiB. The id must match an entry in `apps/web/src/data/global-exchange.json`.

| Section | Contents |
|---|---|
| `meta` | `schemaVersion: 1`, `directoryId`, `researchedAt`, `agent {model, harness}`, `author`, `status` (`draft` or `published`), `reviewedBy` and `reviewedAt` (required when published) |
| `identity` | Facts: official URL, operating entity, headquarters, date of formation |
| `legal` | Facts: registered jurisdiction, governing law in terms of service, licenses held, stated restricted jurisdictions, sanctions screening, KYC requirement |
| `marketData` | Reported: token symbol, market cap (USD), token price (USD), as-of timestamp, source; all `not-published` for entries without a token |
| `usage` | Metrics: average weekly users, trading/transaction volume, number of traders/buyers — each with unit, window, level and evidence, or `not-published` |
| `priceQuotes` | Workload-specific quotes in their own currency and unit (e.g. USD per GPU-hour for a named GPU, EUR per 400 OctaneBench-hours, USDC per API call) |
| `costComponents` | Fees by kind (platform fee, take rate, payment processor, facilitator, network gas, withdrawal, minimum charge), basis (percent, fixed, per-unit), currency, who pays, evidence |
| `securityChecks` / `riskChecks` | One outcome per rubric criterion: `pass`, `fail`, `not-applicable` or `unknown`, with evidence |
| `evidence` | `{id, url, retrievedAt, quote, kind}` where kind is `official-docs`, `terms`, `registry`, `regulator`, `aggregator`, `explorer`, `certificate`, `dns` or `observation` |

A **fact** is `{value, level, evidence[]}` or `{value: null, level: "not-published",
searched[]}`, where `searched` lists the pages checked. Every evidence id must exist; every
non-null fact must cite at least one evidence item.

## Scores

Computed in `@unite4ai/core` from the record; never stored in it. All three are 0–100,
withheld (shown as "insufficient evidence, N% coverage") when coverage is below 70%.

**Security Score (higher = more protective practices evidenced).** Rubric v1 criteria and
weights: third-party security audit published (20); bug bounty or vulnerability disclosure
programme (10); security contact or disclosure policy (10); core code open source (10);
deployed contracts verified on an explorer (10, not applicable without contracts);
no unresolved security incident in the last 24 months, or post-mortem published (15);
custody model documented (10); valid HTTPS certificate for the official domain (5);
HSTS and baseline security headers on the official site (5); account protection
(2FA or equivalent) for custodial accounts (5, not applicable if non-custodial).
Score = pass weight ÷ known applicable weight × 100.

**Risk Score (higher = more risk indicators present).** Rubric v1 criteria and weights:
holds customer funds (custodial) (20); operating entity not identifiable (15); governing
law or jurisdiction not stated (10); unresolved security incident (15); public regulatory
action on record (10, from regulator sources only); conflicting payment or refund terms in
official documentation (10); a single operator controls a critical component (10); no
published terms of service (10). Score = triggered weight ÷ known applicable weight × 100.

**Transaction Cost Score (higher = cheaper), compared within a category only.** Rubric v1
reference transaction: a USD 100 purchase by a buyer, plus a USD 100 payout to a seller
where a seller side exists. Effective cost % sums percent components and USD fixed
components that apply to the reference. Score = 100 × (1 − min(cost%, 20) ÷ 20). Components
in other currencies, or with unknown amounts, make the score not computable rather than
converted or guessed. Network gas is shown separately and excluded unless the operator
states it as a fixed USD amount, in which case it counts like any other fixed USD fee.
Minimum charges are shown but excluded: they are thresholds, not per-transaction fees.

Every score is shown with its rubric version, per-criterion outcomes with evidence links,
coverage, and the statement: "A rubric score, not a judgement of the company's conduct."

**Letter grades.** Every computed score also gets a letter: A for 90–100, B for 80–89,
C for 70–79, D for 50–69, F below 50. Security and Transaction Cost are graded on their
score; Risk is graded on 100 − Risk Score, so A always means the best outcome (fewest risk
indicators). A withheld or not-computable score has no letter. The letter is shown next to
the number, never instead of it.

## Active testing from Kali (in-scope only)

The owner's Kali Linux machine (`kali`, reached only from m5 over Tailscale) may run
automated security tests against a project **only** when all of these hold:

1. The project runs a published bug-bounty or vulnerability-disclosure programme, and its
   rules **explicitly permit automated testing**. A verbatim quote of that permission is
   recorded.
2. Every target host is listed in the programme's in-scope assets and not in its
   out-of-scope list. Out-of-scope always wins.
3. The owner has personally registered with the programme and accepted its terms. Agents
   cannot accept terms on the owner's behalf. The scope record names the owner and the
   acceptance date.
4. The scope record is at most 30 days old, because programme rules change. Expired records
   refuse to run.
5. The run uses only tools the programme allows, from a fixed set (TLS configuration,
   top-100-port connect scan, non-intrusive template scan excluding denial-of-service,
   fuzzing, brute-force and intrusive templates). It stays within the programme's rate limit
   (never above 10 requests per second) and sends any identification header the programme
   requires.

Scan output never enters the public repository or site. It is stored privately on m5 with
owner-only permissions. Findings are triaged by the owner and reported **only** through the
programme, under its disclosure rules. A profile may cite a finding only after the programme
publishes it, and then only as evidence for the `incident-handling` criterion. Scans
therefore never raise or lower a score directly.

Many programmes, especially smart-contract programmes, forbid automated testing or limit
it to contracts or test networks. Some or all of the 20 projects may be ineligible; that
outcome is recorded rather than worked around. Prerequisite: Kali's SSH bootstrap
(`ssh-host-control` skill) is complete and its identity is verified. As of 2026-11-22, port 22
on `kali` was closed.

## Price modelling

Normalise quotes into named reference workloads defined in the rubric file (v1: one
NVIDIA H100 80GB GPU-hour, one NVIDIA RTX 4090 GPU-hour, one paid API call, one rendering
unit as defined by the operator). Compare only quotes with the same currency and unit, and
show sample size and date. No currency conversion, no synthesised totals. Quotes from
Observed Markets observations, when available, appear separately at `observed` level.

## Research workflow (autonomous, reviewed)

1. **Plan the brief.** `bun run profile -- new <id>` writes a draft skeleton with the
   rubric's criteria and the directory entry's URLs.
2. **Agent team, in parallel, public sources only:** Identity & Legal, Usage & Market,
   Prices & Costs, Security & Risk. Each writes only its own sections and evidence.
3. **Deterministic checks:** schema and cross-reference validation; a passive security
   collector (certificate, headers, security.txt, DNS CAA) for the official domain; an
   evidence verifier that refetches every URL and confirms each quote is present.
4. **Independent literal review.** A separate reviewer agent checks every fact against its
   quote and fails any characterisation the source does not state.
5. **Owner review**, one section at a time; the owner sets `reviewedBy` and `status:
   published`. Published profiles ship through an ordinary pull request.
6. **Refresh on demand** with the same steps; a refresh replaces the record and its date,
   and the page states the research and review dates.

Agent runs happen in the maintainer's session. Nothing runs on a schedule, in CI, or on the
site. CI validates records only.

## Pages and feeds

- `/global-exchange/<id>`: the profile page. Sections in the order of the record, scores
  with breakdowns, every fact linked to its evidence, gaps shown as "not published".
  Drafts are never rendered.
- The directory card links to "Full profile" when a published profile exists.
- `/data/exchange-profiles.json`: structured profiles and computed scores with rubric
  version and coverage; free text marked untrusted, as in the existing feeds.

## Limits the site states

Profiles describe public documentation and data at the stated dates. Reported usage and
market figures come from the operator or third parties and are not verified by Unite4AI.
Scores depend on what is published: an operator that documents more can score differently
from one that documents less. Legal facts are informational, not legal advice.

## Risks

- **Scores read as verdicts or ratings of companies.** Mitigation: published rubric,
  criterion breakdown, evidence links, coverage, the conduct disclaimer, a correction
  process for operators (CONTRIBUTING), and no overall score.
- **Stale data.** Market and usage numbers age quickly; every value carries its as-of date
  and the page states the profile date.
- **Aggregator dependence.** Market data comes from free public endpoints whose terms and
  availability can change; the source is named per value.
- **Agent error.** Mitigated by the evidence verifier, the literal reviewer and owner review;
  agent-written records disclose the model and harness.
- **Active testing exceeds permission.** Mitigated by a machine-checked scope record
  (permission quote, in/out-of-scope hosts, tool allowlist, rate limit, owner acceptance,
  30-day expiry), a fixed command set and an SSH identity check before each run. Findings stay
  private.

## Out of scope

Scheduled automatic refresh, any paid data source, buying or testing services, scanning
outside an owner-accepted bug-bounty scope, publishing scan findings, investment or legal
advice, an overall rating.
