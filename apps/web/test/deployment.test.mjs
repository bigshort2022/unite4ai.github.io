import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url);

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
  // The rig fixture's device contains markup, so it appears escaped (or raw, if escaping broke).
  const fixtureMarkers = /fixture-bot|Fixture (?:Laptop|Tower)|Fixture (?:&lt;b&gt;|<b>)?Rig|Q4_K_M|ghost-model/;
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
  assert.match(description, /^[^.]*evaluations/i);
  assert.ok(description.length <= 160, `the description is ${description.length} characters`);

  const heroStart = text.indexOf('<section class="hero');
  const hero = text.slice(heroStart, text.indexOf('</section>', heroStart));
  assert.ok(hero.includes(
    'Independent evaluations of open models, run on hardware people actually own. Every score comes with the '
    + 'command that produced it and a hash of its transcript, so anyone can reproduce it. Around them: an open '
    + 'model and dataset registry that grades real openness, and a free technology school.',
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
  const latest = text.indexOf('<h2 id="latest-results-title">Latest results</h2>');
  assert.notEqual(latest, -1, 'the home page must have a Latest results heading');
  assert.equal(text.slice(heroStart, latest).split('<section').length - 1, 2);
  assert.ok(text.slice(latest).includes('<a href="/evals">All leaderboards</a>'));

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

  assert.doesNotMatch(home, /fixture-bot|Fixture (?:Laptop|Tower)|Fixture (?:&lt;b&gt;|<b>)?Rig|Q4_K_M|ghost-model/);
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
