import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { validateContent } from '../src/validate.ts';
import { benchmark, result } from './fixtures/evals.mjs';

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const FILE = 'model-a--bench-a--alice--2026-11-10.json';
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** YAML is a superset of JSON, so fixtures write frontmatter as JSON. */
function makeRoot({ benchmarks = { 'bench-a': benchmark() }, evals = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'models/model-a.md'), MODEL_CARD);
  for (const [id, data] of Object.entries(benchmarks)) {
    writeFileSync(join(root, 'benchmarks', `${id}.md`), `---\n${JSON.stringify(data, null, 2)}\n---\n\n## Method\n\nFixture.\n`);
  }
  for (const [file, data] of Object.entries(evals)) {
    writeFileSync(join(root, 'evals', file), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
  return root;
}

async function errorsFor(options) {
  return (await validateContent(makeRoot(options))).errors;
}

test('a valid benchmark and a valid result produce no errors', async () => {
  assert.deepEqual(await errorsFor({ evals: { [FILE]: result() } }), []);
});

test('content with no evals or benchmarks directories is still valid', async () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  assert.deepEqual((await validateContent(root)).errors, []);
});

test('a result over 16 KB is rejected and told where raw output belongs', async () => {
  const big = result({ run: { ...result().run, command: 'x'.repeat(17_000) } });
  const errors = await errorsFor({ evals: { [FILE]: big } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^evals\/model-a--bench-a--alice--2026-11-10\.json: \d+ bytes exceeds the 16384-byte limit/);
  assert.match(errors[0], /evidence\.url/);
});

test('a result must reference an existing model card and benchmark', async () => {
  const ghostModel = await errorsFor({ evals: { 'ghost--bench-a--alice--2026-11-10.json': result({ model: 'ghost' }) } });
  assert.match(ghostModel.join('\n'), /model "ghost" has no card in models\//);
  const ghostBench = await errorsFor({ evals: { 'model-a--ghost--alice--2026-11-10.json': result({ benchmark: 'ghost' }) } });
  assert.match(ghostBench.join('\n'), /benchmark "ghost" is not defined/);
});

test('score and item count must fit the benchmark', async () => {
  const high = await errorsFor({ evals: { [FILE]: result({ score: 140 }) } });
  assert.match(high.join('\n'), /score 140 is above the benchmark maximum 100/);
  const low = await errorsFor({ evals: { [FILE]: result({ score: -3 }) } });
  assert.match(low.join('\n'), /score -3 is below the benchmark minimum 0/);
  const tooMany = await errorsFor({ evals: { [FILE]: result({ n: 201 }) } });
  assert.match(tooMany.join('\n'), /n 201 exceeds the benchmark's 200 items/);
});

test('the filename must state the same model, benchmark, submitter and date as the file', async () => {
  const errors = await errorsFor({ evals: { 'model-a--bench-a--bob--2026-11-10.json': result() } });
  assert.match(errors.join('\n'), /filename must be "model-a--bench-a--alice--2026-11-10\.json"/);
});

test('a run cannot be dated in the future or on a date that does not exist', async () => {
  const future = await errorsFor({ evals: { 'model-a--bench-a--alice--2999-01-01.json': result({ run: { ...result().run, date: '2999-01-01' } }) } });
  assert.match(future.join('\n'), /run\.date 2999-01-01 is in the future/);
  const impossible = await errorsFor({ evals: { 'model-a--bench-a--alice--2026-13-45.json': result({ run: { ...result().run, date: '2026-13-45' } }) } });
  assert.match(impossible.join('\n'), /run\.date 2026-13-45 is not a real date/);
});

test('malformed files are reported by name, with the failing field', async () => {
  const notJson = await errorsFor({ evals: { [FILE]: '{ not json' } });
  assert.match(notJson.join('\n'), /^evals\/model-a--bench-a--alice--2026-11-10\.json: not valid JSON/m);
  const { evidence: _dropped, ...withoutEvidence } = result();
  const missing = await errorsFor({ evals: { [FILE]: withoutEvidence } });
  assert.match(missing.join('\n'), /evals\/model-a--bench-a--alice--2026-11-10\.json: evidence/);
});

test('a benchmark with a non-deterministic scoring kind or a plain-http source is rejected', async () => {
  const judge = await errorsFor({ benchmarks: { 'bench-a': benchmark({ scoring: 'llm-judge' }) } });
  assert.match(judge.join('\n'), /^benchmarks\/bench-a\.md: scoring/m);
  const http = await errorsFor({ benchmarks: { 'bench-a': benchmark({ source_url: 'http://example.org/x' }) } });
  assert.match(http.join('\n'), /^benchmarks\/bench-a\.md: source_url: must be an https URL/m);
});
