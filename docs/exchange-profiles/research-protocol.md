# Exchange profile research protocol

Run by a maintainer's agent session. Public, passive sources only: official docs, terms of
service, company registries, regulator databases, block explorers, certificate records,
and named free public data aggregators. Never sign up, log in, connect a wallet, buy, scan,
probe, or use paid data. Never invent a value; a value not found is `not-published` with
the URLs searched.

## 1. Scaffold
`bun run profile:new <id> <owner-handle>` — creates the draft with every value `not-published`.

## 2. Dispatch four research agents in parallel
Each agent edits only its own sections of `apps/web/src/content/exchange-profiles/<id>.json`
and appends evidence items with ids from its block (Identity & Legal e1–e29, Usage & Market
e30–e59, Prices & Costs e60–e89, Security & Risk e90–e129). Every non-null value must cite a
verbatim quote (≤500 chars) that states it, from the page at `url`, retrieved today. Write
values close to the source's own words; do not characterise. The scaffold pre-fills `searched`
with the directory source page; replace every `searched` list with the pages actually checked.

- **Identity & Legal:** official URL; operating entity; headquarters; date of formation
  (registry first, then official "about"/terms); registered jurisdiction; governing law clause
  in the terms of service; licenses held (regulator registers only); restricted jurisdictions
  stated in terms; sanctions screening and KYC statements. Levels: own docs/terms = `stated`,
  registries/regulators = `reported`.
- **Usage & Market:** average weekly active users, transaction/trading volume, number of
  traders/buyers — only where the operator, an official dashboard or a named aggregator
  publishes them, with exact unit and window. Token symbol, market cap (USD) and token price
  (USD) from a named free aggregator, level `reported`, with the retrieval date. Projects
  without a token: all three `not-published`. Never compute, sum or convert.
- **Prices & Costs:** quotes for the reference workloads in `packages/core/src/profile-rubrics.ts`,
  in their own currency and unit, with statistic and sample size; public offer listings or
  price pages only. Fee components: platform fee, take rate, payment processor, facilitator,
  network gas, withdrawal, minimum charge — basis, amount, currency, who pays, scope. A fee that
  exists but whose amount is unpublished is recorded with `amount: null`, evidence that the fee
  exists, and `searched` listing the pages checked for its amount. Record network gas as
  the operator states it: only gas stated as a fixed USD amount counts in the cost score; other
  gas and minimum charges are shown but excluded.
- **Security & Risk:** one outcome per rubric criterion with evidence. For risk criteria `fail`
  means the indicator is present and `pass` means it is absent. Custodial means the operator
  (company, foundation or admin key) holds or can control customer funds; immutable contract
  escrow that no owner can seize is not custodial. Run
  `bun run profile:passive <official-url>`; record its certificate/header/security.txt results
  as evidence kind `certificate`. Audits and bounties from official pages or the
  auditor's site; incidents from the operator's post-mortems or regulator sources; regulatory
  action from regulator sites only. Use `unknown` when evidence is not found. Active testing
  happens only under plan Task 10 and is currently deferred because no programme checked so
  far explicitly permits automated testing (`research_notes/exchange-profiles/scan-eligibility.md`).

Each agent's brief must include: the directory entry, the design and this protocol, its
section list and evidence-id block, the literal-sourcing rule, and "report gaps; never guess".

## 3. Deterministic checks
`bun run validate` (schema and cross-references) and `bun run profile:verify <id>` (every
quote still on its page). Fix or remove failing evidence; JavaScript-rendered pages may need a
manual confirmation note for the review. Certificate and header evidence is re-confirmed by
rerunning `bun run profile:passive <official-url>`, not by `profile:verify`.

## 4. Independent literal review
Dispatch one reviewer agent with only the profile and the evidence URLs. It fails any value
whose quote does not state it, any characterisation not in the source, any computed or
converted number, and any market data not marked `reported`. Apply its fixes; rerun step 3.

## 5. Owner review
Present each section to the owner with values, quotes and highlight links; the owner accepts,
edits or marks values `not-published`. On approval set `status: "published"`, `reviewedBy`
(the owner's GitHub handle) and `reviewedAt`, and record the agent model and harness in
`meta.agent`; agents never set `reviewedBy` or `status: "published"`. Open a pull request.

## 6. Refresh
Repeat steps 2–5 on the existing record; replace values and evidence; update `researchedAt`
and the review fields. Rubric changes bump `RUBRIC_VERSION` in code; records are not edited for them.
