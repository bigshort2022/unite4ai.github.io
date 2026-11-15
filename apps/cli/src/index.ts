#!/usr/bin/env bun
/**
 * unite4ai CLI — validate content and scaffold registry submissions locally.
 *
 * Usage:
 *   bun run publish:cli -- validate
 *   bun run publish:cli -- new-model my-model-slug
 *   bun run publish:cli -- new-dataset my-dataset-slug
 *   bun run eval -- --help
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_USAGE, parseEvalArgs } from './eval/args.ts';
import { runEval } from './eval/run.ts';

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
  case 'eval': {
    if (process.argv.includes('--help')) {
      console.log(EVAL_USAGE);
      break;
    }
    try {
      const options = parseEvalArgs(process.argv.slice(3), { root: ROOT, env: process.env });
      const outcome = await runEval({ ...options, log: (line) => console.error(line) });
      console.log(JSON.stringify({ status: 'complete', ...outcome }));
      const speed = outcome.speedResultPath === undefined ? '' : `\nSpeed result: ${outcome.speedResultPath}`;
      console.error(`\n${outcome.correct}/${outcome.n} correct (${outcome.score}). Result: ${outcome.resultPath}${speed}\nRun \`bun run validate\`, then open a pull request with ${speed ? 'both files' : 'that file'}.`);
    } catch (error) {
      console.error(`eval failed: ${(error as Error).message}`);
      process.exit(1);
    }
    break;
  }
  default:
    console.log(`unite4ai — open registry tooling

Commands:
  validate              Run content validation (same as CI)
  new-model <slug>      Scaffold a model card
  new-dataset <slug>    Scaffold a dataset card
  eval <flags>          Run a benchmark against a local model (bun run eval -- --help)
  sync                  Regenerate registry JSON snapshot
`);
}
