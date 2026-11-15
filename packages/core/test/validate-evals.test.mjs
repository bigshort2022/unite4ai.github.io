import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { validateEvals } from '../src/validate-evals.ts';
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

/** A benchmark written the way a contributor would: block YAML, quoted version, bare date. */
const BLOCK_YAML_BENCHMARK = `---
name: Fixture benchmark
summary: A benchmark used only in tests.
category: quality
version: "1"
metric:
  name: accuracy
  unit: "%"
  higher_is_better: true
  min: 0
  max: 100
scoring: exact-match
items: 200
source_url: https://example.org/items.jsonl
license: mit
updated: 2026-11-14
---

## Method

Fixture.
`;

/** The fixture evidence hash is 64 "a"s, so the filename suffix is "aaaaaaaa". */
const FILE = 'model-a--bench-a--alice--2026-11-10--aaaaaaaa.json';
const FLAT_ONLY = 'subfolders and links are not read';
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const on = (date) => ({ ...result().run, date });
const fileOn = (date) => `model-a--bench-a--alice--${date}--aaaaaaaa.json`;

/**
 * YAML is a superset of JSON, so object fixtures write frontmatter as JSON; a string is
 * written as the whole benchmark file.
 */
function makeRoot({ benchmarks = { 'bench-a': benchmark() }, evals = {}, models = { 'model-a.md': MODEL_CARD } } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(root, dir));
  for (const [file, card] of Object.entries(models)) writeFileSync(join(root, 'models', file), card);
  for (const [id, data] of Object.entries(benchmarks)) {
    const body = typeof data === 'string' ? data : `---\n${JSON.stringify(data, null, 2)}\n---\n\n## Method\n\nFixture.\n`;
    writeFileSync(join(root, 'benchmarks', `${id}.md`), body);
  }
  for (const [file, data] of Object.entries(evals)) {
    writeFileSync(join(root, 'evals', file), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
  return root;
}

async function errorsFor(options) {
  return (await validateContent(makeRoot(options))).errors;
}

/** Returns false where the platform or account cannot create symlinks. */
function trySymlink(target, path) {
  try {
    symlinkSync(target, path);
    return true;
  } catch {
    return false;
  }
}

test('a valid benchmark and a valid result produce no errors', async () => {
  assert.deepEqual(await errorsFor({ evals: { [FILE]: result() } }), []);
});

test('content with no evals or benchmarks directories is still valid', async () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  assert.deepEqual((await validateContent(root)).errors, []);
});

test('a benchmark written by hand as block YAML with a bare date validates cleanly', async () => {
  assert.deepEqual(await errorsFor({ benchmarks: { 'bench-a': BLOCK_YAML_BENCHMARK }, evals: { [FILE]: result() } }), []);
});

