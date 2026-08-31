#!/usr/bin/env bun
/**
 * Scaffold a new dataset card.
 * Usage: bun run new:dataset my-dataset-slug
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: bun run new:dataset <slug>');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const title = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const template = `---
name: ${title}
summary: One-line description of this dataset (max 300 characters).
maintainers: ["your-github-handle"]
license: cc-by-4.0
collection_method: Describe how data was collected (min 10 chars).
consent: yes / no / partial — explain
pii_review: false
bias_notes: Name populations under-represented and known collection biases (min 10 chars).
artifacts: []
# storage:
#   protocol: ipfs
#   content_address: ipfs://...
#   mirror_urls: []
domains: []
sdg_alignment: []
community_led: false
featured: false
updated: ${today}
---

## Overview

Describe the dataset, intended use, and openness.

## Provenance

How was it collected? Who consented?

## Known limitations

Bias, gaps, and misuse risks.
`;

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/content/datasets');
await mkdir(dir, { recursive: true });
const path = join(dir, `${slug}.md`);
await writeFile(path, template, 'utf8');
console.log(`Created ${path}`);
