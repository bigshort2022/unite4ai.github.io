import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatSummary } from '@unite4ai/core';
import { validateContent } from '@unite4ai/core/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'u4ai-evals-site-'));
const danglingOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-dangling-'));
const unknownKeyOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-unknown-key-'));
const gateRoot = mkdtempSync(join(tmpdir(), 'u4ai-evals-gate-'));
// Each fixture build needs empty exchange records and its own content cache, including
// when the next build has no results. Production findings cannot cite fixture result ids.
const exchangeRoots = [];
function fixtureEnv(evalsDir) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-evals-exchange-'));
  exchangeRoots.push(root);
  for (const kind of ['hypotheses', 'findings', 'reviews']) mkdirSync(join(root, kind));
  return { ...process.env, U4AI_EVALS_DIR: evalsDir, U4AI_EXCHANGE_DIR: root };
}
after(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(danglingOut, { recursive: true, force: true });
  rmSync(unknownKeyOut, { recursive: true, force: true });
  rmSync(gateRoot, { recursive: true, force: true });
  for (const root of exchangeRoots) rmSync(root, { recursive: true, force: true });
});

const page = (path) => readFileSync(join(out, path), 'utf8');

/** Builds the site against a fixture results directory into a temp directory; the real dist is untouched. */
function buildWith(evalsDir, outDir) {
  return spawnSync('bun', ['run', 'astro', 'build', '--outDir', outDir], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env: fixtureEnv(evalsDir),
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
/** One benchmark's board within a section of the evaluations page. */
const boardOf = (section, id) => section.split('data-eval-board').find((board) => board.includes(`href="/evals/${id}"`));
/** A benchmark page's leaderboard, without the method prose and run tables that follow it. */
const leaderboardOf = (detail) => detail.slice(detail.indexOf('<h2>Leaderboard</h2>'), detail.indexOf('<div class="prose"'));

test('the fixture results pass the content gate, so the pages are tested with results that could be published', async () => {
  for (const dir of ['models', 'benchmarks']) cpSync(join(ROOT, 'src/content', dir), join(gateRoot, dir), { recursive: true });
  cpSync(join(ROOT, 'test/fixtures/evals'), join(gateRoot, 'evals'), { recursive: true });
  // Three fixtures are of GSM8K-200 version 1 and the speed measured on it, which the
  // definitions list as a previous version: one model's older run, and the only run of another.
  const previous = (file) => `evals/${file}: result is for benchmark version 1; the current version is 2, so it will not appear on the leaderboard`;
  const { errors, warnings } = await validateContent(gateRoot);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.filter((warning) => warning.startsWith('evals/')), [
    previous('darsy-xray-analysis--gsm8k-200--fixture-bot--2026-10-01--44444444.json'),
    previous('qwen3-6-35b-a3b--decode-speed-gsm8k-200--fixture-bot--2026-10-02--88888888.json'),
    previous('qwen3-6-35b-a3b--gsm8k-200--fixture-bot--2026-10-02--88888888.json'),
  ]);
});

test('the published results pass the content gate; version 1 runs of GSM8K-200, its speed and the canary are kept as previous-version results', async () => {
  const contentRoot = join(ROOT, 'src/content');
  const run = 'bigshort2022--2026-11-15--eb8811e4.json';
  const files = [
    'qwen3-4b-instruct-2507--canary-injection-v1--bigshort2022--2026-11-15--0f64fdf6.json',
    'qwen3-6-35b-a3b--canary-injection-v1--bigshort2022--2026-11-15--0182e626.json',
    `qwen3-6-35b-a3b--decode-speed-gsm8k-200--${run}`,
    `qwen3-6-35b-a3b--gsm8k-200--${run}`,
  ];
  const published = readdirSync(join(contentRoot, 'evals'));
  for (const file of files) assert.ok(published.includes(file), `${file} must stay in the repository`);

  const { errors, warnings } = await validateContent(contentRoot);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    warnings.filter((warning) => warning.startsWith('evals/')),
    files.map((file) => `evals/${file}: result is for benchmark version 1; the current version is 2, so it will not appear on the leaderboard`),
  );
});

