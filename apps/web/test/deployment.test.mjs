import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

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

  const bfcl = await readFile(new URL('dist/evals/bfcl-multiple-50/index.html', ROOT), 'utf8');
  const card = bfcl.match(/<section\b[^>]*\bid="replication-task"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(card, 'the published BFCL reference should offer a replication task');
  const run = 'qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8';
  assert.ok(card.includes(`href="#run-${run}"`));
  assert.ok(bfcl.includes(`id="run-${run}"`));
  const receipt = card.match(/href="(\/data\/eval-exports\/[^"]+\/evidence\.json)"/)?.[1];
  assert.ok(receipt, 'the card links to the actual evidence receipt');
  const evidence = JSON.parse(await readFile(new URL(`dist${receipt}`, ROOT), 'utf8'));
  assert.equal(evidence.result_id, run);
  assert.ok(card.includes(evidence.setup.served_model));
  assert.match(card, /64 GB/);
  assert.match(card, /\$0[\s\S]*60 minutes[\s\S]*55 minutes[\s\S]*90 seconds/);
  assert.match(card, /250 attempts/);
  assert.match(card, /not a target/i);
  assert.match(exchangeHtml, /href="\/evals\/bfcl-multiple-50"[^>]*>BFCL replication task</);
  assert.doesNotMatch(await readFile(new URL('dist/evals/gsm8k-200/index.html', ROOT), 'utf8'), /id="replication-task"/);

  const taskPath = '/data/replication-tasks.json';
  const feed = JSON.parse(await readFile(new URL(`dist${taskPath}`, ROOT), 'utf8'));
  assert.equal(feed.schema_version, 1);
  assert.equal(feed.tasks.length, 1);
  const [task] = feed.tasks;
  assert.equal(task.id, 'bfcl-multiple-50-v1-replication');
  assert.equal(task.kind, 'independent_replication');
  assert.deepEqual(task.reference, {
    result_id: run, submitter: evidence.run.submitter,
    result_url: new URL(evidence.source_url).pathname + `#run-${run}`, evidence_url: receipt,
  });
  assert.deepEqual(task.benchmark, {
    id: evidence.benchmark, version: evidence.benchmark_version, source_sha256: evidence.benchmark_source.sha256,
    items: 50, repeat: { runs: 5, temperature: 0.7, top_p: 1 }, expected_attempts: 250,
  });
  assert.deepEqual(task.artifact, {
    model_card_id: evidence.model, served_model: evidence.setup.served_model,
    format: evidence.setup.format, quantization: evidence.setup.quantization, already_loaded: true, thinking: false,
  });
  assert.deepEqual(task.requirements, {
    accelerator: 'apple-silicon', min_memory_gb: 64, idle_local_host: true,
    independent_contributor: true, run_approval: true, separate_submission_approval: true,
  });
  assert.deepEqual(task.budget, { max_paid_usd: 0, max_wall_seconds: 3600, runner_max_seconds: 3300, request_timeout_seconds: 90, payout_usd: 0 });
  assert.equal(task.deliverable.new_results, 1);
  assert.equal(task.deliverable.submission, 'add_only_draft_pr');
  assert.equal(task.deliverable.transcript, 'private_to_reviewer');
  assert.ok(task.deliverable.review_checks.includes('transcript_sha256_and_bytes'));
  assert.doesNotMatch(JSON.stringify(task), /"(?:command|endpoint|transcript_url|score_target|assignee|status)"/);
  assert.ok(card.includes(`href="${taskPath}"`));
  assert.ok((await readFile(new URL('dist/llms.txt', ROOT), 'utf8')).includes(`https://unite4ai.com${taskPath}`));

  // Cost guard: GitHub Pages serves at most 1 GB; fail long before that.
  const bytes = await directorySize(new URL('dist/', ROOT));
  assert.ok(bytes < 250 * 1024 * 1024, `dist is ${bytes} bytes; the budget is 250 MB`);
});

