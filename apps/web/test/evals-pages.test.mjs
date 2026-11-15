import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'u4ai-evals-site-'));
const danglingOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-dangling-'));
const unknownKeyOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-unknown-key-'));
// The fixture builds keep their content store in their own cacheDir (see astro.config.mjs), so
// fixture rows cannot reach a normal build even if this run is killed; remove it when done.
after(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(danglingOut, { recursive: true, force: true });
  rmSync(unknownKeyOut, { recursive: true, force: true });
  rmSync(join(ROOT, 'node_modules/.astro-fixtures'), { recursive: true, force: true });
});

const page = (path) => readFileSync(join(out, path), 'utf8');

/** Builds the site against a fixture results directory into a temp directory; the real dist is untouched. */
function buildWith(evalsDir, outDir) {
  return spawnSync('bun', ['run', 'astro', 'build', '--outDir', outDir], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, U4AI_EVALS_DIR: evalsDir },
  });
}

const ESCAPED_DEVICE = /Fixture &lt;b&gt;Rig&lt;\/b&gt; &amp;/;
const RAW_DEVICE = /<b>Rig<\/b>/;
const CONTRIBUTOR_REL = 'rel="nofollow ugc noopener"';

test('leaderboard and benchmark page render fixture results', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals', out);
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);

  const board = page('evals/index.html');
  assert.match(board, /GSM8K \(first 200\)/);
  assert.match(board, /href="\/registry\/models\/darsy-xray-analysis"/);
  // Two groups: gguf (70) ranks above mlx (median of 60 and 64 = 62).
  const gguf = board.indexOf('Q4_K_M');
  const mlx = board.indexOf('4bit');
  assert.notEqual(gguf, -1, 'the gguf group must be on the leaderboard');
  assert.notEqual(mlx, -1, 'the mlx group must be on the leaderboard');
  assert.ok(gguf < mlx, 'higher score must rank first');
  assert.match(board, /<td class="rank num">1<\/td>/);
  assert.match(board, /<td class="rank num">2<\/td>/);
  assert.match(board, />62</);
  assert.match(board, /60–64/);
  assert.match(board, /reproduced by 1/);
  assert.match(board, /not yet reproduced/);
  assert.match(board, /self-reported/i);
  // GSM8K has a fixed item count, so each row states how many items the run answered.
  assert.match(board, /<small>n = 200<\/small>/);
  // The version "0" run (score 99) belongs to a previous version and stays off the leaderboard.
  assert.doesNotMatch(board, />99</);

  assert.match(board, /<caption class="sr-only">Leaderboard for GSM8K \(first 200\)<\/caption>/);
  assert.match(board, /<div class="eval-scroll" tabindex="0" role="region" aria-label="Leaderboard for GSM8K \(first 200\)">/);
  assert.match(board, /<select data-eval-category>/);
  assert.match(board, /<option value="quality">Quality<\/option>/);
  assert.match(board, /<section[^>]* data-category="quality"/);
  assert.match(board, /<p class="empty"[^>]* hidden data-eval-none>No results match these filters\.<\/p>/);

  const detail = page('evals/gsm8k-200/index.html');
  assert.match(detail, /Known weaknesses/);
  assert.match(detail, /fixture-bot-2/);
  assert.match(detail, /--fixture-three/);
  assert.match(detail, /3{12}/);
  assert.match(detail, /<small>n = 200<\/small>/);
  assert.match(detail, /<caption class="sr-only">Leaderboard for GSM8K \(first 200\)<\/caption>/);
  assert.match(detail, /<td class="rank num">1<\/td>/);

  // Run tables are evidence, not search content; the method prose stays indexed.
  assert.match(detail, /<section[^>]* data-pagefind-ignore[^>]*>\s*<h2>Every run<\/h2>/);
  const previous = detail.indexOf('<h2>Previous versions</h2>');
  assert.notEqual(previous, -1, 'runs of an older benchmark version get their own section');
  assert.doesNotMatch(detail.slice(0, previous), />99</);
  const previousRuns = detail.slice(previous);
  assert.match(previousRuns, />99</);
  assert.match(previousRuns, /--fixture-zero/);
  assert.match(previousRuns, /0\.123 tok\/s/);

  // Contributor text is escaped, and links built from it are marked as user content.
  assert.match(detail, ESCAPED_DEVICE);
  assert.doesNotMatch(detail, RAW_DEVICE);
  assert.ok(detail.includes(`<a href="https://github.com/fixture-bot-2" ${CONTRIBUTOR_REL}>`));
  assert.ok(detail.includes(`<a href="https://example.org/fixture-raw-output.jsonl" ${CONTRIBUTOR_REL}>`));
});

test('model page lists its evaluations and local setups; the feed publishes the groups', () => {
  const model = page('registry/models/darsy-xray-analysis/index.html');
  assert.match(model, /Evaluations/);
  assert.match(model, /href="\/evals\/gsm8k-200"/);
  assert.match(model, /Runs locally on/);
  assert.match(model, /Fixture Laptop/);
  assert.match(model, /70 tok\/s/);
  assert.match(model, /<caption class="sr-only">Evaluation results for Darsy X-Ray Analysis<\/caption>/);
  assert.match(model, ESCAPED_DEVICE);
  assert.doesNotMatch(model, RAW_DEVICE);

  const feed = JSON.parse(page('data/evals.json'));
  assert.equal(feed.schema_version, 1);
  assert.equal(
    feed.notice,
    'Results are self-reported by contributors. Each benchmark page lists every run with its reproduce command and evidence hash.',
  );
  assert.deepEqual(feed.benchmarks.map((b) => b.id), ['gsm8k-200']);
  assert.equal(feed.benchmarks[0].higher_is_better, true);
  assert.equal(feed.groups.length, 3);
  const current = feed.groups.filter((g) => g.benchmark_version === feed.benchmarks[0].version);
  assert.equal(current.length, 2);
  const mlx = current.find((g) => g.format === 'mlx');
  assert.equal(mlx.score, 62);
  assert.deepEqual(mlx.submitters, ['fixture-bot', 'fixture-bot-2']);
  // A run's id is its filename without the extension.
  assert.deepEqual(mlx.run_ids, [
    'darsy-xray-analysis--gsm8k-200--fixture-bot--2026-11-01--11111111',
    'darsy-xray-analysis--gsm8k-200--fixture-bot-2--2026-11-02--22222222',
  ]);
  assert.equal(feed.runs, 4);

  assert.match(page('index.html'), /href="\/evals"/);
});

test('a result that references a missing model fails the build and names it', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals-dangling', danglingOut);
  const output = `${build.stdout}${build.stderr}`;
  assert.notEqual(build.status, 0, output);
  assert.match(output, /ghost-model--gsm8k-200--fixture-bot--2026-11-01--55555555: model "ghost-model"/);
});

test('the content collection rejects a result with an unknown key, like the validator does', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals-unknown-key', unknownKeyOut);
  const output = `${build.stdout}${build.stderr}`;
  assert.notEqual(build.status, 0, output);
  assert.match(output, /Unrecognized key: "notes"/);
});
