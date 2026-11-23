import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { matchingBaseline } from '../src/baselines.ts';
import { repeatSummary } from '../src/repeat.ts';
import { validateEvals } from '../src/validate-evals.ts';
import { benchmark, measuredBenchmark, result } from './fixtures/evals.mjs';

const legacy = result();
const run = { ...legacy, setup: { ...legacy.setup, served_model: 'org/exact-checkpoint' } };
const entry = {
  id: 'local-1',
  model: run.model,
  submitter: run.run.submitter,
  runtime: run.setup.runtime,
  format: run.setup.format,
  quantization: run.setup.quantization,
  hardware: run.setup.hardware,
  served_model: run.setup.served_model,
  registered_on: '2026-11-10',
};
const manifest = (entries = [entry], overrides = {}) => ({
  benchmark: run.benchmark,
  benchmark_version: run.benchmark_version,
  entries,
  ...overrides,
});
const alter = (patch) => ({ ...run, ...patch });
const withSetup = (patch) => alter({ setup: { ...run.setup, ...patch } });
const withHardware = (patch) => withSetup({ hardware: { ...run.setup.hardware, ...patch } });
const withRun = (patch) => alter({ run: { ...run.run, ...patch } });

const method = { runs: 2, temperature: 0.7, top_p: 1 };
const apiSetup = { runtime: 'api', format: 'other', quantization: 'undisclosed' };
const apiEntry = { ...entry, ...apiSetup, id: 'api-1', model: 'external-model', provider: 'fixture', model_card: 'https://example.org/model' };
const apiRun = {
  ...withSetup(apiSetup),
  model: apiEntry.model,
  score: 100,
  repeat: repeatSummary(method, { item_pass_histogram: [0, 0, 200], run_correct: [200, 200], seconds_total: 100 }),
  api: {
    provider: apiEntry.provider,
    model_card: apiEntry.model_card,
    terms_url: 'https://example.org/terms',
    terms_checked_on: '2026-11-10',
    expected_usd: 1,
    approved_usd: 2,
  },
};

test('baseline matching requires the exact version, model, submitter and setup', () => {
  const registered = manifest();
  assert.equal(matchingBaseline(registered, run, true), entry);
  assert.equal(matchingBaseline(registered, withSetup({ runtime_version: 'different' }), true), entry);
  const mismatches = {
    benchmark: alter({ benchmark: 'bench-b' }),
    version: alter({ benchmark_version: '2' }),
    model: alter({ model: 'model-b' }),
    submitter: withRun({ submitter: 'bob' }),
    served_model: withSetup({ served_model: 'Org/exact-checkpoint' }),
    runtime: withSetup({ runtime: 'vllm' }),
    format: withSetup({ format: 'gguf' }),
    quantization: withSetup({ quantization: '4bit-DWQ' }),
    device: withHardware({ device: run.setup.hardware.device.toLowerCase() }),
    accelerator: withHardware({ accelerator: 'cpu' }),
    memory: withHardware({ memory_gb: 64 }),
    'legacy run without served_model': legacy,
  };
  for (const [name, changed] of Object.entries(mismatches)) {
    assert.equal(matchingBaseline(registered, changed, true), undefined, name);
  }
  assert.equal(matchingBaseline(undefined, run, true), undefined);
});

test('withdrawal leaves earlier evidence linked within an inclusive date window', () => {
  const withdrawn = { ...entry, withdrawal: { date: '2026-11-12', reason: 'The test hardware is unavailable.' } };
  const registered = manifest([withdrawn]);
  for (const date of ['2026-11-10', '2026-11-11', '2026-11-12']) {
    assert.equal(matchingBaseline(registered, withRun({ date }), true), withdrawn);
  }
  for (const date of ['2026-11-09', '2026-11-13']) {
    assert.equal(matchingBaseline(registered, withRun({ date }), true), undefined);
  }
});

test('recorded API card identity survives later addition of a local registry model', () => {
  const registered = manifest([apiEntry]);
  assert.equal(matchingBaseline(registered, apiRun, false), apiEntry);
  assert.equal(matchingBaseline(registered, apiRun, true), apiEntry);
  const differentCard = { ...apiRun, api: { ...apiRun.api, model_card: 'https://example.org/other' } };
  assert.equal(matchingBaseline(registered, differentCard, false), undefined);
  const noCard = { ...apiRun, api: { ...apiRun.api, model_card: undefined } };
  assert.equal(matchingBaseline(registered, noCard, false), undefined);
  const internal = { ...apiEntry, model_card: undefined };
  assert.equal(matchingBaseline(manifest([internal]), apiRun, true), undefined);
  assert.equal(matchingBaseline(manifest([internal]), noCard, true), internal);
});

test('an identical served ID on another API provider does not match a baseline', () => {
  const differentProvider = { ...apiRun, api: { ...apiRun.api, provider: 'other-provider' } };
  assert.equal(matchingBaseline(manifest([apiEntry]), differentProvider, false), undefined);
  const internal = { ...apiEntry, model_card: undefined };
  assert.equal(matchingBaseline(manifest([internal]), differentProvider, true), undefined);
  assert.equal(matchingBaseline(manifest([internal]), { ...apiRun, api: undefined }, true), undefined);
});

const MANIFEST_FILE = 'baselines/bench-a-v1.md';
const frontmatter = (data) => `---\n${JSON.stringify(data)}\n---\n`;