test('leaderboard and benchmark page render fixture results', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals', out);
  assert.equal(build.status, 0, `${build.error ?? ''}${build.stdout}${build.stderr}`);
  const exchange = JSON.parse(page('data/exchange.json'));
  assert.deepEqual(exchange.hypotheses, [], 'evaluation fixtures must not load production hypotheses');
  assert.deepEqual(exchange.findings, [], 'evaluation fixtures must not load production findings');
  assert.deepEqual(exchange.reviews, [], 'evaluation fixtures must not load production reviews');
  assert.doesNotMatch(page('evals/bfcl-multiple-50/index.html'), /id="replication-task"/);

  const board = page('evals/index.html');
  assert.match(board, /GSM8K \(first 200\)/);
  assert.match(board, /href="\/registry\/models\/darsy-xray-analysis"/);
  // Two groups: gguf (two runs at 70, on two machines) ranks above mlx (median of 60 and 64 = 62).
  const gguf = board.indexOf('FIXTURE_Q');
  const mlx = board.indexOf('4bit');
  assert.notEqual(gguf, -1, 'the gguf group must be on the leaderboard');
  assert.notEqual(mlx, -1, 'the mlx group must be on the leaderboard');
  assert.ok(gguf < mlx, 'higher score must rank first');
  assert.match(board, /<td class="rank num">1<\/td>/);
  assert.match(board, /<td class="rank num">2<\/td>/);
  assert.match(board, /<span class="score">62%<\/span>/);
  assert.match(board, /60–64/);
  assert.match(board, /2 submitting accounts/);
  assert.match(board, /1 submitting account</);
  assert.match(board, /self-reported/i);
  assert.match(
    board.replace(/\s+/g, ' '),
    /Speed is tokens generated per second after the first token, from the server's own token count; it depends on the hardware and on what else the machine was doing\./,
  );
  // GSM8K has a fixed item count, so each row states how many items the run answered.
  assert.match(board, /<small>n = 200<\/small>/);
  // The version 1 run (score 99) belongs to a previous version and stays off the leaderboard.
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
  assert.doesNotMatch(page('evals/gsm8k-200/index.html'), /runs per item|answered correctly on all/);
  assert.match(detail, /<caption class="sr-only">Leaderboard for GSM8K \(first 200\)<\/caption>/);
  assert.match(detail, /<td class="rank num">1<\/td>/);

  // Run tables are evidence, not search content; the method prose stays indexed.
  assert.match(detail, /<section[^>]* data-pagefind-ignore[^>]*>\s*<h2>Every run<\/h2>/);
  const previous = detail.indexOf('<h2>Previous versions</h2>');
  assert.notEqual(previous, -1, 'runs of an older benchmark version get their own section');
  assert.doesNotMatch(detail.slice(0, previous), />99%</);
  const previousRuns = detail.slice(previous);
  assert.match(previousRuns, />99%</);
  assert.match(previousRuns, /--fixture-previous/);
  // Each run is marked with its benchmark version: the previous one here, the current one above.
  assert.match(previousRuns, /<td class="num">2026-10-01<small>v1<\/small><\/td>/);
  assert.doesNotMatch(previousRuns, /<small>v2<\/small>/);
  assert.match(detail.slice(0, previous), /<td class="num">2026-11-05<small>v2<\/small><\/td>/);
  assert.doesNotMatch(detail.slice(0, previous), /<small>v1<\/small>/);
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
  assert.match(matrix, /Best measured speed and lowest time to first token per setup, across runs of current benchmark versions; the two can come from different runs and different benchmarks\./);
  // The rig has two setups, 64 GB in a version 2 run and 32 GB in a version 1 run (0.123 tok/s):
  // only the first is a current workload, so only it has a row.
  assert.match(matrix, /Fixture &lt;b&gt;Rig&lt;\/b&gt; &amp; [^<]*<small>apple-silicon · 64 GB<\/small><\/td>\s*<td class="num">50 tok\/s<\/td>/);
  assert.doesNotMatch(matrix, /0\.123 tok\/s|apple-silicon · 32 GB<\/small><\/td>\s*<td class="num">0/);
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
  for (const id of [
    'darsy-xray-analysis--decode-speed-gsm8k-200--fixture-bot--2026-11-03--33333333',
    'darsy-xray-analysis--decode-speed-gsm8k-200--fixture-bot--2026-11-05--77777777',
  ]) {
    assert.match(evaluations, new RegExp(`href="/evals/decode-speed-gsm8k-200#run-${id}">1 reported run</a>\\s*<small>1 submitter</small>`));
    assert.ok(page('evals/decode-speed-gsm8k-200/index.html').includes(`id="run-${id}"`));
  }
  // A quality row pools its machines, so its speed is the median of what they measured (61.5 and 140.25).
  assert.match(evaluations, /<td class="num">100\.88 tok\/s<\/td>/);
  assert.match(model, /<caption class="sr-only">Evaluation results for Darsy X-Ray Analysis<\/caption>/);
  assert.match(model, ESCAPED_DEVICE);
  assert.doesNotMatch(model, RAW_DEVICE);

  const feed = JSON.parse(page('data/evals.json'));
  assert.deepEqual(feed.replications, []);
  assert.equal(feed.schema_version, 1);
  assert.equal(
    feed.notice,
    'Results are self-reported by contributors. Each benchmark page lists every run with its reproduce command and evidence hash.',
  );
  assert.equal(
    feed.note,
    'Groups include runs of previous benchmark versions; compare only groups whose benchmark_version equals the benchmark\'s version.',
  );
  assert.deepEqual(feed.benchmarks.map((b) => [b.id, b.version, b.previous_versions]), [
    ['bfcl-multiple-50', '1', []],
    ['gsm8k-200', '2', ['1']],
    ['tool-selection-v1', '1', []],
    ['canary-injection-v1', '2', ['1']],
    ['decode-speed-gsm8k-200', '2', ['1']],
  ]);
  const gsm8k = feed.benchmarks.find((b) => b.id === 'gsm8k-200');
  assert.equal(gsm8k.higher_is_better, true);
  assert.deepEqual(Object.fromEntries(feed.benchmarks.map((b) => [b.id, b.repeat])), {
    'bfcl-multiple-50': { runs: 5, temperature: 0.7, top_p: 1 },
    'gsm8k-200': null,
    'tool-selection-v1': { runs: 5, temperature: 0.7, top_p: 1 },
    'canary-injection-v1': { runs: 5, temperature: 0.7, top_p: 1 },
    'decode-speed-gsm8k-200': null,
  });
  // Groups of a measured benchmark carry their runtime and machine; quality groups do not.
  assert.equal(feed.groups.length, 7);
  const quality = feed.groups.filter((g) => g.benchmark === 'gsm8k-200');
  assert.deepEqual(quality.map((g) => [g.runtime, g.device, g.memory_gb]), Array(4).fill([null, null, null]));
  assert.deepEqual(
    feed.groups
      .filter((g) => g.benchmark === 'decode-speed-gsm8k-200')
      .map((g) => [g.benchmark_version, g.runtime, g.runtime_versions, g.device, g.memory_gb, g.score]),
    [
      ['2', 'llama.cpp', ['0.0.0'], 'Fixture Laptop', 32, 61.5],
      ['2', 'llama.cpp', ['0.0.0'], 'Fixture Tower', 24, 140.25],
      ['1', 'mlx-lm', ['0.0.0'], 'Fixture Laptop', 32, 12.5],
    ],
  );
  const current = quality.filter((g) => g.benchmark_version === gsm8k.version);
  assert.equal(current.length, 2);
  const mlx = current.find((g) => g.format === 'mlx');
  assert.equal(mlx.score, 62);
  assert.deepEqual(mlx.submitters, ['fixture-bot', 'fixture-bot-2']);
  // A run's id is its filename without the extension.
  assert.deepEqual(mlx.run_ids, [
    'darsy-xray-analysis--gsm8k-200--fixture-bot--2026-11-01--11111111',
    'darsy-xray-analysis--gsm8k-200--fixture-bot-2--2026-11-02--22222222',
  ]);
  const gguf = current.find((g) => g.format === 'gguf');
  assert.equal(gguf.score, 70);
  assert.equal(gguf.runs, 2);
  assert.deepEqual(gguf.accelerators, ['apple-silicon', 'nvidia']);
  assert.equal(gguf.tokens_per_second, 100.875);
  // Nine files, six runs: each speed result shares its run, and so its transcript, with a GSM8K result.
  assert.equal(feed.runs, 6);

  const home = page('index.html');
  assert.match(home, /href="\/evals"/);
  assert.match(home, /<b>6<\/b>\s*<span>Evaluation runs<\/span>/);
});

