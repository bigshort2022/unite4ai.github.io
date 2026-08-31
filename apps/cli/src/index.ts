#!/usr/bin/env bun
/**
 * unite4ai CLI — validate content and scaffold registry submissions locally.
 *
 * Usage:
 *   bun run publish:cli -- validate
 *   bun run publish:cli -- new-model my-model-slug
 *   bun run publish:cli -- new-dataset my-dataset-slug
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = join(ROOT, 'apps/web');

const [, , command, arg] = process.argv;

function run(script: string, args: string[] = []) {
  const result = spawnSync('bun', [script, ...args], { cwd: WEB, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

switch (command) {
  case 'validate':
    run('scripts/validate.ts');
    break;
  case 'new-model':
    if (!arg) {
      console.error('Usage: unite4ai new-model <slug>');
      process.exit(1);
    }
    run('scripts/new-model.ts', [arg]);
    break;
  case 'new-dataset':
    if (!arg) {
      console.error('Usage: unite4ai new-dataset <slug>');
      process.exit(1);
    }
    run('scripts/new-dataset.ts', [arg]);
    break;
  case 'sync':
    spawnSync('bun', ['run', 'sync:d1'], { cwd: ROOT, stdio: 'inherit' });
    break;
  default:
    console.log(`unite4ai — open registry tooling

Commands:
  validate              Run content validation (same as CI)
  new-model <slug>      Scaffold a model card
  new-dataset <slug>    Scaffold a dataset card
  sync                  Regenerate registry JSON snapshot
`);
}