function fixture(t, { files = { [MANIFEST_FILE]: manifest() }, definition = benchmark(), results = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-baselines-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['models', 'benchmarks', 'baselines', 'evals']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'models', 'model-a.md'), frontmatter({ name: 'Model A' }));
  writeFileSync(join(root, 'benchmarks', 'bench-a.md'), frontmatter(definition));
  for (const [path, data] of Object.entries(files)) writeFileSync(join(root, path), frontmatter(data));
  for (const r of results) {
    const file = [r.model, r.benchmark, r.run.submitter, r.run.date, r.evidence.sha256.slice(0, 8)].join('--');
    writeFileSync(join(root, 'evals', `${file}.json`), JSON.stringify(r));
  }
  return root;
}

async function validate(root) {
  const errors = [];
  const { models } = await validateEvals(root, errors, [], '2026-11-23');
  return { errors, models };
}

test('content gate accepts separate current and previous version manifests', async (t) => {
  const options = {
    definition: benchmark({ version: '2', previous_versions: ['1'] }),
    files: { [MANIFEST_FILE]: manifest(), 'baselines/bench-a-v2.md': manifest([entry], { benchmark_version: '2' }) },
  };
  assert.deepEqual((await validate(fixture(t, options))).errors, []);
});

test('content gate rejects a misnamed second manifest of the same version', async (t) => {
  const { errors } = await validate(fixture(t, {
    files: { [MANIFEST_FILE]: manifest(), 'baselines/duplicate.md': manifest() },
  }));
  assert.match(errors.join('\n'), /baselines\/duplicate\.md: filename must be "bench-a-v1\.md"/);
  assert.match(errors.join('\n'), /same benchmark version as baselines\/bench-a-v1\.md/);
});

test('content gate rejects a version not listed on the benchmark and measured benchmarks', async (t) => {
  const invalidVersion = await validate(fixture(t, { definition: benchmark({ version: '2' }) }));
  assert.match(invalidVersion.errors.join('\n'), /benchmark_version "1" is not the current version/);
  const measured = await validate(fixture(t, { definition: measuredBenchmark({ measured_on: 'bench-b' }) }));
  assert.match(measured.errors.join('\n'), /registered baselines are not allowed for measured benchmarks/);
});

test('content gate rejects nested and symlink manifests', async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'baselines/nested'));
  writeFileSync(join(root, 'baselines/nested/bench-a-v1.md'), frontmatter(manifest()));
  symlinkSync('bench-a-v1.md', join(root, 'baselines/linked.md'));
  const { errors } = await validate(root);
  assert.match(errors.join('\n'), /baselines\/nested: .*subfolders and links are not read/);
  assert.match(errors.join('\n'), /baselines\/linked\.md: .*subfolders and links are not read/);
});

test('content gate rejects both duplicate IDs and duplicate setup keys within a version', async (t) => {
  const data = manifest([entry, { ...entry, served_model: 'a-different-model' }, { ...entry, id: 'local-2' }]);
  const { errors } = await validate(fixture(t, { files: { [MANIFEST_FILE]: data } }));
  assert.match(errors.join('\n'), /duplicate entry id "local-1"/);
  assert.match(errors.join('\n'), /same setup as entry "local-1"/);
});

test('content gate rejects unknown fields, missing withdrawal reasons and dates outside the calendar or window', async (t) => {
  const cases = [
    [{ ...entry, typo: true }, /entries\.0: .*typo/],
    [{ ...entry, withdrawal: { date: '2026-11-12' } }, /withdrawal\.reason/],
    [{ ...entry, withdrawal: { date: '2026-11-12', reason: '   ' } }, /withdrawal\.reason/],
    [{ ...entry, registered_on: '2026-11-31' }, /registered_on/],
    [{ ...entry, withdrawal: { date: '2026-11-09', reason: 'No hardware.' } }, /withdrawal/],
  ];
  for (const [changed, expected] of cases) {
    const { errors } = await validate(fixture(t, { files: { [MANIFEST_FILE]: manifest([changed]) } }));
    assert.match(errors.join('\n'), expected);
  }
});

test('content gate requires a model card unless the setup is API-only with an upstream card', async (t) => {
  const missing = await validate(fixture(t, { files: { [MANIFEST_FILE]: manifest([{ ...entry, model: 'missing' }]) } }));
  assert.match(missing.errors.join('\n'), /model "missing" has no card in models\//);
  const accepted = await validate(fixture(t, {
    definition: benchmark({ repeat: method }),
    files: { [MANIFEST_FILE]: manifest([apiEntry]) },
    results: [apiRun],
  }));
  assert.deepEqual(accepted.errors, []);
  assert.equal(accepted.models.has(apiEntry.model), false);
  const noUpstream = await validate(fixture(t, {
    definition: benchmark({ repeat: method }),
    results: [{ ...apiRun, api: { ...apiRun.api, model_card: undefined } }],
  }));
  assert.match(noUpstream.errors.join('\n'), /model "external-model" has no card in models\//);
});

test('content gate distinguishes API setup keys by provider and rejects provider fields on local setups', async (t) => {
  const anotherProvider = { ...apiEntry, id: 'api-2', provider: 'other-provider' };
  const valid = await validate(fixture(t, { files: { [MANIFEST_FILE]: manifest([apiEntry, anotherProvider]) } }));
  assert.deepEqual(valid.errors, []);
  for (const invalid of [{ ...apiEntry, provider: undefined }, { ...entry, provider: 'fixture' }]) {
    const { errors } = await validate(fixture(t, { files: { [MANIFEST_FILE]: manifest([invalid]) } }));
    assert.match(errors.join('\n'), /provider/);
  }
});

test('the gate rejects hosted registrations that cannot match any valid API result', async (t) => {
  const incorrect = { ...apiEntry, format: 'mlx', quantization: '4bit' };
  const { errors } = await validate(fixture(t, { files: { [MANIFEST_FILE]: manifest([incorrect]) } }));
  assert.match(errors.join('\n'), /undisclosed/);
});