test('a model page names the benchmarks it has results for only in an earlier version, and links to them', () => {
  // This model's only fixture run is of GSM8K-200 version 1, with the speed measured on it.
  const model = page('registry/models/qwen3-6-35b-a3b/index.html');
  const evaluations = model.split('<h2>Evaluations</h2>')[1];
  const text = evaluations.replace(/\s+/g, ' ');
  assert.ok(
    text.includes(
      'Results for earlier versions: <a href="/evals/decode-speed-gsm8k-200">Decode speed on GSM8K-200</a> (v1), '
      + '<a href="/evals/gsm8k-200">GSM8K (first 200)</a> (v1)',
    ),
    text,
  );
  // Nothing of the current versions to tabulate, and the page does not claim there are no results at all.
  assert.doesNotMatch(evaluations, /<table/);
  assert.match(text, /No results for the current benchmark versions yet\./);
  assert.doesNotMatch(text, /No evaluation results yet/);
  // The local-run matrix is built from runs of current versions, so this model has none.
  assert.doesNotMatch(model, /Runs locally on|12\.5 tok\/s/);

  // A benchmark with a result of its current version is in the table, not in that line.
  const [current] = page('registry/models/darsy-xray-analysis/index.html').split('<h2>Evaluations</h2>')[1].split('Runs locally on');
  assert.match(current, /<table/);
  assert.doesNotMatch(current, /Results for earlier versions|>99%</);

  // The earlier runs themselves are on the benchmark pages, under "Previous versions".
  for (const id of ['gsm8k-200', 'decode-speed-gsm8k-200']) {
    const detail = page(`evals/${id}/index.html`);
    const earlier = detail.slice(detail.indexOf('<h2>Previous versions</h2>'));
    assert.match(earlier, /<td class="num">2026-10-02<small>v1<\/small><\/td>\s*<td><a href="\/registry\/models\/qwen3-6-35b-a3b">/, id);
    assert.doesNotMatch(leaderboardOf(detail), /qwen3-6-35b-a3b/, id);
  }
});

