import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STACK_LAYERS,
  hasDecentralizedStorage,
  hasVerifiableArtifacts,
} from '../src/lib/stack-layers.mjs';

test('STACK_LAYERS defines four open stack layers', () => {
  assert.equal(STACK_LAYERS.length, 4);
  assert.deepEqual(STACK_LAYERS.map((l) => l.id), ['data', 'compute', 'weights', 'verify']);
});

test('hasVerifiableArtifacts detects sha256 checksums', () => {
  assert.equal(hasVerifiableArtifacts([]), false);
  assert.equal(hasVerifiableArtifacts([{ url: 'https://x', sha256: 'a'.repeat(64) }]), true);
});

test('hasDecentralizedStorage detects mirrors and content addresses', () => {
  assert.equal(hasDecentralizedStorage(undefined), false);
  assert.equal(hasDecentralizedStorage({ protocol: 'https' }), false);
  assert.equal(hasDecentralizedStorage({ protocol: 'ipfs', content_address: 'ipfs://abc' }), true);
  assert.equal(hasDecentralizedStorage({ mirror_urls: ['https://mirror.example/x'] }), true);
});
