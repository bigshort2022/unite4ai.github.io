import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateContent } from '@unite4ai/core/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'u4ai-evals-site-'));
const danglingOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-dangling-'));
const unknownKeyOut = mkdtempSync(join(tmpdir(), 'u4ai-evals-unknown-key-'));
const gateRoot = mkdtempSync(join(tmpdir(), 'u4ai-evals-gate-'));
// The fixture builds keep their content store in their own cacheDir (see astro.config.mjs), so
// fixture rows cannot reach a normal build even if this run is killed; remove it when done.
after(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(danglingOut, { recursive: true, force: true });
  rmSync(unknownKeyOut, { recursive: true, force: true });
  rmSync(gateRoot, { recursive: true, force: true });
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

test('the published results pass the content gate; the version 1 GSM8K run and its speed are kept as previous-version results', async () => {
  const contentRoot = join(ROOT, 'src/content');
  const run = 'bigshort2022--2026-11-15--eb8811e4.json';
  const published = readdirSync(join(contentRoot, 'evals'));
  for (const file of [
    'qwen3-6-35b-a3b--canary-injection-v1--bigshort2022--2026-11-15--0182e626.json',
    `qwen3-6-35b-a3b--decode-speed-gsm8k-200--${run}`,
    `qwen3-6-35b-a3b--gsm8k-200--${run}`,
  ]) {
    assert.ok(published.includes(file), `${file} must stay in the repository`);
  }

  const { errors, warnings } = await validateContent(contentRoot);
  assert.deepEqual(errors, []);
  // Exactly these two: the canary result is for its benchmark's current version.
  assert.deepEqual(warnings.filter((warning) => warning.startsWith('evals/')), [
    `evals/qwen3-6-35b-a3b--decode-speed-gsm8k-200--${run}: result is for benchmark version 1; `
    + 'the current version is 2, so it will not appear on the leaderboard',
    `evals/qwen3-6-35b-a3b--gsm8k-200--${run}: result is for benchmark version 1; `
    + 'the current version is 2, so it will not appear on the leaderboard',
  ]);
});

test('leaderboard and benchmark page render fixture results', { timeout: 120_000 }, () => {
  const build = buildWith('./test/fixtures/evals', out);
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);

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
  assert.match(board, /reproduced by 1/);
  assert.match(board, /not yet reproduced/);
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
  // A quality row pools its machines, so its speed is the median of what they measured (61.5 and 140.25).
  assert.match(evaluations, /<td class="num">100\.88 tok\/s<\/td>/);
  assert.match(model, /<caption class="sr-only">Evaluation results for Darsy X-Ray Analysis<\/caption>/);
  assert.match(model, ESCAPED_DEVICE);
  assert.doesNotMatch(model, RAW_DEVICE);

  const feed = JSON.parse(page('data/evals.json'));
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
    ['gsm8k-200', '2', ['1']],
    ['canary-injection-v1', '1', []],
    ['decode-speed-gsm8k-200', '2', ['1']],
  ]);
  assert.equal(feed.benchmarks[0].higher_is_better, true);
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

// ── The home page's Leading results, and what a board says when it has nothing current ──

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
const modelName = inHtml(cardField('models', MODEL, 'name'));
const benchmarkName = (id) => inHtml(cardField('benchmarks', id, 'name'));
const currentVersion = (id) => cardField('benchmarks', id, 'version');
/** No benchmark has had a version "0", so a run of it is always a run of an earlier version. */
const EARLIER = '0';

const GUIDE = '<a href="https://github\\.com/[^"]+/CONTRIBUTING\\.md#submitting-an-evaluation-result"[^>]*>How to submit one\\.</a>';
/** The explained empty state: nobody has run the subject at all. */
const noResultsYet = (subject) => new RegExp(
  `No results yet\\. Results arrive by pull request from people who ran ${subject} on their own hardware\\. ${GUIDE}`,
);

/** The home page's Leading results section, from its heading to the end of the section. */
const leadingResultsOf = (home) => {
  const start = home.indexOf('<h2 id="leading-results-title"');
  return start === -1 ? '' : home.slice(start, home.indexOf('</section>', start));
};
/** The table rows of that section, one per benchmark. */
const rowsOf = (section) => (section.split('<tbody>')[1] ?? '').split('<tr').slice(1);
const benchmarksOf = (rows) => rows.map((row) => row.match(/href="\/evals\/([^"]+)"/)?.[1]);

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
 * Builds the site against result files written for one test, and against extra benchmark
 * definitions when given. Returns a reader of the built pages with their whitespace collapsed.
 */