test('a result that references a missing model fails the build and names it', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals-dangling', danglingOut);
  const output = `${build.error ?? ''}${build.stdout}${build.stderr}`;
  assert.notEqual(build.status, 0, output);
  assert.match(output, /ghost-model--gsm8k-200--fixture-bot--2026-11-01--55555555: model "ghost-model"/);
});

test('the content collection rejects a result with an unknown key, like the validator does', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals-unknown-key', unknownKeyOut);
  const output = `${build.error ?? ''}${build.stdout}${build.stderr}`;
  assert.notEqual(build.status, 0, output);
  assert.match(output, /Unrecognized key: "notes"/);
});

// ── Homepage run counts and benchmark empty states ──

/** A field of a card's frontmatter, so these tests follow the content instead of repeating it. */
const cardField = (collection, id, field) => {
  const card = readFileSync(join(ROOT, 'src/content', collection, `${id}.md`), 'utf8');
  const value = card.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(new RegExp(`^${field}: (.+)$`, 'm'))?.[1];
  assert.ok(value, `${collection}/${id}.md has no ${field}`);
  return value.replace(/^(["'])(.*)\1$/, '$2');
};
/** Text as it appears in built HTML, as a pattern. */
const inHtml = (text) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MODEL = 'darsy-xray-analysis';
const benchmarkName = (id) => inHtml(cardField('benchmarks', id, 'name'));
const currentVersion = (id) => cardField('benchmarks', id, 'version');
/** No benchmark has had a version "0", so a run of it is always a run of an earlier version. */
const EARLIER = '0';

const GUIDE = '<a href="https://github\\.com/[^"]+/CONTRIBUTING\\.md#submitting-an-evaluation-result"[^>]*>How to submit one\\.</a>';
/** The explained empty state: nobody has run the subject at all. */
const noResultsYet = (subject) => new RegExp(
  `No results yet\\. Results arrive by pull request from people who ran ${subject} on their own hardware\\. ${GUIDE}`,
);


/** A result file the content collection accepts: a test names what it is about, this fills in the rest. */
function result({ benchmark, version = currentVersion(benchmark), score, date, hash, submitter = 'fixture-bot', format = 'mlx', quantization = 'FIXTURE_Q', device = 'Fixture Laptop', memory = 32 }) {
  return {
    name: `${MODEL}--${benchmark}--${submitter}--${date}--${hash.repeat(8)}.json`,
    content: {
      schema_version: 1,
      model: MODEL,
      benchmark,
      benchmark_version: version,
      score,
      n: 200,
      run: { date, submitter, harness: { name: 'unite4ai-eval', version: '0.0.0-fixture' }, command: 'bun run eval -- --fixture' },
      setup: {
        runtime: format === 'mlx' ? 'mlx-lm' : 'llama.cpp',
        runtime_version: '0.0.0',
        format,
        quantization,
        hardware: { device, accelerator: 'apple-silicon', memory_gb: memory },
      },
      evidence: { sha256: hash.repeat(64) },
    },
  };
}

const scratch = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const scratchDir = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `u4ai-evals-${name}-`));
  scratch.push(dir);
  return dir;
};

