import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { baselineSchema, evalResultSchema, type BaselineData, type EvalResult } from '../../packages/schema/src/index.ts';
import { matchingBaseline } from '../../packages/core/src/baselines.ts';

const CONTENT = 'apps/web/src/content';

/** Compare the candidate with the merged base, not with run dates or PR timestamps. */
export function baselineHistoryProblems(
  base: ReadonlyMap<string, BaselineData>,
  candidate: ReadonlyMap<string, BaselineData>,
  results: readonly EvalResult[],
  publishedResults: readonly EvalResult[],
): string[] {
  const problems: string[] = [];
  for (const [file, before] of base) {
    const after = candidate.get(file);
    if (after === undefined) {
      problems.push(`${file}: registered manifest was removed`);
      continue;
    }
    if (before.benchmark !== after.benchmark || before.benchmark_version !== after.benchmark_version) {
      problems.push(`${file}: registered benchmark or version changed`);
      continue;
    }
    for (const entry of before.entries) {
      const next = after.entries.find(({ id }) => id === entry.id);
      if (next === undefined) {
        problems.push(`${file}#${entry.id}: registered entry was removed; withdraw it with a reason instead`);
        continue;
      }
      const { withdrawal, ...setup } = entry;
      const { withdrawal: nextWithdrawal, ...nextSetup } = next;
      if (!isDeepStrictEqual(setup, nextSetup)) problems.push(`${file}#${entry.id}: changed setup; add a new entry instead`);
      if (withdrawal !== undefined && !isDeepStrictEqual(withdrawal, nextWithdrawal)) {
        problems.push(`${file}#${entry.id}: recorded withdrawal changed`);
      }
      if (withdrawal === undefined && nextWithdrawal !== undefined && publishedResults.some((run) =>
        run.run.date > nextWithdrawal.date
        && matchingBaseline({ ...before, entries: [entry] }, run, entry.model_card === undefined) !== undefined)) {
        problems.push(`${file}#${entry.id}: withdrawal would unlink a published result`);
      }
    }
  }
  for (const [file, manifest] of candidate) {
    const before = base.get(file);
    const sameVersion = results.filter((run) => run.benchmark === manifest.benchmark && run.benchmark_version === manifest.benchmark_version);
    if (sameVersion.length === 0) continue;
    if (before === undefined) {
      problems.push(`${file}: benchmark version already has results in this candidate; merge the manifest first`);
      continue;
    }
    const added = manifest.entries.filter((entry) => !before.entries.some(({ id }) => id === entry.id));
    for (const entry of added) {
      // Dates matter to display, not to detecting an already observed setup.
      const { withdrawal: _withdrawal, ...setup } = entry;
      const undated = { ...manifest, entries: [{ ...setup, registered_on: '0000-01-01' }] };
      if (sameVersion.some((run) => matchingBaseline(undated, run, entry.model_card === undefined) !== undefined)) {
        problems.push(`${file}#${entry.id}: setup already has a result in this candidate; merge the entry first`);
      }
    }
  }
  return problems;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const files = (ref: string, dir: string, extension: string) => git('ls-tree', '-r', '--name-only', '-z', ref, '--', `${CONTENT}/${dir}/`)
  .split('\0').filter((path) => path.endsWith(extension));
const read = (ref: string, path: string) => git('show', `${ref}:${path}`);

function manifests(ref: string): Map<string, BaselineData> {
  return new Map(files(ref, 'baselines', '.md').map((path) => {
    const frontmatter = read(ref, path).match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) throw new Error(`${path}: missing YAML frontmatter`);
    return [basename(path), baselineSchema.parse(Bun.YAML.parse(frontmatter[1]))];
  }));
}

if (import.meta.main) {
  try {
    const [base, candidate] = process.argv.slice(2);
    if (![base, candidate].every((ref) => typeof ref === 'string' && /^[a-f0-9]{40}$/.test(ref))) {
      throw new Error('usage: bun scripts/benchmarks/baseline-history.ts <base SHA> <candidate SHA>');
    }
    // A deletion followed by a new manifest and then restoration is still a retroactive
    // registration. Published result files are add-only; do not let their identity disappear.
    const replaced = git('diff', '--no-renames', '--diff-filter=DMT', '--name-only', '-z', base, candidate, '--',
      `${CONTENT}/evals/*.json`, `${CONTENT}/calibrations/*.json`).split('\0').filter(Boolean);
    if (replaced.length > 0) throw new Error(replaced.map((path) => `${path}: published evidence is append-only`).join('\n'));
    const baseManifests = manifests(base);
    const candidateManifests = manifests(candidate);
    if (!isDeepStrictEqual(baseManifests, candidateManifests)) {
      const published = new Set(files(base, 'evals', '.json'));
      const results: EvalResult[] = [];
      const publishedResults: EvalResult[] = [];
      for (const path of files(candidate, 'evals', '.json')) {
        const result = evalResultSchema.parse(JSON.parse(read(candidate, path)));
        results.push(result);
        if (published.has(path)) publishedResults.push(result);
      }
      const problems = baselineHistoryProblems(baseManifests, candidateManifests, results, publishedResults);
      if (problems.length > 0) throw new Error(problems.join('\n'));
    }
    console.log('Baseline registration history passed');
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
