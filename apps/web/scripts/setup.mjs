#!/usr/bin/env node
/**
 * One-command configuration.
 *
 *   node scripts/setup.mjs <github-username> [repo-name] [custom-domain]
 *
 * Replaces every placeholder across the project and rewrites astro.config.mjs
 * with the correct `site` and `base` for your chosen hosting shape:
 *
 *   node scripts/setup.mjs beejal                     → https://beejal.github.io/unite4ai
 *   node scripts/setup.mjs beejal beejal.github.io    → https://beejal.github.io
 *   node scripts/setup.mjs beejal unite4ai unite4ai.org → https://unite4ai.org
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const [user, repoArg, domain] = process.argv.slice(2);

if (!user) {
  console.error(`
Usage: node scripts/setup.mjs <github-username> [repo-name] [custom-domain]

Examples:
  node scripts/setup.mjs beejal
      → project page at https://beejal.github.io/unite4ai

  node scripts/setup.mjs beejal beejal.github.io
      → user page at https://beejal.github.io

  node scripts/setup.mjs beejal unite4ai unite4ai.org
      → custom domain at https://unite4ai.org
`);
  process.exit(1);
}

const repo = repoArg || 'unite4ai';
const isUserPage = /\.github\.io$/i.test(repo);
const site = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : `https://${user}.github.io`;
const base = domain || isUserPage ? '/' : `/${repo}`;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.astro']);
const TEXT_EXT = new Set(['.astro', '.ts', '.js', '.mjs', '.md', '.mdx', '.yml', '.yaml', '.json', '.css', '.html', '.txt']);

let changed = 0;

async function walk(dir) {
  for (const name of await readdir(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) { await walk(p); continue; }
    if (!TEXT_EXT.has(extname(name))) continue;

    const before = await readFile(p, 'utf8');
    const after = before
      .replaceAll('unite4ai/unite4ai.github.io', `${user}/${repo}`)
      .replaceAll('unite4ai', user);
    if (after !== before) { await writeFile(p, after); changed++; }
  }
}

await walk(process.cwd());

// Rewrite the two config constants precisely.
const cfgPath = 'astro.config.mjs';
let cfg = await readFile(cfgPath, 'utf8');
cfg = cfg
  .replace(/const SITE = '[^']*';/, `const SITE = '${site}';`)
  .replace(/const BASE = '[^']*';/, `const BASE = '${base}';`);
await writeFile(cfgPath, cfg);

// A custom domain needs a CNAME file in the published output.
if (domain) {
  await writeFile('public/CNAME', `${domain.replace(/^https?:\/\//, '')}\n`);
}

const url = base === '/' ? site : `${site}${base}`;
console.log(`
✓ Configured.

  GitHub repo   ${user}/${repo}
  Live URL      ${url}
  astro base    ${base}
  Files updated ${changed}${domain ? `\n  CNAME         public/CNAME written for ${domain}` : ''}

Next:
  npm install
  npm run dev      → preview at http://localhost:4321${base === '/' ? '' : base}
  git add -A && git commit -m "Configure Unite4AI site" && git push
`);
