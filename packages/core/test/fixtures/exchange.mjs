import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { benchmark, result } from './evals.mjs';

// Invented test data only. Never stored in a production content directory.
export const RESULT_ID = 'model-a--bench-a--alice--2026-11-10--aaaaaaaa';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const markdown = (data, body = '') => `---\n${JSON.stringify(data, null, 2)}\n---\n${body}`;
export const hypothesis = (overrides = {}) => ({
  title: 'Fixture hypothesis', claim: 'Fixture model reaches the threshold.',
  benchmark: 'bench-a', models: ['model-a'], prediction: 'Fixture score exceeds 70.',
  author: 'fixture-author', date: '2026-11-10', ...overrides,
});
export const finding = (overrides = {}) => ({
  hypothesis: 'fixture-hypothesis', results: [RESULT_ID], verdict: 'supports',
  summary: 'Fixture run exceeded the threshold.', limitations: 'Fixture only, not research.',
  author: 'fixture-author', date: '2026-11-10', ...overrides,
});
export const review = (findingBytes, overrides = {}) => ({
  finding: 'fixture-finding', finding_sha256: hash(findingBytes), verdict: 'accept',
  checks: ['read-results'], notes: 'Fixture review, not independent research.',
  reviewer: 'fixture-reviewer', date: '2026-11-11', ...overrides,
});
export const entry = (id, data) => ({ id, data, sha256: hash(JSON.stringify(data)) });
export const catalog = () => ({
  models: new Set(['model-a']), benchmarks: new Map([['bench-a', benchmark()]]),
  results: new Map([[RESULT_ID, result()]]),
});
export function makeExchangeRoot({ hypotheses = { 'fixture-hypothesis': hypothesis() }, findings = {}, reviews = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-exchange-fixture-'));
  for (const dir of ['models', 'benchmarks', 'evals', 'hypotheses', 'findings', 'reviews']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'models/model-a.md'), `---
name: Fixture Model
summary: Test fixture only.
maintainers: ["fixture-author"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-10
---
`);
  writeFileSync(join(root, 'benchmarks/bench-a.md'), markdown(benchmark()));
  writeFileSync(join(root, 'evals', `${RESULT_ID}.json`), JSON.stringify(result()));
  for (const [dir, records] of Object.entries({ hypotheses, findings, reviews })) {
    for (const [id, data] of Object.entries(records)) {
      writeFileSync(join(root, dir, `${id}.${dir === 'hypotheses' ? 'md' : 'json'}`),
        typeof data === 'string' ? data : dir === 'hypotheses' ? markdown(data) : JSON.stringify(data));
    }
  }
  return root;
}