test('the agent index leads to the deployed data and the same registry cards as the UI', async () => {
  const dist = new URL('dist/', ROOT);
  const origin = 'https://unite4ai.com';
  const index = await readFile(new URL('llms.txt', dist), 'utf8');
  const links = new Set([...index.matchAll(/\[[^\]]+\]\((https:\/\/unite4ai\.com\/[^)]+)\)/g)]
    .map(([, href]) => new URL(href).pathname));
  const readRoute = (path) => {
    assert.ok(links.has(path), `${path} is discoverable in llms.txt`);
    return readFile(new URL(path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1), dist), 'utf8');
  };

  const pages = ['/school/', '/blog/', '/registry/', '/registry/datasets/', '/evals/', '/exchange/', '/global-exchange/'];
  const html = new Map(await Promise.all(pages.map(async (path) => [path, await readRoute(path)])));
  const feeds = new Map(await Promise.all([
    ['/data/evals.json', 'schema_version'], ['/data/registry-index.json', 'schema_version'],
    ['/data/exchange.json', 'schema_version'], ['/data/global-exchange.json', 'schemaVersion'],
    ['/data/exchange-text.json', 'schema_version'],
    ['/data/eval-exports.json', 'schema_version'],
  ].map(async ([path, versionKey]) => {
    const feed = JSON.parse(await readRoute(path));
    assert.equal(feed[versionKey], 1, path);
    return [path, feed];
  })));

  const registry = feeds.get('/data/registry-index.json');
  for (const [kind, page] of [['models', '/registry/'], ['datasets', '/registry/datasets/']]) {
    const prefix = `/registry/${kind}/`;
    const cards = new Set([...html.get(page).matchAll(/\bhref="([^"]+)"/g)]
      .map(([, href]) => new URL(href, origin))
      .filter((url) => url.origin === origin && url.pathname.startsWith(prefix) && url.pathname !== prefix)
      .map((url) => url.pathname.replace(/\/$/, '').slice(prefix.length)));
    assert.deepEqual(registry[kind].map((record) => record.id).sort(), [...cards].sort(), kind);
    for (const record of registry[kind]) {
      const href = new URL(record.href, origin);
      assert.equal(href.origin, origin);
      assert.equal(href.pathname, `${prefix}${record.id}/`);
      await readFile(new URL(`${href.pathname.slice(1)}index.html`, dist), 'utf8');
    }
  }
});

