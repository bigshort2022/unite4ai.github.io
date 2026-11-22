import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url);
// Text that only the page tests' fixtures contain; none of it may reach a normal build. The rig
// fixture's device contains markup, so it appears escaped (or raw, if escaping broke).
const fixtureMarkers = /fixture-bot|fixture-author|fixture-reviewer|fixture-hypothesis|fixture-finding|fixture-error-rate|Fixture (?:Laptop|Tower)|Fixture (?:&lt;b&gt;|<b>)?Rig|FIXTURE_Q|ghost-model/;

// Spawns a full Astro + Pagefind build; CI runners routinely exceed bun's 5s default.
test('production build targets the unite4ai.com custom domain', { timeout: 120_000 }, async () => {
  const result = spawnSync('bun', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.equal(await readFile(new URL('dist/CNAME', ROOT), 'utf8'), 'unite4ai.com\n');

  const sitemap = await readFile(new URL('dist/sitemap-0.xml', ROOT), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/unite4ai\.com\//);
  assert.doesNotMatch(sitemap, /github\.io/);

  const homeHtml = await readFile(new URL('dist/index.html', ROOT), 'utf8');

  assert.match(homeHtml, /href="\/registry"/);

  // Evaluation pages and feed exist in the real build, and test fixtures never reach it.
  const evalsHtml = await readFile(new URL('dist/evals/index.html', ROOT), 'utf8');
  assert.match(evalsHtml, /GSM8K \(first 200\)/);
  // The canary benchmark sits under the Security heading, and only there.
  const sections = evalsHtml.split(/<section[^>]* data-category="/).slice(1);
  const security = sections.find((section) => section.startsWith('security"'));
  assert.ok(security, 'the evaluations page must have a security section');
  assert.match(security, /<h2 id="category-security"[^>]*>Security<\/h2>/);
  assert.match(security, /<a href="\/evals\/canary-injection-v1"[^>]*>Prompt-injection canary<\/a>/);
  assert.equal(sections.filter((section) => section.includes('Prompt-injection canary')).length, 1);
  // The speed benchmark has its Efficiency section whether or not anyone has submitted a result.
  const efficiency = sections.find((section) => section.startsWith('efficiency"'));
  assert.ok(efficiency, 'the evaluations page must have an efficiency section');
  assert.match(efficiency, /<h2 id="category-efficiency"[^>]*>Efficiency<\/h2>/);
  assert.match(efficiency, /<a href="\/evals\/decode-speed-gsm8k-200"[^>]*>Decode speed on GSM8K-200<\/a>/);
  // Its data file is served at the benchmark's source_url, byte for byte what the definition pins.
  const definition = await readFile(new URL('src/content/benchmarks/canary-injection-v1.md', ROOT), 'utf8');
  assert.match(definition, /^source_url: https:\/\/unite4ai\.com\/data\/benchmarks\/canary-injection-v1\.jsonl$/m);
  const served = await readFile(new URL('dist/data/benchmarks/canary-injection-v1.jsonl', ROOT));
  assert.equal(createHash('sha256').update(served).digest('hex'), definition.match(/^source_sha256: ([a-f0-9]{64})$/m)?.[1]);
  const feedJson = await readFile(new URL('dist/data/evals.json', ROOT), 'utf8');
  assert.equal(JSON.parse(feedJson).schema_version, 1);
  assert.doesNotMatch(evalsHtml, fixtureMarkers);
  assert.doesNotMatch(feedJson, fixtureMarkers);
  // The benchmark and model pages print more of each run: its submitter, its command, its device.
  const detailPages = ['gsm8k-200', 'canary-injection-v1', 'decode-speed-gsm8k-200'].map((id) => `dist/evals/${id}/index.html`);
  const modelPages = ['darsy-xray-analysis', 'qwen3-6-35b-a3b'].map((id) => `dist/registry/models/${id}/index.html`);
  for (const path of [...detailPages, ...modelPages]) {
    assert.doesNotMatch(await readFile(new URL(path, ROOT), 'utf8'), fixtureMarkers, path);
  }
  for (const path of ['dist/exchange/index.html', 'dist/exchange/biases/index.html', 'dist/data/exchange.json', 'dist/data/exchange-text.json']) {
    assert.doesNotMatch(await readFile(new URL(path, ROOT), 'utf8'), fixtureMarkers, path);
  }
  const exchange = JSON.parse(await readFile(new URL('dist/data/exchange.json', ROOT), 'utf8'));
  const exchangeHtml = await readFile(new URL('dist/exchange/index.html', ROOT), 'utf8');
  if (exchange.hypotheses.length === 0) assert.match(exchangeHtml, /No open hypotheses published/);
  if (exchange.findings.length === 0) assert.match(exchangeHtml, /No unreviewed findings published/);

  // Cost guard: GitHub Pages serves at most 1 GB; fail long before that.
  const bytes = await directorySize(new URL('dist/', ROOT));
  assert.ok(bytes < 250 * 1024 * 1024, `dist is ${bytes} bytes; the budget is 250 MB`);
});

async function directorySize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    total += entry.isDirectory() ? await directorySize(url) : (await stat(url)).size;
  }
  return total;
}

// Reads the build of the first test. Real scores and model names change, so none is asserted.
test('home leads with the wordmark and groups navigation under parent pages', async () => {
  const home = await readFile(new URL('dist/index.html', ROOT), 'utf8');
  const text = home.replace(/\s+/g, ' ');
  assert.equal(home.split('<h1').length - 1, 1);

  const heroStart = text.indexOf('<section class="hero');
  const hero = text.slice(heroStart, text.indexOf('</section>', heroStart));

  const actions = [...hero.matchAll(/<a class="btn (btn-\w+)" href="([^"]+)"/g)].map(([, kind, target]) => ({ kind, target }));
  assert.match(hero, /<h1 class="sr-only"[^>]*>Unite4AI<\/h1>/);
  assert.doesNotMatch(hero, /We build it like one/);
  assert.deepEqual(actions, [
    { kind: 'btn-primary', target: '/stack' },
    { kind: 'btn-ghost', target: '/school' },
    { kind: 'btn-ghost', target: '/registry' },
  ]);
  const nav = text.match(/<nav class="site-nav"[^>]*>(.*?)<\/nav>/)?.[1] ?? '';
  assert.equal([...nav.matchAll(/href="\/exchange"/g)].length, 1);
  assert.doesNotMatch(nav, /href="\/(?:global-exchange|registry|evals)"/);
  for (const [parent, child] of [['exchange', 'global-exchange'], ['stack', 'registry'], ['playground', 'evals']]) {
    const page = await readFile(new URL(`dist/${parent}/index.html`, ROOT), 'utf8');
    const main = page.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
    assert.match(main, new RegExp(`href="/${child}"`));
  }
  assert.doesNotMatch(nav, /aria-current/);
  const current = async (route) => {
    const page = (await readFile(new URL(`dist${route}/index.html`, ROOT), 'utf8')).replace(/\s+/g, ' ');
    const links = page.match(/<nav class="site-nav"[^>]*>(.*?)<\/nav>/)?.[1] ?? '';
    return [...links.matchAll(/href="([^"]+)" aria-current="(\w+)"/g)].map(([, target, kind]) => `${target}:${kind}`);
  };
  for (const [route, expected] of [
    ['/exchange', '/exchange:page'],
    ['/stack', '/stack:page'],
    ['/playground', '/playground:page'],
    ['/global-exchange', '/exchange:location'],
    ['/registry', '/stack:location'],
    ['/registry/datasets', '/stack:location'],
    ['/evals', '/playground:location'],
    ['/evals/gsm8k-200', '/playground:location'],
  ]) {
    assert.deepEqual(await current(route), [expected], route);
  }
  assert.doesNotMatch(text, /exchange-preview-title|leading-results-title|data-exchange-metric|<table/);
  const order = ['class="hero', 'id="stack-preview-title"', 'aria-label="Platform at a glance"', 'What makes us different', 'Featured models', 'Progress is not automatic.'];
  const positions = order.map((marker) => text.indexOf(marker));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  const exchange = await readFile(new URL('dist/exchange/index.html', ROOT), 'utf8');
  assert.match(exchange, /href="\/exchange" aria-current="page"/);
  assert.match(exchange, /Hypotheses by status/);
  assert.match(exchange, /Findings by review state/);
  assert.match(exchange, /data-exchange-metric="waiting"/);
  assert.match(exchange, /href="\/exchange\/biases"/);
  assert.match(exchange, /href="\/evals"/);
  const stats = [...text.matchAll(/<div class="stat"><b>(\d+)<\/b>\s*<span>([^<]+)<\/span>/g)];
  assert.deepEqual(
    stats.map(([, , label]) => label),
    ['Open models', 'Open datasets', 'Evaluation runs', 'Free courses', 'Community events'],
  );


  assert.doesNotMatch(home, fixtureMarkers);
});

test('the submit page points to the runner guide and to an issue form that exists', async () => {
  const submit = await readFile(new URL('dist/submit/index.html', ROOT), 'utf8');
  const block = submit.slice(submit.indexOf('Evaluation results</h2>'));
  const form = block.match(/href="(https:\/\/github\.com\/[^/"]+\/[^/"]+)\/issues\/new\?template=([\w.-]+)"/);
  assert.ok(form, 'the submit page must link to the evaluation result issue form');
  const [, repo, template] = form;
  assert.equal(template, 'submit-eval-result.yml');
  assert.ok((await stat(new URL(`../../.github/ISSUE_TEMPLATE/${template}`, ROOT))).isFile());
  assert.ok(block.includes(`href="${repo}/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result"`));
});

/** Every file with one of the extensions under a directory, as URLs. */
async function filesUnder(dir, extensions) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await filesUnder(new URL(`${entry.name}/`, dir), extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(new URL(entry.name, dir));
  }
  return found;
}