function buildScratch(name, results, definitions = {}) {
  const evalsDir = scratchDir(name);
  for (const { name: file, content } of results) writeFileSync(join(evalsDir, file), JSON.stringify(content));
  const env = { ...process.env, U4AI_EVALS_DIR: evalsDir };
  if (Object.keys(definitions).length > 0) {
    env.U4AI_BENCHMARKS_DIR = scratchDir(`${name}-benchmarks`);
    cpSync(join(ROOT, 'src/content/benchmarks'), env.U4AI_BENCHMARKS_DIR, { recursive: true });
    for (const [file, text] of Object.entries(definitions)) writeFileSync(join(env.U4AI_BENCHMARKS_DIR, file), text);
  }
  const outDir = scratchDir(`${name}-site`);
  const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', outDir], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);
  return (path) => readFileSync(join(outDir, path), 'utf8').replace(/\s+/g, ' ');
}

test('the home page lists, under the hero, one leading result for each benchmark that has current results', () => {
  const home = page('index.html');
  const leading = leadingResultsOf(home);

  // One row per benchmark with a current result, by category then name. The canary benchmark
  // has no result, so it has no row.
  const rows = rowsOf(leading);
  assert.deepEqual(benchmarksOf(rows), ['gsm8k-200', 'decode-speed-gsm8k-200']);
  assert.doesNotMatch(leading, /canary-injection-v1/);
  assert.equal(leading.split('<th scope="col">').length - 1, 6);
  assert.equal(leading.split('<th scope="row">').length - 1, rows.length);
  // The region that scrolls the table is named after the table, not after the section's heading:
  // two regions with one name cannot be told apart.
  const caption = leading.match(/<caption class="sr-only">([^<]+)<\/caption>/)?.[1];
  assert.ok(caption && caption !== 'Leading results');
  assert.ok(leading.includes(`role="region" aria-label="${caption}"`));

  // A ranked benchmark shows its best group: gguf at 70 leads mlx at 62, alone, and its two runs
  // agree. Hardware does not change a score, so the row names no runtime and no machine.
  const [quality, speed] = rows;
  assert.match(quality, /<td>Quality<\/td>/);
  assert.match(quality, new RegExp(`<a href="/evals/gsm8k-200">${benchmarkName('gsm8k-200')}</a>`));
  assert.match(quality, new RegExp(`<a href="/registry/models/${MODEL}">${modelName}</a>`));
  assert.match(quality, /<span class="score">70%<\/span>\s*<small>Best score<\/small>/);
  assert.match(quality, /gguf · FIXTURE_Q/);
  assert.match(quality, /<span class="tag">not yet reproduced<\/span>/);
  assert.doesNotMatch(quality, /Most recent|tied with|range|Fixture|llama\.cpp|4bit/);
  // Neither earlier-version run is a current result: this model's 99, or the other model's 41.
  assert.doesNotMatch(leading, />99%<|>41%<|qwen3-6-35b-a3b/);

  // A measured benchmark has no winner: the row is its most recent result, with the runtime and
  // machine it ran on.
  assert.match(speed, /<td>Efficiency<\/td>/);
  assert.match(speed, new RegExp(`<a href="/evals/decode-speed-gsm8k-200">${benchmarkName('decode-speed-gsm8k-200')}</a>`));
  assert.match(speed, /<span class="score">140\.25 tok\/s<\/span>\s*<small>Most recent<\/small>\s*<small>2026-11-05<\/small>/);
  assert.match(speed, /gguf · FIXTURE_Q\s*<small>llama\.cpp 0\.0\.0<\/small>\s*<small>Fixture Tower · 24 GB<\/small>/);
  assert.doesNotMatch(speed, /Fixture Laptop|Best score|tied with/);
  assert.doesNotMatch(leading, /class="rank|>Rank<|Fastest/);

  assert.match(leading, /<a href="\/evals">All leaderboards<\/a>/);
  assert.doesNotMatch(leading, /No results/);
});

test('a home row shows a tie, a reproduced leader with its range, the lowest score where lower is better, and the most recent speed', { timeout: 120_000 }, () => {
  const built = buildScratch('rows', [
    // GSM8K: two submitters agree on mlx within 68–72 (median 70); one gguf run scores 70 too.
    result({ benchmark: 'gsm8k-200', score: 68, date: '2026-11-01', hash: 'a' }),
    result({ benchmark: 'gsm8k-200', score: 72, date: '2026-11-02', hash: 'b', submitter: 'fixture-bot-2' }),
    result({ benchmark: 'gsm8k-200', score: 70, date: '2026-11-03', hash: 'c', format: 'gguf' }),
    // An error rate: three groups share the lowest score, a fourth is worse.
    result({ benchmark: 'fixture-error-rate', version: '1', score: 30, date: '2026-11-01', hash: 'd' }),
    result({ benchmark: 'fixture-error-rate', version: '1', score: 12, date: '2026-11-02', hash: 'e', format: 'gguf' }),
    result({ benchmark: 'fixture-error-rate', version: '1', score: 12, date: '2026-11-03', hash: 'f', format: 'gguf', quantization: 'FIXTURE_Q8' }),
    result({ benchmark: 'fixture-error-rate', version: '1', score: 12, date: '2026-11-04', hash: '1', quantization: 'FIXTURE_Q8' }),
    // Speed: the fastest run is the oldest; the two newest share a date, and the slower has the lower id.
    result({ benchmark: 'decode-speed-gsm8k-200', score: 200, date: '2026-11-01', hash: '2', format: 'gguf', device: 'Fixture Tower', memory: 48 }),
    // The laptop has two runs of different speeds, by two people: its group's median is 58.25.
    result({ benchmark: 'decode-speed-gsm8k-200', score: 55, date: '2026-11-02', hash: '6', format: 'gguf', submitter: 'fixture-bot-2' }),
    result({ benchmark: 'decode-speed-gsm8k-200', score: 61.5, date: '2026-11-06', hash: '3', format: 'gguf' }),
    result({ benchmark: 'decode-speed-gsm8k-200', score: 140.25, date: '2026-11-06', hash: '5', format: 'gguf', device: 'Fixture Tower', memory: 24 }),
  ], {
    'fixture-error-rate.md': [
      '---',
      'name: Fixture error rate',
      'summary: A lower-is-better benchmark that exists only in the page tests.',
      'category: quality',
      'version: "1"',
      'metric:',
      '  name: error rate',
      '  unit: "%"',
      '  higher_is_better: false',
      '  min: 0',
      '  max: 100',
      'scoring: exact-match',
      'items: 200',
      'source_url: https://example.org/fixture-error-rate.jsonl',
      'license: mit',
      'updated: 2026-11-15',
      '---',
      '',
      'Exists only in the page tests.',
      '',
    ].join('\n'),
  });

  const rows = rowsOf(leadingResultsOf(built('index.html')));
  assert.deepEqual(benchmarksOf(rows), ['fixture-error-rate', 'gsm8k-200', 'decode-speed-gsm8k-200']);
  const [errorRate, gsm8k, speed] = rows;

  // Lower is better: 12 leads 30. Three groups score 12; the first by the leaderboard's order is shown.
  assert.match(errorRate, /<span class="score">12%<\/span> ?<small>Best score<\/small> ?<small>tied with 2 others<\/small>/);
  assert.match(errorRate, /gguf · FIXTURE_Q ?</);
  assert.match(errorRate, /<span class="tag">not yet reproduced<\/span>/);
  assert.doesNotMatch(errorRate, /30%|range/);

  // Both GSM8K groups score 70; the one two people submitted comes first, with the range of its runs.
  assert.match(
    gsm8k,
    /<span class="score">70%<\/span> ?<small>range 68–72<\/small> ?<small>Best score<\/small> ?<small>tied with 1 other<\/small>/,
  );
  assert.match(gsm8k, /mlx · FIXTURE_Q ?</);
  assert.match(gsm8k, /<span class="tag tag-open">reproduced by 1<\/span>/);

  // Neither the fastest run (200) nor the faster of the two newest (140.25): the most recent by
  // date, then id. The number is that run's own, not the median of its group (58.25) or its
  // range; the reproduction is the group's, which a second person also ran.
  assert.match(speed, /<span class="score">61\.5 tok\/s<\/span> ?<small>Most recent<\/small> ?<small>2026-11-06<\/small> ?<\/td>/);
  assert.match(speed, /gguf · FIXTURE_Q ?<small>llama\.cpp 0\.0\.0<\/small> ?<small>Fixture Laptop · 32 GB<\/small>/);
  assert.match(speed, /<span class="tag tag-open">reproduced by 1<\/span>/);
  assert.doesNotMatch(speed, /200 tok|140\.25|58\.25|55 tok|range|2026-11-02|Fixture Tower|tied with|Best score/);
});

let earlierOnly;

test('when every run is of an earlier version, the home page lists no benchmark and points to the leaderboards', { timeout: 120_000 }, () => {
  // Two earlier-version runs of GSM8K-200, one of the speed benchmark, none of the canary.
  for (const id of ['gsm8k-200', 'decode-speed-gsm8k-200']) assert.notEqual(currentVersion(id), EARLIER);
  earlierOnly = buildScratch('earlier-only', [
    result({ benchmark: 'gsm8k-200', version: EARLIER, score: 99, date: '2026-10-01', hash: '4' }),
    result({ benchmark: 'gsm8k-200', version: EARLIER, score: 98, date: '2026-10-02', hash: '8' }),
    result({ benchmark: 'decode-speed-gsm8k-200', version: EARLIER, score: 61.5, date: '2026-10-03', hash: '3', format: 'gguf' }),
  ]);

  const home = earlierOnly('index.html');
  assert.match(home, /<b>3<\/b> ?<span>Evaluation runs<\/span>/);
  const leading = leadingResultsOf(home);
  assert.doesNotMatch(leading, /<table|\/evals\/gsm8k-200|>99%</);
  // "No results yet" would be false: there are runs, of versions that are no longer current.
  assert.match(leading, new RegExp(
    "No results for the current benchmark versions yet\\. Earlier runs are listed on each benchmark's page, "
    + `linked from the <a href="/evals">leaderboards</a>\\. ${GUIDE}`,
  ));
  assert.doesNotMatch(leading, /No results yet/);
  assert.match(leading, /<a href="\/evals">All leaderboards<\/a>/);
});

test('a benchmark with runs of earlier versions only says which version has no result and where those runs are', () => {
  const board = earlierOnly('evals/index.html');
  const noneFor = (id) => `No results for version ${inHtml(currentVersion(id))} yet\\.`;
  const quality = categorySection(board, 'quality');
  assert.match(quality, new RegExp(
    `${noneFor('gsm8k-200')} 2 results of earlier versions are listed on the `
    + `<a href="/evals/gsm8k-200"[^>]*>benchmark page</a>\\. ${GUIDE}`,
  ));
  assert.doesNotMatch(quality, /No results yet/);
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

test('with no runs at all, the home page says that results arrive by pull request', { timeout: 120_000 }, () => {
  // A loader that finds no file leaves the content store as it was, and the fixture builds share
  // one: start this build from an empty store, or it would show the previous build's runs.
  rmSync(join(ROOT, 'node_modules/.astro-fixtures'), { recursive: true, force: true });
  const built = buildScratch('no-runs', []);
  const home = built('index.html');
  assert.match(home, /<b>0<\/b> ?<span>Evaluation runs<\/span>/);
  const leading = leadingResultsOf(home);
  // The evaluations page's empty state with its link, but about "a benchmark": none is in view here.
  assert.match(leading, noResultsYet('a benchmark'));
  assert.doesNotMatch(leading, /this benchmark|<table|current benchmark versions/);
  assert.match(categorySection(built('evals/index.html'), 'quality'), noResultsYet('this benchmark'));
});

test('a benchmark page with current results has no empty state, and its previous versions keep their anchor', () => {
  const detail = page('evals/gsm8k-200/index.html');
  assert.doesNotMatch(leaderboardOf(detail), /No results/);
  assert.match(detail, /<section id="previous-versions"[^>]*>\s*<h2>Previous versions<\/h2>/);
  assert.doesNotMatch(page('evals/index.html'), /of (?:an )?earlier versions?/);
});
