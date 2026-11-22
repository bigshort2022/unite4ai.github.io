// scripts/profiles/new.ts — usage: bun run profile:new <directory-id> <github-handle>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
console.log(`wrote ${path} (draft; every value not-published until researched)`);
