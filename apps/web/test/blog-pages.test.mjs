import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

test('News & Notes is discoverable and links to published articles newest first under a project base', { timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'u4ai-blog-'));
  try {
    const result = spawnSync('bun', ['run', 'astro', 'build', '--base', '/preview', '--outDir', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);

    const indexPath = join(out, 'blog', 'index.html');
    assert.ok(existsSync(indexPath), '/blog/ must be a generated page');
    const index = readFileSync(indexPath, 'utf8');
    assert.match(index, /<title>News &amp; Notes · Unite4AI<\/title>/);
    const main = index.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.match(main ?? '', /<h1\b[^>]*>News &amp; Notes<\/h1>/);
    const articles = [...main.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(([, card]) => ({
      slug: card.match(/href="\/preview\/blog\/([a-z0-9-]+)\/?"/)?.[1],
      date: card.match(/<time\b[^>]*datetime="(\d{4}-\d{2}-\d{2})"/)?.[1],
    }));
    const slugs = articles.map(({ slug }) => slug);
    assert.ok(slugs.includes('what-an-ai-emissions-estimate-measures'));
    assert.ok(slugs.includes('why-we-built-this-in-the-open'));
    assert.equal(new Set(slugs).size, slugs.length, 'each article appears once');
    let previous = '9999-12-31';
    for (const { slug, date } of articles) {
      assert.ok(slug && date && date <= previous, 'cards link under /preview and are in descending date order');
      previous = date;
      const post = readFileSync(join(out, 'blog', slug, 'index.html'), 'utf8');
      assert.match(post, /<p class="eyebrow"[^>]*>\s*<a href="\/preview\/blog\/?">News &amp; Notes<\/a>/);
    }
    const home = readFileSync(join(out, 'index.html'), 'utf8');
    const nav = home.match(/<nav\b[^>]*aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.match(nav ?? '', /href="\/preview\/blog\/?"[^>]*>News &amp; Notes<\/a>/);
    const community = readFileSync(join(out, 'community', 'index.html'), 'utf8').match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.match(community ?? '', /href="\/preview\/blog\/?"[^>]*>/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
