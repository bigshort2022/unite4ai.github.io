import type { ModelData } from '@unite4ai/schema';

/** Model Openness Framework axis scores — shared by registry and OpennessMeter. */
export const OPENNESS_SCORE = {
  open: 100,
  documented: 70,
  partial: 40,
  closed: 0,
} as const;

export const OPENNESS_LABELS = {
  weights: 'Weights',
  training_data: 'Training data',
  training_code: 'Training code',
  evaluation: 'Evaluation',
} as const;

export function opennessScore(openness: ModelData['openness']): number {
  const values = Object.values(openness);
  if (!values.length) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + (OPENNESS_SCORE[value] ?? 0), 0) / values.length,
  );
}
