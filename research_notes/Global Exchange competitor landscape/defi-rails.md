# Adjacent payment and DeFi rails: five-project landscape

Research date and retrieval date for every source below: **2026-11-18**. Scope: exactly Request Network, Superfluid, Sablier, CoW Protocol, and Uniswap. Evidence is primary official documentation retrieved read-only; no wallet connected, transactions submitted, API credentials obtained, or operational benchmarks run. Deployment listings are documentary evidence of deployment, not independent transaction-history verification. No audit or production-safety claim is made.

## 1. Which projects belong in the competitive set?

### Takeaway

**All five belong in an adjacent infrastructure/reference set, not the direct compute-marketplace count.** Their documented products cover requesting money, streaming tokens, or exchanging tokens—not discovering compute providers, scheduling jobs, or proving task delivery. Competitive placement below is an inference from those product scopes, not a claim that no integration elsewhere exists. [Request](https://docs.request.network/api-features/create-requests.md), [Superfluid](https://docs.superfluid.org/docs/concepts/overview/money-streaming), [Sablier](https://docs.sablier.com/concepts/lockup/overview), [CoW](https://docs.cow.fi/cow-protocol/reference/contracts/core), [Uniswap](https://developers.uniswap.org/docs/trading/overview)

### Cited Findings: compact comparison

| Project / category | Actual product | Human and machine workflow | Payment / settlement | Custody, trust, verification limits | Maturity evidence and relevance |
|---|---|---|---|---|---|
| **Request Network — invoicing/payment-request infrastructure** | Structured requests, payment links, transaction construction and reconciliation. | Human creates a dashboard link; payer connects/signs with a wallet. Software creates requests via HTTP API, retrieves calldata, signs/submits externally, tracks status/webhooks. | On-chain payment reference links transfers to invoices; request data persisted separately through IPFS and Gnosis. | Signing remains external; API/indexer/payment-page dependencies. A paid request proves payment reconciliation, not compute delivery. | Retrieved dashboard workflow and API examples, not a tested payment. **Adjacent checkout/accounting alternative**, not provider marketplace. [API](https://docs.request.network/api-features/create-requests.md), [lifecycle](https://docs.request.network/resources/lifecycle-of-a-request.md), [dashboard](https://docs.request.network/use-cases/no-code-payment-links.md) |
| **Superfluid — continuous token streaming** | Per-second balance accrual through Super Tokens and flow agreements. | Human wallet or authorized software creates/changes/closes stream; current guide uses forwarder contract ABIs with ethers/Viem rather than requiring a proprietary SDK. | Dynamic balance accounting, not one transaction per second; stream creation and management use chain transactions; solvency buffer/liquidation mechanism. | Stream can stop; sender can run out of funds; protocol, token, signer and liquidation dependencies. Buffer is not buyer delivery escrow. | Retrieved contract addresses/ABI examples and solvency rules; no stream tested or independent activity measured. **Adjacent pay-over-time mechanism**, not compute supply. [streaming](https://docs.superfluid.org/docs/concepts/overview/money-streaming), [quickstart](https://docs.superfluid.org/docs/sdk/quickstart), [solvency](https://docs.superfluid.org/docs/protocol/advanced-topics/solvency/liquidations-and-toga) |
| **Sablier — scheduled and open-ended token distribution** | Lockup prefunds scheduled vesting; Flow accrues open-ended debt against deposited balances. | Human uses UI; machine uses deployed contracts, packages and indexed state; recipient withdraws vested/covered amount. | Lockup holds tokens in a contract; Flow separates covered withdrawable debt from uncovered debt. | Cancelability matters; Flow can be paused/voided, and uncovered debt forfeited when voided. Time-based release is not acceptance-based task escrow. | Flow v3.0 dated March 2026 with addresses/UI coverage; custom-deployment page says maintenance mode/no new chain requests. **Adjacent funded-release model**, not compute market. [Lockup](https://docs.sablier.com/concepts/lockup/overview), [Flow](https://docs.sablier.com/concepts/flow/overview), [deployments](https://docs.sablier.com/guides/flow/deployments), [maintenance](https://docs.sablier.com/guides/custom-deployments) |
| **CoW Protocol — intent-based token exchange** | Signed token orders compete for solver execution, batched with matched orders/external liquidity. | Human or software signs order; order book API accepts order; solver settles on-chain. EOA and smart-contract signature schemes supported. | Contract settlement enforces authorized orders and limit-price conditions; not an invoice or stream. | Authorized spending and signature correctness remain critical; solver allowlist is upgradeable. Execution conditions do not ensure fill or off-chain work. | Published deployed settlement/relayer addresses, signing code and known-issue documentation; no order submitted. **Adjacent asset-conversion rail**, not task exchange. [core](https://docs.cow.fi/cow-protocol/reference/contracts/core), [signing](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) |
| **Uniswap — AMM/token-swap infrastructure and routing** | Liquidity-pool swaps; API also routes across protocol versions and UniswapX. | Human follows prefilled web-app link; bot/application gets quotes/calldata via API or SDK, then uses its own signer/RPC; contracts can call router directly. | On-chain token exchange with router/pool accounting and user min-output/max-input/deadline guards. | Approvals, contract/hook behavior, price impact, slippage and transaction ordering risk. Swap receipt is not an invoice or task receipt. | Retrieved current routing/API/SDK/contract guides and frontend integration path; no swap or production-volume verification. **Adjacent liquidity/conversion infrastructure**, not compute provider discovery. [integration](https://developers.uniswap.org/docs/trading/overview), [swaps](https://developers.uniswap.org/docs/get-started/concepts/traders/swaps) |

### Inferences

- Request is the nearest substitute for a future checkout/accounting component; Superfluid and Sablier are alternatives for payment timing; CoW and Uniswap solve currency/liquidity conversion. Counting them as five direct compute competitors would conflate layers. Sources are the product descriptions in the table.
- Agent compatibility here means a machine-callable interface plus externally supplied signing authority. It does **not** establish an agent registry, autonomous negotiation, task-quality verification, or safe spending policy.

### Gaps

- No comparable active-user, compute-volume, revenue, latency, or task-success metrics were established. Documentation breadth cannot stand in for these metrics.
- This research did not establish a complete chain/token/fee matrix; integration support must be assessed for a specific asset, network, protocol version and transaction path.

## 2. What exactly do the payment and settlement guarantees cover?

### Request Network

#### Takeaway

Request records and reconciles payment obligations. It should not be described as delivery escrow merely because a request and its payment reference are recorded on-chain. [Request lifecycle](https://docs.request.network/resources/lifecycle-of-a-request.md)

#### Cited Findings

- **Product and human flow:** Dashboard users connect a wallet, configure a receiving destination, create a Client ID, generate a hosted payment link and share it. The documented payer flow connects a supported wallet and pays; dashboard statuses include on-chain transaction hashes. This is a documented UI workflow, not observed successful checkout in this research. [No-code payment links](https://docs.request.network/use-cases/no-code-payment-links.md)
- **Machine flow:** `POST /v2/request` creates a request; `GET /v2/request/{requestId}/pay` returns transactions/calldata. The application obtains approval/payment signatures and submits transactions. API features include partial-payment tracking, recurrence configuration, fees and webhooks. The separate `/payouts` flow constructs payment-first transactions. Recurrence configuration alone is not evidence of an unrestricted automatic debit mandate. [Create Requests](https://docs.request.network/api-features/create-requests.md)
- **Settlement versus storage:** Request content can be encrypted and persisted in IPFS, with its CID stored on Gnosis. Payment may occur on other supported EVM chains or Tron. Reference-based requests reconcile payment events, indexed by a subgraph; declarative requests instead include payer/payee declarations in stored data. Therefore evidence strength differs between a chain-observed transfer and a declaration. [Lifecycle](https://docs.request.network/resources/lifecycle-of-a-request.md)
- **Custody boundary:** The API returns transaction data for external signing rather than acting as the signer in the documented native flow. Hosted payment links may also involve cross-chain swap-to-pay infrastructure; that path should not be assigned the same risk profile as a same-chain transfer. [API](https://docs.request.network/api-features/create-requests.md), [payment-link workflow](https://docs.request.network/use-cases/no-code-payment-links.md)

#### Inferences

- Useful as an optional provider-owned invoice link or machine-readable payment request. A webhook confirming payment should trigger only a payment-status update, not an assertion that a compute task succeeded.
- The documented flow does not itself establish escrow, refunds for nonperformance, arbitration, or verifiable execution. Wallet keys, token approvals, chain finality, API availability and indexer correctness remain relevant dependencies.

#### Gaps

- No payment was executed. API service terms, pricing, complete credential policy and operational availability were not validated. No general safety conclusion about crypto-to-fiat or cross-chain routes is supported by this evidence.

### Superfluid

#### Takeaway

Superfluid transfers economic value with elapsed time through real-time token accounting. Its solvency deposit is an incentive/reserve for closing depleted streams, not a performance bond guaranteeing compute delivery. [Streaming](https://docs.superfluid.org/docs/concepts/overview/money-streaming), [solvency](https://docs.superfluid.org/docs/protocol/advanced-topics/solvency/liquidations-and-toga)

#### Cited Findings

- **Actual mechanism:** A stream has a per-second rate and changes the sender/receiver's real-time balances. Stream creation is a one-time action; ongoing balance calculation does not require continuous transactions. The overview says a stream persists until cancellation or depletion; the detailed solvency documentation explains that depletion first creates a critical state and closure requires external action. [Streaming model](https://docs.superfluid.org/docs/concepts/overview/money-streaming), [liquidations](https://docs.superfluid.org/docs/protocol/advanced-topics/solvency/liquidations-and-toga)
- **Machine interface:** The current quickstart expressly prefers forwarder contracts over building an SDK: `CFAv1Forwarder` for money streams and `GDAv1Forwarder` for distribution pools. It supplies contract addresses, ABI references and ethers code, and allows other libraries such as Viem. Do not describe an old SDK as the sole current interface. [Quickstart](https://docs.superfluid.org/docs/sdk/quickstart)
- **Payment and solvency risk:** Opening a stream reserves a buffer. When balance reaches zero, anyone can close the critical stream; the buffer supports payouts until closure. If the buffer is exhausted, the protocol accounts for a deficit and applies its liquidation/PIC-stake mechanisms. The page explicitly makes timely stream closure the user's responsibility. [Liquidations and TOGA](https://docs.superfluid.org/docs/protocol/advanced-topics/solvency/liquidations-and-toga)
- **Maturity evidence:** The quickstart provides concrete forwarder addresses; the contract-address page links an official explorer, but its address table did not render in the static retrieval. This supports documented deployment/interface existence, not a fresh chain-by-chain deployment validation or transaction proof. [Quickstart](https://docs.superfluid.org/docs/sdk/quickstart), [addresses](https://docs.superfluid.org/docs/protocol/contract-addresses)

#### Inferences

- Potentially relevant for charging elapsed rental time, but not proof of GPU availability, utilization or useful task output. A separate meter/controller would have to decide when to start/stop/update the stream and who bears disputes.
- Sender/receiver controls and buffer accounting constrain payment exposure, not service quality. User-controlled signing is not freedom from Super Token/protocol/chain risk.

#### Gaps

- No stream tested; no protocol security review, token-wrapper analysis, current chain-specific deposit verification, or third-party uptime evidence obtained. No conclusion that all streams halt atomically at zero balance is warranted.

### Sablier

#### Takeaway

**Keep Lockup and Flow distinct.** Prefunded, optionally uncancelable Lockup streams provide a stronger scheduled funding commitment than an open-ended Flow stream with uncovered debt, but neither proves that work was delivered. [Lockup](https://docs.sablier.com/concepts/lockup/overview), [Flow](https://docs.sablier.com/concepts/flow/overview)

#### Cited Findings

- **Lockup:** Creator deposits the scheduled token amount in a contract, specifying timing and distribution shape. Recipient allocation increases with time and the recipient sends a transaction to withdraw. [Lockup overview](https://docs.sablier.com/concepts/lockup/overview)
- **Cancellation:** A cancelable Lockup stream can be stopped by its creator, returning unstreamed funds; vested funds remain the recipient's. An uncancelable stream cannot be changed back to cancelable. The docs describe the recipient as guaranteed to receive funds, which should be read as a contract scheduling rule, not an assurance against contract/token/chain failure or proof of work. [Cancelability](https://docs.sablier.com/concepts/cancelability)
- **Flow:** Open-ended debt accrues at a rate per second, with flexible top-ups. Covered debt equals the withdrawable amount; uncovered debt is not currently funded. Sender can pause and refund unstreamed funds. Either party may void a stream; voiding an insolvent stream forfeits uncovered debt. The separate cancelability page says Flow lacks Lockup-style cancellation but can be paused: this is not a contradiction with its distinct `void` operation. [Flow overview](https://docs.sablier.com/concepts/flow/overview), [cancelability](https://docs.sablier.com/concepts/cancelability)
- **Machine interfaces and maturity:** Official Flow deployment docs list `@sablier/flow`, version-specific addresses, repository deployment records and UI support by chain; v3.0 is dated March 2026. The docs state these Flow contracts are non-upgradeable and source-verified. The custom-deployment guide describes JSON-RPC access and GraphQL indexing through The Graph or Envio, and links the SDK repository. These are machine integration surfaces; no SDK execution was performed here. [Flow deployments](https://docs.sablier.com/guides/flow/deployments), [deployment guide](https://docs.sablier.com/guides/custom-deployments)
- **Maintenance caveat:** The custom-deployment page explicitly says “Maintenance Mode” and that Sablier Labs no longer accepts requests for new chain deployments. This is evidence about new-chain deployment support, **not sufficient evidence that existing streams or all products have shut down**. [Custom Deployments](https://docs.sablier.com/guides/custom-deployments)

#### Inferences

- Lockup is escrow-like only in the limited sense that contract-held funds are allocated by a predefined schedule. Ordinary release is time-based, not conditional on customer acceptance, a benchmark, or arbitration.
- Sablier belongs as an adjacent payment-scheduling alternative. Choosing uncancelable funding protects the recipient's scheduled claim but can worsen the buyer's recourse if the provider never delivers.

#### Gaps

- Current withdrawal transactions, complete fee/comptroller authorities, SDK API details and formal security assurances were not validated. Non-upgradeability alone is not a safety claim. Broader organizational maintenance status cannot be inferred from the new-chain notice.

### CoW Protocol

#### Takeaway

CoW offers intent-based token exchange and conditional on-chain settlement, not compute procurement or task escrow. Its relevant competitive dimension is automated conversion into a provider's accepted asset. [Core architecture](https://docs.cow.fi/cow-protocol/reference/contracts/core)

#### Cited Findings

- **Workflow:** Users sign orders off-chain; solvers compete to settle them. A settlement bundles orders, prices and interactions with on-chain liquidity for orders without direct matches. [Core architecture](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- **Machine interfaces:** Orderbook submission is documented through signing-scheme examples and fields. `@cowprotocol/contracts` provides order/hash helpers. EOA users can use `EIP-712` or `eth_sign`; smart contracts can use `ERC-1271`; `PreSign` supports both but requires an on-chain transaction. Thus “gasless signature” must not be conflated with no approval, no settlement costs, or all workflows being gasless. [Signing schemes](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes)
- **Settlement conditions:** Documented invariants restrict funds access to settling authorized orders, require limit price or better, and prevent refilling completed orders. The same page warns about zero-amount orders and signature issues, so these guarantees must not be quoted without their input/signature assumptions. [Core guarantees and known issues](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- **Custody/trust limits:** Settlement and vault relayer are listed as non-upgradeable, but solver allowlist authentication is upgradeable. Documented hazards include some smart-wallet `ERC-1271` replay behavior, chain-fork signature replay and arbitrary app-data vulnerabilities in custom contract orders. Off-chain API rejection is explicitly not always equivalent to preventing malicious on-chain settlement. [Core security notes](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- **Maturity evidence:** The official page lists contract addresses and explorer links on multiple chains, and code repositories. This is stronger than a concept-only proposal but no transaction history was independently inspected. The standalone orderbook page rendered only its heading; detailed API capability claims here are grounded in the signing/core pages instead. [Deployments](https://docs.cow.fi/cow-protocol/reference/contracts/core), [orderbook page](https://docs.cow.fi/cow-protocol/reference/apis/orderbook)

#### Inferences

- Atomic or limit-constrained token settlement is a guarantee about exchanging assets under authorized terms, not about a remote compute result. Solver competition also does not guarantee that a particular order will fill.
- A future integration would still need constrained agent signing authority, order validation, expiry/cancellation handling and a distinct payment-to-task association. These are not features claimed for the current Global Exchange.

#### Gaps

- No order quote/fill, current fee calculation, minimum order size, or API availability verified. This study did not evaluate separate agent-payment or x402 offerings; it evaluates CoW's documented core exchange behavior.

### Uniswap

#### Takeaway

Uniswap supplies token liquidity and swaps, not invoice reconciliation or service delivery assurance. Its documentation provides unusually clear separation between external-link integration, hosted routing, local SDK construction and direct contracts. [Trading overview](https://developers.uniswap.org/docs/trading/overview)

#### Cited Findings

- **Human workflow:** The documented simplest integration is a link to the web app with prefilled input/output tokens and amount; users remain on the external swap interface for execution. [Custom-link option](https://developers.uniswap.org/docs/trading/overview)
- **Machine workflow:** The Trading API handles quoting/routing and transaction construction; the calling app handles signing and submission. The documented sequence is `/check_approval`, `/quote`, `/swap`, then external submission. Routing can include v2/v3/v4 and UniswapX. JS/TS SDKs help construct trades but do not execute them; router or pool contracts support direct on-chain integration. [Trading overview](https://developers.uniswap.org/docs/trading/overview)
- **Settlement:** Pool swaps exchange tokens against liquidity rather than a conventional FIFO order book. Version-specific contract accounting is supplemented by minimum output, maximum input and deadline protections. The overview's Universal Router example combines swap, input settlement and output collection in one transaction. Do not assume every API-routed path has identical mechanics to that direct v4 example. [Swap mechanics](https://developers.uniswap.org/docs/get-started/concepts/traders/swaps), [router example](https://developers.uniswap.org/docs/trading/overview)
- **Risk:** Price impact and slippage remain material; documented safety guidance warns against zero minimum output. v4 pools can attach external hooks that modify fees, impose conditions or reject swaps, so integration risk depends on the selected pool/hook as well as core contracts. Allowance/Permit2 checking and wallet signing are explicit integration steps. [Trading overview](https://developers.uniswap.org/docs/trading/overview), [swap safeguards](https://developers.uniswap.org/docs/get-started/concepts/traders/swaps)
- **Maturity evidence:** Retrieved docs cover concrete endpoints, ABI-level contract examples and an established web-app integration path. This research did not independently measure usage or submit a trade. [Integration guide](https://developers.uniswap.org/docs/trading/overview)

#### Inferences

- Useful as an optional external conversion link when buyer/provider assets differ; not itself a payment receipt mapped to a compute job.
- Self-directed wallet signing avoids assuming platform custody, but approvals, token behavior, router/pool/hook correctness, signer security, gas and market movement remain risks. “Permissionless” does not mean “safe for arbitrary agent spending.”

#### Gaps

- API pricing/access requirements, route-specific fill behavior, token availability and current liquidity depth were not validated. No assurance of a particular task-payment cost or exact-output availability follows from the general docs.

## 3. What follows for a static, Git-backed Global Exchange?

### Takeaway

The approved static GitHub Pages/Git-record design can describe or link external rails without becoming a payment operator. **Nothing in this research establishes an existing Unite4AI wallet, payment processor, escrow, live balance service, or task-verification system.** This is the assignment's design boundary, not a finding about an implemented checkout.

### Cited Findings

- Request explicitly supports sharing provider-generated hosted payment links; Uniswap explicitly supports external links with prefilled swap parameters. Both are useful reference patterns for outbound links, not evidence that Unite4AI currently performs either workflow. [Request link flow](https://docs.request.network/use-cases/no-code-payment-links.md), [Uniswap linking](https://developers.uniswap.org/docs/trading/overview)
- Request's automated reconciliation uses an API/indexer/webhooks; Superfluid and Sablier require on-chain interactions and state; CoW requires order submission/signatures and solvers; Uniswap API integration still requires signing and RPC submission. These dependencies exist even if the discovery frontend itself is static. [Request lifecycle](https://docs.request.network/resources/lifecycle-of-a-request.md), [Superfluid guide](https://docs.superfluid.org/docs/sdk/quickstart), [Sablier Flow](https://docs.sablier.com/concepts/flow/overview), [CoW signing](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes), [Uniswap guide](https://developers.uniswap.org/docs/trading/overview)

### Inferences

- **Compatible research/design implication:** public Git records can identify a provider's accepted payment methods and external destination/checkout documentation, with clear ownership and disclaimers. Human users or independently operated agents can carry out external transactions under their own credentials. This is a possible design, not implemented functionality.
- **No hidden operating-cost assumption:** zero platform hosting cost does not imply zero blockchain fees, zero third-party API cost, zero user funds, or zero operational responsibility for an agent. This study did not establish any provider's free-service entitlement.
- **Do not collapse status meanings:** `listed` is not `available`; `invoice created` is not `paid`; `paid` is not `compute reserved`; `stream active` is not `service healthy`; `swap settled` is not `task delivered`; a Git entry referencing a transaction is not independent delivery verification.
- **Decision boundary:** selecting one of these rails would be a separate integration decision requiring wallet/signing, fees, chain/token choice, event reconciliation, failure handling and acceptance/dispute rules. None should be silently introduced merely because it appears in a competitor landscape.

### Gaps

- No actual Global Exchange settlement implementation was inspected or assumed. The evidence does not choose a rail, validate an integration, prove a compute SLA, establish escrow arbitration, or support a claim of audited/production-safe operation.