/**
 * Builds the site against result files written for one test.
 * Returns a reader of the built pages with their whitespace collapsed.
 */
function buildScratch(name, results) {
  const evalsDir = scratchDir(name);
  for (const { name: file, content } of results) writeFileSync(join(evalsDir, file), JSON.stringify(content));
  const env = fixtureEnv(evalsDir);
  const outDir = scratchDir(`${name}-site`);
  const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', outDir], { cwd: ROOT, encoding: 'utf8', timeout: 120_000, env });
  assert.equal(build.status, 0, `${build.error ?? ''}${build.stdout}${build.stderr}`);
  return (path) => readFileSync(join(outDir, path), 'utf8').replace(/\s+/g, ' ');
}

let earlierOnly;

test('the home page counts earlier-version runs without duplicating the leaderboards', { timeout: 120_000 }, () => {
  // Two earlier-version runs of GSM8K-200, one of the speed benchmark, none of the canary.
  for (const id of ['gsm8k-200', 'decode-speed-gsm8k-200']) assert.notEqual(currentVersion(id), EARLIER);
  earlierOnly = buildScratch('earlier-only', [
    result({ benchmark: 'gsm8k-200', version: EARLIER, score: 99, date: '2026-10-01', hash: '4' }),
    result({ benchmark: 'gsm8k-200', version: EARLIER, score: 98, date: '2026-10-02', hash: '8' }),
    result({ benchmark: 'decode-speed-gsm8k-200', version: EARLIER, score: 61.5, date: '2026-10-03', hash: '3', format: 'gguf' }),
  ]);

  const home = earlierOnly('index.html');
  assert.match(home, /<b>3<\/b> ?<span>Evaluation runs<\/span>/);
  assert.doesNotMatch(home, /<table|leading-results-title/);
  assert.match(home, /href="\/evals"/);
});

test('a benchmark with runs of earlier versions only says which version has no result and where those runs are', () => {
  const board = earlierOnly('evals/index.html');
  const noneFor = (id) => `No results for version ${inHtml(currentVersion(id))} yet\\.`;
  const quality = categorySection(board, 'quality');
  assert.match(quality, new RegExp(
    `${noneFor('gsm8k-200')} 2 results of earlier versions are listed on the `
    + `<a href="/evals/gsm8k-200"[^>]*>benchmark page</a>\\. ${GUIDE}`,
  ));
  assert.doesNotMatch(boardOf(quality, 'gsm8k-200'), /No results yet/);
  // Nobody has run tool selection in any version.
  assert.match(boardOf(quality, 'tool-selection-v1'), noResultsYet('this benchmark'));
  const efficiency = categorySection(board, 'efficiency');
  assert.match(efficiency, new RegExp(
    `${noneFor('decode-speed-gsm8k-200')} 1 result of an earlier version is listed on the `
    + `<a href="/evals/decode-speed-gsm8k-200"[^>]*>benchmark page</a>\\. ${GUIDE}`,
  ));
  assert.doesNotMatch(efficiency, /No results yet/);
  // Two benchmarks are in this state, so the two links read differently to a screen reader.
  assert.match(quality, new RegExp(`aria-label="${benchmarkName('gsm8k-200')} benchmark page"`));
  assert.match(efficiency, new RegExp(`aria-label="${benchmarkName('decode-speed-gsm8k-200')} benchmark page"`));
  // Nobody has run the canary in any version.
  assert.match(categorySection(board, 'security'), noResultsYet('this benchmark'));

  // The benchmark page points down to its own list of those runs.
  const gsm8k = earlierOnly('evals/gsm8k-200/index.html');
  assert.match(leaderboardOf(gsm8k), new RegExp(
    `${noneFor('gsm8k-200')} Earlier-version runs are <a href="#previous-versions">listed below</a>\\. ${GUIDE}`,
  ));
  assert.match(gsm8k, /<section id="previous-versions"[^>]*> ?<h2>Previous versions<\/h2>/);
  assert.match(leaderboardOf(earlierOnly('evals/decode-speed-gsm8k-200/index.html')), new RegExp(
    `${noneFor('decode-speed-gsm8k-200')} An earlier-version run is <a href="#previous-versions">listed below</a>\\. ${GUIDE}`,
  ));
  const canary = earlierOnly('evals/canary-injection-v1/index.html');
  assert.match(leaderboardOf(canary), new RegExp(`${noneFor('canary-injection-v1')} ${GUIDE}`));
  assert.doesNotMatch(canary, /previous-versions|[Ee]arlier-version/);
});

