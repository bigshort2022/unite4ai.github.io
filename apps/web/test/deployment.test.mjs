import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url);
// Text that only the page tests' fixtures contain; none of it may reach a normal build. The rig
// fixture's device contains markup, so it appears escaped (or raw, if escaping broke).
const fixtureMarkers = /fixture-bot|fixture-error-rate|Fixture (?:Laptop|Tower)|Fixture (?:&lt;b&gt;|<b>)?Rig|FIXTURE_Q|ghost-model/;

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

  assert.match(homeHtml, /Equitable AI/);
  assert.match(homeHtml, /href="\/registry"/);

  // Evaluation pages and feed exist in the real build, and test fixtures never reach it.
  const evalsHtml = await readFile(new URL('dist/evals/index.html', ROOT), 'utf8');
  assert.match(evalsHtml, /GSM8K \(first 200\)/);
  // The canary benchmark sits under the Security heading, and only there.
  const sections = evalsHtml.split(/<section[^>]* data-category="/).slice(1);
  const security = sections.find((section) => section.startsWith('security"'));
  assert.ok(security, 'the evaluations page must have a security section');
  assert.match(security, /<h2 id="category-security"[^>]*>Security<\/h2>/);
  assert.match(security, /<a href="\/evals\/canary-injection-v1"[^>]*>Prompt-injection canary \(v1\)<\/a>/);
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
  for (const path of [...detailPages, 'dist/registry/models/darsy-xray-analysis/index.html']) {
    assert.doesNotMatch(await readFile(new URL(path, ROOT), 'utf8'), fixtureMarkers, path);
  }

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
test('the home page leads with evaluations and carries no fixture text', async () => {
  const home = await readFile(new URL('dist/index.html', ROOT), 'utf8');
  const text = home.replace(/\s+/g, ' ');
  assert.equal(home.split('<h1').length - 1, 1);
  assert.match(home, /<title>Equitable AI, actually open · Unite4AI<\/title>/);

  const description = home.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
  assert.match(description, /^Self-reported evaluations/);
  assert.doesNotMatch(description, /independent/i);
  assert.ok(description.length <= 160, `the description is ${description.length} characters`);

  const heroStart = text.indexOf('<section class="hero');
  const hero = text.slice(heroStart, text.indexOf('</section>', heroStart));
  assert.ok(hero.includes(
    'Evaluations of open models, self-reported from hardware people actually own. Every score is published with '
    + 'the command that produced it and a hash of the transcript its submitter keeps, so anyone with the same '
    + 'setup can rerun it. Around them: an open model and dataset registry that grades real openness, and a free '
    + 'technology school.',
  ));
  assert.deepEqual(
    [...hero.matchAll(/<a class="btn (btn-\w+)" href="([^"]+)">([^<]+)<\/a>/g)].map(([, kind, target, label]) => [
      kind,
      target.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+/, '<repo>'),
      label,
    ]),
    [
      ['btn-primary', '/evals', 'See the leaderboards'],
      ['btn-ghost', '<repo>/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result', 'Run a benchmark yourself'],
      ['btn-ghost', '/registry', 'Browse the registry'],
    ],
  );

  // The results follow the hero whether or not anyone has submitted one.
  const leading = text.indexOf('<h2 id="leading-results-title">Leading results</h2>');
  assert.notEqual(leading, -1, 'the home page must have a Leading results heading');
  assert.equal(text.slice(heroStart, leading).split('<section').length - 1, 2);
  const results = text.slice(leading, text.indexOf('</section>', leading));
  assert.ok(results.includes(
    'One row per benchmark: the leading result, its format and quantization, and how many others have reproduced it.',
  ));
  assert.ok(results.includes('<a href="/evals">All leaderboards</a>'));
  assert.doesNotMatch(text, /Latest results/);
  assert.doesNotMatch(results, /Fastest/);

  const definitions = (await readdir(new URL('src/content/benchmarks/', ROOT))).filter((name) => name.endsWith('.md'));
  const stats = [...text.matchAll(/<div class="stat"><b>(\d+)<\/b>\s*<span>([^<]+)<\/span>/g)];
  assert.deepEqual(
    stats.map(([, , label]) => label),
    ['Evaluation runs', 'Benchmarks', 'Open models', 'Open datasets', 'Free courses', 'Community events'],
  );
  assert.equal(Number(stats[1][1]), definitions.length);

  // Four commitments, the first of them about results.
  const different = text.slice(text.indexOf('What makes us different'));
  assert.doesNotMatch(different, /Three commitments/);
  assert.deepEqual(
    [...different.slice(0, different.indexOf('</section>')).matchAll(/<h3>([^<]+)<\/h3>/g)].map(([, title]) => title),
    ['Scores you can replay', 'Openness is graded, not claimed', 'The school is the product', 'Privacy-first by architecture'],
  );
  assert.ok(different.includes(
    'Every result names its model, runtime, quantization and machine, the exact command, and the hash of its '
    + 'transcript. A second submitter running the same model, format and quantization turns "not yet reproduced" '
    + 'into "reproduced by 1".',
  ));
  // The cards sit two by two through a class, not an inline rule.
  assert.match(different, /<div class="grid grid-2 grid-pairs" style="margin-top:1\.8rem">/);

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
  assert.doesNotMatch(metrics, /first maintainer review comment|Median PR review \(days\)/);

  // The script is a module built from lib/repo-metrics and lib/site: one copy of each calculation,
  // and no figure typed in. Astro puts a small module in the page and a larger one in a file.
  const { REPO_SLUG } = await import('../src/lib/site.ts');
  const files = await filesUnder(new URL('dist/_astro/', ROOT), ['.js']).catch(() => []);
  const modules = [
    ...[...metrics.matchAll(/<script type="module">(.*?)<\/script>/g)].map(([, code]) => code),
    ...await Promise.all(files.map((file) => readFile(file, 'utf8'))),
  ];
  const script = modules.find((source) => source.includes('time-to-merge'));
  assert.ok(script, 'the metrics page must ship its script as a module');
  assert.doesNotMatch(metrics, /<script>/, 'a plain inline script cannot import the calculations');
  for (const part of ['https://api.github.com/repos/', REPO_SLUG, 'pulls', 'contributors']) assert.ok(script.includes(part), part);
  assert.doesNotMatch(script, /["'`](?:2\.4|12\+)["'`]/);
  // It needs a median and a few filters, not the schema library the content gate uses.
  assert.ok(script.length < 4000, `the metrics script is ${script.length} bytes`);
});
