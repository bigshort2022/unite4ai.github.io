<!-- Pilot record for Task 8 of docs/superpowers/plans/2026-11-22-exchange-profiles.md. Written by omp agents (claude-opus-5-5); independent literal reviewer output, before fixes were applied. -->

# Literal review: x402 (draft dated 2026-11-22)

Reviewer: LiteralReviewX402. I did not edit the draft. The checks below used public, passive reads on 2026-11-22: `curl` of the cited pages, `pdftotext` of the charter and the Cantina report, basescan address pages for the five Base Mainnet x402 contracts, and one run of `bun scripts/profiles/passive-security.ts https://x402.org/`. I did not refetch quotes just to confirm they are present; `local://evidence-confirmation.md` already covers that.

## Facts, cost components and checks

| Path | Verdict | Reason | Exact fix |
|---|---|---|---|
| identity.officialUrl | PASS | e1, on x402.org itself, says "visit https://x402.org/" for the x402 Foundation. | — |
| identity.operatingEntity | PASS | e3 says the project "has been established as x402 a Series of LF Projects, LLC". e2 on its own is only a copyright line, but e3 states the entity. | — |
| identity.headquarters | PASS | Not-published holds. Note for owner: lfprojects.org, which is in `searched`, shows "Contact Information LF Projects, LLC 2810 N Church St, PMB 57274 Wilmington, Delaware 19802-4447". That is the parent company's contact address. It is not stated to be x402's headquarters, so recording it as HQ would itself break the literal rule. | — |
| identity.formedOn | PASS | Not-published holds. The charter says "Adopted March 31, 2026". That is when the charter was adopted, not when the series was formed. e102 says "operational launch", which is not a formation date either. | — |
| legal.registeredJurisdiction | PASS | e3 and e4 both say "LF Projects, LLC … is a Delaware series limited liability company". The value's parenthetical repeats the quote and names the parent. Level `stated` is correct because these are the operator's own and the parent's own documents. | — |
| legal.governingLaw | PASS | Not-published holds. The LF Projects Terms of Use have no governing-law clause; the only "governed" text is about contributions being "governed by the terms of the charter". The charter has no governing-law clause. | — |
| legal.licenses | PASS | Not-published, and the searched pages are real pages, not the scaffold default. Apache-2.0 (e96) is a software licence, not a licence held, so leaving it out is correct. | — |
| legal.restrictedJurisdictions | PASS | Not-published holds. The Terms of Use and the charter have no clause on export, sanctions or restricted jurisdictions. | — |
| legal.sanctionsScreening | FAIL | Wrong entity. e6 is the description of the third-party "CDP Facilitator" in the docs.x402.org facilitator directory. It describes Coinbase's hosted service, not the x402 protocol or its operator. The same table lists facilitators that do no screening (for example Dexter: "no account required"). Marking it `stated` presents a third party's practice as a stated x402 fact. | `{value:null, level:'not-published', searched:['https://x402.org/','https://docs.x402.org/introduction','https://docs.x402.org/faq','https://docs.x402.org/dev-tools/facilitators','https://lfprojects.org/policies/terms-of-use/']}`. If the owner wants a facilitator-scoped line instead, the first-party quote is at https://docs.cdp.coinbase.com/x402/seller/facilitator: "OFAC and Know Your Transaction (KYT) checks identify and decline payments involving sanctioned or high-risk addresses." The value would then have to name the CDP Facilitator. |
| legal.kycRequired | PASS | The value is word for word e5 ("No accounts or personal information needed", under the x402.org heading "Zero friction"). | — |
| marketData.tokenSymbol | PASS | Not-published; the searched list includes CoinGecko and CoinMarketCap. | — |
| marketData.marketCapUsd | PASS | Same as tokenSymbol. | — |
| marketData.tokenPriceUsd | PASS | Same as tokenSymbol. | — |
| usage.weeklyActiveUsers | FAIL | (1) The number was expanded: "16.91K" became 16910. (2) The window 2026-11-15 to 2026-11-22 was worked out from "Past 7 Days" and the retrieval date; no dates are stated. (3) The unit adds "unique" and "all chains", which are not in the quote ("Global statistics for the x402 ecosystem … Buyers"). (4) "Buyers" are not the same as weekly active users. (5) e30 can only be seen after picking "Past 7 Days" from a menu, so the URL cannot reproduce it. The schema needs a number, so the abbreviated figure cannot be stored literally. | `{value:null, level:'not-published', searched:['https://www.x402scan.com/']}`. Delete e30. Note: exact counts (for example `"unique_buyers":40411`) appear only in the page's embedded JSON, not in visible text, and come without a stated window, so they cannot be quoted. |
| usage.volume | FAIL | (1) The number was expanded: "$1.74M" became 1740000. (2) The window 2026-10-23 to 2026-11-22 was worked out from "Past 30 Days"; it is not stated. (3) "all chains" in the unit is not in the quote. | `{value:null, level:'not-published', searched:['https://www.x402scan.com/']}`. Delete e31. (The embedded JSON `"total_amount":1742543820880` is in token base units; using it would need a conversion, so it cannot be used either.) |
| usage.traders | PASS | Not-published is consistent: x402scan shows buyer counts only in abbreviated form ("40.41K") with no stated window, and those cannot be stored without expansion. Owner note: the claim really means "not published in a storable literal form", because a buyer count does appear on a searched page. | — |
| costComponents[0] platform-fee buyer 0% | PASS | e60 says "x402 as a standard has 0 fees built in" and e61 says "free for the customer … just pay nominal payment network fees". The scope wording matches the quotes. | — |
| costComponents[1] platform-fee seller 0% | PASS | e60 as above; e61 says "free for … the merchant". | — |
| costComponents[2] facilitator seller 0.001 USD per unit | PASS | e62 states $0.001 per onchain transaction after the first 1,000 each month. e63 states "Payment verification is always free". e67 ("Price above your own cost per call … a $0.001 endpoint nets nothing") states that the seller bears the cost. | — |
| costComponents[3] facilitator seller 0% (Dexter) | PASS | e68 is the Dexter row of the facilitator table (checked): "with no fees and no account required". | — |
| costComponents[4] payment-processor seller 0% | PASS | e64 says "There are no processor fees or chargeback fees". "you" on the CDP seller FAQ is the seller. | — |
| costComponents[5] network-gas buyer 0% (EIP-3009) | PASS | e65 says "facilitator … pays the gas" and e66 says EIP-3009 buyers "never need a gas token". Together they state that the buyer pays no gas. | — |
| costComponents[6] network-gas buyer null (Permit2) | PASS | e69 states the exception word for word; no amount is published, and `searched` lists real pages. | — |
| costComponents[7] network-gas seller null (self-settlement) | FAIL | The scope clause "x402.org says users pay nominal payment network fees" is not supported by the evidence cited for this component (only e70). It comes from e61, which this component does not cite. | Scope: `"Self-settlement (verifying and settling x402 payments yourself): seller manages settlement gas; amount not published"`, evidence `["e70"]`. Alternatively keep the clause and set evidence to `["e70","e61"]`. |
| securityChecks.third-party-audit pass | PASS | e94: the Cantina team "conducted a review of x402 on commit hash ca60063c". The report is published in the official repo. e95 says it "has been audited for security". Note: the audit covered x402BatchSettlement and the DepositCollectors only, not the Permit2 proxies. | — |
| securityChecks.bug-bounty pass | FAIL | e93 says there is no bounty yet: "A bug bounty program is coming soon." e92 is a private-reporting instruction (that is the security-contact criterion), not a stated vulnerability disclosure programme. The pass rests on inference, and the same quote is counted twice. No source states that a programme is absent, so `fail` is not supported either. | outcome `unknown`, evidence `[]`. |
| securityChecks.security-contact pass | PASS | e92 states a disclosure procedure: privately contact a TSC member or a primary maintainer. | — |
| securityChecks.open-source-core pass | PASS | e95 says "The protocol is open-source". e96 says "open protocol (Apache-2.0 license)". | — |
| securityChecks.verified-contracts pass | FAIL | e97 ("Source Code Verified") does not say the address belongs to x402; no cited evidence links 0x402085…0001 to x402. It also covers one of the five Base Mainnet contracts listed in contracts/evm/README.md. I checked basescan on 2026-11-22 and all five show "Source Code Verified", so the outcome can stay pass once evidence is added. | Keep `pass`. Add evidence: (a) the README (`https://raw.githubusercontent.com/x402-foundation/x402/main/contracts/evm/README.md`, official-docs) with quotes `x402ExactPermit2Proxy \| 0x402085c248EeA27D92E8b30b2C58ed07f9E20001`, `x402UptoPermit2Proxy \| 0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002`, `x402BatchSettlement \| 0x4020074e9dF2ce1deE5A9C1b5c3f541D02a10003`, `ERC3009DepositCollector \| 0x4020806089470a89826cB9fB1f4059150b550004`, `Permit2DepositCollector \| 0x4020425FAf3B746C082C2f942b4E5159887B0005`; (b) four more `explorer` items with quote "Source Code Verified" at `https://basescan.org/address/<addr>#code` for addresses …0002, …0003, …0004 and …0005. |
| securityChecks.incident-handling unknown | PASS | Unknown with no evidence claims nothing. | — |
| securityChecks.custody-documented pass | PASS | e99 documents the custody model of the facilitator. | — |
| securityChecks.https-certificate pass | FAIL | Certificate evidence must point at the official URL. e90 points at `https://www.x402.org/`, which returns a 301 redirect to `https://x402.org/`. | Set the e90 url to `https://x402.org/` and keep the quote `"https-certificate": "pass",`. I reran `profile:passive https://x402.org/` at 2026-11-22T10:40:36Z: certificate authorized, SAN x402.org/*.x402.org, valid until 2027-01-27, outcome pass. |
| securityChecks.security-headers fail | FAIL | Same URL problem (e91 points at `www.x402.org`). | Set the e91 url to `https://x402.org/` and keep the quote `"security-headers": "fail",`. The same rerun gave fail: `strict-transport-security: max-age=300`, with no content-security-policy and no x-content-type-options. |
| securityChecks.account-protection not-applicable | PASS | The spec makes this not-applicable for non-custodial services. e99 says the facilitator "does not hold funds or act as a custodian", and e100 says "No accounts". (e100 repeats e5.) | — |
| riskChecks.custodial-funds pass | FAIL (evidence) | e108 ("Contracts never hold tokens") and e105 come from the README Security section about the two Permit2 proxies. x402BatchSettlement does hold tokens: Cantina says "The contract escrows USDC/USDT", and the implementer notes describe a "Per-channel `balance` (escrow)". Citing e108 as a statement about all contracts covers a different product. The outcome still holds under the custody rule, because e107 says this escrow has "no admin, no rescue function, no way to redirect a payout" and e99 covers the facilitator. | Keep `pass`, evidence `["e99","e105","e107"]`. Delete e108. |
| riskChecks.entity-unidentified pass | PASS | e101 names "x402 a Series of LF Projects, LLC"; e102 names the x402 Foundation. | — |
| riskChecks.jurisdiction-unstated pass | PASS | e103 states Delaware. The indicator ("not stated") is absent because a jurisdiction is stated, even though no governing law is. | — |
| riskChecks.unresolved-incident unknown | PASS | Claims nothing. | — |
| riskChecks.regulatory-action unknown | PASS | Claims nothing; there is no regulator evidence. | — |
| riskChecks.conflicting-terms unknown | PASS | Claims nothing. | — |
| riskChecks.single-operator-control pass | FAIL | This is an absence claim that no single operator controls any critical component. The sources state absence for only two components: facilitators (e106, "anyone can run a facilitator") and the Permit2 proxies (e105, which belongs to the proxy section only). No cited source states the general absence, so the outcome is inferred. The settlement tokens are an uncovered component: Cantina notes USDC/USDT blacklists that can freeze escrow [INFERENCE that these count as critical]. | outcome `unknown`, evidence `[]`. |
| riskChecks.no-terms-of-service pass | PASS | e101 points to lfprojects.org for website terms of use, and e104 says "These terms of use apply to your use of the web sites of LF Project and the Projects." | — |

## Evidence items (kind, URL, scope)

| Evidence | Verdict | Note |
|---|---|---|
| e1, e2, e3, e4, e5 | PASS | Kinds are correct; these are operator or parent first-party documents. |
| e6 | FAIL | Correct as a quote, but it describes a third party (the CDP Facilitator directory row). Remove it with the sanctionsScreening fix. |
| e30, e31 | FAIL | The quotes are fine and the kind (aggregator) is fine, but the values taken from them were expanded and the windows were derived. e30 cannot be reproduced from the URL. Remove them. |
| e60–e70 | PASS | official-docs; the CDP pages are Coinbase's own documentation for its facilitator, and the scopes name the CDP Facilitator. |
| e90, e91 | FAIL | Wrong URL (`www.x402.org`, a redirect). Use `https://x402.org/`. |
| e92 | PASS | |
| e93 | FAIL (as used) | It states that the bounty is absent ("coming soon") but is cited for a pass. Drop it from bug-bounty. |
| e94 | PASS | A third-party report hosted in the official repo; official-docs is acceptable. Its scope is the batch-settlement contracts. |
| e95, e96, e99, e102–e104, e106, e107 | PASS | |
| e97 | PASS (quote) | The quote and kind are correct, but on its own it does not tie the address to x402 (see verified-contracts). |
| e100, e101 | PASS | These repeat e5 and e2 (www host). Optional: point the citations at e5/e2 and delete the duplicates. |
| e105 | PASS (scoped) | Part of the README Security section about the Permit2 proxies; valid only for those. |
| e108 | FAIL | Proxy-scoped, but cited as if it covered every contract; the batch-settlement contract holds escrow. Delete it. |

`searched` lists: none of them is the scaffold default (`["https://docs.x402.org/introduction"]` alone). Every list names pages relevant to its field.

## Counts

- Facts, cost components and checks reviewed: 42. **PASS 32, FAIL 10**.
  - The failures: sanctionsScreening, weeklyActiveUsers, volume, costComponents[7], bug-bounty, verified-contracts, https-certificate, security-headers, custodial-funds (evidence only), single-operator-control.
  - Breakdown: facts 16 (3 FAIL), cost components 8 (1 FAIL), security checks 10 (4 FAIL), risk checks 8 (2 FAIL).
- Evidence items reviewed: 37. **FAIL 7**: e6, e30, e31, e90, e91, e93 (as used), e108.
- Effect of the fixes on outcomes:
  - Verdict changes: bug-bounty pass→unknown; single-operator-control pass→unknown.
  - Unchanged after the evidence fixes: verified-contracts, https-certificate, security-headers and custodial-funds.
  - Facts turned into not-published: sanctionsScreening, weeklyActiveUsers, volume.
