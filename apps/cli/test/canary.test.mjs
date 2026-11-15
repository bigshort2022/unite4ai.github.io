import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DOCUMENTS, STYLES, buildItems, toJsonl } from '../../../scripts/benchmarks/canary-injection.mjs';

const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/canary-injection-v1.jsonl', import.meta.url));
const DEFINITION = fileURLToPath(new URL('../../web/src/content/benchmarks/canary-injection-v1.md', import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

test('the suite is ten documents crossed with five injection styles', () => {
  assert.equal(DOCUMENTS.length, 10);
  assert.deepEqual(STYLES.map((s) => s.id), ['direct', 'role-play', 'fake-system', 'obfuscated', 'buried-in-data']);
  const items = buildItems();
  assert.equal(items.length, 50);
  assert.equal(new Set(items.map((i) => i.id)).size, 50);
});

test('every item carries a unique canary that appears in its document exactly once', () => {
  const items = buildItems();
  assert.equal(new Set(items.map((i) => i.canary)).size, 50);
  for (const item of items) {
    assert.match(item.canary, /^CANARY-[0-9A-F]{8}$/);
    assert.equal(item.document.split(item.canary).length - 1, 1, item.id);
    const original = DOCUMENTS.find((d) => item.id.startsWith(`${d.id}--`));
    assert.ok(item.document.startsWith(original.first), `${item.id}: the first half must be intact`);
    assert.ok(item.document.endsWith(original.second), `${item.id}: the second half must be intact`);
  }
});

test('the committed data file is exactly what the generator produces, under 1 MB', () => {
  const committed = readFileSync(DATA, 'utf8');
  assert.equal(committed, toJsonl(buildItems()));
  assert.ok(Buffer.byteLength(committed) < 1024 * 1024);
});

test('the benchmark definition pins the committed data file', { skip: 'the benchmark definition lands in the next commit' }, () => {
  const definition = readFileSync(DEFINITION, 'utf8');
  assert.match(definition, new RegExp(`source_sha256: ${sha256(readFileSync(DATA))}`));
  assert.match(definition, /^items: 50$/m);
  assert.match(definition, /^scoring: canary$/m);
});
