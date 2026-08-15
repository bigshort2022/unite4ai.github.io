import assert from 'node:assert/strict';
import test from 'node:test';

import { supportsNodeVersion } from '../scripts/node-version.mjs';

test('accepts supported Node 24 releases', () => {
  assert.equal(supportsNodeVersion('v24.0.0'), true);
  assert.equal(supportsNodeVersion('v24.18.1'), true);
});

test('rejects Node releases outside major version 24', () => {
  assert.equal(supportsNodeVersion('v23.11.1'), false);
  assert.equal(supportsNodeVersion('v25.0.0'), false);
});

test('rejects malformed version strings', () => {
  assert.equal(supportsNodeVersion('24'), false);
  assert.equal(supportsNodeVersion('not-a-version'), false);
});
