import assert from 'node:assert/strict';
import test from 'node:test';

import { SOURCE_CATALOG } from '../src/lib/sustainable-places/catalog.mjs';

test('every research adapter links to an authoritative source', () => {
  assert.ok(SOURCE_CATALOG.length >= 12);

  for (const source of SOURCE_CATALOG) {
    assert.match(source.url, /^https:\/\//, `${source.name} is missing a source URL`);
    assert.ok(source.coverage);
    assert.ok(source.cadence);
  }
});

test('the catalog separates federal and state incentive evidence', () => {
  const ids = new Set(SOURCE_CATALOG.map((source) => source.id));

  assert.ok(ids.has('irs-48e'));
  assert.ok(ids.has('dsire'));
});
