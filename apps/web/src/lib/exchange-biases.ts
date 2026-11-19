import type { ExchangeStructure } from '@unite4ai/core/exchange';
import type { EvalResult } from '@unite4ai/schema';


/** All published records, including superseded findings; account counts are not people counts. */
export function exchangeBiases(structure: ExchangeStructure, results: Pick<EvalResult, 'run'>[]) {
  const posters = new Set([
    ...structure.hypotheses.map((record) => record.author),
    ...structure.findings.map((record) => record.author),
    ...results.map((result) => result.run.submitter),
  ]);
  const verdicts = { supports: 0, refutes: 0, inconclusive: 0 };
  for (const finding of structure.findings) verdicts[finding.verdict]++;
  return {
    posters: posters.size,
    reviewers: new Set(structure.reviews.map((review) => review.reviewer)).size,
    verdicts,
    unreviewed: structure.findings.filter((finding) => finding.state === 'unreviewed').length,
    pageOnly: structure.reviews.filter((review) => review.checks.length > 0 && review.checks.every((check) => check === 'read-page-only')).length,
  };
}

export function share(count: number, total: number): string {
  return total === 0 ? 'Unavailable (0 records)' : `${(100 * count / total).toFixed(1)}% (${count} / ${total})`;
}