test('every link to the repository comes from one constant, and none points at the old, missing repository', async () => {
  const { REPO, REPO_SLUG } = await import('../src/lib/site.ts');
  assert.equal(REPO, `https://github.com/${REPO_SLUG}`);
  const deadSlug = 'unite4ai/unite4ai.github.io';

  // No page, layout, component or helper spells the repository out again, under either name.
  const sources = (await Promise.all(
    ['pages/', 'layouts/', 'components/', 'lib/'].map((dir) => filesUnder(new URL(`src/${dir}`, ROOT), ['.astro', '.ts', '.mjs'])),
  )).flat();
  const copies = [];
  for (const source of sources) {
    if (source.pathname.endsWith('/src/lib/site.ts')) continue;
    const text = await readFile(source, 'utf8');
    if (text.includes(REPO_SLUG) || text.includes(deadSlug)) copies.push(source.pathname);
  }
  assert.deepEqual(copies, []);

  // A model or dataset card's own links (demo, code, mirror) are its maintainers' claims, not
  // the site's: a URL that appears verbatim in a card's frontmatter is not checked here.
  const cardUrls = new Set();
  for (const collection of ['models/', 'datasets/']) {
    for (const card of await filesUnder(new URL(`src/content/${collection}`, ROOT), ['.md', '.mdx'])) {
      const frontmatter = (await readFile(card, 'utf8')).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      for (const url of frontmatter.match(/https?:\/\/[^\s"']+/g) ?? []) cardUrls.add(url);
    }
  }
  const pages = await filesUnder(new URL('dist/', ROOT), ['.html']);
  assert.ok(pages.length > 20, `only ${pages.length} built pages were found`);
  // The repository that does not exist, as a page link and as an API address.
  const deadUrl = new RegExp(
    `https://(?:github\\.com|api\\.github\\.com/repos)/${deadSlug.replaceAll('.', '\\.')}[^\\s"'\`<>)]*`,
    'g',
  );
  const dead = [];
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const [url] of html.matchAll(deadUrl)) {
      if (!cardUrls.has(url)) dead.push(`${page.pathname.split('/dist/')[1]}: ${url}`);
    }
  }
  assert.deepEqual(dead, []);

  const home = await readFile(new URL('dist/index.html', ROOT), 'utf8');
  assert.ok(home.includes(`<a href="${REPO}">Source on GitHub</a>`));

  // The registry form opens an issue on the repository, and so does the evaluation result form.
  const submit = await readFile(new URL('dist/submit/index.html', ROOT), 'utf8');
  assert.equal(submit.match(/const REPO = "([^"]+)";/)?.[1], REPO);
  assert.ok(submit.includes('`${REPO}/issues/new?title='));
  assert.match(submit, new RegExp(`href="${REPO.replaceAll('.', '\\.')}/issues/new\\?template=submit-eval-result\\.yml"`));
});

test('the governance metrics page computes its figures and prints no number of its own', async () => {
  const metrics = (await readFile(new URL('dist/governance/metrics/index.html', ROOT), 'utf8')).replace(/\s+/g, ' ');
  // Every tile starts empty: a figure appears only when the visitor's browser has computed it.
  assert.deepEqual(
    [...metrics.matchAll(/<div class="stat"><b data-metric="([\w-]+)">([^<]*)<\/b>\s*<span>([^<]+)<\/span>/g)].map(([, key, value, label]) => [key, value, label]),
    [
      ['time-to-merge', '—', 'Median time to merge'],
      ['open-prs', '—', 'Open pull requests'],
      ['merged-month', '—', 'Merged this month'],
      ['contributors', '—', 'Contributors (all time)'],
    ],
  );
  assert.match(metrics, /the median time from opening a pull request to merging it/);
  assert.match(metrics, /It is not a review time/);
  // The two pull-request counts are lower bounds when the page of pull requests came back full, and say so.
  assert.match(metrics, /A \+ after either number means that page of 100 was full, so there may be more\./);
  assert.ok(metrics.includes(
    "This page's script sets no cookies and sends nothing to a server of ours. GitHub receives those two requests.",
  ));
  assert.doesNotMatch(metrics, /records nothing about your visit/);
  assert.doesNotMatch(metrics, /first maintainer review comment|Median PR review \(days\)/);

});

// Derived from the published files, so it holds whatever results and versions are current.
test('the leaderboards agree with published results about earlier benchmark versions', async () => {
  const versions = new Map();
  for (const file of await filesUnder(new URL('src/content/benchmarks/', ROOT), ['.md'])) {
    const id = file.pathname.split('/').pop().replace(/\.md$/, '');
    versions.set(id, (await readFile(file, 'utf8')).match(/^version: "?([^"\n]+)"?$/m)?.[1]);
  }
  const current = new Set();
  const earlier = new Map();
  for (const file of await filesUnder(new URL('src/content/evals/', ROOT), ['.json'])) {
    const { benchmark, benchmark_version: version } = JSON.parse(await readFile(file, 'utf8'));
    if (version === versions.get(benchmark)) current.add(benchmark);
    else earlier.set(benchmark, (earlier.get(benchmark) ?? 0) + 1);
  }

  const page = async (path) => (await readFile(new URL(`dist/${path}`, ROOT), 'utf8')).replace(/\s+/g, ' ');

  // A benchmark whose only results are of an earlier version says so, with their number, and
  // its own page points down to them.
  const board = await page('evals/index.html');
  for (const [id, count] of earlier) {
    if (current.has(id)) continue;
    const said = `No results for version ${versions.get(id)} yet. `
      + `${count === 1 ? '1 result of an earlier version is' : `${count} results of earlier versions are`} listed on the <a href="/evals/${id}"`;
    assert.ok(board.includes(said), said);
    const detail = await page(`evals/${id}/index.html`);
    assert.match(detail, /<a href="#previous-versions">listed below<\/a>/, id);
    assert.match(detail, /<section id="previous-versions"/, id);
  }
});
