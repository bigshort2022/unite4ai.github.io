# Exchange Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research each of the 20 Global Exchange entries with an agent team and publish an owner-reviewed profile per entry: identity, legal jurisdiction facts, usage and market data, price quotes, transaction-cost components, and computed Security, Risk and Transaction Cost scores with A–F letter grades. Optionally run automated security tests from Kali, only inside an owner-accepted bug-bounty scope, with findings reported privately.

**Architecture:** One strict JSON record per entry under `apps/web/src/content/exchange-profiles/`, validated by a Zod schema in `@unite4ai/schema` and cross-checked by `@unite4ai/core` inside the existing `validateContent` gate. Scores are pure functions over versioned rubrics in core and are never stored. Astro pages and a JSON feed read published records through the core reader at build time. Research runs as an agent team in the maintainer's session, followed by deterministic evidence checks, an independent literal review and owner review.

**Tech Stack:** Bun 1.4 workspace, Node 24, TypeScript, Zod (v4 API as used in `packages/schema`), Astro static pages, `node:test` + `node:assert/strict` run by `bun test`.

**Design:** `docs/superpowers/specs/2026-11-22-exchange-profiles-design.md`. Read it first; it records the owner's decisions and the amendment to the Observed Markets design.

---

## Ground rules for every task

- Work on a feature branch from `origin/main`; never commit to `main`.
- `source scripts/agent/activate-node.sh` before running tests or the gate.
- Tests never touch the network. Network is used only by the manual research CLIs (Tasks 6–7) for public, passive reads, and by the gated Kali runner (Task 10), which only runs inside an owner-accepted bug-bounty scope.
- Never invent a value. Anything not found is `not-published` with the pages searched.
- No new dependencies. Bun runs the `.ts` CLIs directly.
- Finish each pull request with `node scripts/agent/verify.mjs --only hub` and quote its JSON line.

## File map

| File | Responsibility |
|---|---|
| `packages/schema/src/index.ts` (append) | `exchangeProfileSchema` and its enums |
| `packages/core/src/profile-rubrics.ts` (new) | Rubric v1: criteria, weights, thresholds, reference workloads |
| `packages/core/src/profile-scores.ts` (new) | Security, Risk, Transaction Cost scores; quote grouping |
| `packages/core/src/profiles.ts` (new) | Read records from disk; cross-reference validation |
| `packages/core/src/profile-checks.ts` (new) | Quote matching, highlight links, passive security evaluation |
| `packages/core/src/validate.ts` (modify) | Run profile validation in the content gate |
| `packages/core/package.json` (modify) | Export the four new modules |
| `packages/core/test/fixtures/profile.mjs` (new) | A valid published profile for tests |
| `packages/core/test/profile-*.test.mjs` (new) | Score, validation and check tests |
| `apps/web/src/pages/global-exchange/[id].astro` (new) | Profile page |
| `apps/web/src/pages/data/exchange-profiles.json.ts` (new) | Profiles feed |
| `apps/web/src/pages/global-exchange.astro` (modify) | "Full profile" link on cards |
| `apps/web/astro.config.mjs` (modify) | Isolate fixture builds for profiles |
| `apps/web/test/exchange-profiles-pages.test.mjs` (new) | Built page and feed contract |
| `scripts/profiles/new.ts`, `verify-evidence.ts`, `passive-security.ts` (new) | Research CLIs |
| `package.json` (modify) | `profile:*` scripts |
| `packages/core/src/scan-scope.ts` (new) | Decide which hosts and tools a Kali run may use |
| `packages/core/test/scan-scope.test.mjs` (new) | Scope decision tests |
| `scripts/profiles/kali-scan.ts` (new) | Run allowed tools on `kali`; store output privately on m5 |
| `research_notes/exchange-profiles/scan-scopes/<id>.json` (new, per programme) | Owner-accepted bug-bounty scope records |
| `research_notes/exchange-profiles/scan-eligibility.md` (new) | Which projects permit automated testing, with quotes |
| `docs/exchange-profiles/research-protocol.md` (new) | Agent briefs, review procedure, refresh |
| `CONTRIBUTING.md` (modify) | Profile rules and operator correction process |

---

### Task 1: Profile schema

**Files:**
- Modify: `packages/schema/src/index.ts` (append at end of file)
- Create: `packages/core/test/fixtures/profile.mjs`
- Test: `packages/core/test/profile-schema.test.mjs`

- [ ] **Step 1: Write the fixture**

```js
// packages/core/test/fixtures/profile.mjs
// FIXTURE ONLY — invented values for tests; never copy into content.
const ev = (id, kind = 'official-docs') => ({
  id, url: `https://fixture.example/${id}`, retrievedAt: '2026-11-22', quote: `Fixture quote ${id}.`, kind,
});
const fact = (value, evidence, level = 'stated') => ({ value, level, evidence });
const none = () => ({ value: null, level: 'not-published', searched: ['https://fixture.example/search'] });

export function profile(overrides = {}) {
  const base = {
    meta: {
      schemaVersion: 1, directoryId: 'akash', researchedAt: '2026-11-22', author: 'fixture-bot',
      agent: { model: 'fixture-model', harness: 'fixture-harness' }, status: 'published',
      reviewedBy: 'fixture-owner', reviewedAt: '2026-11-22',
    },
    identity: {
      officialUrl: fact('https://fixture.example', ['e1']), operatingEntity: fact('Fixture Labs Inc.', ['e2'], 'reported'),
      headquarters: none(), formedOn: fact('2018', ['e2'], 'reported'),
    },
    legal: {
      registeredJurisdiction: fact('Delaware, United States', ['e2'], 'reported'), governingLaw: fact('State of New York', ['e3']),
      licenses: none(), restrictedJurisdictions: fact('Sanctioned countries listed in the terms', ['e3']),
      sanctionsScreening: none(), kycRequired: fact('No', ['e3']),
    },
    marketData: { tokenSymbol: fact('FIX', ['e4'], 'reported'), marketCapUsd: fact(1000000, ['e4'], 'reported'), tokenPriceUsd: fact(0.5, ['e4'], 'reported') },
    usage: {
      weeklyActiveUsers: none(),
      volume: { value: 1200, unit: 'USD', window: { start: '2026-11-10', end: '2026-11-17' }, level: 'reported', evidence: ['e5'] },
      traders: none(),
    },
    priceQuotes: [{ workload: 'gpu-hour-h100-80gb', statistic: 'median', amount: '1.80', currency: 'USD', per: 'GPU-hour', sampleSize: 12, sampledAt: '2026-11-22', level: 'reported', evidence: ['e5'] }],
    costComponents: [
      { kind: 'take-rate', basis: 'percent', amount: '4', appliesTo: 'buyer', scope: 'All leases', evidence: ['e1'] },
      { kind: 'payment-processor', basis: 'fixed', amount: '0.30', currency: 'USD', appliesTo: 'buyer', scope: 'Card top-ups', evidence: ['e1'] },
      { kind: 'network-gas', basis: 'per-unit', amount: '0.01', currency: 'ETH', appliesTo: 'buyer', scope: 'Per transaction', evidence: ['e1'] },
    ],
    securityChecks: [
      { criterion: 'third-party-audit', outcome: 'pass', evidence: ['e6'] },
      { criterion: 'bug-bounty', outcome: 'pass', evidence: ['e6'] },
      { criterion: 'security-contact', outcome: 'pass', evidence: ['e6'] },
      { criterion: 'open-source-core', outcome: 'pass', evidence: ['e1'] },
      { criterion: 'verified-contracts', outcome: 'not-applicable', evidence: ['e1'] },
      { criterion: 'incident-handling', outcome: 'pass', evidence: ['e6'] },
      { criterion: 'custody-documented', outcome: 'pass', evidence: ['e1'] },
      { criterion: 'https-certificate', outcome: 'pass', evidence: ['e7'] },
      { criterion: 'security-headers', outcome: 'fail', evidence: ['e7'] },
      { criterion: 'account-protection', outcome: 'unknown', evidence: [] },
    ],
    riskChecks: [
      { criterion: 'custodial-funds', outcome: 'fail', evidence: ['e1'] },
      { criterion: 'entity-unidentified', outcome: 'pass', evidence: ['e2'] },
      { criterion: 'jurisdiction-unstated', outcome: 'pass', evidence: ['e3'] },
      { criterion: 'unresolved-incident', outcome: 'pass', evidence: ['e6'] },
      { criterion: 'regulatory-action', outcome: 'pass', evidence: ['e2'] },
      { criterion: 'conflicting-terms', outcome: 'unknown', evidence: [] },
      { criterion: 'single-operator-control', outcome: 'fail', evidence: ['e1'] },
      { criterion: 'no-terms-of-service', outcome: 'pass', evidence: ['e3'] },
    ],
    evidence: [ev('e1'), ev('e2', 'registry'), ev('e3', 'terms'), ev('e4', 'aggregator'), ev('e5', 'aggregator'), ev('e6'), ev('e7', 'certificate')],
  };
  return structuredClone({ ...base, ...overrides });
}
```

- [ ] **Step 2: Write the failing schema test**

```js
// packages/core/test/profile-schema.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeProfileSchema } from '@unite4ai/schema';
import { profile } from './fixtures/profile.mjs';

test('a complete published profile parses', () => {
  assert.equal(exchangeProfileSchema.safeParse(profile()).success, true);
});

