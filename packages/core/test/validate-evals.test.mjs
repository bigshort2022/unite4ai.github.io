import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { repeatSummary } from '../src/repeat.ts';
import { validateEvals } from '../src/validate-evals.ts';
import { validateContent } from '../src/validate.ts';
import { benchmark, measuredBenchmark, result } from './fixtures/evals.mjs';

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

const withSlug = (line) => MODEL_CARD.replace('name: Model A', `name: Model A\n${line}`);
const slugError = (file) => `models/${file}: a model card must not set \`slug\`: it changes the card's id, and results reference the filename`;

test('no model card may set a slug, however the key is written', async () => {
  for (const line of ['slug: another-id', '"slug": another-id', "'slug': another-id"]) {
    const errors = await errorsFor({ models: { 'model-a.md': withSlug(line) }, evals: { [FILE]: result() } });
    assert.deepEqual(errors, [slugError('model-a.md')], line);
  }
  const mentioned = MODEL_CARD.replace('Fixture.\n', 'Fixture.\n\nslug: only body text\n');
  assert.deepEqual(await errorsFor({ models: { 'model-a.md': mentioned }, evals: { [FILE]: result() } }), []);
});

test('a card that no result references cannot take over another card\'s id with a slug', async () => {
  const models = { 'model-a.md': MODEL_CARD, 'model-b.md': withSlug('slug: model-a') };
  assert.deepEqual(await errorsFor({ models, evals: { [FILE]: result() } }), [slugError('model-b.md')]);
  assert.deepEqual(await errorsFor({ models }), [slugError('model-b.md')]);

  // Astro's loader reads subfolders of models/, so a nested card is checked too.
  const root = makeRoot({ evals: { [FILE]: result() } });
  mkdirSync(join(root, 'models', 'nested'));
  writeFileSync(join(root, 'models', 'nested', 'model-c.md'), withSlug('slug: model-a'));
  assert.deepEqual((await validateContent(root)).errors, [slugError('nested/model-c.md')]);
});

test('a card whose frontmatter cannot be parsed is left to the model checks', async () => {
  const errors = [];
  const broken = MODEL_CARD.replace('name: Model A', 'name: [unclosed\nslug: another-id');
  await validateEvals(makeRoot({ models: { 'model-a.md': broken } }), errors, []);
  assert.deepEqual(errors, []);
});

