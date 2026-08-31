#!/usr/bin/env bun
/**
 * Verify artifact SHA256 checksums declared in content frontmatter.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../src/content');
const errors: string[] = [];
const warnings: string[] = [];
const verified: string[] = [];

async function verifyFile(dir: string) {
  let files: string[] = [];
  try {
    files = await readdir(join(ROOT, dir));
  } catch {
    return;
  }

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
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`${rel}: fetch failed for ${url} — ${message}`);
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
