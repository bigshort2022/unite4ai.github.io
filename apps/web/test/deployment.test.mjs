import assert from 'node:assert/strict';
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
  const feedJson = await readFile(new URL('dist/data/evals.json', ROOT), 'utf8');
  assert.equal(JSON.parse(feedJson).schema_version, 1);
  const fixtureMarkers = /fixture-bot|Fixture Laptop|Q4_K_M/;
  assert.doesNotMatch(evalsHtml, fixtureMarkers);
  assert.doesNotMatch(feedJson, fixtureMarkers);

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
