#!/usr/bin/env node
/**
 * Scaffold a new model card with valid frontmatter defaults.
 * Usage: npm run new:model my-model-name
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: npm run new:model <slug>\n  Example: npm run new:model my-open-model');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const template = `---
name: ${slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
summary: One-line description of what this model does (max 300 characters).
maintainers: ["your-github-handle"]
license: apache-2.0
openness:
  weights: open
  training_data: documented
  training_code: open
  evaluation: open
artifacts: []
# Optional open-stack fields:
# inference:
#   protocol: ollama
#   run_local_guide: /school/run-open-weights
# eval_bundle:
#   url: https://example.com/eval.tar.gz
#   sha256: "64-char-hex"
#   reproducible: false
tasks: []
domains: []
sdg_alignment: []
community_led: false
featured: false
updated: ${today}
---

## Overview

Describe the model, its intended use, and what makes it genuinely open.

## Training data

Be honest about data sources, consent, and known gaps.

## Evaluation

Describe benchmarks, metrics, and limitations.
`;

const dir = join(new URL('../src/content/models/', import.meta.url).pathname);
await mkdir(dir, { recursive: true });
const path = join(dir, `${slug}.md`);
await writeFile(path, template, 'utf8');
console.log(`Created ${path}`);
console.log('Next: edit the file, then run npm run validate && npm run build');
