# Global Exchange competitor landscape

## Decision

Build a static, non-custodial discovery directory, not a new payment exchange. The owner selected external handoffs: humans and independently operated agents transact with existing providers under those providers' terms. Unite4AI can differentiate through task-oriented discovery, evidence provenance, clear billing units and honest trust boundaries without operating a wallet, scheduler or settlement service.

**Research:** official documentation and public product pages retrieved 2026-11-18; synthesis prepared 2026-11-19. Twenty distinct projects, not twenty equivalent compute exchanges. No accounts funded, jobs executed, wallets connected or transactions submitted. Documentation establishes advertised interfaces and mechanics, not uptime, delivery, withdrawals, audited safety or comparative economics. No market-size or market-share estimates were established.

## Twenty existing projects

Category and strategic relevance are analytical judgments. Capabilities below are first-party documented, not transaction-tested. Linked sources support each row; detailed evidence and conflicting documentation are retained in the four notes files linked below.

| # | Project / category | What people or agents obtain | Human and machine paths | Payment model / important limit | Implication for Unite4AI |
|---|---|---|---|---|---|
| 1 | [Akash Network](https://akash.network/docs/getting-started/core-concepts/) — compute marketplace | Containerized CPU/GPU infrastructure | Console; CLI, SDK and [agent tooling](https://akash.network/docs/getting-started/ai-agents/) | Current docs describe ACT-funded leases and managed credits; provider attributes/benchmarks do not prove arbitrary task correctness | Direct comparator; link buyer and provider documentation |
| 2 | [io.net](https://io.net/docs/guides/clouds/start-using-io-cloud) — GPU cloud | GPU rentals; separately managed inference | Cloud UI; account/API interfaces | [IO Credits](https://io.net/docs/guides/payment/io-credits) for buyers; supplier earnings documented in IO Coin. Some services require sales provisioning; payment/refund prose conflicts | Direct comparator; distinguish infrastructure from inference and label onboarding limits |
| 3 | [Golem Network](https://docs.golem.network/docs/golem/payments) — execution market | Negotiated resource execution, including documented GPU workloads | Human-configured Yagna; SDK requestor | GLM usage invoices/debit notes plus gas; not guaranteed prepaid escrow | Direct comparator; useful resource-unit and payment-risk model |
| 4 | [Vast.ai](https://docs.vast.ai/guides/pricing) — GPU marketplace | GPU instances and serverless workers | Web search; CLI/API | Prepaid account billing separates compute, storage and bandwidth; [host payouts](https://docs.vast.ai/host/payment) use centralized processors | Direct comparator; total cost and payout timing matter |
| 5 | [Render Network](https://rendernetwork.com/pricing) — specialized task compute | Scene/frame rendering rather than a general-purpose GPU shell | Rendering UI; [whitelisted Manager API](https://know.rendernetwork.com/the-render-network-api) | Render Credits/BME economics; frame approval and API access are separate constraints | Direct specialist comparator; do not imply general AI capacity from AI-subnet waitlist |
| 6 | [Virtuals ACP](https://os.virtuals.io/acp/concepts) — agent task commerce | Priced agent-delivered services | Butler for humans; agent offerings/jobs | USDC escrow and approval/rejection; evaluator independence is not automatic | Close task-market comparator; separate service purchases from agents controlling principal funds |
| 7 | [Olas Mech Marketplace](https://stack.olas.network/mech-client/) — agent services | Tools, LLM access and other Mech-delivered tasks | Marketplace; client/server request flows | Chain-specific token/payment models; operator claims and benchmark links are not Olas-reviewed | Close comparator; good example of explicit provenance limitations |
| 8 | [SingularityNET](https://dev.singularitynet.io/docs/products/AIMarketplace/) — AI-service marketplace | Callable inference/training/algorithm services | Marketplace UI; SDK/CLI/provider daemon | [MPE channels](https://dev.singularitynet.io/docs/products/DecentralizedAIPlatform/CoreConcepts/SmartContracts/mpe/) fund service calls; registry publication differs from UI listing | Close comparator for buying outputs rather than renting hardware |
| 9 | [Fetch.ai / ASI](https://docs.agentverse.ai/documentation/getting-started/agentverse-marketplace) — agent discovery | Registered agents and routing/interaction | Agentverse/ASI:One; uAgents protocols | [Payment messages](https://uagents.fetch.ai/docs/guides/agent-payment-protocol) do not themselves settle funds; overview still labels monetization tools forthcoming | Discovery comparator; do not equate a demonstration transaction ID with payment |
| 10 | [Bittensor](https://www.bittensor.com/docs/concepts/network) — subnet incentive markets | Independently produced services scored by subnet mechanisms | Subnet-specific consumer APIs; miners/validators | TAO/alpha incentives and staking, not universal task escrow | Adjacent supply ecosystem; list specific service providers before implying purchasable capacity |
| 11 | [x402](https://docs.x402.org/introduction) — HTTP payment protocol | Machine-payable resources/API access | Human developer integration; HTTP 402 client/server flow | On-chain verification/settlement; [facilitators](https://docs.x402.org/core-concepts/facilitator.md) do not verify output quality | Complementary rail, not a compute supplier; count Coinbase/CDP once with x402 |
| 12 | [Google AP2](https://ap2-protocol.org/ap2/specification/) — authorization/evidence protocol | Signed checkout/payment mandates | Trusted approval surface; constrained autonomous mode | External rails move funds; current v0.2 does not implement dispute resolution or agent-to-agent delegation | Complementary authorization model; no compliance claim without implementation |
| 13 | [Nevermined](https://nevermined.ai/docs/products/catalog/overview.md) — service discovery/payments | Monetized APIs, plans and external paid-service catalog | Human card/plan flows; REST/MCP/catalog/router | [Payments](https://nevermined.ai/docs/products/payments/overview.md) differ by product; delegated budgets do not eliminate funding/reconciliation risk | Strong discovery/payment-orchestration overlap; link instead of rebuild |
| 14 | [Skyfire](https://docs.skyfire.xyz/docs/platform-structure) — identity/payment network | Agent identities, wallets and paid services | Account owner setup; buyer/seller tokens | Managed wallets; [token charge/settlement](https://docs.skyfire.xyz/docs/payments-settlement) is not instantaneous universal settlement | Partial service-discovery competitor; show managed-account dependency |
| 15 | [Payman AI](https://paymanai.com/) — governed banking agents | Institution-backed conversational payments | Banking user experience; [Genie MCP bridge](https://github.com/PaymanAI/genie-mcp-stdio) | Institution-held funds and policy controls; provider eligibility is not universal | Adjacent institutional rail; current positioning differs from older generic agent-payment descriptions |
| 16 | [Request Network](https://docs.request.network/api-features/create-requests.md) — invoicing | Structured requests, payment links and reconciliation | Dashboard/payment link; HTTP API plus external signer | Invoice payment status is not compute delivery or refund escrow | Adjacent accounting/checkout reference |
| 17 | [Superfluid](https://docs.superfluid.org/docs/concepts/overview/money-streaming) — payment streaming | Time-accruing token balances | Wallet or authorized contract client | Solvency buffer/liquidation; not one transaction per second and not a delivery bond | Adjacent timing mechanism; requires external metering and stop policy |
| 18 | [Sablier](https://docs.sablier.com/concepts/lockup/overview) — scheduled/open-ended payments | Prefunded Lockup schedules or [Flow debt](https://docs.sablier.com/concepts/flow/overview) | UI; contracts/indexers | Covered debt differs from unfunded debt; timed release is not task acceptance | Adjacent payment timing; [maintenance notice](https://docs.sablier.com/guides/custom-deployments) concerns new-chain deployments, not proof all streams stopped |
| 19 | [CoW Protocol](https://docs.cow.fi/cow-protocol/reference/contracts/core) — token exchange | Intent-based token conversion | Signed orders; orderbook/solvers | Limit-constrained settlement; no guaranteed fill or off-chain task delivery | Adjacent liquidity rail, not a compute marketplace |
| 20 | [Uniswap](https://developers.uniswap.org/docs/trading/overview) — token exchange | AMM/routed asset conversion | External app; API/SDK/contracts with user signer | Approvals, slippage, gas and route/hook risks; swap receipt is not a compute receipt | Adjacent liquidity rail; do not advertise it as selling task capacity |

## Competitive conclusions

**[INFERENCE] Closest overlap:** Akash, io.net, Golem and Vast for general resource acquisition; Render for specialized task completion; Virtuals ACP, Olas and SingularityNET for buying AI services. Nevermined adds particularly relevant cross-service discovery/payment orchestration. These are different transaction units, so a single cheapest-provider score would mislead.

**[INFERENCE] Complement rather than recreate:** x402 and AP2 solve payment exchange and authorization/evidence, respectively. Request handles accounting; Superfluid/Sablier handle payment timing; CoW/Uniswap handle conversion. None supplies compute-quality assurance merely because settlement is on-chain.

**[INFERENCE] Positioning:** “Find documented compute and agent-service providers; understand their interfaces, evidence and payment responsibilities.” Do not claim to be the first global agent-payment exchange, the cheapest GPU market, or a trustless verified-compute venue. This study establishes none of those claims.

## Product requirements derived from evidence

- Separate hardware rental, per-call inference, task deliverables, discovery, payment authorization and token exchange.
- Show documented machine interfaces and access prerequisites; API existence does not mean permissionless onboarding or autonomous authorization.
- Link to source pricing instead of embedding volatile offers. Buyers must inspect compute, storage, bandwidth, minimum charge, conversion, gas and interruption rules externally.
- Publish source-review dates and documentation-only evidence labels. “Listed,” “available,” “paid,” “delivered” and “verified” are distinct assertions.
- Provide separate human buyer and provider-onboarding paths for actual compute markets. Give agents a static discovery feed without keys, signatures or authority to spend.
- Maintain public corrections through Git review. Never promise refund arbitration, guaranteed capacity or geographically universal access.

## Evidence quality and unresolved questions

Operational proof is absent: no paid task, refund, withdrawal, account eligibility or live offer was tested. Security audits and legal/service contracts were not reviewed. Documentation conflicts remain especially in io.net's payment/refund prose, Render's old versus new pricing, Olas chain support, Fetch payment examples, and Payman's legacy docs availability. The directory should publish conservative product descriptions, not guess through these conflicts.

Any future transaction integration needs a separately approved operating model and scoped testing: signer/custody boundary, eligible jurisdiction, asset/chain/version, fee budget, transaction reconciliation, output acceptance, refunds and dispute ownership. The selected directory scope does not authorize that work.

## Detailed source notes

- [Compute markets](../research_notes/Global%20Exchange%20competitor%20landscape/compute-markets.md)
- [Agent-service markets](../research_notes/Global%20Exchange%20competitor%20landscape/agent-markets.md)
- [Agent-payment infrastructure](../research_notes/Global%20Exchange%20competitor%20landscape/agent-payments.md)
- [Payment and DeFi rails](../research_notes/Global%20Exchange%20competitor%20landscape/defi-rails.md)

## Implementation handoff

Approved design: `docs/superpowers/specs/2026-11-19-global-exchange-pages-design.md`.

Separate plans cover the AI stack pages and Global Exchange. No site behavior or payment integration was implemented as part of this research.
