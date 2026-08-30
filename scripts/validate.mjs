#!/usr/bin/env node
/**
 * Content gate — runs before the build, in CI on every pull request.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPEN_LICENSE_SET, OPEN_WASHED } from './open-licenses.mjs';

const ROOT = new URL('../src/content/', import.meta.url).pathname;

const errors = [];
const warnings = [];

function frontmatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { errors.push(`${file}: missing YAML frontmatter (the --- block at the top)`); return null; }
  const out = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (top) {
      currentKey = top[1];
      out[currentKey] = top[2].trim();
    } else if (currentKey && /^\s+/.test(line)) {
      out[currentKey] = (out[currentKey] ? out[currentKey] + ' ' : '') + line.trim();
    }
  }
  return out;
}

const unquote = (v = '') => v.replace(/^["']|["']$/g, '').trim();

async function checkDir(dir, checks) {
  let files = [];
  try { files = await readdir(join(ROOT, dir)); } catch { return; }
  for (const f of files.filter((x) => /\.mdx?$/.test(x))) {
    const rel = `${dir}/${f}`;
    const raw = await readFile(join(ROOT, dir, f), 'utf8');
    const fm = frontmatter(raw, rel);
    if (!fm) continue;
    checks(fm, rel, raw);
  }
}

const licenseCheck = (fm, rel) => {
  const lic = unquote(fm.license || '').toLowerCase();
  if (!lic) { errors.push(`${rel}: missing "license"`); return; }
  if (OPEN_WASHED[lic]) {
    errors.push(`${rel}: license "${lic}" is not open. ${OPEN_WASHED[lic]}`);
  } else if (!OPEN_LICENSE_SET.has(lic)) {
    errors.push(
      `${rel}: license "${lic}" is not on the allowlist.\n` +
      `    Allowed: ${[...OPEN_LICENSE_SET].join(', ')}\n` +
      `    If this license is genuinely open, propose adding it in a separate PR.`
    );
  }
};

const requireFields = (fields) => (fm, rel) => {
  for (const key of fields) {
    if (!fm[key] || !unquote(fm[key])) errors.push(`${rel}: missing required field "${key}"`);
  }
};

await checkDir('models', (fm, rel, raw) => {
  licenseCheck(fm, rel);
  requireFields(['name', 'summary', 'maintainers', 'updated'])(fm, rel);
  for (const axis of ['weights:', 'training_data:', 'training_code:', 'evaluation:']) {
    if (!raw.includes(axis)) errors.push(`${rel}: openness axis "${axis.replace(':', '')}" not declared`);
  }
  for (const [, hash] of raw.matchAll(/sha256:\s*["']?([^"'\s]+)/g)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) errors.push(`${rel}: sha256 "${hash}" is not a valid 64-char hex digest`);
  }
  if (!/##\s/.test(raw)) warnings.push(`${rel}: card body has no sections — reviewers will ask for more detail`);
});

await checkDir('datasets', (fm, rel) => {
  licenseCheck(fm, rel);
  requireFields([
    'name', 'summary', 'maintainers', 'updated',
    'collection_method', 'consent', 'pii_review', 'bias_notes',
  ])(fm, rel);
  if (fm.bias_notes && unquote(fm.bias_notes).length < 20) {
    errors.push(`${rel}: "bias_notes" is too short. Name the populations under-represented.`);
  }
});

await checkDir('courses', (fm, rel) => {
  requireFields(['title', 'summary', 'level', 'persona', 'duration_minutes', 'author', 'updated'])(fm, rel);
  const lvl = unquote(fm.level || '');
  if (lvl && !['beginner', 'intermediate', 'advanced'].includes(lvl)) {
    errors.push(`${rel}: level "${lvl}" must be beginner, intermediate, or advanced`);
  }
});

await checkDir('events', requireFields(['title', 'summary', 'starts', 'kind']));
await checkDir('posts', requireFields(['title', 'summary', 'author', 'published']));

if (warnings.length) {
  console.log('\n\x1b[33mWarnings\x1b[0m');
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

if (errors.length) {
  console.error('\n\x1b[31mContent validation failed\x1b[0m\n');
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  console.error(`\n${errors.length} error(s). Fix these and push again — CI will re-run automatically.\n`);
  process.exit(1);
}

console.log('\n\x1b[32m✓ Content validation passed\x1b[0m — schemas, licenses, and checksums all clean.\n');
