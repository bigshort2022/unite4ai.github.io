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

/** One category's section of the evaluations page, from its opening tag to the next section. */
const categorySection = (board, category) => board
  .split(/<section[^>]* data-category="/)
  .slice(1)
  .find((section) => section.startsWith(`${category}"`));
/** A benchmark page's leaderboard, without the method prose and run tables that follow it. */
const leaderboardOf = (detail) => detail.slice(detail.indexOf('<h2>Leaderboard</h2>'), detail.indexOf('<div class="prose"'));

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
  assert.match(board, /<span class="score">62%<\/span>/);
  assert.match(board, /60–64/);
  assert.match(board, /reproduced by 1/);
  assert.match(board, /not yet reproduced/);
  assert.match(board, /self-reported/i);
  assert.match(
    board.replace(/\s+/g, ' '),
    /Speed is tokens generated per second after the first token, from the server's own token count; it depends on the hardware and on what else the machine was doing\./,
  );
  // GSM8K has a fixed item count, so each row states how many items the run answered.
  assert.match(board, /<small>n = 200<\/small>/);
  // The version "0" run (score 99) belongs to a previous version and stays off the leaderboard.
  assert.doesNotMatch(board, />99%</);

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
  assert.doesNotMatch(detail.slice(0, previous), />99%</);
  const previousRuns = detail.slice(previous);
  assert.match(previousRuns, />99%</);
  assert.match(previousRuns, /--fixture-zero/);
  assert.match(previousRuns, /0\.123 tok\/s/);

  // A run's setup note is printed with its setup, on that run only.
  assert.equal(detail.split('<small>thinking disabled</small>').length - 1, 1);

  // Contributor text is escaped, and links built from it are marked as user content.
  assert.match(detail, ESCAPED_DEVICE);
  assert.doesNotMatch(detail, RAW_DEVICE);
  assert.ok(detail.includes(`<a href="https://github.com/fixture-bot-2" ${CONTRIBUTOR_REL}>`));
  assert.ok(detail.includes(`<a href="https://example.org/fixture-raw-output.jsonl" ${CONTRIBUTOR_REL}>`));
});

