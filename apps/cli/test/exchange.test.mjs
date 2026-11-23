import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { validateContent } from '../../../packages/core/src/validate.ts';
import { readExchangeRecords } from '../../../packages/core/src/read-exchange.ts';
import { finding, hash, makeExchangeRoot, markdown, RESULT_ID } from '../../../packages/core/test/fixtures/exchange.mjs';
import { benchmark, result } from '../../../packages/core/test/fixtures/evals.mjs';
import { repeatSummary } from '../../../packages/core/src/repeat.ts';

const repo = resolve(import.meta.dirname, '../../..');
const author = { author: 'fixture-author', date: '2026-11-10' };
const hypothesisFlags = {
  id: 'fixture-new-hypothesis', title: 'CLI fixture hypothesis', claim: 'Fixture score exceeds 70.',
  benchmark: 'bench-a', models: 'model-a', prediction: 'Fixture run exceeds the threshold.', ...author,
};
const findingFlags = {
  id: 'fixture-finding', hypothesis: 'fixture-hypothesis', results: RESULT_ID, verdict: 'supports',
  summary: 'Fixture run exceeded 70.', limitations: 'Fixture only; not research.', ...author,
};
const reviewFlags = {
  finding: 'fixture-finding', reviewer: 'fixture-reviewer', date: '2026-11-11',
  verdict: 'accept', checks: 'read-results', notes: 'Fixture review only; not independent research.',
};
function cli(root, command, flags = {}, extra = []) {
  return spawnSync('bun', ['run', 'exchange', '--', command, '--content-dir', root,
    ...Object.entries(flags).flatMap(([key, value]) => [`--${key}`, value]), ...extra],
  { cwd: repo, encoding: 'utf8', timeout: 120_000 });
}
function success(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}
function rejected(result, pattern, status = 1) {
  assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^status: error$/m);
  assert.match(result.stdout, status === 2 ? /^kind: usage$/m : /^kind: domain$/m);
  assert.match(result.stdout, pattern);
}
function fixture(t, options) {
  const root = makeExchangeRoot(options);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Oracle: approved task-3 CLI contract. Exercise the public root script, not a parser mock.
test('exchange parent help lists commands, leaf help scopes flags, and neither creates records', (t) => {
  const root = fixture(t);
  const commands = ['new-hypothesis', 'new-finding', 'review', 'graft'];
  const help = cli(root, '--help');
  assert.equal(help.status, 0, help.stderr);
  for (const command of commands) assert.match(help.stdout, new RegExp(command));
  for (const command of commands) {
    const result = cli(root, command, {}, ['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`^usage: bun run exchange -- ${command} `));
    assert.match(result.stdout, /--agent-model/);
    assert.match(result.stdout, /Examples:/);
    if (command === 'new-finding' || command === 'graft') {
      assert.match(result.stdout, /\[--incumbent RESULT_ID --candidate RESULT_ID\]/);
      assert.match(result.stdout, /include both.*--results/i);
    } else {
      assert.doesNotMatch(result.stdout, /--incumbent|--candidate/);
    }
  }
  const reviewHelp = cli(root, 'review', {}, ['--help']);
  assert.match(reviewHelp.stdout, /--finding-sha256/);
  assert.doesNotMatch(reviewHelp.stdout, /new-hypothesis|new-finding|graft|--source-sha256/);
  rejected(cli(root, 'unrecognized-command', {}, ['--help']), /unknown command/, 2);
  assert.deepEqual(readdirSync(join(root, 'findings')), []);
});

test('hypothesis and finding scaffolds preserve explicit attribution and source dates and pass the gate', async (t) => {
  const root = fixture(t);
  const created = success(cli(root, 'new-hypothesis', {
    ...hypothesisFlags, 'agent-model': 'fixture-model-not-real', 'agent-harness': 'fixture-harness-not-real',
  }));
  assert.equal(created.id, 'fixture-new-hypothesis');
  const output = cli(root, 'new-finding', { ...findingFlags, hypothesis: created.id });
  const result = success(output);
  assert.deepEqual(Object.keys(result).sort(), ['id', 'path', 'sha256']);
  assert.match(output.stderr, /bun run validate/);
  assert.match(output.stderr, /verify\.mjs/);
  assert.match(output.stderr, /pull request/i);
  assert.match(output.stderr, /disabled/i);
  const parsed = await readExchangeRecords(root);
  const h = parsed.records.hypotheses.find((entry) => entry.id === created.id).data;
  assert.equal(h.date, '2026-11-10');
  assert.deepEqual(h.agent, { model: 'fixture-model-not-real', harness: 'fixture-harness-not-real' });
  const bytes = readFileSync(result.path);
  assert.equal(result.sha256, hash(bytes));
  assert.equal(JSON.parse(bytes).hypothesis, created.id);
  assert.equal(JSON.parse(bytes).agent, undefined);
  assert.deepEqual((await validateContent(root)).errors, []);
});

test('switch scaffold requires both directional inputs before it creates a record', (t) => {
  const root = fixture(t);
  rejected(cli(root, 'new-finding', { ...findingFlags, incumbent: RESULT_ID }), /--incumbent and --candidate must be supplied together/, 2);
  assert.deepEqual(readdirSync(join(root, 'findings')), []);
});

test('new findings and grafts retain the direction of two validated published result IDs', (t) => {
  const root = fixture(t);
  const method = { runs: 5, temperature: 0.7, top_p: 1 };
  writeFileSync(join(root, 'benchmarks/bench-a.md'), markdown(benchmark({ repeat: method })));
  const candidate = RESULT_ID.replace(/aaaaaaaa$/, 'bbbbbbbb');
  for (const [id, seconds, device, digest] of [
    [RESULT_ID, 600, 'Incumbent fixture', 'a'],
    [candidate, 400, 'Candidate fixture', 'b'],
  ]) {
    const run = result();
    run.repeat = repeatSummary(method, {
      item_pass_histogram: [0, 0, 0, 0, 0, 200], run_correct: [200, 200, 200, 200, 200], seconds_total: seconds,
    });
    run.score = run.repeat.pass_k;
    run.setup.hardware.device = device;
    run.evidence.sha256 = digest.repeat(64);
    writeFileSync(join(root, 'evals', `${id}.json`), JSON.stringify(run));
  }
  const flags = { ...findingFlags, results: `${candidate},${RESULT_ID}`, incumbent: RESULT_ID, candidate };
  const output = success(cli(root, 'new-finding', flags));
  assert.deepEqual(JSON.parse(readFileSync(output.path, 'utf8')).switch, { incumbent: RESULT_ID, candidate });
  const graft = success(cli(root, 'graft', {
    ...flags, id: 'fixture-switch-graft', kind: 'finding', source: output.id,
    'source-sha256': output.sha256, note: 'Adopts the fixture comparison.',
  }));
  const grafted = JSON.parse(readFileSync(graft.path, 'utf8'));
  assert.deepEqual(grafted.switch, { incumbent: RESULT_ID, candidate });
  assert.deepEqual(grafted.grafts, [{ finding: output.id, sha256: output.sha256, note: 'Adopts the fixture comparison.' }]);
});

test('review pins exact original bytes, not reserialized JSON, and the gate accepts the workflow', async (t) => {
  const bytes = `  ${JSON.stringify(finding(), null, 4).replaceAll('\n', '\r\n')}\r\n`;
  const root = fixture(t, { findings: { 'fixture-finding': bytes } });
  const created = success(cli(root, 'review', { ...reviewFlags, 'finding-sha256': hash(bytes) }));
  assert.equal(created.id, 'fixture-finding--fixture-reviewer--2026-11-11');
  const data = JSON.parse(readFileSync(created.path, 'utf8'));
  assert.equal(data.finding_sha256, hash(bytes));
  assert.deepEqual(data.checks, ['read-results']);
  assert.deepEqual((await validateContent(root)).errors, []);
  rejected(cli(root, 'review', { ...reviewFlags, date: '2026-11-12' }), /one review per reviewer/);
  assert.deepEqual(readdirSync(join(root, 'reviews')), [`${created.id}.json`]);
});

test('review refuses self-review, incorrect inspected hash and missing or malformed references without writing', (t) => {
  const root = fixture(t, { findings: { 'fixture-finding': finding() } });
  rejected(cli(root, 'review', { ...reviewFlags, reviewer: 'fixture-author' }), /reviewer must differ/);
  rejected(cli(root, 'review', { ...reviewFlags, 'finding-sha256': '0'.repeat(64) }), /hash|sha256/);
  rejected(cli(root, 'review', { ...reviewFlags, finding: 'unknown-finding' }), /unknown finding/);
  rejected(cli(root, 'review', { ...reviewFlags, finding: '../fixture-finding' }), /finding.*id/, 2);
  assert.deepEqual(readdirSync(join(root, 'reviews')), []);
});

test('bad inputs fail closed without records: unknown references, malformed results, incomplete attribution, flags and dates', (t) => {
  const root = fixture(t);
  for (const [flags, pattern] of [
    [{ ...findingFlags, results: '../escape' }, /results.*result file id/],
    [{ ...findingFlags, 'agent-model': 'fixture-model' }, /supplied together/],
    [{ ...findingFlags, date: '2026-02-30' }, /real calendar date/],
    [{ ...findingFlags, summary: '<script>bad</script>' }, /plain text/],
    [{ ...findingFlags, id: '../outside' }, /record id/],
  ]) rejected(cli(root, 'new-finding', flags), pattern, 2);
  rejected(cli(root, 'new-finding', { ...findingFlags, results: 'model-a--bench-a--alice--2026-11-10--bbbbbbbb' }), /result/);
  rejected(cli(root, 'new-finding', { ...findingFlags, hypothesis: 'missing' }), /hypothesis/);
  rejected(cli(root, 'new-hypothesis', { ...hypothesisFlags, models: 'missing-model' }), /unknown model/);
  rejected(cli(root, 'new-hypothesis', { ...hypothesisFlags, benchmark: 'missing-benchmark' }), /unknown benchmark/);
  rejected(cli(root, 'new-finding', findingFlags, ['--date', '2026-11-11']), /duplicate/, 2);
  rejected(cli(root, 'new-finding', { ...findingFlags, force: 'true' }), /unknown flag/, 2);
  const { date, ...noDate } = findingFlags;
  rejected(cli(root, 'new-finding', noDate), /missing.*--date/, 2);
  assert.deepEqual(readdirSync(join(root, 'findings')), []);
  assert.deepEqual(readdirSync(join(root, 'hypotheses')), ['fixture-hypothesis.md']);
});

test('existing records and symlink destinations are never overwritten', (t) => {
  const root = fixture(t, { findings: { 'fixture-finding': finding() } });
  const path = join(root, 'findings/fixture-finding.json');
  const original = readFileSync(path);
  rejected(cli(root, 'new-finding', { ...findingFlags, summary: 'Replacement is forbidden.' }), /exists|duplicate/);
  assert.deepEqual(readFileSync(path), original);
  const link = join(root, 'findings/fixture-link.json');
  symlinkSync(path, link);
  rejected(cli(root, 'new-finding', { ...findingFlags, id: 'fixture-link' }), /link|exists/);
  assert.deepEqual(readFileSync(path), original);
});

test('grafting creates a new adopting hypothesis or superseding finding and preserves reviewed source bytes', async (t) => {
  const root = fixture(t, { findings: { 'fixture-finding': finding() } });
  const path = join(root, 'findings/fixture-finding.json');
  const original = readFileSync(path);
  success(cli(root, 'review', reviewFlags));
  const shared = { source: 'fixture-finding', note: 'Fixture method reused; not a research claim.' };
  const hyp = success(cli(root, 'graft', { ...hypothesisFlags, kind: 'hypothesis', ...shared }));
  const replacement = success(cli(root, 'graft', {
    ...findingFlags, id: 'fixture-correction', kind: 'finding', supersedes: 'fixture-finding', ...shared,
    'source-sha256': hash(original),
  }));
  assert.deepEqual(readFileSync(path), original);
  const data = JSON.parse(readFileSync(replacement.path, 'utf8'));
  assert.equal(data.supersedes, 'fixture-finding');
  assert.deepEqual(data.grafts, [{ finding: 'fixture-finding', sha256: hash(original), note: shared.note }]);
  const records = (await readExchangeRecords(root)).records;
  assert.deepEqual(records.hypotheses.find((entry) => entry.id === hyp.id).data.grafts, data.grafts);
  assert.deepEqual((await validateContent(root)).errors, []);
  rejected(cli(root, 'graft', { ...findingFlags, kind: 'finding', ...shared }), /exists|duplicate|itself/);
  rejected(cli(root, 'graft', { ...hypothesisFlags, id: 'fixture-bad-graft', kind: 'hypothesis', ...shared,
    'source-sha256': 'f'.repeat(64) }), /hash|sha256/);
  assert.deepEqual(readFileSync(path), original);
});

test('invalid existing references and incompatible evidence cannot produce apparently valid scaffolds', (t) => {
  const root = fixture(t);
  const resultPath = join(root, 'evals', `${RESULT_ID}.json`);
  const data = JSON.parse(readFileSync(resultPath, 'utf8'));
  writeFileSync(resultPath, JSON.stringify({ ...data, model: 'missing-model' }));
  rejected(cli(root, 'new-finding', findingFlags), /missing-model|incompatible model/);
  assert.deepEqual(readdirSync(join(root, 'findings')), []);
});
