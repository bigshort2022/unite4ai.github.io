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
