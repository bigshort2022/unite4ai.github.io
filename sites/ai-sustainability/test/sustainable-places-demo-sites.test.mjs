import assert from 'node:assert/strict';
import test from 'node:test';

import { DEMO_SITES } from '../src/lib/sustainable-places/demo-sites.mjs';
import { scoreSite } from '../src/lib/sustainable-places/tea.mjs';

test('ranked candidate badges match the weighted evidence score', () => {
  for (const feature of DEMO_SITES.features) {
    assert.equal(
      scoreSite(feature.properties).overall,
      feature.properties.overall,
      `${feature.properties.name} has inconsistent scores`,
    );
  }
});

test('candidate ranks descend by opportunity score', () => {
  for (let index = 1; index < DEMO_SITES.features.length; index += 1) {
    const previous = DEMO_SITES.features[index - 1].properties;
    const current = DEMO_SITES.features[index].properties;

    assert.ok(previous.overall >= current.overall, `${previous.name} should rank above ${current.name}`);
    assert.equal(current.rank, index + 1);
  }
});
