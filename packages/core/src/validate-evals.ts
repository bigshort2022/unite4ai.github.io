/// <reference types="bun" />
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  CONTENT_ID,
  EVAL_RESULT_MAX_BYTES,
  baselineSchema,
  benchmarkSchema,
  evalResultSchema,
  type BaselineData,
  type BenchmarkData,
  type EvalResult,
} from '@unite4ai/schema';
import { baselineSetupKey, baselineVersionKey, matchingBaseline } from './baselines.ts';
import { validateBfclCalibration } from './bfcl-calibration.ts';
import { apiCostProblems } from './eval-cost.ts';
import { repeatProblems } from './repeat.ts';

interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const DAY_MS = 86_400_000;

function describe(issues: SchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

/**
 * Every model card under models/, as a /-separated path in name order. Astro's loader reads
 * subfolders there, so a nested card is a card too.
 */
async function listModelCards(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((entry) => !entry.isDirectory() && /\.mdx?$/.test(entry.name))
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
      .sort();
  } catch {
    return [];
  }
}

/** Regular files that may sit beside content: `.gitkeep` holds an empty directory, `.DS_Store` is git-ignored. */
const IGNORED_FILES = ['.gitkeep', '.DS_Store'];

/**
 * Regular files with the given extension directly inside a content directory, in name order.
 * Astro's loaders would read subfolders and follow links, so anything else (bar IGNORED_FILES)
 * is an error rather than content the validator never saw.
 */
async function listFlat(
  contentRoot: string,
  dir: string,
  extension: string,
  kind: string,
  errors: string[],
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(contentRoot, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entry.name);
    } else if (!entry.isFile() || !IGNORED_FILES.includes(entry.name)) {
      errors.push(`${dir}/${entry.name}: only ${kind} files are allowed here; subfolders and links are not read`);
    }
  }
  return files;
}

function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

/** Read frontmatter using the same delimiters as the Astro content loader. */
async function readMarkdownData(contentRoot: string, dir: string, file: string, errors: string[]): Promise<unknown> {
  const rel = `${dir}/${file}`;
  const raw = await readFile(join(contentRoot, dir, file), 'utf8');
  const frontmatter = raw.match(FRONTMATTER);
  if (!frontmatter) {
    errors.push(`${rel}: missing YAML frontmatter (the --- block at the top)`);
    return;
  }
  if (/^\+\+\+/m.test(frontmatter[1])) {
    errors.push(`${rel}: frontmatter contains a +++ line; Astro would stop parsing there`);
    return;
  }
  try {
    return Bun.YAML.parse(frontmatter[1]);
  } catch (error) {
    errors.push(`${rel}: frontmatter is not valid YAML (${(error as Error).message})`);
  }
}

/**
 * Validates benchmark definitions, baseline manifests and evaluation results, including rules
 * a schema cannot express: flat directories, cross-references, score bounds, full runs,
 * one result per transcript and benchmark, one manifest per version, and filename/content
 * agreement. `today` is a UTC date, `YYYY-MM-DD`.
 */
