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
