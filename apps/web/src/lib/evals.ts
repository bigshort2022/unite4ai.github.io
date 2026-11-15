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

/** Orders strings by UTF-16 code units, so the build output is the same in every locale. */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Everything the evaluation pages need, loaded once per page. Throws, failing the build, when
 * a result references a model or benchmark that is not in its collection.
 */
export async function loadEvals() {
  const [benchmarks, evals, models] = await Promise.all([
    getCollection('benchmarks'),
    getCollection('evals'),
    getCollection('models'),
  ]);
  const runs: EvalRun[] = evals.map((entry) => ({ id: entry.id, ...entry.data }));
  const modelNames = new Map(models.map((model) => [model.id, model.data.name]));

  const benchmarkIds = new Set(benchmarks.map((benchmark) => benchmark.id));
  const dangling: string[] = [];
  for (const run of runs) {
    if (!modelNames.has(run.model)) dangling.push(`evals/${run.id}: model "${run.model}" has no card in models/`);
    if (!benchmarkIds.has(run.benchmark)) {
      dangling.push(`evals/${run.id}: benchmark "${run.benchmark}" is not defined in benchmarks/`);
    }
  }
  if (dangling.length > 0) {
    throw new Error(`Evaluation results reference content that does not exist:\n${dangling.sort(byCodeUnit).join('\n')}`);
  }

  return {
    benchmarks: benchmarks.sort((a, b) =>
      CATEGORIES.indexOf(a.data.category) - CATEGORIES.indexOf(b.data.category)
      || byCodeUnit(a.data.name, b.data.name)
      || byCodeUnit(a.id, b.id)),
    runs,
    groups: groupEvals(runs),
    modelNames,
  };
}

/** Two decimals at most, without trailing zeros (62, 62.5, 62.25); three significant digits below 1 (0.123). */
export function formatNumber(value: number): string {
  return String(Number(Math.abs(value) < 1 ? value.toPrecision(3) : value.toFixed(2)));
}

/** "60–64" when the group's runs disagree, null when they all scored the same. */
export function scoreRange(group: EvalGroup): string | null {
  return group.score_min === group.score_max
    ? null
    : `${formatNumber(group.score_min)}–${formatNumber(group.score_max)}`;
}
