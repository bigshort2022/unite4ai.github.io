import assert from 'node:assert/strict';
import test from 'node:test';

import { cacheKey, getCachedEvidence, setCachedEvidence } from '../src/lib/sustainable-places/evidence-cache.mjs';
import { opennessScore } from '../src/lib/openness-score.mjs';
import { buildRegistryIndex } from '../src/lib/registry-index.mjs';

test('cacheKey rounds coordinates for stable cache keys', () => {
  assert.equal(cacheKey(39.52963, -119.81382), '39.53,-119.81');
});

test('evidence cache stores and retrieves payloads', () => {
  const payload = { evidence: [], health: {}, observedAt: '2026-01-01T00:00:00.000Z' };
  setCachedEvidence(40.1, -74.2, payload);
  assert.deepEqual(getCachedEvidence(40.1004, -74.1998), payload);
});

test('opennessScore averages Model Openness Framework axes', () => {
  const score = opennessScore({
    weights: 'open',
    training_data: 'documented',
    training_code: 'open',
    evaluation: 'partial',
  });
  assert.equal(score, 78);
});

test('buildRegistryIndex includes openness score and featured flag', () => {
  const index = buildRegistryIndex([{
    id: 'test-model',
    data: {
      name: 'Test',
      summary: 'Summary',
      license: 'apache-2.0',
      domains: ['healthcare'],
      sdg_alignment: [3],
      community_led: true,
      featured: true,
      updated: new Date('2026-08-01'),
      openness: { weights: 'open', training_data: 'open', training_code: 'open', evaluation: 'open' },
    },
  }]);
  assert.equal(index[0].openness_score, 100);
  assert.equal(index[0].featured, true);
  assert.equal(index[0].href, '/registry/models/test-model');
});
