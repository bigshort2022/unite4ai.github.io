import assert from 'node:assert/strict';
import test from 'node:test';

import { cacheKey, getCachedEvidence, setCachedEvidence } from '../src/lib/sustainable-places/evidence-cache.mjs';

test('cacheKey rounds coordinates for stable cache keys', () => {
  assert.equal(cacheKey(39.52963, -119.81382), '39.53,-119.81');
});

test('nearby points share a cached evidence payload', () => {
  const payload = { evidence: [], health: {}, observedAt: '2026-01-01T00:00:00.000Z' };
  setCachedEvidence(40.1, -74.2, payload);
  assert.deepEqual(getCachedEvidence(40.1004, -74.1998), payload);
});

test('cached evidence expires after its TTL', () => {
  setCachedEvidence(12.34, 56.78, { evidence: [], health: {}, observedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(getCachedEvidence(12.34, 56.78, 0), null);
});