test('a published profile without a reviewer is rejected', () => {
  const p = profile();
  delete p.meta.reviewedBy;
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('a missing value must say where it was searched for, never be zero or blank', () => {
  const p = profile();
  p.identity.headquarters = { value: null, level: 'not-published', searched: [] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  p.identity.headquarters = { value: '', level: 'stated', evidence: ['e1'] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('a known check outcome must cite evidence; unknown may not', () => {
  const p = profile();
  p.securityChecks[0] = { criterion: 'third-party-audit', outcome: 'pass', evidence: [] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
});

test('fixed fees need a currency and amounts are decimal strings', () => {
  const p = profile();
  p.costComponents[1] = { kind: 'payment-processor', basis: 'fixed', amount: '0.30', appliesTo: 'buyer', scope: 'x', evidence: ['e1'] };
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  const q = profile();
  q.costComponents[0].amount = 4;
  assert.equal(exchangeProfileSchema.safeParse(q).success, false);
});

test('unknown keys and HTML text are rejected', () => {
  const p = profile();
  p.meta.score = 99;
  assert.equal(exchangeProfileSchema.safeParse(p).success, false);
  const q = profile();
  q.evidence[0].quote = '<b>bold</b>';
  assert.equal(exchangeProfileSchema.safeParse(q).success, false);
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun test packages/core/test/profile-schema.test.mjs`
Expected: FAIL — `exchangeProfileSchema` is not exported.

- [ ] **Step 4: Append the schema**

Append to the end of `packages/schema/src/index.ts` (it reuses `httpsUrl`, `contentId`, `CONTENT_ID`, `exchangeText`, `exchangeDate`, `exchangeIdentity` and `exchangeAgent`, all defined earlier in the file):

```ts
// ── Exchange profiles (docs/superpowers/specs/2026-11-22-exchange-profiles-design.md) ──

export const PROFILE_MAX_BYTES = 32 * 1024;
export const PROFILE_EVIDENCE_KINDS = ['official-docs', 'terms', 'registry', 'regulator', 'aggregator', 'explorer', 'certificate', 'dns', 'observation'] as const;
export const PROFILE_LEVELS = ['stated', 'reported', 'observed'] as const;
export const PROFILE_CHECK_OUTCOMES = ['pass', 'fail', 'not-applicable', 'unknown'] as const;
export const PROFILE_COST_KINDS = ['platform-fee', 'take-rate', 'payment-processor', 'facilitator', 'network-gas', 'withdrawal', 'minimum-charge'] as const;

const profileEvidenceId = z.string().regex(/^e\d{1,3}$/, 'must be an evidence id like e7');
const profileDecimal = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string');
const profileCurrency = z.string().regex(/^[A-Z]{3,5}$/, 'must be an uppercase currency or asset code');
const profileNotPublished = z.strictObject({ value: z.null(), level: z.literal('not-published'), searched: z.array(httpsUrl).min(1) });

export const profileFactSchema = z.union([
  z.strictObject({
    value: z.union([exchangeText(300, true), z.number().finite()]),
    level: z.enum(PROFILE_LEVELS),
    evidence: z.array(profileEvidenceId).min(1),
  }),
  profileNotPublished,
]);

export const profileMetricSchema = z.union([
  z.strictObject({
    value: z.number().finite().nonnegative(),
    unit: exchangeText(60, true),
    window: z.strictObject({ start: exchangeDate, end: exchangeDate }),
    level: z.enum(PROFILE_LEVELS),
    evidence: z.array(profileEvidenceId).min(1),
  }),
  profileNotPublished,
]);

export const profileQuoteSchema = z.strictObject({
  workload: z.string().regex(CONTENT_ID, 'must be a workload id like gpu-hour-h100-80gb'),
  statistic: z.enum(['list', 'min', 'median', 'p90']),
  amount: profileDecimal,
  currency: profileCurrency,
  per: exchangeText(60, true),
  sampleSize: z.number().int().positive().optional(),
  sampledAt: exchangeDate,
  level: z.enum(PROFILE_LEVELS),
  evidence: z.array(profileEvidenceId).min(1),
});

export const profileCostSchema = z.union([
  z.strictObject({
    kind: z.enum(PROFILE_COST_KINDS),
    basis: z.enum(['percent', 'fixed', 'per-unit']),
    amount: profileDecimal,
    currency: profileCurrency.optional(),
    appliesTo: z.enum(['buyer', 'seller']),
    scope: exchangeText(200, true),
    evidence: z.array(profileEvidenceId).min(1),
  }).refine((c) => c.basis === 'percent' || c.currency !== undefined, 'fixed and per-unit costs need a currency'),
  z.strictObject({
    kind: z.enum(PROFILE_COST_KINDS),
    amount: z.null(),
    appliesTo: z.enum(['buyer', 'seller']),
    scope: exchangeText(200, true),
    searched: z.array(httpsUrl).min(1),
  }),
]);

export const profileCheckSchema = z.strictObject({
  criterion: contentId,
  outcome: z.enum(PROFILE_CHECK_OUTCOMES),
  evidence: z.array(profileEvidenceId),
}).refine((c) => c.outcome === 'unknown' || c.evidence.length > 0, 'a known outcome must cite evidence');

export const profileEvidenceSchema = z.strictObject({
  id: profileEvidenceId,
  url: httpsUrl,
  retrievedAt: exchangeDate,
  quote: exchangeText(500),
  kind: z.enum(PROFILE_EVIDENCE_KINDS),
});

export const exchangeProfileSchema = z.strictObject({
  meta: z.strictObject({
    schemaVersion: z.literal(1),
    directoryId: contentId,
    researchedAt: exchangeDate,
    author: exchangeIdentity,
    agent: exchangeAgent.optional(),
    status: z.enum(['draft', 'published']),
    reviewedBy: exchangeIdentity.optional(),
    reviewedAt: exchangeDate.optional(),
  }).refine((m) => m.status === 'draft' || (m.reviewedBy !== undefined && m.reviewedAt !== undefined),
    'a published profile needs reviewedBy and reviewedAt'),
  identity: z.strictObject({
    officialUrl: profileFactSchema, operatingEntity: profileFactSchema, headquarters: profileFactSchema, formedOn: profileFactSchema,
  }),
  legal: z.strictObject({
    registeredJurisdiction: profileFactSchema, governingLaw: profileFactSchema, licenses: profileFactSchema,
    restrictedJurisdictions: profileFactSchema, sanctionsScreening: profileFactSchema, kycRequired: profileFactSchema,
  }),
  marketData: z.strictObject({ tokenSymbol: profileFactSchema, marketCapUsd: profileFactSchema, tokenPriceUsd: profileFactSchema }),
  usage: z.strictObject({ weeklyActiveUsers: profileMetricSchema, volume: profileMetricSchema, traders: profileMetricSchema }),
  priceQuotes: z.array(profileQuoteSchema),
  costComponents: z.array(profileCostSchema),
  securityChecks: z.array(profileCheckSchema),
  riskChecks: z.array(profileCheckSchema),
  evidence: z.array(profileEvidenceSchema),
});
export type ExchangeProfile = z.infer<typeof exchangeProfileSchema>;
```

- [ ] **Step 5: Run the test and the typecheck**

Run: `bun test packages/core/test/profile-schema.test.mjs && bun run typecheck`
Expected: 6 pass, 0 fail; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/index.ts packages/core/test/fixtures/profile.mjs packages/core/test/profile-schema.test.mjs
git commit -m "feat(schema): add exchange profile record schema"
```

### Task 2: Rubrics and scores

**Files:**
- Create: `packages/core/src/profile-rubrics.ts`, `packages/core/src/profile-scores.ts`
- Modify: `packages/core/package.json` (exports)
- Test: `packages/core/test/profile-scores.test.mjs`

- [ ] **Step 1: Write the failing score tests**

```js
// packages/core/test/profile-scores.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { securityScore, riskScore, transactionCostScore, quotesByWorkload, letterGrade } from '../src/profile-scores.ts';
import { MIN_COVERAGE } from '../src/profile-rubrics.ts';
import { profile } from './fixtures/profile.mjs';

test('security score is passed weight over known applicable weight; not-applicable leaves the denominator', () => {
  // Applicable weight 100 - 10 (verified-contracts n/a) = 90; unknown account-protection (5) leaves 85 known.
  // Passed: 20+10+10+10+15+10+5 = 80. 80/85 = 94.1 -> 94. Coverage 85/90.
  const s = securityScore(profile());
  assert.equal(s.score, 94);
  assert.equal(s.coverage, 0.94);
  assert.equal(s.rubricVersion, '1');
  assert.equal(s.breakdown.find((b) => b.criterion === 'account-protection').outcome, 'unknown');
});

test('a criterion with no check counts as unknown, and low coverage withholds the score', () => {
  const p = profile();
  p.securityChecks = p.securityChecks.slice(0, 2); // only 30 of 90 applicable weight known
  const s = securityScore(p);
  assert.equal(s.score, null);
  assert.ok(s.coverage < MIN_COVERAGE);
});

test('risk score counts triggered indicators (outcome fail) over known weight', () => {
  // Known: 100 - 10 (conflicting-terms unknown) = 90. Triggered: custodial 20 + single-operator 10 = 30. 30/90 = 33.
  assert.equal(riskScore(profile()).score, 33);
});

test('transaction cost sums percent fees and USD fixed fees on the USD 100 reference; gas is excluded', () => {
  // 4% + 0.30/100*100 = 4.3% -> score 100*(1-4.3/20) = 78.5 -> 79
  const c = transactionCostScore(profile());
  assert.equal(c.costPercent, 4.3);
  assert.equal(c.score, 79);
  assert.deepEqual(c.excluded, ['network-gas']);
});

test('a fee in another currency or with an unpublished amount makes the cost score not computable, never converted', () => {
  const p = profile();
  p.costComponents[1].currency = 'EUR';
  assert.equal(transactionCostScore(p).score, null);
  const q = profile();
  q.costComponents.push({ kind: 'withdrawal', amount: null, appliesTo: 'seller', scope: 'Payouts', searched: ['https://fixture.example/fees'] });
  const r = transactionCostScore(q);
  assert.equal(r.score, null);
  assert.match(r.notComputable.join(' '), /withdrawal/);
});

test('no published fee at all is not computable rather than free', () => {
  const p = profile();
  p.costComponents = [];
  assert.equal(transactionCostScore(p).score, null);
});

test('costs above the cap floor the score at zero', () => {
  const p = profile();
  p.costComponents = [{ kind: 'take-rate', basis: 'percent', amount: '35', appliesTo: 'seller', scope: 'x', evidence: ['e1'] }];
  assert.equal(transactionCostScore(p).score, 0);
});

test('quotes are compared only within the same workload, currency, unit and statistic', () => {
  const a = profile();
  const b = profile({ meta: { ...profile().meta, directoryId: 'vast-ai' } });
  b.priceQuotes = [
    { ...a.priceQuotes[0], amount: '2.10' },
    { ...a.priceQuotes[0], currency: 'EUR', amount: '1.50' },
  ];
  const groups = quotesByWorkload([{ id: 'akash', data: a }, { id: 'vast-ai', data: b }]);
  const usd = groups.get('gpu-hour-h100-80gb|USD|GPU-hour|median');
  assert.deepEqual(usd.map((r) => [r.directoryId, r.amount]), [['akash', 1.8], ['vast-ai', 2.1]]);
  assert.equal(groups.get('gpu-hour-h100-80gb|EUR|GPU-hour|median').length, 1);
});

test('letters: A 90+, B 80-89, C 70-79, D 50-69, F below 50; withheld scores get no letter', () => {
  assert.deepEqual([100, 90, 89, 80, 79, 70, 69, 50, 49, 0].map(letterGrade), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
  assert.equal(letterGrade(null), null);
  const p = profile();
  p.securityChecks = p.securityChecks.slice(0, 2);
  assert.equal(securityScore(p).grade, null);
});

test('security and cost are graded on their score; risk is graded on 100 minus its score', () => {
  assert.equal(securityScore(profile()).grade, 'A'); // 94
  assert.equal(riskScore(profile()).grade, 'D'); // 100 - 33 = 67
  assert.equal(transactionCostScore(profile()).grade, 'C'); // 79
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/profile-scores.test.mjs`
Expected: FAIL — module `../src/profile-scores.ts` not found.

- [ ] **Step 3: Write the rubric file**

```ts
// packages/core/src/profile-rubrics.ts
// Rubric v1. Changing any weight, criterion, threshold or workload is a new RUBRIC_VERSION.
export const RUBRIC_VERSION = '1';
/** Scores are withheld below this share of known applicable weight. */
export const MIN_COVERAGE = 0.7;
/** Reference transaction value for the Transaction Cost Score, in USD. */
export const REFERENCE_USD = 100;
/** Effective cost at or above this percentage scores zero. */
export const COST_CAP_PERCENT = 20;

export interface Criterion { id: string; weight: number; label: string }

/** Security: outcome `pass` means the protective practice is evidenced. */
export const SECURITY_CRITERIA: readonly Criterion[] = [
  { id: 'third-party-audit', weight: 20, label: 'Third-party security audit published' },
  { id: 'bug-bounty', weight: 10, label: 'Bug bounty or vulnerability disclosure programme' },
  { id: 'security-contact', weight: 10, label: 'Security contact or disclosure policy' },
  { id: 'open-source-core', weight: 10, label: 'Core code is open source' },
  { id: 'verified-contracts', weight: 10, label: 'Deployed contracts verified on an explorer' },
  { id: 'incident-handling', weight: 15, label: 'No unresolved incident in 24 months, or post-mortem published' },
  { id: 'custody-documented', weight: 10, label: 'Custody model documented' },
  { id: 'https-certificate', weight: 5, label: 'Valid HTTPS certificate for the official domain' },
  { id: 'security-headers', weight: 5, label: 'HSTS and baseline security headers' },
  { id: 'account-protection', weight: 5, label: '2FA or equivalent for custodial accounts' },
];

/** Risk: outcome `fail` means the risk indicator is present; `pass` means it is absent. */
export const RISK_CRITERIA: readonly Criterion[] = [
  { id: 'custodial-funds', weight: 20, label: 'Holds customer funds' },
  { id: 'entity-unidentified', weight: 15, label: 'Operating entity not identifiable' },
  { id: 'jurisdiction-unstated', weight: 10, label: 'Governing law or jurisdiction not stated' },
  { id: 'unresolved-incident', weight: 15, label: 'Unresolved security incident' },
  { id: 'regulatory-action', weight: 10, label: 'Public regulatory action on record' },
  { id: 'conflicting-terms', weight: 10, label: 'Conflicting payment or refund terms in official docs' },
  { id: 'single-operator-control', weight: 10, label: 'A single operator controls a critical component' },
  { id: 'no-terms-of-service', weight: 10, label: 'No published terms of service' },
];

/** Price quotes must name one of these workloads so comparisons stay like-for-like. */
export const REFERENCE_WORKLOADS = [
  { id: 'gpu-hour-h100-80gb', label: 'One NVIDIA H100 80GB GPU-hour' },
  { id: 'gpu-hour-rtx-4090', label: 'One NVIDIA RTX 4090 GPU-hour' },
  { id: 'api-call', label: 'One paid API call' },
  { id: 'render-unit', label: 'One rendering unit as the operator defines it' },
] as const;

/** Letter bands, highest first; anything below the last band is F. */
export const GRADE_BANDS: readonly (readonly [number, 'A' | 'B' | 'C' | 'D'])[] = [[90, 'A'], [80, 'B'], [70, 'C'], [50, 'D']];
```

- [ ] **Step 4: Write the scores module**

```ts
// packages/core/src/profile-scores.ts
import type { ExchangeProfile } from '@unite4ai/schema';
import { COST_CAP_PERCENT, GRADE_BANDS, MIN_COVERAGE, REFERENCE_USD, RISK_CRITERIA, RUBRIC_VERSION, SECURITY_CRITERIA, type Criterion } from './profile-rubrics.ts';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** A 90+, B 80–89, C 70–79, D 50–69, F below 50. No score, no letter. */
export function letterGrade(score: number | null): Grade | null {
  if (score === null) return null;
  return GRADE_BANDS.find(([min]) => score >= min)?.[1] ?? 'F';
}

export interface RubricScore {
  rubricVersion: string;
  score: number | null;
  /** Letter for the score; for risk it grades 100 − score so A is always best. */
  grade: Grade | null;
  coverage: number;
  breakdown: { criterion: string; label: string; weight: number; outcome: string; evidence: string[] }[];
}

function rubricScore(criteria: readonly Criterion[], checks: ExchangeProfile['securityChecks'], counted: 'pass' | 'fail', higherIsWorse: boolean): RubricScore {
  const byId = new Map(checks.map((c) => [c.criterion, c]));
  let applicable = 0, known = 0, hit = 0;
  const breakdown = criteria.map((c) => {
    const check = byId.get(c.id);
    const outcome = check?.outcome ?? 'unknown';
    if (outcome !== 'not-applicable') {
      applicable += c.weight;
      if (outcome !== 'unknown') {
        known += c.weight;
        if (outcome === counted) hit += c.weight;
      }
    }
    return { criterion: c.id, label: c.label, weight: c.weight, outcome, evidence: check?.evidence ?? [] };
  });
  const coverage = applicable === 0 ? 0 : known / applicable;
  const score = coverage >= MIN_COVERAGE && known > 0 ? Math.round((100 * hit) / known) : null;
  return {
    rubricVersion: RUBRIC_VERSION,
    score,
    grade: letterGrade(score === null ? null : higherIsWorse ? 100 - score : score),
    coverage: Math.round(coverage * 100) / 100,
    breakdown,
  };
}

/** Higher means more protective practices are evidenced. */
export const securityScore = (p: ExchangeProfile): RubricScore => rubricScore(SECURITY_CRITERIA, p.securityChecks, 'pass', false);
/** Higher means more risk indicators are present. */
export const riskScore = (p: ExchangeProfile): RubricScore => rubricScore(RISK_CRITERIA, p.riskChecks, 'fail', true);

export interface CostScore {
  rubricVersion: string;
  score: number | null;
  grade: Grade | null;
  costPercent: number | null;
  excluded: string[];
  notComputable: string[];
}

/** Higher means cheaper. Compare only within a directory category. */
export function transactionCostScore(p: ExchangeProfile): CostScore {
  const excluded: string[] = [];
  const notComputable: string[] = [];
  let percent = 0;
  let fees = 0;
  for (const c of p.costComponents) {
    if (c.kind === 'network-gas' || c.kind === 'minimum-charge') {
      excluded.push(c.kind);
      continue;
    }
    fees += 1;
    if (c.amount === null) notComputable.push(`${c.kind} (${c.appliesTo}): amount not published`);
    else if (c.basis === 'percent') percent += Number(c.amount);
    else if (c.basis === 'fixed' && c.currency === 'USD') percent += (Number(c.amount) / REFERENCE_USD) * 100;
    else notComputable.push(`${c.kind} (${c.appliesTo}): ${c.basis} fee in ${c.currency}`);
  }
  if (fees === 0) notComputable.push('no fee components published');
  if (notComputable.length > 0) return { rubricVersion: RUBRIC_VERSION, score: null, grade: null, costPercent: null, excluded, notComputable };
  const costPercent = Math.round(percent * 100) / 100;
  const score = Math.round(100 * (1 - Math.min(costPercent, COST_CAP_PERCENT) / COST_CAP_PERCENT));
  return { rubricVersion: RUBRIC_VERSION, score, grade: letterGrade(score), costPercent, excluded, notComputable };
}

export interface QuoteRow { directoryId: string; amount: number; sampleSize?: number; sampledAt: string; level: string }

/** Groups quotes that are directly comparable: same workload, currency, unit and statistic. Sorted cheapest first. */
export function quotesByWorkload(profiles: { id: string; data: ExchangeProfile }[]): Map<string, QuoteRow[]> {
  const groups = new Map<string, QuoteRow[]>();
  for (const { id, data } of profiles) {
    for (const q of data.priceQuotes) {
      const key = `${q.workload}|${q.currency}|${q.per}|${q.statistic}`;
      const rows = groups.get(key) ?? [];
      rows.push({ directoryId: id, amount: Number(q.amount), sampleSize: q.sampleSize, sampledAt: q.sampledAt, level: q.level });
      groups.set(key, rows);
    }
  }
  for (const rows of groups.values()) rows.sort((a, b) => a.amount - b.amount || a.directoryId.localeCompare(b.directoryId));
  return groups;
}
```

- [ ] **Step 5: Export the modules**

In `packages/core/package.json`, add to `exports`:

```json
    "./profile-rubrics": "./src/profile-rubrics.ts",
    "./profile-scores": "./src/profile-scores.ts",
    "./profiles": "./src/profiles.ts",
    "./profile-checks": "./src/profile-checks.ts",
```

- [ ] **Step 6: Run and confirm pass**

Run: `bun test packages/core/test/profile-scores.test.mjs`
Expected: 10 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/profile-rubrics.ts packages/core/src/profile-scores.ts packages/core/package.json packages/core/test/profile-scores.test.mjs
git commit -m "feat(core): add rubric v1 and computed profile scores"
```

### Task 3: Read and cross-validate profiles in the content gate

**Files:**
- Create: `packages/core/src/profiles.ts`
- Modify: `packages/core/src/validate.ts` (after the exchange validation near line 136)
- Test: `packages/core/test/profile-validate.test.mjs`

- [ ] **Step 1: Write the failing validation tests**

```js
// packages/core/test/profile-validate.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { readExchangeProfiles, validateProfiles } from '../src/profiles.ts';
import { validateContent } from '../src/validate.ts';
import { profile } from './fixtures/profile.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
function root(files, directoryIds = ['akash', 'vast-ai']) {
  const r = mkdtempSync(join(tmpdir(), 'u4ai-profiles-'));
  dirs.push(r);
  mkdirSync(join(r, 'content', 'exchange-profiles'), { recursive: true });
  mkdirSync(join(r, 'data'), { recursive: true });
  writeFileSync(join(r, 'data', 'global-exchange.json'), JSON.stringify({ projects: directoryIds.map((id) => ({ id })) }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(r, 'content', 'exchange-profiles', name), typeof body === 'string' ? body : JSON.stringify(body));
  return join(r, 'content');
}
const ids = new Set(['akash', 'vast-ai']);
const entry = (data, id = 'akash') => ({ id, data, sha256: '0'.repeat(64) });

test('a valid profile has no cross-reference errors', () => {
  assert.deepEqual(validateProfiles([entry(profile())], ids), []);
});

test('the file name must equal the directory id, and the id must be in the directory', () => {
  assert.match(validateProfiles([entry(profile(), 'vast-ai')], ids).join('\n'), /directoryId/);
  const p = profile({ meta: { ...profile().meta, directoryId: 'not-listed' } });
  assert.match(validateProfiles([entry(p, 'not-listed')], ids).join('\n'), /not in the Global Exchange directory/);
});

test('every cited evidence id must exist, and every evidence item must be cited', () => {
  const p = profile();
  p.identity.officialUrl.evidence = ['e99'];
  p.evidence.push({ ...p.evidence[0], id: 'e8' });
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /e99/);
  assert.match(errors, /e8: not cited/);
});

test('criteria must belong to the right rubric and appear once', () => {
  const p = profile();
  p.securityChecks.push({ criterion: 'custodial-funds', outcome: 'pass', evidence: ['e1'] });
  p.riskChecks.push({ ...p.riskChecks[0] });
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /custodial-funds.*security rubric/);
  assert.match(errors, /custodial-funds.*more than once/);
});

test('market data must be reported, and quotes must name a reference workload', () => {
  const p = profile();
  p.marketData.marketCapUsd.level = 'stated';
  p.priceQuotes[0].workload = 'mystery-unit';
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /marketCapUsd.*reported/);
  assert.match(errors, /mystery-unit/);
});

test('the content gate reads the directory beside the content root and reports bad files', async () => {
  const content = root({ 'akash.json': profile(), 'broken.json': '{not json', 'Bad Name.json': profile() });
  const { errors } = await validateContent(content);
  const text = errors.join('\n');
  assert.match(text, /broken\.json: cannot parse/);
  assert.match(text, /Bad Name\.json: filename must be a lowercase id/);
  assert.doesNotMatch(text, /akash\.json/);
});

test('reading skips nothing silently: oversize files are errors', async () => {
  const big = profile();
  big.evidence[0].quote = 'x'.repeat(499);
  const padded = JSON.stringify(big).padEnd(40 * 1024, ' ');
  const { errors } = await readExchangeProfiles(root({ 'akash.json': padded }));
  assert.match(errors.join('\n'), /byte record limit/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/profile-validate.test.mjs`
Expected: FAIL — `../src/profiles.ts` not found.

- [ ] **Step 3: Write the reader and validator**

```ts
// packages/core/src/profiles.ts
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_ID, PROFILE_MAX_BYTES, exchangeProfileSchema, type ExchangeProfile } from '@unite4ai/schema';
import { REFERENCE_WORKLOADS, RISK_CRITERIA, SECURITY_CRITERIA } from './profile-rubrics.ts';

export interface ProfileEntry { id: string; data: ExchangeProfile; sha256: string }

/** Reads `exchange-profiles/*.json` under a content root. Missing directory means no profiles. */
export async function readExchangeProfiles(root: string): Promise<{ profiles: ProfileEntry[]; errors: string[] }> {
  const profiles: ProfileEntry[] = [];
  const errors: string[] = [];
  const directory = join(root, 'exchange-profiles');
  try {
    if (!(await lstat(directory)).isDirectory()) return { profiles, errors: ['exchange-profiles: must be a real flat directory, not a link'] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { profiles, errors };
    return { profiles, errors: ['exchange-profiles: cannot read directory'] };
  }
  const entries = await readdir(directory, { withFileTypes: true });
  for (const item of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const file = `exchange-profiles/${item.name}`;
    if (item.isFile() && ['.gitkeep', '.DS_Store'].includes(item.name)) continue;
    if (!item.isFile() || !item.name.endsWith('.json')) {
      errors.push(`${file}: only .json files are allowed; subfolders and links are not read`);
      continue;
    }
    const id = item.name.slice(0, -'.json'.length);
    if (!CONTENT_ID.test(id)) {
      errors.push(`${file}: filename must be a lowercase id`);
      continue;
    }
    const path = join(directory, item.name);
    if ((await lstat(path)).size > PROFILE_MAX_BYTES) {
      errors.push(`${file}: exceeds the ${PROFILE_MAX_BYTES}-byte record limit`);
      continue;
    }
    let data: unknown;
    let sha256: string;
    try {
      const bytes = await readFile(path);
      sha256 = createHash('sha256').update(bytes).digest('hex');
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      errors.push(`${file}: cannot parse record (${(error as Error).message})`);
      continue;
    }
    const parsed = exchangeProfileSchema.safeParse(data);
    if (parsed.success) profiles.push({ id, data: parsed.data, sha256 });
    else errors.push(`${file}: ${parsed.error.message}`);
  }
  return { profiles, errors };
}

function citedEvidence(p: ExchangeProfile): string[] {
  const ids: string[] = [];
  const facts = [...Object.values(p.identity), ...Object.values(p.legal), ...Object.values(p.marketData), ...Object.values(p.usage)];
  for (const f of facts) if ('evidence' in f) ids.push(...f.evidence);
  for (const q of p.priceQuotes) ids.push(...q.evidence);
  for (const c of p.costComponents) if ('evidence' in c) ids.push(...c.evidence);
  for (const c of [...p.securityChecks, ...p.riskChecks]) ids.push(...c.evidence);
  return ids;
}

/** Cross-record rules the schema cannot express. */
export function validateProfiles(profiles: ProfileEntry[], directoryIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const security = new Set(SECURITY_CRITERIA.map((c) => c.id));
  const risk = new Set(RISK_CRITERIA.map((c) => c.id));
  const workloads = new Set<string>(REFERENCE_WORKLOADS.map((w) => w.id));
  for (const { id, data: p } of profiles) {
    const file = `exchange-profiles/${id}.json`;
    if (p.meta.directoryId !== id) errors.push(`${file}: meta.directoryId must equal the file name`);
    if (!directoryIds.has(p.meta.directoryId)) errors.push(`${file}: ${p.meta.directoryId} is not in the Global Exchange directory`);
    const evidenceIds = new Set<string>();
    for (const e of p.evidence) {
      if (evidenceIds.has(e.id)) errors.push(`${file}: evidence ${e.id} appears more than once`);
      evidenceIds.add(e.id);
    }
    const cited = new Set(citedEvidence(p));
    for (const c of cited) if (!evidenceIds.has(c)) errors.push(`${file}: cites evidence ${c}, which does not exist`);
    for (const e of evidenceIds) if (!cited.has(e)) errors.push(`${file}: evidence ${e}: not cited by any fact or check`);
    for (const [key, fact] of Object.entries(p.marketData)) {
      if (fact.level !== 'not-published' && fact.level !== 'reported') errors.push(`${file}: marketData.${key} must be reported market data`);
    }
    for (const q of p.priceQuotes) if (!workloads.has(q.workload)) errors.push(`${file}: quote workload ${q.workload} is not a reference workload`);
    const checkRubric = (checks: ExchangeProfile['securityChecks'], allowed: Set<string>, name: string) => {
      const seen = new Set<string>();
      for (const c of checks) {
        if (!allowed.has(c.criterion)) errors.push(`${file}: ${c.criterion} is not a ${name} rubric criterion`);
        if (seen.has(c.criterion)) errors.push(`${file}: ${c.criterion} appears more than once in ${name} checks`);
        seen.add(c.criterion);
      }
    };
    checkRubric(p.securityChecks, security, 'security');
    checkRubric(p.riskChecks, risk, 'risk');
  }
  return errors;
}
```

- [ ] **Step 4: Run the profile checks in the content gate**

In `packages/core/src/validate.ts`, add imports beside the existing exchange imports:

```ts
import { readExchangeProfiles, validateProfiles } from './profiles.ts';
```

and directly after the line `errors.push(...exchange.errors, ...validateExchange(exchange.records, catalog));` add:

```ts
  const profiles = await readExchangeProfiles(contentRoot);
  errors.push(...profiles.errors);
  if (profiles.profiles.length > 0) {
    let directoryIds = new Set<string>();
    try {
      const directory = JSON.parse(await readFile(join(contentRoot, '..', 'data', 'global-exchange.json'), 'utf8')) as { projects: { id: string }[] };
      directoryIds = new Set(directory.projects.map((p) => p.id));
    } catch {
      errors.push('exchange-profiles: cannot read data/global-exchange.json beside the content root');
    }
    errors.push(...validateProfiles(profiles.profiles, directoryIds));
  }
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test packages/core/test/profile-validate.test.mjs && bun run validate && bun run typecheck`
Expected: 7 pass, 0 fail; validate passes on real content (no profiles yet); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/profiles.ts packages/core/src/validate.ts packages/core/test/profile-validate.test.mjs
git commit -m "feat(core): validate exchange profiles in the content gate"
```

### Task 4: Evidence and passive security checks (pure functions)

**Files:**
- Create: `packages/core/src/profile-checks.ts`
- Test: `packages/core/test/profile-checks.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// packages/core/test/profile-checks.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { quotePresent, highlightUrl, evaluatePassive } from '../src/profile-checks.ts';

test('a quote matches across HTML tags, entities, markdown emphasis and line wraps', () => {
  const html = '<p>You add <strong>credits</strong> to your&nbsp;account,\n and Console keeps them.</p>';
  assert.equal(quotePresent(html, 'text/html', 'You add credits to your account, and Console keeps them.'), true);
  assert.equal(quotePresent('**Each IO Credit is equivalent to 1 USD**', 'text/markdown', 'Each IO Credit is equivalent to 1 USD'), true);
});

test('a quote that is not on the page, or only partly there, does not match', () => {
  assert.equal(quotePresent('<p>Fees are 2%.</p>', 'text/html', 'Fees are 3%.'), false);
  assert.equal(quotePresent('<p>Fees are</p>', 'text/html', 'Fees are 2%.'), false);
});

test('highlight links use a text fragment of the first words of the quote', () => {
  assert.equal(
    highlightUrl('https://docs.example/fees', 'Buyers pay a 2% fee on every lease, billed monthly in arrears.'),
    'https://docs.example/fees#:~:text=Buyers%20pay%20a%202%25%20fee%20on%20every%20lease%2C%20billed%20monthly',
  );
});

const now = new Date('2026-11-22T00:00:00Z');
const observation = (over = {}) => ({
  url: 'https://docs.example/',
  tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:docs.example'] },
  headers: { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff' },
  securityTxt: true,
  ...over,
});

test('passive evaluation passes a valid matching certificate, HSTS headers and security.txt', () => {
  assert.deepEqual(evaluatePassive(observation(), now), { 'https-certificate': 'pass', 'security-headers': 'pass', 'security-contact': 'pass' });
});

test('wildcard certificates match one label; expired or mismatched certificates fail', () => {
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:*.example'] } }), now)['https-certificate'], 'pass');
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2026-01-01T00:00:00Z', subjectAltNames: ['DNS:docs.example'] } }), now)['https-certificate'], 'fail');
  assert.equal(evaluatePassive(observation({ tls: { authorized: true, validTo: '2027-01-01T00:00:00Z', subjectAltNames: ['DNS:other.example'] } }), now)['https-certificate'], 'fail');
});

test('missing observations stay unknown; absent security.txt is unknown, not a fail', () => {
  const r = evaluatePassive(observation({ tls: null, headers: null, securityTxt: false }), now);
  assert.deepEqual(r, { 'https-certificate': 'unknown', 'security-headers': 'unknown', 'security-contact': 'unknown' });
});

test('HSTS without another baseline header fails the header check', () => {
  assert.equal(evaluatePassive(observation({ headers: { 'strict-transport-security': 'max-age=1' } }), now)['security-headers'], 'fail');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/profile-checks.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/profile-checks.ts
const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”' };

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\\([\\`*_{}[\]()#+\-.!$~])/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visible text of a fetched page: tags and scripts removed for HTML, markdown kept as text. */
export function pageText(body: string, contentType: string): string {
  if (!/html/i.test(contentType)) return body;
  return body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ');
}

/** True when the whole quote appears in the page after whitespace and formatting normalization. */
export function quotePresent(body: string, contentType: string, quote: string): boolean {
  return normalize(pageText(body, contentType)).includes(normalize(quote));
}

/** A link that opens the page and highlights the start of the quote (Chrome, Edge, Safari). */
export function highlightUrl(url: string, quote: string): string {
  const start = normalize(quote).split(' ').slice(0, 10).join(' ');
  return `${url.split('#')[0]}#:~:text=${encodeURIComponent(start).replace(/-/g, '%2D')}`;
}

export interface PassiveObservation {
  url: string;
  tls: { authorized: boolean; validTo: string; subjectAltNames: string[] } | null;
  headers: Record<string, string> | null;
  securityTxt: boolean | null;
}
export type PassiveOutcome = 'pass' | 'fail' | 'unknown';

function hostMatches(host: string, san: string): boolean {
  const name = san.replace(/^DNS:/, '').toLowerCase();
  if (name.startsWith('*.')) {
    const rest = host.slice(host.indexOf('.') + 1);
    return host.includes('.') && rest === name.slice(2);
  }
  return host === name;
}

/** Evaluates passive observations for three security criteria. Only collected evidence produces pass or fail. */
export function evaluatePassive(o: PassiveObservation, now: Date): Record<'https-certificate' | 'security-headers' | 'security-contact', PassiveOutcome> {
  const host = new URL(o.url).hostname.toLowerCase();
  const certificate: PassiveOutcome = o.tls === null ? 'unknown'
    : o.tls.authorized && new Date(o.tls.validTo) > now && o.tls.subjectAltNames.some((s) => hostMatches(host, s)) ? 'pass' : 'fail';
  const h = o.headers;
  const headers: PassiveOutcome = h === null ? 'unknown'
    : h['strict-transport-security'] && (h['content-security-policy'] || h['x-content-type-options']) ? 'pass' : 'fail';
  // A missing security.txt does not prove there is no disclosure policy; researchers decide that from the docs.
  const contact: PassiveOutcome = o.securityTxt === true ? 'pass' : 'unknown';
  return { 'https-certificate': certificate, 'security-headers': headers, 'security-contact': contact };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test packages/core/test/profile-checks.test.mjs`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/profile-checks.ts packages/core/test/profile-checks.test.mjs
git commit -m "feat(core): add evidence quote matching and passive security evaluation"
```

### Task 5: Profile page, feed and directory link

**Files:**
- Create: `apps/web/src/pages/global-exchange/[id].astro`, `apps/web/src/pages/data/exchange-profiles.json.ts`
- Modify: `apps/web/src/pages/global-exchange.astro` (card links), `apps/web/astro.config.mjs` (fixture cache isolation)
- Test: `apps/web/test/exchange-profiles-pages.test.mjs`

- [ ] **Step 1: Write the failing build test**

```js
// apps/web/test/exchange-profiles-pages.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { profile } from '../../../packages/core/test/fixtures/profile.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('published profiles render with scores and evidence; drafts never render', { timeout: 120_000 }, () => {
  const fixtures = mkdtempSync(join(tmpdir(), 'u4ai-profile-fixtures-'));
  const out = mkdtempSync(join(tmpdir(), 'u4ai-profile-site-'));
  try {
    mkdirSync(join(fixtures, 'exchange-profiles'));
    writeFileSync(join(fixtures, 'exchange-profiles', 'akash.json'), JSON.stringify(profile()));
    const draft = profile({ meta: { ...profile().meta, directoryId: 'vast-ai', status: 'draft' } });
    writeFileSync(join(fixtures, 'exchange-profiles', 'vast-ai.json'), JSON.stringify(draft));
    const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
      cwd: root, encoding: 'utf8', timeout: 110_000, env: { ...process.env, U4AI_PROFILES_DIR: fixtures },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

    const page = readFileSync(join(out, 'global-exchange', 'akash', 'index.html'), 'utf8');
    assert.match(page, /Security Score[\s\S]*?94[\s\S]*?grade A/);
    assert.match(page, /Risk Score[\s\S]*?33[\s\S]*?grade D/);
    assert.match(page, /Transaction Cost Score[\s\S]*?79[\s\S]*?grade C/);
    assert.match(page, /Rubric version 1/);
    assert.match(page, /not a judgement of the company/);
    assert.match(page, /informational, not legal advice/i);
    assert.match(page, /Not published/);
    assert.ok(page.includes('href="https://fixture.example/e2#:~:text='), 'facts link to highlighted evidence');
    assert.equal(existsSync(join(out, 'global-exchange', 'vast-ai', 'index.html')), false, 'drafts are not rendered');

    const directory = readFileSync(join(out, 'global-exchange', 'index.html'), 'utf8');
    const akashCard = directory.match(/data-project-id="akash"[\s\S]*?<\/article>/)[0];
    assert.ok(akashCard.includes('href="/global-exchange/akash"'));
    const vastCard = directory.match(/data-project-id="vast-ai"[\s\S]*?<\/article>/)[0];
    assert.doesNotMatch(vastCard, /Full profile/);

    const feed = JSON.parse(readFileSync(join(out, 'data', 'exchange-profiles.json'), 'utf8'));
    assert.equal(feed.untrusted, true);
    assert.deepEqual(feed.profiles.map((p) => p.id), ['akash']);
    assert.equal(feed.profiles[0].scores.security.score, 94);
    assert.equal(feed.profiles[0].scores.transactionCost.costPercent, 4.3);
    assert.equal(feed.profiles[0].scores.risk.grade, 'D');
  } finally {
    rmSync(fixtures, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `source scripts/agent/activate-node.sh && bun test apps/web/test/exchange-profiles-pages.test.mjs`
Expected: FAIL — `global-exchange/akash/index.html` does not exist.

- [ ] **Step 3: Isolate fixture builds**

In `apps/web/astro.config.mjs`, the fixture cache is chosen by a ternary (`U4AI_EXCHANGE_DIR ? … : process.env.U4AI_EVALS_DIR ? { cacheDir: './node_modules/.astro-fixtures' } : {}`). Change its last branch so profile fixture builds use the same isolated cache:

```js
    : (process.env.U4AI_EVALS_DIR || process.env.U4AI_PROFILES_DIR) ? { cacheDir: './node_modules/.astro-fixtures' } : {}),
```

- [ ] **Step 4: Write the profile page**

```astro
---
// apps/web/src/pages/global-exchange/[id].astro
import Base from '../../layouts/Base.astro';
import { readExchangeProfiles } from '@unite4ai/core/profiles';
import { riskScore, securityScore, transactionCostScore } from '@unite4ai/core/profile-scores';
import { highlightUrl } from '@unite4ai/core/profile-checks';
import directory from '../../data/global-exchange.json';

export async function getStaticPaths() {
  const { profiles, errors } = await readExchangeProfiles(process.env.U4AI_PROFILES_DIR || './src/content');
  if (errors.length) throw new Error(errors.join('\n'));
  return profiles.filter((p) => p.data.meta.status === 'published').map((p) => ({ params: { id: p.id }, props: { profile: p.data } }));
}

const { profile } = Astro.props;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';
const entry = directory.projects.find((p) => p.id === profile.meta.directoryId)!;
const evidence = new Map(profile.evidence.map((e) => [e.id, e]));
const link = (id: string) => { const e = evidence.get(id)!; return highlightUrl(e.url, e.quote); };
const scores = [
  { name: 'Security Score', note: 'Higher means more protective practices are evidenced.', s: securityScore(profile) },
  { name: 'Risk Score', note: 'Higher means more risk indicators are present.', s: riskScore(profile) },
];
const cost = transactionCostScore(profile);
const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const factRows = (section: Record<string, any>) => Object.entries(section).map(([k, f]) => ({ k: label(k), f }));
---
<Base title={`${entry.name} profile`} description={`Researched profile of ${entry.name}: identity, legal facts, usage, prices, costs and rubric scores.`}>
  <section class="wrap section">
    <p><a href={href('/global-exchange')}>Back to the Global Exchange</a></p>
    <h1>{entry.name}</h1>
    <p>Researched {profile.meta.researchedAt}; reviewed by {profile.meta.reviewedBy} on {profile.meta.reviewedAt}.
      {profile.meta.agent && <>Drafted by {profile.meta.agent.model} via {profile.meta.agent.harness}.</>}</p>
    <p>Profiles describe public documentation and data at the stated dates. Reported figures are not verified by Unite4AI.</p>
  </section>

  <section class="wrap section" aria-labelledby="scores">
    <h2 id="scores">Scores</h2>
    <p>Rubric version {scores[0].s.rubricVersion}. A rubric score, not a judgement of the company's conduct.</p>
    <p>Letters: A 90+, B 80–89, C 70–79, D 50–69, F below 50. The Risk letter grades 100 − Risk Score, so A always means fewest risk indicators.</p>
    {scores.map(({ name, note, s }) => (
      <article class="card">
        <h3>{name}: {s.score === null ? `insufficient evidence (${Math.round(s.coverage * 100)}% coverage)` : `${s.score} (grade ${s.grade})`}</h3>
        <p>{note} Evidence coverage {Math.round(s.coverage * 100)}%.</p>
        <ul>{s.breakdown.map((b) => (
          <li>{b.label} ({b.weight}): {b.outcome}{b.evidence.map((id) => <> <a href={link(id)} rel="nofollow noopener">[{id}]</a></>)}</li>
        ))}</ul>
      </article>
    ))}
    <article class="card">
      <h3>Transaction Cost Score: {cost.score === null ? 'not computable' : `${cost.score} (grade ${cost.grade})`}</h3>
      <p>Higher means cheaper; compare within the same directory category only. Reference: a USD 100 purchase and, where applicable, a USD 100 seller payout.</p>
      {cost.costPercent !== null && <p>Effective cost {cost.costPercent}% excluding {cost.excluded.join(', ') || 'nothing'}.</p>}
      {cost.notComputable.length > 0 && <ul>{cost.notComputable.map((r) => <li>{r}</li>)}</ul>}
    </article>
  </section>

  {[
    { id: 'identity', title: 'Identity', rows: factRows(profile.identity) },
    { id: 'legal', title: 'Legal jurisdiction (informational, not legal advice)', rows: factRows(profile.legal) },
    { id: 'market', title: 'Reported market data', rows: factRows(profile.marketData) },
  ].map((section) => (
    <section class="wrap section" aria-labelledby={section.id}>
      <h2 id={section.id}>{section.title}</h2>
      <dl>{section.rows.map(({ k, f }) => (
        <><dt>{k}</dt><dd>{f.value === null ? 'Not published' : <>{String(f.value)} <small>({f.level})</small>{f.evidence.map((id: string) => <> <a href={link(id)} rel="nofollow noopener">[{id}]</a></>)}</>}</dd></>
      ))}</dl>
    </section>
  ))}

  <section class="wrap section" aria-labelledby="usage">
    <h2 id="usage">Usage</h2>
    <dl>{factRows(profile.usage).map(({ k, f }) => (
      <><dt>{k}</dt><dd>{f.value === null ? 'Not published' : <>{f.value.toLocaleString('en-US')} {f.unit}, {f.window.start} to {f.window.end} <small>({f.level})</small>{f.evidence.map((id: string) => <> <a href={link(id)} rel="nofollow noopener">[{id}]</a></>)}</>}</dd></>
    ))}</dl>
  </section>

  <section class="wrap section" aria-labelledby="prices">
    <h2 id="prices">Price quotes</h2>
    {profile.priceQuotes.length === 0 ? <p>Not published.</p> : (
      <table><thead><tr><th>Workload</th><th>Statistic</th><th>Amount</th><th>Sample</th><th>Date</th><th>Evidence</th></tr></thead>
        <tbody>{profile.priceQuotes.map((q) => (
          <tr><td>{q.workload}</td><td>{q.statistic}</td><td>{q.amount} {q.currency} per {q.per}</td><td>{q.sampleSize ?? '—'}</td><td>{q.sampledAt}</td>
            <td>{q.evidence.map((id) => <a href={link(id)} rel="nofollow noopener">[{id}]</a>)}</td></tr>
        ))}</tbody></table>
    )}
  </section>

  <section class="wrap section" aria-labelledby="costs">
    <h2 id="costs">Transaction cost components</h2>
    <ul>{profile.costComponents.map((c) => (
      <li>{c.kind} ({c.appliesTo}, {c.scope}): {c.amount === null ? 'amount not published' : c.basis === 'percent' ? `${c.amount}%` : `${c.amount} ${c.currency}${c.basis === 'per-unit' ? ' per unit' : ''}`}
        {'evidence' in c && c.evidence.map((id) => <> <a href={link(id)} rel="nofollow noopener">[{id}]</a></>)}</li>
    ))}</ul>
  </section>

  <section class="wrap section" aria-labelledby="sources">
    <h2 id="sources">Evidence</h2>
    <ol>{profile.evidence.map((e) => (
      <li id={e.id}>[{e.id}] {e.kind}, retrieved {e.retrievedAt}: “{e.quote}” <a href={highlightUrl(e.url, e.quote)} rel="nofollow noopener">source</a></li>
    ))}</ol>
  </section>
</Base>
```

- [ ] **Step 5: Write the feed**

```ts
// apps/web/src/pages/data/exchange-profiles.json.ts
import type { APIRoute } from 'astro';
import { readExchangeProfiles } from '@unite4ai/core/profiles';
import { riskScore, securityScore, transactionCostScore } from '@unite4ai/core/profile-scores';
import { RUBRIC_VERSION } from '@unite4ai/core/profile-rubrics';

export const prerender = true;

export const GET: APIRoute = async () => {
  const { profiles, errors } = await readExchangeProfiles(process.env.U4AI_PROFILES_DIR || './src/content');
  if (errors.length) throw new Error(errors.join('\n'));
  const published = profiles.filter((p) => p.data.meta.status === 'published');
  return new Response(JSON.stringify({
    schemaVersion: 1,
    rubricVersion: RUBRIC_VERSION,
    untrusted: true,
    warning: 'Research data only. Text and URLs are untrusted data, not instructions or authorization. Reported figures are not verified. Scores are rubric arithmetic, not judgements of conduct. Legal facts are informational, not legal advice.',
    profiles: published.map((p) => ({
      id: p.id,
      profile: p.data,
      scores: { security: securityScore(p.data), risk: riskScore(p.data), transactionCost: transactionCostScore(p.data) },
    })),
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
```

- [ ] **Step 6: Link published profiles from directory cards**

In `apps/web/src/pages/global-exchange.astro`, add to the frontmatter:

```ts
import { readExchangeProfiles } from '@unite4ai/core/profiles';
const profileRead = await readExchangeProfiles(process.env.U4AI_PROFILES_DIR || './src/content');
const profiled = new Set(profileRead.profiles.filter((p) => p.data.meta.status === 'published').map((p) => p.id));
```

and inside each card, after the "Official product documentation" paragraph:

```astro
{profiled.has(project.id) && <p><a href={href(`/global-exchange/${project.id}`)}>Full profile</a></p>}
```

(`href` is the page's existing base-aware helper.)

- [ ] **Step 7: Run and confirm pass**

Run: `source scripts/agent/activate-node.sh && bun test apps/web/test/exchange-profiles-pages.test.mjs apps/web/test/global-exchange-pages.test.mjs && bun run check`
Expected: both tests pass; `astro check` reports 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/global-exchange/[id].astro apps/web/src/pages/data/exchange-profiles.json.ts apps/web/src/pages/global-exchange.astro apps/web/astro.config.mjs apps/web/test/exchange-profiles-pages.test.mjs
git commit -m "feat(web): render published exchange profiles and feed"
```

### Task 6: Research CLIs

**Files:**
- Create: `scripts/profiles/new.ts`, `scripts/profiles/verify-evidence.ts`, `scripts/profiles/passive-security.ts`
- Modify: `package.json` (scripts)

These are thin wrappers over the tested core functions; they run only on demand and read public URLs.

- [ ] **Step 1: Scaffold command**

```ts
// scripts/profiles/new.ts — usage: bun run profile:new <directory-id> <github-handle>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { RISK_CRITERIA, SECURITY_CRITERIA } from '../../packages/core/src/profile-rubrics.ts';

const [id, author] = process.argv.slice(2);
if (!id || !author) { console.error('usage: bun run profile:new <directory-id> <github-handle>'); process.exit(2); }
const directory = JSON.parse(readFileSync('apps/web/src/data/global-exchange.json', 'utf8'));
const entry = directory.projects.find((p: { id: string }) => p.id === id);
if (!entry) { console.error(`${id} is not in the Global Exchange directory`); process.exit(2); }
const path = `apps/web/src/content/exchange-profiles/${id}.json`;
if (existsSync(path)) { console.error(`${path} exists; edit it instead`); process.exit(2); }
const today = new Date().toISOString().slice(0, 10);
const none = { value: null, level: 'not-published', searched: [entry.source] };
const facts = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, none]));
const draft = {
  meta: { schemaVersion: 1, directoryId: id, researchedAt: today, author, status: 'draft' },
  identity: facts(['officialUrl', 'operatingEntity', 'headquarters', 'formedOn']),
  legal: facts(['registeredJurisdiction', 'governingLaw', 'licenses', 'restrictedJurisdictions', 'sanctionsScreening', 'kycRequired']),
  marketData: facts(['tokenSymbol', 'marketCapUsd', 'tokenPriceUsd']),
  usage: facts(['weeklyActiveUsers', 'volume', 'traders']),
  priceQuotes: [], costComponents: [],
  securityChecks: SECURITY_CRITERIA.map((c) => ({ criterion: c.id, outcome: 'unknown', evidence: [] })),
  riskChecks: RISK_CRITERIA.map((c) => ({ criterion: c.id, outcome: 'unknown', evidence: [] })),
  evidence: [],
};
writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
console.log(`wrote ${path} (draft; every value not-published until researched)`);
```

- [ ] **Step 2: Evidence verifier**

```ts
// scripts/profiles/verify-evidence.ts — usage: bun run profile:verify <directory-id>
// Refetches every evidence URL and confirms its quote is on the page. Network, on demand only.
import { readFileSync } from 'node:fs';
import { quotePresent } from '../../packages/core/src/profile-checks.ts';

const id = process.argv[2];
if (!id) { console.error('usage: bun run profile:verify <directory-id>'); process.exit(2); }
const profile = JSON.parse(readFileSync(`apps/web/src/content/exchange-profiles/${id}.json`, 'utf8'));
let failed = 0;
for (const e of profile.evidence) {
  let status: string;
  try {
    const res = await fetch(e.url, { headers: { accept: 'text/markdown, text/html;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    status = !res.ok ? `http ${res.status}` : quotePresent(await res.text(), res.headers.get('content-type') ?? '', e.quote) ? 'ok' : 'quote missing';
  } catch (error) {
    status = `unreachable (${(error as Error).message})`;
  }
  if (status !== 'ok') failed++;
  console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${e.id} ${e.url} ${status === 'ok' ? '' : status}`);
  await new Promise((r) => setTimeout(r, 500)); // be polite to public endpoints
}
console.log(JSON.stringify({ id, evidence: profile.evidence.length, failed }));
process.exit(failed ? 1 : 0);
```

Note: pages that render text with JavaScript may report "quote missing"; record such evidence for manual confirmation in the review step rather than weakening the check.

- [ ] **Step 3: Passive security collector**

```ts
// scripts/profiles/passive-security.ts — usage: bun run profile:passive <https-url>
// Reads a public certificate, response headers and /.well-known/security.txt. No scanning or probing.
import { connect } from 'node:tls';
import { evaluatePassive, type PassiveObservation } from '../../packages/core/src/profile-checks.ts';

const url = process.argv[2];
if (!url?.startsWith('https://')) { console.error('usage: bun run profile:passive <https-url>'); process.exit(2); }
const host = new URL(url).hostname;

const tls = await new Promise<PassiveObservation['tls']>((resolve) => {
  const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 }, () => {
    const cert = socket.getPeerCertificate();
    resolve({ authorized: socket.authorized, validTo: new Date(cert.valid_to).toISOString(), subjectAltNames: (cert.subjectaltname ?? '').split(', ').filter(Boolean) });
    socket.end();
  });
  socket.on('error', () => resolve(null));
  socket.on('timeout', () => { socket.destroy(); resolve(null); });
});

let headers: Record<string, string> | null = null;
try {
  const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
} catch { headers = null; }

let securityTxt: boolean | null = null;
try {
  const res = await fetch(new URL('/.well-known/security.txt', url), { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  securityTxt = res.ok && /contact:/i.test(await res.text());
} catch { securityTxt = null; }

const observation: PassiveObservation = { url, tls, headers, securityTxt };
const observedAt = new Date().toISOString();
console.log(JSON.stringify({ observedAt, observation, outcomes: evaluatePassive(observation, new Date(observedAt)) }, null, 2));
```

- [ ] **Step 4: Add scripts**

In root `package.json` `scripts`, add:

```json
    "profile:new": "bun scripts/profiles/new.ts",
    "profile:verify": "bun scripts/profiles/verify-evidence.ts",
    "profile:passive": "bun scripts/profiles/passive-security.ts",
```

- [ ] **Step 5: Smoke-test the scaffold offline**

Run: `bun run profile:new akash <your-handle> && bun run validate && rm apps/web/src/content/exchange-profiles/akash.json`
Expected: the draft is written and `validate` passes (a fresh draft is valid: every value `not-published`, every check `unknown`, and drafts are never rendered).

- [ ] **Step 6: Commit**

```bash
git add scripts/profiles package.json
git commit -m "feat(scripts): add exchange profile research commands"
```

### Task 7: Research protocol and contributor rules

**Files:**
- Create: `docs/exchange-profiles/research-protocol.md`
- Modify: `CONTRIBUTING.md` (Global Exchange section)

- [ ] **Step 1: Write the research protocol**

Create `docs/exchange-profiles/research-protocol.md` with exactly these sections:

````markdown
# Exchange profile research protocol

Run by a maintainer's agent session. Public, passive sources only: official docs, terms of
service, company registries, regulator databases, block explorers, certificate/DNS records,
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
values close to the source's own words; do not characterise.

- **Identity & Legal:** official URL; operating entity; headquarters; date of formation
  (registry first, then official "about"/terms); registered jurisdiction; governing law clause
  in the terms of service; licenses held (regulator registers only); restricted jurisdictions
  stated in terms; sanctions screening and KYC statements. Levels: own docs/terms = `stated`,
  registries/regulators = `reported`.
- **Usage & Market:** average weekly active users, transaction/trading volume, number of
  traders/buyers — only where the operator, an official dashboard or a named aggregator
  publishes them, with exact unit and window. Token symbol, market cap (USD) and token price
  (USD) from a named free aggregator, level `reported`, with the retrieval timestamp. Projects
  without a token: all three `not-published`. Never compute, sum or convert.
- **Prices & Costs:** quotes for the reference workloads in `packages/core/src/profile-rubrics.ts`,
  in their own currency and unit, with statistic and sample size; public offer listings or
  price pages only. Fee components: platform fee, take rate, payment processor, facilitator,
  network gas, withdrawal, minimum charge — basis, amount, currency, who pays, scope. A fee that
  exists but whose amount is unpublished is recorded with `amount: null`.
- **Security & Risk:** one outcome per rubric criterion with evidence. Run
  `bun run profile:passive <official-url>`; record its certificate/header/security.txt results
  as evidence kinds `certificate`/`dns`. Audits and bounties from official pages or the
  auditor's site; incidents from the operator's post-mortems or regulator sources; regulatory
  action from regulator sites only. Use `unknown` when evidence is not found.

Each agent's brief must include: the directory entry, the design and this protocol, its
section list and evidence-id block, the literal-sourcing rule, and "report gaps; never guess".

## 3. Deterministic checks
`bun run validate` (schema and cross-references) and `bun run profile:verify <id>` (every
quote still on its page). Fix or remove failing evidence; JavaScript-rendered pages may need a
manual confirmation note for the review.

## 4. Independent literal review
Dispatch one reviewer agent with only the profile and the evidence URLs. It fails any value
whose quote does not state it, any characterisation not in the source, any computed or
converted number, and any market data not marked `reported`. Apply its fixes; rerun step 3.

## 5. Owner review
Present each section to the owner with values, quotes and highlight links; the owner accepts,
edits or marks values `not-published`. On approval set `status: "published"`, `reviewedBy`
and `reviewedAt`, and record the agent model and harness in `meta.agent`. Open a pull request.

## 6. Refresh
Repeat steps 2–5 on the existing record; replace values and evidence; update `researchedAt`
and the review fields. Rubric changes bump `RUBRIC_VERSION` in code; records are not edited for them.
````

- [ ] **Step 2: Add contributor rules and the correction process**

Append to the "Global Exchange directory records" section of `CONTRIBUTING.md`:

```markdown
### Exchange profiles

Profiles live in `apps/web/src/content/exchange-profiles/<directory-id>.json` and follow
`docs/exchange-profiles/research-protocol.md`. Every value cites a verbatim quote from a
public source; missing values are `not-published`, never estimated. Market data is
`reported` from a named source with its date. Scores are computed from the rubric in
`packages/core/src/profile-rubrics.ts` and are never written into records. Only profiles
with `status: "published"` and an owner review are rendered.

**Corrections from operators or anyone else:** open an issue or pull request naming the
profile, the value, and a public source that states the correct value. A maintainer
re-verifies the source and updates the record within the normal review cycle. Scores
change only through record changes or a new rubric version.
```

- [ ] **Step 3: Commit**

```bash
git add docs/exchange-profiles/research-protocol.md CONTRIBUTING.md
git commit -m "docs: add exchange profile research protocol and correction process"
```

- [ ] **Step 4: Gate and pull request for Tasks 1–7**

Run: `source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs --only hub`
Expected: final JSON `{"status":"pass",...}`. Open a PR "Add exchange profile records, scores and research tooling"; quote the JSON line. Do not merge without owner review.

### Task 8: Pilot — Akash, Olas, x402 (gated on owner review)

**Prerequisite:** Tasks 1–7 merged.

- [ ] **Step 1:** For each of `akash`, `olas`, `x402`, run protocol steps 1–4 (scaffold, four agents, deterministic checks, literal review). Run the three profiles in parallel; each agent edits only its own profile's sections.
- [ ] **Step 2:** Record per profile: how many values are filled vs `not-published`, score coverage, evidence failures fixed, and research time. These numbers decide whether the template needs changes.
- [ ] **Step 3: Owner review.** Present each profile section by section (protocol step 5). Collect template feedback separately from value corrections.
- [ ] **Step 4: Template decision.** If the owner changes fields, criteria, weights or workloads, update the design, schema or `RUBRIC_VERSION` in a separate PR before Task 9.
- [ ] **Step 5:** Run `bun run validate`, `bun run profile:verify <id>` for all three and the hub gate. Open a PR "Publish pilot exchange profiles: Akash, Olas, x402" with the gate JSON and the Step 2 numbers.

### Task 9: Remaining 17 profiles

**Prerequisite:** Task 8 merged and the template decision recorded.

- [ ] **Step 1:** Batch the 17 remaining directory ids by category: compute (io-net, golem, vast-ai, render), agent services (virtuals-acp, singularitynet, fetch-ai, bittensor), agent payments (ap2, nevermined, skyfire, payman), payment and DeFi rails (request, superfluid, sablier, cow, uniswap).
- [ ] **Step 2:** For each batch, run protocol steps 1–4 with one four-agent team per profile; then owner review per profile (protocol step 5).
- [ ] **Step 3:** One PR per batch, each with `bun run validate`, `profile:verify` for every profile in the batch, and the hub gate JSON.
- [ ] **Step 4:** After the last batch, add a short "Profiles" section to `README.md` naming the route, the feed and the protocol.

### Task 10: Kali in-scope active testing (gated)

**Status 2026-11-22:** Step 7 (eligibility) was run first. Result: 0 eligible, 9 not eligible, 11 with no programme (`research_notes/exchange-profiles/scan-eligibility.md`). Steps 1–6 and 8–9 are deferred until a programme explicitly permits automated testing; do not build the runner before then. Re-run Step 7 on refresh. Owner to confirm two rows the agent could not read: Coinbase HackerOne policy (x402) and Golem's Sherlock rules.

**Prerequisites:** Tasks 1–7 merged. Kali's SSH route is working (Step 1). For each programme, the owner has personally registered and accepted its terms. Can run in parallel with Tasks 8–9.

**Files:**
- Modify: `packages/schema/src/index.ts` (append), `packages/core/package.json` (export `"./scan-scope": "./src/scan-scope.ts"`), `package.json` (script)
- Create: `packages/core/src/scan-scope.ts`, `packages/core/test/scan-scope.test.mjs`, `scripts/profiles/kali-scan.ts`, `research_notes/exchange-profiles/scan-eligibility.md`, `research_notes/exchange-profiles/scan-scopes/<id>.json`

- [ ] **Step 1: Make Kali reachable (owner, then agent)**

As of 2026-11-22, `nc -z kali.tailbc2bfe.ts.net 22` was closed. The owner runs this on kali: `sudo tailscale file get /tmp && sudo bash /tmp/kali-bootstrap.sh`. The agent then follows the `ssh-host-control` skill: check the port, compare the host-key fingerprint with the one shown on kali's screen, pin it, and run the identity check (expect `kali`, `kali`, `Linux x86_64`). Then the tool preflight:

```bash
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 kali 'for t in testssl.sh nmap nuclei; do printf "%s: " $t; command -v $t || echo missing; done'
```

Missing tools are installed by the owner (`sudo apt install testssl.sh nmap nuclei`). Agents never use sudo on kali. Any authentication or host-key failure is stop-and-report.

- [ ] **Step 2: Write the failing scope tests**

```js
// packages/core/test/scan-scope.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { scanScopeSchema } from '@unite4ai/schema';
import { checkScanRun } from '../src/scan-scope.ts';

// FIXTURE ONLY — invented programme.
const scope = (over = {}) => ({
  directoryId: 'olas', programUrl: 'https://bounty.example/olas', platform: 'Example Bounty',
  automatedTestingQuote: 'Automated scanning of in-scope web assets is permitted at up to 5 requests per second.',
  inScope: ['*.fixture.example', 'app.other.example'], outOfScope: ['status.fixture.example'],
  allowedTools: ['testssl', 'nuclei-safe'], maxRequestsPerSecond: 5,
  requiredHeader: { name: 'X-Bug-Bounty', value: 'fixture-owner' },
  acceptedBy: 'fixture-owner', acceptedAt: '2026-11-20', expiresAt: '2026-12-15', ...over,
});
const run = (over = {}) => checkScanRun(scanScopeSchema.parse(scope(over.scope)), over.tool ?? 'testssl', over.targets ?? ['api.fixture.example'], over.today ?? '2026-11-22');

test('an in-scope host with an allowed tool inside the scope window is allowed', () => {
  assert.deepEqual(run(), { allowed: ['api.fixture.example'], refused: [] });
});

test('wildcards cover subdomains but not the bare domain; exact entries match only themselves', () => {
  const r = run({ targets: ['a.b.fixture.example', 'fixture.example', 'app.other.example', 'x.other.example'] });
  assert.deepEqual(r.allowed, ['a.b.fixture.example', 'app.other.example']);
  assert.deepEqual(r.refused.map((x) => x.target), ['fixture.example', 'x.other.example']);
});

test('out-of-scope wins over a matching wildcard', () => {
  assert.match(run({ targets: ['status.fixture.example'] }).refused[0].reason, /out of scope/);
});

test('a tool the programme does not allow refuses every host', () => {
  const r = run({ tool: 'nmap-top100-connect' });
  assert.deepEqual(r.allowed, []);
  assert.match(r.refused[0].reason, /tool/);
});

test('an expired scope, or one valid for more than 30 days, refuses to run', () => {
  assert.match(run({ today: '2026-12-16' }).refused[0].reason, /expired/);
  assert.match(run({ scope: { expiresAt: '2027-01-30' } }).refused[0].reason, /30 days/);
});

test('targets must be bare hostnames, never URLs, IP ranges or shell text', () => {
  const r = run({ targets: ['https://api.fixture.example', '10.0.0.0/8', 'api.fixture.example;id'] });
  assert.equal(r.allowed.length, 0);
  assert.equal(r.refused.length, 3);
});

test('the schema caps the rate at 10 per second and requires the permission quote', () => {
  assert.equal(scanScopeSchema.safeParse(scope({ maxRequestsPerSecond: 50 })).success, false);
  const { automatedTestingQuote, ...noQuote } = scope();
  assert.equal(scanScopeSchema.safeParse(noQuote).success, false);
});
```

Run: `bun test packages/core/test/scan-scope.test.mjs`
Expected: FAIL — `scanScopeSchema` is not exported.

- [ ] **Step 3: Append the scope schema**

Append to `packages/schema/src/index.ts`:

```ts
// ── Kali in-scope scan records (exchange profiles design, "Active testing from Kali") ──

export const SCAN_TOOLS = ['testssl', 'nmap-top100-connect', 'nuclei-safe'] as const;
export const SCAN_HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const scanHostPattern = z.string().refine((v) => SCAN_HOST.test(v.startsWith('*.') ? v.slice(2) : v), 'must be a hostname or *.hostname');

export const scanScopeSchema = z.strictObject({
  directoryId: contentId,
  programUrl: httpsUrl,
  platform: exchangeText(60, true),
  /** Verbatim programme text that explicitly permits automated testing. */
  automatedTestingQuote: exchangeText(500),
  inScope: z.array(scanHostPattern).min(1),
  outOfScope: z.array(scanHostPattern),
  allowedTools: z.array(z.enum(SCAN_TOOLS)).min(1),
  maxRequestsPerSecond: z.number().positive().max(10),
  requiredHeader: z.strictObject({
    name: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    value: z.string().regex(/^[A-Za-z0-9._@:+=/-]{1,128}$/),
  }).optional(),
  /** The owner who personally registered with the programme and accepted its terms. */
  acceptedBy: exchangeIdentity,
  acceptedAt: exchangeDate,
  expiresAt: exchangeDate,
});
export type ScanScope = z.infer<typeof scanScopeSchema>;
```

- [ ] **Step 4: Implement the scope decision**

```ts
// packages/core/src/scan-scope.ts
import { SCAN_HOST, type ScanScope } from '@unite4ai/schema';

const DAY = 86_400_000;
const covers = (pattern: string, host: string) => (pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern);

export interface ScanDecision { allowed: string[]; refused: { target: string; reason: string }[] }

/** Which hosts a Kali run may touch with `tool` today. Any scope-level problem refuses every host. */
export function checkScanRun(scope: ScanScope, tool: string, targets: string[], today: string): ScanDecision {
  const window = Date.parse(`${scope.expiresAt}T00:00:00Z`) - Date.parse(`${scope.acceptedAt}T00:00:00Z`);
  const blocker = today > scope.expiresAt ? `scope expired on ${scope.expiresAt}; re-read the programme rules`
    : window < 0 || window > 30 * DAY ? 'scope must expire within 30 days of acceptance'
    : today < scope.acceptedAt ? 'scope is not yet accepted'
    : !(scope.allowedTools as readonly string[]).includes(tool) ? `tool ${tool} is not allowed by this programme`
    : null;
  const decision: ScanDecision = { allowed: [], refused: [] };
  for (const target of targets) {
    if (blocker) decision.refused.push({ target, reason: blocker });
    else if (!SCAN_HOST.test(target)) decision.refused.push({ target, reason: 'not a bare hostname' });
    else if (scope.outOfScope.some((p) => covers(p, target))) decision.refused.push({ target, reason: 'out of scope' });
    else if (!scope.inScope.some((p) => covers(p, target))) decision.refused.push({ target, reason: 'not listed in scope' });
    else decision.allowed.push(target);
  }
  return decision;
}
```

Run: `bun test packages/core/test/scan-scope.test.mjs && bun run typecheck`
Expected: 7 pass, 0 fail; typecheck exits 0.

- [ ] **Step 5: Write the runner**

```ts
// scripts/profiles/kali-scan.ts — usage: bun run profile:scan <scope.json> <tool> <host...>
// Runs only what checkScanRun allows, on kali, and stores output privately on m5. Never writes into the repository.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { scanScopeSchema } from '../../packages/schema/src/index.ts';
import { checkScanRun } from '../../packages/core/src/scan-scope.ts';

const [scopePath, tool, ...targets] = process.argv.slice(2);
if (!scopePath || !tool || targets.length === 0) { console.error('usage: bun run profile:scan <scope.json> <tool> <host...>'); process.exit(2); }
const raw = readFileSync(scopePath);
const scope = scanScopeSchema.parse(JSON.parse(raw.toString('utf8')));
const decision = checkScanRun(scope, tool, targets, new Date().toISOString().slice(0, 10));
if (decision.refused.length > 0) {
  for (const r of decision.refused) console.error(`refused ${r.target}: ${r.reason}`);
  process.exit(2);
}

const ssh = (command: string) => spawnSync('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', 'kali', command],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 3_600_000 });
const identity = ssh('hostname; whoami; uname -sm');
if (identity.status !== 0 || identity.stdout.trim() !== 'kali\nkali\nLinux x86_64') {
  console.error(`kali identity check failed; stopping.\n${identity.stdout}${identity.stderr}`);
  process.exit(2);
}

// Hosts and header values are validated by the schema to contain no shell metacharacters.
const rps = scope.maxRequestsPerSecond;
const header = scope.requiredHeader ? `${scope.requiredHeader.name}: ${scope.requiredHeader.value}` : null;
const command = (host: string): string => {
  switch (tool) {
    case 'testssl': return `testssl.sh --quiet --sneaky --color 0 --warnings off${header ? ` --reqheader '${header}'` : ''} https://${host}`;
    case 'nmap-top100-connect': return `nmap -sT -Pn --top-ports 100 -T2 --max-rate ${rps} ${host}`;
    case 'nuclei-safe': return `nuclei -u https://${host} -rl ${rps} -c 1 -etags dos,intrusive,fuzz,bruteforce -duc -silent -jsonl${header ? ` -H '${header}'` : ''}`;
    default: throw new Error(`unknown tool ${tool}`);
  }
};

const outDir = join(homedir(), 'unite4ai-private', 'scans', scope.directoryId, new Date().toISOString().replace(/[:.]/g, '-'));
if (resolve(outDir).startsWith(resolve(process.cwd()))) { console.error('refusing to write scan output inside the repository'); process.exit(2); }
mkdirSync(outDir, { recursive: true, mode: 0o700 });
const scopeSha256 = createHash('sha256').update(raw).digest('hex');
for (const host of decision.allowed) {
  const started = new Date().toISOString();
  const result = ssh(command(host));
  const file = join(outDir, `${tool}-${host}.txt`);
  writeFileSync(file, `${result.stdout}\n--- stderr ---\n${result.stderr}`, { mode: 0o600 });
  appendFileSync(join(outDir, 'runs.jsonl'), `${JSON.stringify({ host, tool, scopeSha256, started, finished: new Date().toISOString(), exit: result.status })}\n`, { mode: 0o600 });
  console.log(`${host}: exit ${result.status} -> ${file}`);
}
console.log('Output is private. Triage it and report findings only through the programme; never commit or publish it.');
```

In root `package.json` `scripts`, add `"profile:scan": "bun scripts/profiles/kali-scan.ts",`.

Offline check: `bun run profile:scan /dev/null testssl example.com` must exit with a schema error before any SSH call.

- [ ] **Step 6: Commit the tooling**

```bash
git add packages/schema/src/index.ts packages/core/src/scan-scope.ts packages/core/package.json packages/core/test/scan-scope.test.mjs scripts/profiles/kali-scan.ts package.json
git commit -m "feat(scripts): add scope-checked Kali scan runner"
```

- [ ] **Step 7: Eligibility research (agent, public reads only)**

For each of the 20 directory ids, find any bug-bounty or disclosure programme (the operator's security page, HackerOne, Bugcrowd, Immunefi, Cantina). Quote the rule that **permits or forbids** automated testing of web assets. Write `research_notes/exchange-profiles/scan-eligibility.md` with one row per project: programme URL, quote, eligible yes/no, in-scope hosts. Where a programme does not say, mark the project ineligible. Commit the note; it contains public programme text only.

- [ ] **Step 8: Owner acceptance and scope records**

For each eligible project, the owner registers with the programme, reads and accepts its terms, and approves a scope record at `research_notes/exchange-profiles/scan-scopes/<id>.json` with `acceptedBy` set to themselves and `expiresAt` at most 30 days later. An agent may draft the record, but only the owner sets `acceptedBy`. If no project is eligible, record that in the eligibility note and stop this task.

- [ ] **Step 9: Run, triage, report privately**

Run `bun run profile:scan research_notes/exchange-profiles/scan-scopes/<id>.json <tool> <host...>` once per allowed tool. The owner triages the private output in `~/unite4ai-private/scans/` and reports findings only through the programme. Nothing from the output goes into the repository, profiles or site. A finding may be cited in a profile only after the programme publishes it, and only as `incident-handling` evidence.

## Validation

- [ ] Schema, score, validation and check tests pass (`bun test packages/core/test`).
- [ ] The page/feed fixture build test passes; drafts never render; every fact links to highlighted evidence.
- [ ] Scores are withheld below 70% coverage; cost is "not computable" rather than converted.
- [ ] Every published profile passes `profile:verify` and an independent literal review and has `reviewedBy`.
- [ ] No paid source, scheduled job, CI network access, purchase or sign-up is introduced by agents. Active testing runs only through `profile:scan` with an unexpired, owner-accepted scope, and no scan output is committed or published.
- [ ] Letter grades follow A 90+, B 80–89, C 70–79, D 50–69, F below 50; the Risk letter uses 100 − score.
- [ ] The hub gate passes on every PR.

## Risks / unknowns

- **Numeric scores read as ratings.** Published rubric, per-criterion breakdown, coverage, disclaimer and correction process; no overall score. Revisit wording with the owner during the pilot.
- **Coverage may be low** for private companies (Vast.ai, Skyfire, Payman): many scores may be withheld. That is the honest outcome; do not loosen thresholds to fill pages.
- **JavaScript-rendered pages** defeat the evidence verifier; such evidence needs manual confirmation in the review.
- **Aggregator terms and rate limits** for market data may change; name the source per value and back off politely.
- **Kali scanning may have no eligible targets.** Many programmes forbid automated testing or limit it to contracts. Task 10 records that outcome rather than working around it.
- **Tool behaviour drifts.** `testssl.sh` and `nuclei` flags can change between Kali releases; the Step 1 preflight should also print versions, and the owner confirms the command templates before the first run.
- **Usage metrics overlap Observed Markets.** When an observation exists for an entry, cite it as `observed` evidence instead of re-measuring.

## Notes

Scores in the fixture-based tests come from invented fixture data and never reach the built site.