test('a measured benchmark lists each machine and runtime on its own, unranked; quality rows name no device', () => {
  const board = page('evals/index.html');
  const efficiency = categorySection(board, 'efficiency');
  assert.ok(efficiency, 'the evaluations page must have an efficiency section');
  assert.match(efficiency, /<h2 id="category-efficiency"[^>]*>Efficiency<\/h2>/);
  assert.match(efficiency, /<a href="\/evals\/decode-speed-gsm8k-200"[^>]*>Decode speed on GSM8K-200<\/a>/);
  assert.match(board, /<option value="efficiency">Efficiency<\/option>/);
  assert.match(efficiency, /<caption class="sr-only">Leaderboard for Decode speed on GSM8K-200<\/caption>/);

  // The two runs share a model, format, quantization and runtime: only the machine tells them apart.
  for (const html of [efficiency, leaderboardOf(page('evals/decode-speed-gsm8k-200/index.html'))]) {
    const tower = html.indexOf('Fixture Tower');
    const laptop = html.indexOf('Fixture Laptop');
    assert.notEqual(tower, -1, 'the tower must have its own row');
    assert.notEqual(laptop, -1, 'the laptop must have its own row');
    assert.ok(tower < laptop, 'rows are sorted by speed');
    // A speed on one machine does not outrank a speed on another, so the rows carry no rank.
    assert.doesNotMatch(html, /class="rank|>Rank</);
    assert.match(html, /<p[^>]*>Grouped per machine and runtime\. Compare rows on the same machine only\.<\/p>/);
    assert.match(html, /<span class="score">140\.25 tok\/s<\/span>/);
    assert.match(html, /<span class="score">61\.5 tok\/s<\/span>/);
    assert.match(html, /<small>llama\.cpp 0\.0\.0 · nvidia<\/small>\s*<small>Fixture Tower · 24 GB<\/small>/);
    assert.match(html, /<small>llama\.cpp 0\.0\.0 · apple-silicon<\/small>\s*<small>Fixture Laptop · 32 GB<\/small>/);
    // The score is the speed, so it is not repeated in a column of its own.
    assert.doesNotMatch(html, /<th scope="col">Speed<\/th>/);
  }
  // A measured benchmark has no items to count.
  assert.doesNotMatch(efficiency, /<small>n = /);

  // Hardware does not change a score, so quality rows are ranked, not split by device, and name none.
  for (const html of [categorySection(board, 'quality'), leaderboardOf(page('evals/gsm8k-200/index.html'))]) {
    assert.match(html, /<th scope="col">Speed<\/th>/);
    assert.match(html, /<td class="rank num">2<\/td>/);
    assert.doesNotMatch(html, /Grouped per machine/);
    assert.doesNotMatch(html, /Fixture/);
  }

  // Run tables: a speed run's score is its speed, so the setup does not repeat it.
  const speedPage = page('evals/decode-speed-gsm8k-200/index.html');
  assert.match(speedPage, /<span class="score">61\.5 tok\/s<\/span>/);
  assert.doesNotMatch(speedPage, /<small>[\d.]+ tok\/s<\/small>/);
  assert.match(page('evals/gsm8k-200/index.html'), /<small>61\.5 tok\/s<\/small>/);

  // A benchmark without results keeps its section and says how results arrive.
  assert.match(
    categorySection(board, 'security').replace(/\s+/g, ' '),
    /No results yet\. Results arrive by pull request from people who ran this benchmark on their own hardware\./,
  );
});

test('a score is printed with its unit: a percent sign attached, any other unit after one space', () => {
  const quality = page('evals/gsm8k-200/index.html');
  const speed = page('evals/decode-speed-gsm8k-200/index.html');
  assert.match(quality, /<span class="tag">accuracy \(%\), higher is better<\/span>/);
  assert.match(speed, /<span class="tag">decode speed \(tok\/s\), higher is better<\/span>/);

  const [evaluations] = page('registry/models/darsy-xray-analysis/index.html').split('Runs locally on');
  for (const html of [page('evals/index.html'), `${leaderboardOf(quality)}${leaderboardOf(speed)}`, evaluations]) {
    assert.match(html, /<span class="score">70%<\/span>/);
    assert.match(html, /<span class="score">140\.25 tok\/s<\/span>/);
  }
  for (const html of [page('evals/index.html'), quality, speed, evaluations]) {
    assert.doesNotMatch(html, /\( tok|\d {2,}tok\/s|\d tok\/s<\/span> tok|\d %/);
  }
});

test('model page lists its evaluations and local setups; the feed publishes the groups', () => {
  const model = page('registry/models/darsy-xray-analysis/index.html');
  assert.match(model, /Evaluations/);
  assert.match(model, /href="\/evals\/gsm8k-200"/);
  assert.match(model, /Runs locally on/);
  // The local-run matrix: each setup's best speed and its shortest time to the first token.
  const [evaluations, matrix] = model.split('Runs locally on');
  assert.match(matrix, /Best measured speed and lowest time to first token per setup; the two can come from different runs\./);
  assert.match(matrix, /<th scope="col">First token<\/th>/);
  assert.match(matrix, /Fixture Tower<small>nvidia · 24 GB<\/small><\/td>\s*<td class="num">140\.25 tok\/s<\/td>\s*<td class="num">95 ms<\/td>/);
  assert.match(matrix, /Fixture Laptop<small>apple-silicon · 32 GB<\/small><\/td>\s*<td class="num">61\.5 tok\/s<\/td>\s*<td class="num">480 ms<\/td>/);
  // The mlx setup measured its speed but not its time to the first token.
  assert.match(matrix, /<td class="num">70 tok\/s<\/td>\s*<td class="num">—<\/td>/);
  // Its results on a measured benchmark say which machine and runtime each one is from. Their
  // score is the speed, so the speed column has nothing to add.
  const speedRows = evaluations.split('<tr>').filter((row) => row.includes('href="/evals/decode-speed-gsm8k-200"'));
  assert.equal(speedRows.length, 2);
  assert.match(speedRows.join(''), /<small>llama\.cpp 0\.0\.0<\/small>\s*<small>Fixture Tower · 24 GB<\/small>/);
  assert.match(speedRows.join(''), /<small>llama\.cpp 0\.0\.0<\/small>\s*<small>Fixture Laptop · 32 GB<\/small>/);
  for (const row of speedRows) {
    assert.match(row, /<td class="num">—<\/td>/);
    assert.doesNotMatch(row, /tok\/s<\/td>/);
  }
  // A quality row keeps the speed its runs measured.
  assert.match(evaluations, /<td class="num">61\.5 tok\/s<\/td>/);
  assert.match(model, /<caption class="sr-only">Evaluation results for Darsy X-Ray Analysis<\/caption>/);
  assert.match(model, ESCAPED_DEVICE);
  assert.doesNotMatch(model, RAW_DEVICE);

  const feed = JSON.parse(page('data/evals.json'));
  assert.equal(feed.schema_version, 1);
  assert.equal(
    feed.notice,
    'Results are self-reported by contributors. Each benchmark page lists every run with its reproduce command and evidence hash.',
  );
  assert.deepEqual(feed.benchmarks.map((b) => b.id), ['gsm8k-200', 'canary-injection-v1', 'decode-speed-gsm8k-200']);
  assert.equal(feed.benchmarks[0].higher_is_better, true);
  // Groups of a measured benchmark carry their runtime and machine; quality groups do not.
  assert.equal(feed.groups.length, 5);
  const quality = feed.groups.filter((g) => g.benchmark === 'gsm8k-200');
  assert.deepEqual(quality.map((g) => [g.runtime, g.device, g.memory_gb]), [[null, null, null], [null, null, null], [null, null, null]]);
  assert.deepEqual(
    feed.groups
      .filter((g) => g.benchmark === 'decode-speed-gsm8k-200')
      .map((g) => [g.runtime, g.runtime_versions, g.device, g.memory_gb, g.score]),
    [['llama.cpp', ['0.0.0'], 'Fixture Laptop', 32, 61.5], ['llama.cpp', ['0.0.0'], 'Fixture Tower', 24, 140.25]],
  );
  const current = quality.filter((g) => g.benchmark_version === feed.benchmarks[0].version);
  assert.equal(current.length, 2);
  const mlx = current.find((g) => g.format === 'mlx');
  assert.equal(mlx.score, 62);
  assert.deepEqual(mlx.submitters, ['fixture-bot', 'fixture-bot-2']);
  // A run's id is its filename without the extension.
  assert.deepEqual(mlx.run_ids, [
    'darsy-xray-analysis--gsm8k-200--fixture-bot--2026-11-01--11111111',
    'darsy-xray-analysis--gsm8k-200--fixture-bot-2--2026-11-02--22222222',
  ]);
  // Six files, five runs: the laptop's speed result and its GSM8K result are one run, with one transcript.
  assert.equal(feed.runs, 5);

  const home = page('index.html');
  assert.match(home, /href="\/evals"/);
  assert.match(home, /<b>5<\/b>\s*<span>Evaluation runs<\/span>/);
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
