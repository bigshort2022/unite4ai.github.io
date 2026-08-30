#!/usr/bin/env node
/**
 * Verify artifact SHA256 checksums declared in content frontmatter.
 * Runs in CI when artifact URLs are present — skips unreachable URLs with a warning.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../src/content/', import.meta.url).pathname;
const errors = [];
const warnings = [];
const verified = [];

async function verifyFile(dir) {
  let files = [];
  try { files = await readdir(join(ROOT, dir)); } catch { return; }

  for (const f of files.filter((x) => /\.mdx?$/.test(x))) {
    const rel = `${dir}/${f}`;
    const raw = await readFile(join(ROOT, dir, f), 'utf8');
    const artifacts = [...raw.matchAll(/-\s+kind:\s+\w+\s*\n\s+url:\s+(\S+)\s*\n(?:\s+sha256:\s+([a-f0-9]{64}))?/g)];

    for (const [, url, expectedHash] of artifacts) {
      if (!expectedHash) continue;
      try {
        const response = await fetch(url.replace(/['"]/g, ''), {
          signal: AbortSignal.timeout(30_000),
          redirect: 'follow',
        });
        if (!response.ok) {
          warnings.push(`${rel}: could not fetch ${url} (${response.status}) — skipping verify`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const hash = createHash('sha256').update(buffer).digest('hex');
        if (hash !== expectedHash) {
          errors.push(`${rel}: sha256 mismatch for ${url}\n    expected ${expectedHash}\n    got      ${hash}`);
        } else {
          verified.push(`${rel}: ${url.slice(0, 60)}…`);
        }
      } catch (err) {
        warnings.push(`${rel}: fetch failed for ${url} — ${err.message}`);
      }
    }
  }
}

await verifyFile('models');
await verifyFile('datasets');

if (warnings.length) {
  console.log('\n\x1b[33mArtifact verification warnings\x1b[0m');
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

if (verified.length) {
  console.log(`\n\x1b[32m✓ Verified ${verified.length} artifact checksum(s)\x1b[0m`);
}

if (errors.length) {
  console.error('\n\x1b[31mArtifact verification failed\x1b[0m\n');
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

console.log('\n\x1b[32m✓ Artifact verification passed\x1b[0m\n');
