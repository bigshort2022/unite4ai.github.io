import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const scratch = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Runs the setup script in a copy of the two files it rewrites by name; returns the copy's directory. */
function configure(...args) {
  const dir = mkdtempSync(join(tmpdir(), 'u4ai-setup-'));
  scratch.push(dir);
  mkdirSync(join(dir, 'src/lib'), { recursive: true });
  cpSync(join(ROOT, 'astro.config.mjs'), join(dir, 'astro.config.mjs'));
  cpSync(join(ROOT, 'src/lib/site.ts'), join(dir, 'src/lib/site.ts'));
  const run = spawnSync('bun', [join(ROOT, 'scripts/setup.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  return dir;
}

test('setup names the fork in lib/site.ts, the one place every link to the repository derives from', { timeout: 120_000 }, async () => {
  const dir = configure('octo-cat', 'my-fork');
  const site = readFileSync(join(dir, 'src/lib/site.ts'), 'utf8');
  assert.match(site, /^export const REPO_SLUG = 'octo-cat\/my-fork';$/m);
  // The link is still derived, and the rewritten module says what the pages will print.
  const { REPO, REPO_SLUG } = await import(pathToFileURL(join(dir, 'src/lib/site.ts')).href);
  assert.equal(REPO_SLUG, 'octo-cat/my-fork');
  assert.equal(REPO, 'https://github.com/octo-cat/my-fork');

  const config = readFileSync(join(dir, 'astro.config.mjs'), 'utf8');
  assert.match(config, /^const SITE = 'https:\/\/octo-cat\.github\.io';$/m);
  assert.match(config, /^const BASE = '\/my-fork';$/m);
});

test('setup names a user page repository in full', { timeout: 120_000 }, () => {
  const dir = configure('octo-cat', 'octo-cat.github.io');
  assert.match(readFileSync(join(dir, 'src/lib/site.ts'), 'utf8'), /^export const REPO_SLUG = 'octo-cat\/octo-cat\.github\.io';$/m);
  assert.match(readFileSync(join(dir, 'astro.config.mjs'), 'utf8'), /^const BASE = '\/';$/m);
});