test('static exports preserve all published result files and link back to their exact evidence', async () => {
  const dist = new URL('dist/', ROOT);
  const readJson = async (path) => JSON.parse(await readFile(new URL(path.replace(/^\//, ''), dist), 'utf8'));
  const source = new URL('src/content/evals/', ROOT);
  const files = (await readdir(source)).filter((name) => name.endsWith('.json')).sort();
  const { results } = await readJson('/data/eval-exports.json');
  assert.deepEqual(results.map((row) => `${row.id}.json`), files);
  assert.ok(results.length > 0);
  for (const row of results) {
    const original = JSON.parse(await readFile(new URL(`${row.id}.json`, source), 'utf8'));
    const evidence = await readJson(row.evidence);
    const eee = await readJson(row.every_eval_ever);
    assert.equal(evidence.evidence.sha256, original.evidence.sha256);
    assert.equal(evidence.score, original.score);
    assert.equal(evidence.n, original.n);
    assert.deepEqual(evidence.repeat, original.repeat);
    assert.equal(Object.hasOwn(evidence.run, 'command'), false);
    assert.equal(Object.hasOwn(evidence.evidence, 'url'), false);
    assert.equal(Object.hasOwn(eee, 'detailed_evaluation_results'), false);
    assert.equal(eee.evaluation_results[0].score_details.score, original.score);
    const result = new URL(row.result_url);
    assert.equal(result.origin, 'https://unite4ai.com');
    assert.equal(result.hash, `#run-${row.id}`);
    const page = await readFile(new URL(`${result.pathname.replace(/^\/|\/$/g, '')}/index.html`, dist), 'utf8');
    assert.ok(page.includes(`id="run-${row.id}"`));
    if (row.hugging_face.status === 'blocked') {
      assert.ok(row.hugging_face.reasons.length > 0);
      assert.equal('yaml' in row.hugging_face, false);
      await assert.rejects(stat(new URL(`data/eval-exports/${row.id}/huggingface.yaml`, dist)), { code: 'ENOENT' });
    } else {
      assert.equal(row.hugging_face.status, 'ready');
      assert.ok((await stat(new URL(row.hugging_face.yaml.slice(1), dist))).isFile());
    }
  }
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
  const order = ['class="hero', 'id="stack-preview-title"', 'aria-label="Platform at a glance"', 'What makes us different', 'Progress is not automatic.'];
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
});

test('public participation links separate reading from signing in to post', async () => {
  const { REPO } = await import('../src/lib/site.ts');
  const [community, article, submit] = await Promise.all([
    'community', 'blog/what-an-ai-emissions-estimate-measures', 'submit',
  ].map((path) => readFile(new URL(`dist/${path}/index.html`, ROOT), 'utf8')));
  for (const html of [community, article, submit]) {
    assert.ok(html.includes(`href="${REPO}/issues"`));
    assert.match(html, /Sign in on GitHub to post/);
    assert.doesNotMatch(html, /href="[^"]+\/discussions(?:[/?#"])/);
  }
  const handoff = [...submit.matchAll(/<a [^>]*href="([^"]*\/issues\/new\?[^"]+)"[^>]*>/g)];
  assert.deepEqual(handoff.map((link) => link[1]), [
    `${REPO}/issues/new?blank=1`,
    `${REPO}/issues/new?template=submit-eval-result.yml`,
  ]);
  assert.match(handoff[0][0], /target="_blank"/);
  assert.match(handoff[0][0], /rel="noopener noreferrer"/);
});

test('Darsy preserves the background source without asserting a released model or runnable setup', async () => {
  const model = await readFile(new URL('dist/registry/models/darsy-xray-analysis/index.html', ROOT), 'utf8');
  const main = model.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert.ok(main);
  assert.match(main, /Unreleased concept/);
  assert.match(main, /href="https:\/\/www\.jacr\.org\/article\/S1546-1440\(22\)00404-4\/fulltext"/);
  assert.match(main, /No weights listed\./);
  assert.match(main, /No artifact checksum listed on this card\./);
  assert.match(main, /No evaluation results yet\./);
  assert.doesNotMatch(main, /href="[^"]*(?:unite4ai\/unite4ai\.github\.io|\/school\/run-open-weights)"/);
});

test('the deployed submission script generates and copies only the editable local draft', async () => {
  const html = await readFile(new URL('dist/submit/index.html', ROOT), 'utf8');
  const script = html.match(/<script\b[^>]*\bid="submission-draft-script"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.match(html, /<fieldset [^>]*disabled[^>]*>/);
  const source = new Map([
    ['type', 'dataset'], ['name', 'Synthetic example'], ['summary', 'Public summary'],
    ['license', 'cc-by-4.0'], ['maintainers', 'example'],
    ['notes', 'local-only <probe>\nsecond line'],
  ]);
  const elements = new Map();
  for (const id of [
    'submit-form', 'submission-fields', 'submission-draft', 'draft-title', 'draft-body',
    'copy-draft-title', 'copy-draft-body', 'draft-status',
  ]) {
    elements.set(id, {
      hidden: true, disabled: true,
      addEventListener(type, fn) { this[type] = fn; },
      focus() {},
      select() { this.selected = true; },
    });
  }
  const get = (id) => elements.get(id);
  const copied = [];
  let clipboardAvailable = true;
  runInNewContext(script, {
    document: { getElementById: get },
    FormData: function (form) {
      assert.equal(form, get('submit-form'));
      return new Map(source);
    },
    navigator: { clipboard: { async writeText(text) {
      if (!clipboardAvailable) throw new Error('Permission denied');
      copied.push(text);
    } } },
  });
  assert.equal(get('submission-fields').disabled, false);
  let prevented = false;
  get('submit-form').submit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(get('submission-draft').hidden, false);
  assert.equal(get('draft-title').value, '[dataset] Synthetic example');
  assert.ok(get('draft-body').value.includes('local-only <probe>\nsecond line'));
  assert.deepEqual(copied, []);

  get('draft-body').value = 'Edited public draft';
  await get('copy-draft-body').click();
  await get('copy-draft-title').click();
  assert.deepEqual(copied, ['Edited public draft', '[dataset] Synthetic example']);
  assert.equal(source.get('notes'), 'local-only <probe>\nsecond line');
  clipboardAvailable = false;
  await get('copy-draft-body').click();
  assert.equal(get('draft-body').selected, true);
  assert.equal(get('draft-body').value, 'Edited public draft');
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
