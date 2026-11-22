import type { ExchangeProfile, PROFILE_CHECK_OUTCOMES, PROFILE_LEVELS } from '@unite4ai/schema';
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
  breakdown: { criterion: string; label: string; weight: number; outcome: (typeof PROFILE_CHECK_OUTCOMES)[number]; evidence: string[] }[];
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
    // Gas counts only as a fixed USD amount; any other gas is priced in another asset or varies per transaction.
    const fixedUsdGas = c.kind === 'network-gas' && c.amount !== null && c.basis === 'fixed' && c.currency === 'USD';
    if (c.kind === 'minimum-charge' || (c.kind === 'network-gas' && !fixedUsdGas)) {
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
  // Basis points keep the arithmetic exact: 100 * (1 - 9.3 / 20) is 53.4999… in floating point.
  const costBp = Math.round(percent * 100);
  const capBp = COST_CAP_PERCENT * 100;
  const costPercent = costBp / 100;
  const score = Math.round((100 * (capBp - Math.min(costBp, capBp))) / capBp);
  return { rubricVersion: RUBRIC_VERSION, score, grade: letterGrade(score), costPercent, excluded, notComputable };
}

/** `amount` is the published decimal string, shown as the source states it. */
export interface QuoteRow { directoryId: string; amount: string; sampleSize?: number; sampledAt: string; level: (typeof PROFILE_LEVELS)[number] }

/** Quotes are directly comparable only within one key: same workload, currency, unit and statistic. */
export const quoteGroupKey = (q: ExchangeProfile['priceQuotes'][number]): string => `${q.workload}|${q.currency}|${q.per}|${q.statistic}`;

/** Groups directly comparable quotes by `quoteGroupKey`. Sorted cheapest first. */
export function quotesByWorkload(profiles: { id: string; data: ExchangeProfile }[]): Map<string, QuoteRow[]> {
  const groups = new Map<string, QuoteRow[]>();
  for (const { id, data } of profiles) {
    for (const q of data.priceQuotes) {
      const key = quoteGroupKey(q);
      const rows = groups.get(key) ?? [];
      rows.push({ directoryId: id, amount: q.amount, sampleSize: q.sampleSize, sampledAt: q.sampledAt, level: q.level });
      groups.set(key, rows);
    }
  }
  for (const rows of groups.values()) rows.sort((a, b) => Number(a.amount) - Number(b.amount) || a.directoryId.localeCompare(b.directoryId));
  return groups;
}
