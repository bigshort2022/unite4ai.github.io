import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bfclCalibrationProblems } from '../src/bfcl-calibration.ts';

const hash = '3'.repeat(64);
const wrongHash = 'a'.repeat(64);
const report = (different = []) => ({
  transcript_sha256: hash,
  agreement: Array.from({ length: 250 }, (_, index) => !different.includes(index)),
});

test('first BFCL publication must bind a full checker report to a registered transcript', () => {
  assert.deepEqual(bfclCalibrationProblems(undefined, new Set(), false), []);
  assert.match(bfclCalibrationProblems(undefined, new Set([hash]), true).join(), /required/);
  assert.match(bfclCalibrationProblems(report(), new Set([wrongHash]), true).join(), /registered/);
  assert.match(bfclCalibrationProblems({ ...report(), agreement: [true] }, new Set([hash]), true).join(), /250/);
  assert.deepEqual(bfclCalibrationProblems(report(), new Set([hash]), true), []);
});

test('every disagreement is published with its answer position and explanation', () => {
  const diff = report([0, 249]);
  assert.match(bfclCalibrationProblems(diff, new Set([hash]), true).join(), /answer 249/);
  assert.deepEqual(bfclCalibrationProblems({ ...diff, disagreement_notes: { 0: 'Changed empty string normalization.', 249: 'Known integer coercion difference.' } }, new Set([hash]), true), []);
  assert.match(bfclCalibrationProblems({ ...diff, disagreement_notes: { 0: 'Reason', 249: 'Reason', 25: 'Not a disagreement' } }, new Set([hash]), true).join(), /answer 25/);
});