test('with no runs the home counts zero and the leaderboard explains participation', { timeout: 120_000 }, () => {
  const built = buildScratch('no-runs', []);
  const home = built('index.html');
  assert.match(home, /<b>0<\/b> ?<span>Evaluation runs<\/span>/);
  assert.doesNotMatch(home, /<table|leading-results-title/);
  assert.match(categorySection(built('evals/index.html'), 'quality'), noResultsYet('this benchmark'));
});

test('a benchmark page with current results has no empty state, and its previous versions keep their anchor', () => {
  const detail = page('evals/gsm8k-200/index.html');
  assert.doesNotMatch(leaderboardOf(detail), /No results/);
  assert.match(detail, /<section id="previous-versions"[^>]*>\s*<h2>Previous versions<\/h2>/);
  assert.doesNotMatch(page('evals/index.html'), /of (?:an )?earlier versions?/);
  // Single-run scores carry no interval, so their ranking is not qualified.
  assert.doesNotMatch(detail, /not distinguishable/);
  assert.doesNotMatch(page('evals/index.html'), /not distinguishable/);
});

test('a repeat-run result shows its interval, pass@1 with its interval, and the spread between runs', { timeout: 120_000 }, () => {
  const repeat = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
    item_pass_histogram: [10, 0, 0, 0, 2, 38],
    run_correct: [40, 39, 40, 40, 39],
    seconds_total: 250,
  });
  const file = result({ benchmark: 'canary-injection-v1', score: repeat.pass_k, date: '2026-11-20', hash: 'c' });
  file.content.n = 50;
  file.content.repeat = repeat;
  file.content.setup.notes = 'never in selectors';
  // A second run whose five runs all scored the same, built into the same site.
  const steady = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
    item_pass_histogram: [10, 0, 0, 0, 0, 40],
    run_correct: [40, 40, 40, 40, 40],
    seconds_total: 250,
  });
  const steadyFile = result({ benchmark: 'canary-injection-v1', score: steady.pass_k, date: '2026-11-21', hash: 'd', submitter: 'fixture-bot-2' });
  steadyFile.content.n = 50;
  steadyFile.content.repeat = steady;
  const lower = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
    item_pass_histogram: [40, 0, 0, 0, 0, 10],
    run_correct: [10, 10, 10, 10, 10],
    seconds_total: 250,
  });
  const conflict = result({ benchmark: 'canary-injection-v1', score: lower.pass_k, date: '2026-11-22', hash: 'a', submitter: 'fixture-bot-2' });
  conflict.content.n = 50;
  conflict.content.repeat = lower;
  const otherDevice = result({
    benchmark: 'canary-injection-v1', score: repeat.pass_k, date: '2026-11-22',
    hash: '9', device: 'Fixture <b>Rig</b> &', memory: 64,
  });
  otherDevice.content.n = 50;
  otherDevice.content.repeat = repeat;
  otherDevice.content.setup.runtime = 'mlx-lm-go';
  const earlierCanary = result({
    benchmark: 'canary-injection-v1', version: '1', score: steady.pass_k, date: '2026-11-19',
    hash: '8', submitter: 'fixture-bot-2',
  });
  earlierCanary.content.n = 50;
  // Another model, five runs of 35 of the 50 items: a lower score whose interval overlaps the first group's.
  const other = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
    item_pass_histogram: [15, 0, 0, 0, 0, 35],
    run_correct: [35, 35, 35, 35, 35],
    seconds_total: 250,
  });
  const OTHER = 'qwen3-4b-instruct-2507';
  const otherFile = result({ benchmark: 'canary-injection-v1', score: other.pass_k, date: '2026-11-22', hash: 'e' });
  otherFile.name = otherFile.name.replace(MODEL, OTHER);
  otherFile.content.model = OTHER;
  otherFile.content.n = 50;
  otherFile.content.repeat = other;
  const tools = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
    item_pass_histogram: [50, 0, 0, 0, 0, 50],
    run_correct: [50, 50, 50, 50, 50],
    seconds_total: 750,
  });
  const registered = result({
    benchmark: 'tool-selection-v1', score: tools.pass_k, date: '2026-11-23',
    hash: 'f', submitter: 'bigshort2022', quantization: '4bit-DWQ', device: 'Apple M5 Mac17,2',
  });
  registered.content.model = 'qwen3-6-35b-a3b';
  registered.name = registered.name.replace(MODEL, registered.content.model);
  registered.content.n = 100;
  registered.content.repeat = tools;
  registered.content.setup.served_model = 'mlx-community/Qwen3.6-35B-A3B-4bit-DWQ';
  const paid = result({ benchmark: 'tool-selection-v1', score: tools.pass_k, date: '2026-11-23', hash: 'b', format: 'other', quantization: 'undisclosed' });
  paid.content.n = 100;
  paid.content.repeat = tools;
  paid.content.model = 'example-frontier';
  paid.name = paid.name.replace(MODEL, paid.content.model);
  paid.content.setup.runtime = 'api';
  paid.content.setup.served_model = 'example-frontier-2026';
  paid.content.api = {
    provider: 'example',
    model_card: 'https://example.org/model-card',
    terms_url: 'https://example.org/terms',
    terms_checked_on: '2026-11-23',
    expected_usd: 0.5,
    approved_usd: 1,
  };
  paid.content.cost = { kind: 'invoice', invoice_sha256: '1'.repeat(64), total_usd: 0.5, usd_per_success: 0.002 };
  const site = buildScratch('repeat', [file, steadyFile, conflict, otherDevice, earlierCanary, otherFile, registered, paid]);
  const toolPage = site('evals/tool-selection-v1/index.html');
  assert.match(toolPage, /Registered baselines/);
  assert.match(toolPage, /href="#baseline-1-[^"]+"/);
  assert.ok(toolPage.includes(`href="#run-${registered.name.slice(0, -5)}"`), 'registered setup links back to the result');
  assert.match(toolPage, /Not yet run/i);
  assert.match(toolPage, /Unregistered setup/i);
  assert.match(toolPage, /href="https:\/\/example\.org\/model-card"/);
  assert.match(toolPage, /invoice/i);
  assert.match(toolPage, /Expected \$0\.5 USD · Approved \$1 USD/);
  assert.match(toolPage, /0\.002/);
  const detail = site('evals/canary-injection-v1/index.html');

  assert.match(detail, /<span class="tag">5 runs per item at temperature 0\.7<\/span>/);
  const note = leaderboardOf(detail);
  assert.match(note, /The score is the share of items answered correctly on all 5 runs\./);
  assert.ok(note.includes('<a href="#every-run">Every run</a>'));
  // The label is defined where it appears.
  assert.match(note, /A row marked (?:"|&quot;)not distinguishable from #N(?:"|&quot;) has a 95% score interval that overlaps row N(?:'|&#39;)s\./);
  assert.ok(detail.includes(`<span class="score">${repeat.pass_k}%</span>`));
  const range = ([low, high]) => `${low}–${high}%`;
  for (const text of [
    `score 95% CI ${range(repeat.pass_k_ci)}`,
    `pass@1 ${repeat.pass_1}% (95% CI ${range(repeat.pass_1_ci)})`,
    `per run 78–80%, sd ${repeat.run_score_sd} pts`,
    `per run 80%, sd ${steady.run_score_sd} pts`,
  ]) {
    assert.ok(detail.includes(`<small>${text}</small>`), text);
  }
  assert.ok(!detail.includes('per run 80–80'));

  // Both groups' 95% intervals overlap, so the ranking between them is not supported.
  assert.ok(Math.max(repeat.pass_k_ci[1], steady.pass_k_ci[1]) >= other.pass_k_ci[0]);
  const board = site('evals/index.html');
  const canaryBoard = board.slice(board.indexOf('Leaderboard for Prompt-injection canary'));
  const canaryRows = canaryBoard.slice(0, canaryBoard.indexOf('</table>'));
  assert.match(canaryRows, /<small title="Its 95% score interval overlaps that row(?:'|&#39;)s">not distinguishable from #1<\/small>/);
  for (const leaderboard of [leaderboardOf(detail), canaryRows]) {
    const [first, second] = leaderboard.split('<tbody>')[1].split('<tr').slice(1);
    assert.ok(first.includes(`/registry/models/${MODEL}"`), 'the higher score ranks first');
    assert.doesNotMatch(first, /not distinguishable/);
    assert.ok(second.includes(`/registry/models/${OTHER}"`));
    assert.match(second, /<td class="rank num">2<small[^>]*>not distinguishable from #1<\/small><\/td>/);
    // Each result of a repeat-run benchmark is five runs, so the Runs cell counts results.
    assert.match(first, /<small>4 results/);
    assert.match(second, /<small>1 result[ <]/);
  }

  // Summary tables link to every result in their group, with stable labels and no implied replication.
  const resultId = ({ name }) => name.slice(0, -5);
  const resultHash = (file) => `#run-${resultId(file)}`;
  const resultPath = (file) => `/evals/canary-injection-v1${resultHash(file)}`;
  const model = site(`registry/models/${MODEL}/index.html`);
  for (const [summary, linkFor] of [
    [leaderboardOf(detail), resultHash],
    [canaryRows, resultPath],
    [model, resultPath],
  ]) {
    assert.match(summary, /Replication evidence/);
    for (const candidate of [file, steadyFile, conflict, otherDevice]) {
      const { run, evidence } = candidate.content;
      const label = `${run.submitter} · ${run.date} · ${evidence.sha256.slice(0, 8)}`;
      assert.ok(summary.includes(`href="${linkFor(candidate)}">${label}</a>`), label);
    }
    assert.ok(!summary.includes(linkFor(earlierCanary)));
    assert.doesNotMatch(summary, /reproduced by|replicated by/);
  }

  const row = detail.split(`id="run-${resultId(file)}"`)[1].split('</tr>')[0];
  assert.match(row, /replicated by 1/);
  assert.match(row, /contested/);
  assert.ok(row.includes(`href="${resultHash(steadyFile)}">consistent · fixture-bot-2`));
  assert.ok(row.includes(`href="${resultHash(conflict)}">inconsistent · fixture-bot-2`));
  assert.ok(row.includes(`href="${resultHash(otherDevice)}">repeated on other hardware · fixture-bot`));
  assert.match(row, /mlx-lm-go 0\.0\.0.*Fixture &lt;b&gt;Rig&lt;\/b&gt; &amp; · apple-silicon · 64 GB/);
  assert.ok(!row.includes(resultHash(otherFile)), 'rank interval overlap for a different model is not replication');
  const solo = detail.split(`id="run-${resultId(otherFile)}"`)[1].split('</tr>')[0];
  assert.match(solo, /not yet independently replicated/);
  const earlier = detail.split('id="previous-versions"')[1];
  assert.ok(earlier.includes(`id="run-${resultId(earlierCanary)}"`));
  assert.doesNotMatch(earlier, /independently replicated|>Replication<\/th>/);

  const feed = JSON.parse(site('data/evals.json'));
  assert.ok(!feed.replications.some(({ result }) => result === resultId(earlierCanary)));
  const evidence = feed.replications.find(({ result }) => result === resultId(file));
  assert.equal(evidence.href, resultPath(file));
  assert.equal(evidence.benchmark, 'canary-injection-v1');
  assert.equal(evidence.benchmark_version, currentVersion('canary-injection-v1'));
  assert.equal(evidence.model, MODEL);
  assert.equal(evidence.submitter, file.content.run.submitter);
  assert.equal(evidence.n, 50);
  assert.deepEqual(evidence.repeat_method, { runs: 5, temperature: 0.7, top_p: 1 });
  assert.deepEqual(evidence.setup, {
    runtime: 'mlx-lm',
    runtime_version: '0.0.0',
    format: 'mlx',
    quantization: 'FIXTURE_Q',
    hardware: { device: 'Fixture Laptop', memory_gb: 32, accelerator: 'apple-silicon' },
  });
  assert.equal(evidence.api, undefined);
  assert.equal(evidence.independent_replicators, 1);
  assert.equal(evidence.contested, true);
  assert.deepEqual(evidence.peers, [
    { result: resultId(otherDevice), relationship: 'repeated_on_other_hardware' },
    { result: resultId(steadyFile), relationship: 'consistent' },
    { result: resultId(conflict), relationship: 'inconsistent' },
  ]);
  for (const candidate of [otherDevice, steadyFile, conflict]) {
    assert.equal(feed.replications.find(({ result }) => result === resultId(candidate)).href, resultPath(candidate));
  }
  const hosted = feed.replications.find(({ result }) => result === resultId(paid));
  assert.equal(hosted.model, 'example-frontier');
  assert.equal(hosted.setup.runtime, 'api');
  assert.equal(hosted.setup.served_model, 'example-frontier-2026');
  assert.deepEqual(hosted.api, { provider: 'example', model_card: 'https://example.org/model-card' });
  assert.doesNotMatch(JSON.stringify(feed.replications), /"command"|"sha256"|"notes"|never in selectors/);
});