export async function validateEvals(
  contentRoot: string,
  errors: string[],
  warnings: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ models: Set<string>; benchmarks: Map<string, BenchmarkData>; results: Map<string, EvalResult> }> {
  /** Model id to its card file, for the cards directly in models/: the ones a result can reference. */
  const models = new Map<string, string>();
  for (const card of await listModelCards(join(contentRoot, 'models'))) {
    if (!card.includes('/')) {
      const id = card.replace(/\.mdx?$/, '');
      const owner = models.get(id);
      if (owner) errors.push(`models/${card}: same id as models/${owner}; one id is one file`);
      else models.set(id, card);
    }
    // A card that cannot be read or parsed is reported by the model checks, not here.
    let data: unknown;
    try {
      const frontmatter = (await readFile(join(contentRoot, 'models', card), 'utf8')).match(FRONTMATTER);
      data = frontmatter && Bun.YAML.parse(frontmatter[1]);
    } catch {
      continue;
    }
    if (typeof data === 'object' && data !== null && 'slug' in data) {
      errors.push(
        `models/${card}: a model card must not set \`slug\`: it changes the card's id, and results reference the filename`,
      );
    }
  }

  const benchmarks = new Map<string, BenchmarkData>();
  for (const file of await listFlat(contentRoot, 'benchmarks', '.md', 'benchmark', errors)) {
    const rel = `benchmarks/${file}`;
    const id = file.slice(0, -'.md'.length);
    if (!CONTENT_ID.test(id)) errors.push(`${rel}: filename must be a lowercase id like my-benchmark.md`);
    const errorCount = errors.length;
    const data = await readMarkdownData(contentRoot, 'benchmarks', file, errors);
    if (errors.length !== errorCount) continue;
    const parsed = benchmarkSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    benchmarks.set(id, parsed.data);
  }
  for (const [id, { measured_on: measuredOn }] of benchmarks) {
    if (measuredOn === undefined) continue;
    const ran = benchmarks.get(measuredOn);
    if (!ran) {
      errors.push(`benchmarks/${id}.md: measured_on "${measuredOn}" is not defined (or failed validation) in benchmarks/`);
    } else if (ran.scoring === 'measured') {
      errors.push(
        `benchmarks/${id}.md: measured_on "${measuredOn}" is itself a measured benchmark; name the benchmark whose runs are measured`,
      );
    }
  }

  const baselines = new Map<string, BaselineData>();
  const manifestOwners = new Map<string, string>();
  for (const file of await listFlat(contentRoot, 'baselines', '.md', 'baseline manifest', errors)) {
    const rel = `baselines/${file}`;
    const errorCount = errors.length;
    const data = await readMarkdownData(contentRoot, 'baselines', file, errors);
    if (errors.length !== errorCount) continue;
    const parsed = baselineSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    const { benchmark, benchmark_version: version, entries } = parsed.data;
    const expected = `${benchmark}-v${version}.md`;
    if (file !== expected) errors.push(`${rel}: filename must be "${expected}"`);

    const key = baselineVersionKey(benchmark, version);
    const owner = manifestOwners.get(key);
    if (owner !== undefined) errors.push(`${rel}: same benchmark version as baselines/${owner}; one version is one manifest`);
    else manifestOwners.set(key, file);

    const definition = benchmarks.get(benchmark);
    if (definition === undefined) {
      errors.push(`${rel}: benchmark "${benchmark}" is not defined (or failed validation) in benchmarks/`);
    } else if (definition.scoring === 'measured') {
      errors.push(`${rel}: registered baselines are not allowed for measured benchmarks`);
    } else if (version !== definition.version && !definition.previous_versions.includes(version)) {
      errors.push(`${rel}: benchmark_version "${version}" is not the current version "${definition.version}" nor one of its previous versions`);
    }

    const ids = new Set<string>();
    const setups = new Map<string, string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) errors.push(`${rel}: duplicate entry id "${entry.id}"`);
      else ids.add(entry.id);

      const setup = baselineSetupKey(entry);
      const duplicate = setups.get(setup);
      if (duplicate !== undefined) errors.push(`${rel}: entry "${entry.id}" has the same setup as entry "${duplicate}"`);
      else setups.set(setup, entry.id);

      if (entry.withdrawal !== undefined && entry.withdrawal.date < entry.registered_on) {
        errors.push(`${rel}: entry "${entry.id}" withdrawal date must not precede registered_on`);
      }

      const hasLocalModel = models.has(entry.model);
      if (!hasLocalModel && !(entry.runtime === 'api' && entry.model_card !== undefined)) {
        errors.push(`${rel}: entry "${entry.id}" model "${entry.model}" has no card in models/; API entries can cite an upstream model_card`);
      } else if (entry.model_card !== undefined && entry.runtime !== 'api') {
        errors.push(`${rel}: entry "${entry.id}" model_card is only for API baselines`);
      }
    }
    if (errors.length === errorCount) baselines.set(key, parsed.data);
  }

  // Read every result before checking any: a measured result is checked against another file.
  const results: { file: string; result: EvalResult }[] = [];
  for (const file of await listFlat(contentRoot, 'evals', '.json', 'result', errors)) {
    const rel = `evals/${file}`;
    const path = join(contentRoot, 'evals', file);
    const { size } = await stat(path);
    if (size > EVAL_RESULT_MAX_BYTES) {
      errors.push(
        `${rel}: ${size} bytes exceeds the ${EVAL_RESULT_MAX_BYTES}-byte limit. `
        + 'Keep raw output out of git: host it yourself and reference it with evidence.url and evidence.sha256.',
      );
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      errors.push(`${rel}: not valid JSON`);
      continue;
    }
    const parsed = evalResultSchema.safeParse(json);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    results.push({ file, result: parsed.data });
  }

  // A contributor ahead of UTC may submit a run dated "tomorrow" by the UTC calendar.
  const latestDate = new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  /**
   * Evidence hash to the benchmark whose run produced that transcript, the first file that
   * carried the hash, and the file of each benchmark's result. A transcript backs one result
   * of the benchmark that was run, and one of each benchmark measured on it.
   */
  const evidenceOwners = new Map<string, { ran: string; first: string; files: Map<string, string> }>();
  const calibratedRuns = new Set<string>();
  let hasBfclResults = false;

  for (const { file, result } of results) {
    const rel = `evals/${file}`;
    const benchmark = benchmarks.get(result.benchmark);
    for (const problem of apiCostProblems(result)) errors.push(`${rel}: ${problem}`);
    if (result.setup.runtime === 'api') {
      if (benchmark?.scoring === 'measured') errors.push(`${rel}: API runs cannot provide measured speed companion results`);
      if (result.repeat?.energy_wh_total !== undefined) errors.push(`${rel}: API runs cannot report inference energy measured on the client`);
    }
    if (result.benchmark === 'bfcl-multiple-50' && result.benchmark_version === '1') {
      hasBfclResults = true;
      const manifest = baselines.get(baselineVersionKey(result.benchmark, result.benchmark_version));
      if (matchingBaseline(manifest, result, models.has(result.model)) !== undefined) calibratedRuns.add(result.evidence.sha256);
    }
    const expected = [
      result.model,
      result.benchmark,
      result.run.submitter,
      result.run.date,
      result.evidence.sha256.slice(0, 8),
    ].join('--');
    if (file !== `${expected}.json`) {
      errors.push(
        `${rel}: filename must be "${expected}.json" (model--benchmark--submitter--date--first 8 characters of evidence.sha256)`,
      );
    }
    const ran = benchmark?.measured_on ?? result.benchmark;
    const owners = evidenceOwners.get(result.evidence.sha256);
    if (!owners) {
      evidenceOwners.set(result.evidence.sha256, { ran, first: file, files: new Map([[result.benchmark, file]]) });
    } else {
      const owner = owners.files.get(result.benchmark) ?? (owners.ran === ran ? undefined : owners.first);
      if (owner === undefined) {
        owners.files.set(result.benchmark, file);
      } else {
        errors.push(`${rel}: same evidence.sha256 as evals/${owner}; one run's transcript backs one result per benchmark`);
      }
    }
    if (!isRealDate(result.run.date)) {
      errors.push(`${rel}: run.date ${result.run.date} is not a real date`);
    } else if (result.run.date > latestDate) {
      errors.push(`${rel}: run.date ${result.run.date} is in the future`);
    }

    if (!models.has(result.model) && !(result.setup.runtime === 'api' && result.api?.model_card !== undefined)) {
      errors.push(`${rel}: model "${result.model}" has no card in models/. Add the model card first.`);
    }

    if (!benchmark) {
      errors.push(`${rel}: benchmark "${result.benchmark}" is not defined (or failed validation) in benchmarks/`);
      continue;
    }
    if (result.repeat !== undefined) {
      for (const problem of repeatProblems(result.repeat, result.n)) errors.push(`${rel}: ${problem}`);
    }
    if (result.benchmark_version === benchmark.version) {
      const { min, max } = benchmark.metric;
      if (min !== undefined && result.score < min) {
        errors.push(`${rel}: score ${result.score} is below the benchmark minimum ${min}`);
      }
      if (max !== undefined && result.score > max) {
        errors.push(`${rel}: score ${result.score} is above the benchmark maximum ${max}`);
      }
      if (benchmark.items > 0 && result.n !== benchmark.items) {
        errors.push(
          `${rel}: n ${result.n} must equal the benchmark's ${benchmark.items} items; partial runs are not accepted`,
        );
      }
      const method = benchmark.repeat;
      const version = `version ${benchmark.version} of ${result.benchmark}`;
      if (method === undefined && result.repeat !== undefined) {
        errors.push(`${rel}: repeat is set, but ${version} answers every item once`);
      } else if (method !== undefined && result.repeat === undefined) {
        errors.push(`${rel}: ${version} answers every item ${method.runs} times; the result has no repeat block`);
      } else if (method !== undefined && result.repeat !== undefined) {
        for (const key of ['runs', 'temperature', 'top_p'] as const) {
          if (result.repeat[key] !== method[key]) errors.push(`${rel}: repeat.${key} is ${result.repeat[key]}; ${version} sets ${method[key]}`);
        }
        if (result.score !== result.repeat.pass_k) {
          errors.push(
            `${rel}: score ${result.score} must equal repeat.pass_k (${result.repeat.pass_k}); `
            + 'a repeat-run benchmark scores the share of items answered correctly on every run',
          );
        }
      }
    } else if (benchmark.previous_versions.includes(result.benchmark_version)) {
      // The definition describes only the current version, so an older run's score range and item count cannot be checked.
      warnings.push(
        `${rel}: result is for benchmark version ${result.benchmark_version}; `
        + `the current version is ${benchmark.version}, so it will not appear on the leaderboard`,
      );
    } else {
      errors.push(
        `${rel}: benchmark_version "${result.benchmark_version}" is not the current version "${benchmark.version}" `
        + 'nor one of its previous versions',
      );
    }

    // The schema requires measured_on exactly when scoring is "measured".
    if (benchmark.measured_on !== undefined) {
      const speed = result.perf?.tokens_per_second;
      if (speed !== result.score) {
        errors.push(
          `${rel}: score ${result.score} must equal perf.tokens_per_second (${speed ?? 'not set'}); `
          + 'the score of a measured benchmark is the measured speed',
        );
      }
      // Two files of one run differ only in the benchmark they are for, its version and the score.
      const run = results.find(({ result: other }) =>
        other.benchmark === benchmark.measured_on
        && other.model === result.model
        && other.n === result.n
        && isDeepStrictEqual(other.run, result.run)
        && isDeepStrictEqual(other.setup, result.setup)
        && isDeepStrictEqual(other.perf, result.perf)
        && isDeepStrictEqual(other.evidence, result.evidence))?.result;
      if (!run) {
        errors.push(
          `${rel}: no ${benchmark.measured_on} result from the same run; `
          + 'a speed result is published together with the run it was measured on',
        );
      } else if (
        result.benchmark_version === benchmark.version
        && run.benchmark_version !== benchmarks.get(benchmark.measured_on)?.version
      ) {
        errors.push(
          `${rel}: the ${benchmark.measured_on} result of this run is for version ${run.benchmark_version}; `
          + 'a current speed result needs a current run',
        );
      }
    }
  }
  await validateBfclCalibration(contentRoot, calibratedRuns, hasBfclResults, errors);
  return {
    models: new Set(models.keys()),
    benchmarks,
    results: new Map(results.map(({ file, result }) => [file.slice(0, -'.json'.length), result])),
  };
}
