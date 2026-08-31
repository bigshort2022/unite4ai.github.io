import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url);

test('production build targets the unite4ai.com custom domain', async () => {
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
  const placesHtml = await readFile(new URL('dist/places/index.html', ROOT), 'utf8');

  assert.match(homeHtml, /Explore sustainable places/);
  assert.match(homeHtml, /href="\/places"/);
  assert.match(placesHtml, /Sustainable Places/);
  assert.match(placesHtml, /Site evidence/);
  assert.match(placesHtml, /Techno-economic assessment/);
});