test('a result over 16 KB is rejected and told where raw output belongs', async () => {
  const big = result({ run: { ...result().run, command: 'x'.repeat(17_000) } });
  const errors = await errorsFor({ evals: { [FILE]: big } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^evals\/model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json: \d+ bytes exceeds the 16384-byte limit/);
  assert.match(errors[0], /evidence\.url/);
});

test('a result must reference an existing model card and benchmark', async () => {
  const ghostModel = await errorsFor({ evals: { 'ghost--bench-a--alice--2026-11-10--aaaaaaaa.json': result({ model: 'ghost' }) } });
  assert.equal(ghostModel.length, 1);
  assert.match(ghostModel[0], /model "ghost" has no card in models\//);
  const ghostBench = await errorsFor({ evals: { 'model-a--ghost--alice--2026-11-10--aaaaaaaa.json': result({ benchmark: 'ghost' }) } });
  assert.equal(ghostBench.length, 1);
  assert.match(ghostBench[0], /benchmark "ghost" is not defined/);
});

test('a result cannot reference a model card whose slug overrides its id', async () => {
  const slugged = MODEL_CARD.replace('name: Model A', 'name: Model A\nslug: another-id');
  const errors = await errorsFor({ models: { 'model-a.md': slugged }, evals: { [FILE]: result() } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^evals\/model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json: model card sets `slug`, which changes its id; remove it/);
  const mentioned = MODEL_CARD.replace('Fixture.\n', 'Fixture.\n\nslug: only body text\n');
  assert.deepEqual(await errorsFor({ models: { 'model-a.md': mentioned }, evals: { [FILE]: result() } }), []);
});

test('a benchmark filename must be a lowercase id', async () => {
  const errors = await errorsFor({ benchmarks: { Bad_Name: benchmark() } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^benchmarks\/Bad_Name\.md: filename must be a lowercase id like my-benchmark\.md/);
});

test('the score must fit the benchmark metric range', async () => {
  const high = await errorsFor({ evals: { [FILE]: result({ score: 140 }) } });
  assert.match(high.join('\n'), /score 140 is above the benchmark maximum 100/);
  const low = await errorsFor({ evals: { [FILE]: result({ score: -3 }) } });
  assert.match(low.join('\n'), /score -3 is below the benchmark minimum 0/);
});

test('only full runs are accepted when the benchmark has a fixed item count', async () => {
  const partial = await errorsFor({ evals: { [FILE]: result({ n: 150 }) } });
  assert.equal(partial.length, 1);
  assert.match(partial[0], /n 150 must equal the benchmark's 200 items; partial runs are not accepted/);
  const tooMany = await errorsFor({ evals: { [FILE]: result({ n: 201 }) } });
  assert.match(tooMany.join('\n'), /n 201 must equal the benchmark's 200 items/);
});

test('a measured benchmark has no item count, so any positive n is accepted', async () => {
  const benchmarks = { 'bench-a': benchmark({ scoring: 'measured', items: 0 }) };
  assert.deepEqual(await errorsFor({ benchmarks, evals: { [FILE]: result({ n: 37 }) } }), []);
});

test('the filename must state the model, benchmark, submitter, date and evidence prefix of the file', async () => {
  const expected = /filename must be "model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json" \(model--benchmark--submitter--date--first 8 characters of evidence\.sha256\)/;
  for (const file of [
    'model-a--bench-a--bob--2026-11-10--aaaaaaaa.json',
    'model-a--bench-a--alice--2026-11-10.json',
    'model-a--bench-a--alice--2026-11-10--bbbbbbbb.json',
    'model-a--bench-a--alice--2026-11-10--aaaaaaa.json',
  ]) {
    const errors = await errorsFor({ evals: { [file]: result() } });
    assert.equal(errors.length, 1, file);
    assert.match(errors[0], expected, file);
  }
});

test('two result files cannot carry the same evidence', async () => {
  const errors = await errorsFor({
    evals: { [fileOn('2026-11-09')]: result({ run: on('2026-11-09') }), [FILE]: result() },
  });
  assert.deepEqual(errors, [
    `evals/${FILE}: same evidence.sha256 as evals/${fileOn('2026-11-09')}; one run is one file`,
  ]);
});

test('a run cannot be dated on a date that does not exist or far in the future', async () => {
  const future = await errorsFor({ evals: { [fileOn('2999-01-01')]: result({ run: on('2999-01-01') }) } });
  assert.match(future.join('\n'), /run\.date 2999-01-01 is in the future/);
  for (const date of ['2026-13-45', '2026-02-30']) {
    const impossible = await errorsFor({ evals: { [fileOn(date)]: result({ run: on(date) }) } });
    assert.equal(impossible.length, 1, date);
    assert.match(impossible[0], new RegExp(`run\\.date ${date} is not a real date`));
  }
});

test('a run dated tomorrow in UTC is accepted, so a contributor ahead of UTC can submit the same day', async () => {
  const check = async (date) => {
    const errors = [];
    const warnings = [];
    await validateEvals(makeRoot({ evals: { [fileOn(date)]: result({ run: on(date) }) } }), errors, warnings, '2026-11-10');
    return errors;
  };
  assert.deepEqual(await check('2026-11-10'), []);
  assert.deepEqual(await check('2026-11-11'), []);
  const dayAfter = await check('2026-11-12');
  assert.equal(dayAfter.length, 1);
  assert.match(dayAfter[0], /run\.date 2026-11-12 is in the future/);
});

test('a result for an older benchmark version is kept with a warning that it is off the leaderboard', async () => {
  const root = makeRoot({ evals: { [FILE]: result({ benchmark_version: '0', n: 150 }) } });
  const { errors, warnings } = await validateContent(root);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    `evals/${FILE}: result is for benchmark version 0; the current version is 1, so it will not appear on the leaderboard`,
  ]);
  const current = await validateContent(makeRoot({ evals: { [FILE]: result() } }));
  assert.deepEqual(current.warnings, []);
});

test('malformed files are reported by name, with the failing field', async () => {
  const notJson = await errorsFor({ evals: { [FILE]: '{ not json' } });
  assert.match(notJson.join('\n'), /^evals\/model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json: not valid JSON/m);
  const { evidence: _dropped, ...withoutEvidence } = result();
  const missing = await errorsFor({ evals: { [FILE]: withoutEvidence } });
  assert.match(missing.join('\n'), /evals\/model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json: evidence/);
  const typo = await errorsFor({ evals: { [FILE]: result({ perf: { tokens_per_sec: 88.2 } }) } });
  assert.equal(typo.length, 1);
  assert.match(typo[0], /^evals\/model-a--bench-a--alice--2026-11-10--aaaaaaaa\.json: perf: .*tokens_per_sec/);
});

test('a benchmark with a non-deterministic scoring kind or a plain-http source is rejected', async () => {
  const judge = await errorsFor({ benchmarks: { 'bench-a': benchmark({ scoring: 'llm-judge' }) } });
  assert.match(judge.join('\n'), /^benchmarks\/bench-a\.md: scoring/m);
  const http = await errorsFor({ benchmarks: { 'bench-a': benchmark({ source_url: 'http://example.org/x' }) } });
  assert.match(http.join('\n'), /^benchmarks\/bench-a\.md: source_url: must be an https URL/m);
});

test('a benchmark with an inverted range or a missing item count is rejected', async () => {
  const inverted = await errorsFor({ benchmarks: { 'bench-a': benchmark({ metric: { ...benchmark().metric, min: 100, max: 0 } }) } });
  assert.equal(inverted.length, 1);
  assert.match(inverted[0], /^benchmarks\/bench-a\.md: metric\.min: /);
  const noItems = await errorsFor({ benchmarks: { 'bench-a': benchmark({ items: 0 }) } });
  assert.equal(noItems.length, 1);
  assert.match(noItems[0], /^benchmarks\/bench-a\.md: items: /);
});

test('an unquoted benchmark version is rejected with a hint to quote it', async () => {
  const errors = await errorsFor({ benchmarks: { 'bench-a': BLOCK_YAML_BENCHMARK.replace('version: "1"', 'version: 1') } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^benchmarks\/bench-a\.md: version: .*quote/);
});

test('a +++ line in benchmark frontmatter is rejected, because Astro would stop parsing there', async () => {
  const errors = await errorsFor({ benchmarks: { 'bench-a': BLOCK_YAML_BENCHMARK.replace('license: mit', '+++\nlicense: mit') } });
  assert.deepEqual(errors, ['benchmarks/bench-a.md: frontmatter contains a +++ line; Astro would stop parsing there']);
});

for (const [dir, what, named] of [['evals', 'result', 'nested.json'], ['benchmarks', 'benchmark', 'nested.md']]) {
  const rejected = (name) => `${dir}/${name}: only ${what} files are allowed here; ${FLAT_ONLY}`;

  test(`${dir}/ is flat: subfolders and stray files are errors, .gitkeep is allowed`, async () => {
    const root = makeRoot();
    writeFileSync(join(root, dir, '.gitkeep'), '');
    assert.deepEqual((await validateContent(root)).errors, []);

    mkdirSync(join(root, dir, 'sub'));
    writeFileSync(join(root, dir, 'sub', named), '{}');
    mkdirSync(join(root, dir, named));
    writeFileSync(join(root, dir, 'notes.txt'), 'scratch');
    assert.deepEqual((await validateContent(root)).errors, [rejected(named), rejected('notes.txt'), rejected('sub')]);
  });

  test(`${dir}/ is flat: links are errors, whether they point at a folder, a file or nothing`, async (t) => {
    const root = makeRoot();
    const outside = mkdtempSync(join(tmpdir(), 'u4ai-outside-'));
    roots.push(outside);
    writeFileSync(join(outside, named), '{}');
    const linked = [
      trySymlink(outside, join(root, dir, 'linked-dir')),
      trySymlink(join(outside, named), join(root, dir, `linked-${named}`)),
      trySymlink(join(outside, 'missing'), join(root, dir, `broken-${named}`)),
    ];
    if (linked.includes(false)) {
      t.skip('symlinks cannot be created here');
      return;
    }
    assert.deepEqual((await validateContent(root)).errors, [
      rejected(`broken-${named}`),
      rejected('linked-dir'),
      rejected(`linked-${named}`),
    ]);
  });
}
