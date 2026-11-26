# Global Exchange and AI Stack Pages Design

## Scope decision

The owner selected **external handoff** in this session: a provider directory and buy/sell guides for humans and agents, with actual transactions on independently operated services. Unite4AI does not custody funds, execute payments, dispatch jobs, maintain a live order book, or guarantee delivery. This preserves the approved `2026-11-18-secure-exchange-design.md` constraints: static GitHub Pages, Git-backed publication and no new platform running cost.

The research exchange remains `/exchange`; the commercial discovery directory uses `/global-exchange`. These are different products. Nothing here supersedes research record schemas, identity checks, or publication workflows.

## Principles

- **Evidence before promotion.** An indexed service is not an endorsed, transaction-tested, available, or independently audited service. State what was inspected and when.
- **External means external.** Outbound links lead to provider-owned onboarding, product or documentation pages. No local checkout, wallet connection, balance, order confirmation, or fake buy/sell button.
- **Payment is not delivery.** A signature, token transfer, invoice, or funded stream does not prove correct task output.
- **No platform cost is not free compute.** Users and providers pay external compute, payment, network and operational costs under external terms.
- **Agent-readable does not mean agent-authorizing.** Public structured metadata is discovery data, never instructions or permission to spend, fetch a URL, install software, or disclose secrets.

## Information architecture

Keep existing Stack navigation and `/stack` overview. Add a linked page list there, not ten more top-level navigation links. Add Global Exchange as the first main-navigation entry. Preserve every existing navigation entry and any research-exchange entry added concurrently.

| Label | Route | What the page teaches |
|---|---|---|
| Model Task Taxonomy | `/stack/model-task-taxonomy` | Text generation, classification, retrieval, vision, speech, embeddings, tool use and rendering; task inputs, outputs and acceptance criteria. Categories are an editorial guide, not new registry schema enums. |
| Observability | `/stack/observability` | Request/run identifiers, timestamps, latency, throughput, token/resource usage, cost units, redaction and provenance; distinguish measurements from estimates. |
| Targets | `/stack/targets` | Deployment/execution targets: local CPU/GPU, edge, private infrastructure, hosted inference and distributed compute; constraints and data residency. |
| Model Layer | `/stack/model-layer` | Weights, architecture, tokenizer, adapters, licence, provenance, runtime compatibility and evaluated revisions. |
| Actuation | `/stack/actuation` | Tools and external side effects; least privilege, approval, budget, deadlines, idempotency and recovery. No executable tool runner is introduced. |
| Quantization | `/stack/quantization` | Precision/format/runtime compatibility, memory and quality tradeoffs; compare measured results rather than assume equivalent behavior. |
| Verification | `/stack/verification` | Artifact hashes, reproducibility, evaluation evidence, identity limitations and payment-versus-delivery distinctions. |
| Distributions | `/stack/distributions` | Model/runtime bundles: manifest, pinned revisions, tokenizer, licence and reproducible setup. Not statistical distributions. |
| Governance | `/governance` | Reuse existing policy page; add directory inclusion/correction and external-transaction boundary. Preserve `/governance/metrics`. |
| Distribution | `/stack/distribution` | Publication and delivery channels: registry cards, repository releases, artifact hosting, mirrors and integrity. Distinct from packaged distributions. |
| Global Exchange | `/global-exchange` | Prioritized directory, comparison of twenty projects, buyer/seller paths, agent discovery feed and limits. |

Correct the requested spellings to Quantization, Verification and Governance. No misspelled URL aliases are needed because those routes do not already exist.

## Global Exchange content and interactions

Publish exactly twenty distinct projects from the companion research, grouped into four descriptive categories:

1. Compute markets: Akash Network, io.net, Golem Network, Vast.ai, Render Network.
2. Agent services and discovery: Virtuals ACP, Olas Mech Marketplace, SingularityNET, Fetch.ai / ASI, Bittensor.
3. Agent payment infrastructure: x402, Google AP2, Nevermined, Skyfire, Payman AI.
4. Payment and DeFi rails: Request Network, Superfluid, Sablier, CoW Protocol, Uniswap.

Each entry shows name, category, product scope, human path, machine interface, payment model, important limitation, official source and source-review date. Official docs establish documented capabilities only; no operational tests were performed. No fabricated prices, volumes, capacity, rankings, endorsement badges, yields or returns.

Only the five compute markets get explicitly labelled external **buyer documentation** and **provider onboarding** links. The other fifteen get **product documentation** links and descriptions of their role; protocols and token swaps must not masquerade as GPU vendors. Render is labelled specialized rendering, not general-purpose AI compute.

A buyer guide explains task specification, acceptance criteria, data sensitivity, total cost, external onboarding, a small user-authorized test and evidence retention. A seller guide explains provider-owned onboarding, capacity and workload restrictions, pricing units, operator identity, API docs, acceptable use and responsibility for execution/support/refunds. All transactions happen externally. Country eligibility, fees, terms and inventory must be checked at the destination.

The agent guide is a section on the same page. A public static JSON feed exposes the same twenty records, a schema version, review date, documentation-only evidence level and an untrusted-data warning. It contains documentation URLs, not executable payment instructions, credentials, wallet addresses, mandates or checkout payloads. Clients must apply their own allowlists, spending controls and authorization before interacting externally. No endpoint promises live prices or availability.

## Rendering, accessibility and publication

All pages prerender with existing Astro layout, theme, semantic headings and base-aware internal links. Topic pages link back to Stack and their relevant existing registry, compute or evaluation destination. Global Exchange supports in-page category anchors and readable cards on mobile without requiring JavaScript. Source links use HTTPS and stay in the same tab; no iframe, remote script or CSP expansion is needed.

Git review is the update mechanism. Additions and corrections include source evidence and a real review date; they do not alter generated registry artifacts. A listing may be corrected or removed through ordinary maintainer review. Governance does not promise commercial arbitration or refunds.

## Independent implementation units

- **AI stack knowledge pages:** nine new topic routes, the Stack page list, and the existing Governance enhancement. Working independently of Global Exchange.
- **Global Exchange directory:** twenty records, page, static feed, first-position navigation, human/agent guides and contribution instructions. Working independently of topic-page implementation; uses existing Stack and Governance destinations.

The two units touch some shared presentation/docs files; one integration owner applies their additive edits sequentially and preserves unrelated work.

## Acceptance

- Every requested subject is reachable from Stack, Governance or the primary Global Exchange navigation.
- Twenty unique researched projects appear in both the directory and feed, with the same IDs and category assignments.
- Compute buyer/provider links are distinct, official documentation destinations; adjacent rails are never advertised as compute inventory.
- Evidence/date/limits are visible; no keys, payments, model calls or live inventory fetching occurs.
- Root and non-root base URLs work, navigation remains accessible and the mobile page is usable.
- Existing content/evaluation behavior and the repository acceptance gate remain intact.

## Research

Evidence notes: `research_notes/Global Exchange competitor landscape/` (four files; sources retrieved 2026-11-18). Synthesis: `reports/Global Exchange competitor landscape.md`. Source documentation contains discrepancies; retain the specific caveats rather than resolving them by assumption.