test('two card files cannot share one id', async () => {
  const errors = await errorsFor({ models: { 'model-a.md': MODEL_CARD, 'model-a.mdx': MODEL_CARD } });
  assert.deepEqual(errors, ['models/model-a.mdx: same id as models/model-a.md; one id is one file']);
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

const SPEED_FILE = 'model-a--speed-a--alice--2026-11-10--aaaaaaaa.json';
/** `bench-a`, and the benchmark that publishes the decode speed of its runs. */
const WITH_SPEED = { 'bench-a': benchmark(), 'speed-a': measuredBenchmark() };
/** A run of `bench-a` that measured its speed. */
const measuredRun = (overrides = {}) => result({ perf: { tokens_per_second: 88.5, time_to_first_token_ms: 410 }, ...overrides });
/** The speed result the runner derives from a run: the same file with the speed as its score. */
const speedOf = (main, overrides = {}) => ({ ...main, benchmark: 'speed-a', score: main.perf.tokens_per_second, ...overrides });
const NO_SIBLING = `evals/${SPEED_FILE}: no bench-a result from the same run; a speed result is published together with the run it was measured on`;

test('a speed result is accepted beside the result of the run it was measured on', async () => {
  const main = measuredRun();
  assert.deepEqual(await errorsFor({ benchmarks: WITH_SPEED, evals: { [FILE]: main, [SPEED_FILE]: speedOf(main) } }), []);
  // A note about the setup is part of the setup, on both files.
  const noted = measuredRun({
    setup: { ...result().setup, notes: 'thinking disabled' },
    evidence: { ...result().evidence, bytes: 1234, url: 'https://example.org/transcript.jsonl' },
  });
  assert.deepEqual(await errorsFor({ benchmarks: WITH_SPEED, evals: { [FILE]: noted, [SPEED_FILE]: speedOf(noted) } }), []);
});

test('the score of a measured result is the speed that result carries', async () => {
  // Both files carry the same perf, as files of one run do, so only the score is at fault.
  const errorsWith = (perf) => {
    const main = measuredRun({ perf });
    return errorsFor({ benchmarks: WITH_SPEED, evals: { [FILE]: main, [SPEED_FILE]: { ...main, benchmark: 'speed-a', score: 88.5 } } });
  };
  const refused = (speed) => [
    `evals/${SPEED_FILE}: score 88.5 must equal perf.tokens_per_second (${speed}); the score of a measured benchmark is the measured speed`,
  ];
  assert.deepEqual(await errorsWith(undefined), refused('not set'));
  assert.deepEqual(await errorsWith({ time_to_first_token_ms: 410 }), refused('not set'));
  assert.deepEqual(await errorsWith({ tokens_per_second: 80 }), refused('80'));
  assert.deepEqual(await errorsWith({ tokens_per_second: 88.5 }), []);
});

test('a measured result needs the result of the same run on the benchmark it was measured on', async () => {
  const main = measuredRun();
  const speed = speedOf(main);
  const models = { 'model-a.md': MODEL_CARD, 'model-b.md': MODEL_CARD };
  const errorsWith = (evals) => errorsFor({ benchmarks: WITH_SPEED, models, evals: { [SPEED_FILE]: speed, ...evals } });

  assert.deepEqual(await errorsWith({}), [NO_SIBLING], 'no other result at all');
  const otherRun = measuredRun({ evidence: { sha256: 'b'.repeat(64) } });
  assert.deepEqual(await errorsWith({ 'model-a--bench-a--alice--2026-11-10--bbbbbbbb.json': otherRun }), [NO_SIBLING], 'another transcript');

  // The same transcript hash, but one field of the run, or of what it measured, differs.
  const setup = (overrides) => ({ ...main.setup, ...overrides });
  const differing = {
    model: ['model-b--bench-a--alice--2026-11-10--aaaaaaaa.json', { model: 'model-b' }],
    date: [fileOn('2026-11-09'), { run: on('2026-11-09') }],
    submitter: ['model-a--bench-a--bob--2026-11-10--aaaaaaaa.json', { run: { ...main.run, submitter: 'bob' } }],
    harness: [FILE, { run: { ...main.run, harness: { ...main.run.harness, version: '0.2.0' } } }],
    command: [FILE, { run: { ...main.run, command: `${main.run.command} --notes x` } }],
    runtime: [FILE, { setup: setup({ runtime: 'transformers' }) }],
    'runtime version': [FILE, { setup: setup({ runtime_version: '0.32.5' }) }],
    quantization: [FILE, { setup: setup({ quantization: '8bit' }) }],
    device: [FILE, { setup: setup({ hardware: { ...main.setup.hardware, device: 'Mac Studio (M2 Ultra)' } }) }],
    notes: [FILE, { setup: setup({ notes: 'thinking disabled' }) }],
    speed: [FILE, { perf: { tokens_per_second: 80 } }],
    'no speed': [FILE, { perf: undefined }],
    'time to first token': [FILE, { perf: { ...main.perf, time_to_first_token_ms: 500 } }],
    'peak memory': [FILE, { perf: { ...main.perf, peak_memory_gb: 12 } }],
    'evidence size': [FILE, { evidence: { ...main.evidence, bytes: 1234 } }],
    'evidence link': [FILE, { evidence: { ...main.evidence, url: 'https://example.org/transcript.jsonl' } }],
  };
  for (const [field, [file, overrides]] of Object.entries(differing)) {
    assert.deepEqual(await errorsWith({ [file]: measuredRun(overrides) }), [NO_SIBLING], field);
  }
  // The run answered every item, so a speed result that claims fewer is not from it.
  assert.deepEqual(
    await errorsFor({ benchmarks: WITH_SPEED, evals: { [FILE]: main, [SPEED_FILE]: speedOf(main, { n: 150 }) } }),
    [NO_SIBLING],
  );
});

test('a current speed result needs a run of the current version of the benchmark it was measured on', async () => {
  // bench-a moved on to version 2; the run and its speed are from version 1.
  const moved = benchmark({ version: '2', previous_versions: ['1'] });
  const main = measuredRun();
  const evals = { [FILE]: main, [SPEED_FILE]: speedOf(main) };

  const stale = await validateContent(makeRoot({ benchmarks: { 'bench-a': moved, 'speed-a': measuredBenchmark() }, evals }));
  assert.deepEqual(stale.errors, [
    `evals/${SPEED_FILE}: the bench-a result of this run is for version 1; a current speed result needs a current run`,
  ]);

  // Raising the measured benchmark's version too retires the speed result with its run.
  const raised = measuredBenchmark({ version: '2', previous_versions: ['1'] });
  const retired = await validateContent(makeRoot({ benchmarks: { 'bench-a': moved, 'speed-a': raised }, evals }));
  assert.deepEqual(retired.errors, []);
  assert.equal(retired.warnings.length, 2);

  // The two versions are counted separately: a current run backs a current speed result.
  const current = measuredRun({ benchmark_version: '2' });
  const currentEvals = { [FILE]: current, [SPEED_FILE]: speedOf(current, { benchmark_version: '1' }) };
  assert.deepEqual(await errorsFor({ benchmarks: { 'bench-a': moved, 'speed-a': measuredBenchmark() }, evals: currentEvals }), []);
});

test('a measured benchmark must be measured on a benchmark that exists and has items of its own', async () => {
  assert.deepEqual(await errorsFor({ benchmarks: { 'speed-a': measuredBenchmark() } }), [
    'benchmarks/speed-a.md: measured_on "bench-a" is not defined (or failed validation) in benchmarks/',
  ]);
  const chained = { ...WITH_SPEED, 'speed-b': measuredBenchmark({ measured_on: 'speed-a' }) };
  assert.deepEqual(await errorsFor({ benchmarks: chained }), [
    'benchmarks/speed-b.md: measured_on "speed-a" is itself a measured benchmark; name the benchmark whose runs are measured',
  ]);
  const unnamed = await errorsFor({ benchmarks: { ...WITH_SPEED, 'speed-a': measuredBenchmark({ measured_on: undefined }) } });
  assert.deepEqual(unnamed, ['benchmarks/speed-a.md: measured_on: is required when scoring is "measured"']);
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

const sameEvidence = (file, owner) => `evals/${file}: same evidence.sha256 as evals/${owner}; one run's transcript backs one result per benchmark`;

test('two result files cannot carry the same evidence', async () => {
  const errors = await errorsFor({
    evals: { [fileOn('2026-11-09')]: result({ run: on('2026-11-09') }), [FILE]: result() },
  });
  assert.deepEqual(errors, [sameEvidence(FILE, fileOn('2026-11-09'))]);
});

test('one transcript may back a run and the speed measured on it, but not two results for the same benchmark', async () => {
  const main = measuredRun();
  const evals = { [FILE]: main, [SPEED_FILE]: speedOf(main) };
  assert.deepEqual(await errorsFor({ benchmarks: WITH_SPEED, evals }), []);

  // A second speed file for the same transcript, under another date so that it is another file.
  const earlier = 'model-a--speed-a--alice--2026-11-09--aaaaaaaa.json';
  const errors = await errorsFor({
    benchmarks: WITH_SPEED,
    evals: { ...evals, [earlier]: speedOf(main, { run: on('2026-11-09') }) },
  });
  assert.deepEqual(errors, [NO_SIBLING.replace(SPEED_FILE, earlier), sameEvidence(SPEED_FILE, earlier)]);
});

test('one transcript cannot back results for two benchmarks that are not a run and its measurement', async () => {
  const other = 'model-a--bench-b--alice--2026-11-10--aaaaaaaa.json';
  const unrelated = await errorsFor({
    benchmarks: { 'bench-a': benchmark(), 'bench-b': benchmark() },
    evals: { [FILE]: result(), [other]: result({ benchmark: 'bench-b' }) },
  });
  assert.deepEqual(unrelated, [sameEvidence(other, FILE)]);

  // A speed result cannot borrow the transcript of a run on some other benchmark either.
  const borrowed = await errorsFor({
    benchmarks: { ...WITH_SPEED, 'bench-b': benchmark() },
    evals: { [other]: measuredRun({ benchmark: 'bench-b' }), [SPEED_FILE]: speedOf(measuredRun()) },
  });
  assert.deepEqual(borrowed, [sameEvidence(SPEED_FILE, other), NO_SIBLING]);
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

test('a result for a listed previous version is kept with a warning and is not checked against the current definition', async () => {
  // The definition describes version 1, so its item count and score range say nothing about version 0.
  const benchmarks = { 'bench-a': benchmark({ previous_versions: ['0'] }) };
  const root = makeRoot({ benchmarks, evals: { [FILE]: result({ benchmark_version: '0', n: 150, score: 140 }) } });
  const { errors, warnings } = await validateContent(root);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    `evals/${FILE}: result is for benchmark version 0; the current version is 1, so it will not appear on the leaderboard`,
  ]);
  const current = await validateContent(makeRoot({ benchmarks, evals: { [FILE]: result() } }));
  assert.deepEqual(current.errors, []);
  assert.deepEqual(current.warnings, []);
});

test('a result for a version the benchmark never had is an error', async () => {
  const expected = `evals/${FILE}: benchmark_version "9" is not the current version "1" nor one of its previous versions`;
  const unlisted = await validateContent(makeRoot({ evals: { [FILE]: result({ benchmark_version: '9' }) } }));
  assert.deepEqual(unlisted.errors, [expected]);
  assert.deepEqual(unlisted.warnings, []);
  const benchmarks = { 'bench-a': benchmark({ previous_versions: ['0'] }) };
  assert.deepEqual(await errorsFor({ benchmarks, evals: { [FILE]: result({ benchmark_version: '9' }) } }), [expected]);
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

  test(`${dir}/ ignores a .DS_Store file, which is git-ignored and cannot be committed`, async () => {
    const root = makeRoot();
    writeFileSync(join(root, dir, '.DS_Store'), 'finder metadata');
    assert.deepEqual((await validateContent(root)).errors, []);

    rmSync(join(root, dir, '.DS_Store'));
    mkdirSync(join(root, dir, '.DS_Store'));
    assert.deepEqual((await validateContent(root)).errors, [rejected('.DS_Store')]);
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

const METHOD = { runs: 5, temperature: 0.7, top_p: 1 };
/** n = 200: 170 items right on all five runs, 10 on four, 20 on none. */
const REPEAT = repeatSummary(METHOD, {
  item_pass_histogram: [20, 0, 0, 0, 10, 170],
  run_correct: [178, 178, 178, 178, 178],
  seconds_total: 1000,
});
const repeated = (overrides = {}) => result({ score: REPEAT.pass_k, repeat: REPEAT, ...overrides });
const REPEAT_BENCHMARKS = { 'bench-a': benchmark({ repeat: METHOD }) };

test('a repeat-run result whose counts, figures and method agree is accepted', async () => {
  assert.equal(REPEAT.pass_k, 85);
  assert.deepEqual(await errorsFor({ benchmarks: REPEAT_BENCHMARKS, evals: { [FILE]: repeated() } }), []);
});

test('a repeat-run benchmark scores the share of items right on every run', async () => {
  assert.deepEqual(await errorsFor({ benchmarks: REPEAT_BENCHMARKS, evals: { [FILE]: repeated({ score: REPEAT.pass_1 }) } }), [
    `evals/${FILE}: score ${REPEAT.pass_1} must equal repeat.pass_k (85); a repeat-run benchmark scores the share of items answered correctly on every run`,
  ]);
});

test("a result follows its version's method: repeat runs when it has them, one run when it has not", async () => {
  assert.deepEqual(await errorsFor({ benchmarks: REPEAT_BENCHMARKS, evals: { [FILE]: result() } }), [
    `evals/${FILE}: version 1 of bench-a answers every item 5 times; the result has no repeat block`,
  ]);
  assert.deepEqual(await errorsFor({ evals: { [FILE]: repeated() } }), [
    `evals/${FILE}: repeat is set, but version 1 of bench-a answers every item once`,
  ]);
  assert.deepEqual(await errorsFor({ benchmarks: REPEAT_BENCHMARKS, evals: { [FILE]: repeated({ repeat: { ...REPEAT, temperature: 1 } }) } }), [
    `evals/${FILE}: repeat.temperature is 1; version 1 of bench-a sets 0.7`,
  ]);
});

test('figures that the counts do not give are rejected, so none can be typed in', async () => {
  assert.deepEqual(await errorsFor({ benchmarks: REPEAT_BENCHMARKS, evals: { [FILE]: repeated({ repeat: { ...REPEAT, pass_1: 99 } }) } }), [
    `evals/${FILE}: repeat.pass_1 is 99; the counts give ${REPEAT.pass_1}`,
  ]);
  // Previous versions are not checked against the current method, but their counts still are.
  const earlier = { 'bench-a': benchmark({ version: '2', previous_versions: ['1'] }) };
  const errors = await errorsFor({ benchmarks: earlier, evals: { [FILE]: repeated({ repeat: { ...REPEAT, run_correct: [178] } }) } });
  assert.deepEqual(errors, [`evals/${FILE}: repeat.run_correct must have 5 entries, one per run`]);
});
