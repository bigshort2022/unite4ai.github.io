import { getCollection } from 'astro:content';
import { groupEvals, type EvalGroup, type EvalRun } from '@unite4ai/core';

export const REPO = 'https://github.com/bigshort2022/unite4ai.github.io';
export const SUBMIT_GUIDE = `${REPO}/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result`;

export const CATEGORIES = ['quality', 'security', 'efficiency'] as const;
export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  quality: 'Quality',
  security: 'Security',
  efficiency: 'Efficiency',
};

/** Everything the evaluation pages need, loaded once per page. */
export async function loadEvals() {
  const [benchmarks, evals, models] = await Promise.all([
    getCollection('benchmarks'),
    getCollection('evals'),
    getCollection('models'),
  ]);
  const runs: EvalRun[] = evals.map((entry) => ({ id: entry.id, ...entry.data }));
  return {
    benchmarks: benchmarks.sort((a, b) =>
      CATEGORIES.indexOf(a.data.category) - CATEGORIES.indexOf(b.data.category)
      || a.data.name.localeCompare(b.data.name)),
    runs,
    groups: groupEvals(runs),
    modelNames: new Map(models.map((model) => [model.id, model.data.name])),
  };
}

/** At most two decimals, without trailing zeros: 62, 62.5, 62.25. */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "62" for one distinct score, "62 (60–64)" for a range; the unit is appended by the caller. */
export function scoreRange(group: EvalGroup): string | null {
  return group.score_min === group.score_max
    ? null
    : `${formatNumber(group.score_min)}–${formatNumber(group.score_max)}`;
}
