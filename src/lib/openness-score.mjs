/** Model Openness Framework axis scores — shared by registry and OpennessMeter. */
export const OPENNESS_SCORE = Object.freeze({
  open: 100,
  documented: 70,
  partial: 40,
  closed: 0,
});

export const OPENNESS_LABELS = Object.freeze({
  weights: 'Weights',
  training_data: 'Training data',
  training_code: 'Training code',
  evaluation: 'Evaluation',
});

export function opennessScore(openness) {
  const values = Object.values(openness);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + (OPENNESS_SCORE[value] ?? 0), 0) / values.length);
}
