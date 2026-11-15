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
  const modelPages = ['darsy-xray-analysis', 'qwen3-6-35b-a3b'].map((id) => `dist/registry/models/${id}/index.html`);
  for (const path of [...detailPages, ...modelPages]) {
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
