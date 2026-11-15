/// <reference types="bun" />
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CONTENT_ID,
  EVAL_RESULT_MAX_BYTES,
  benchmarkSchema,
  evalResultSchema,
  type BenchmarkData,
} from '@unite4ai/schema';

interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const DAY_MS = 86_400_000;

function describe(issues: SchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

async function list(dir: string, pattern: RegExp): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => pattern.test(file)).sort();
  } catch {
    return [];
  }
}

/** Regular files that may sit beside content: `.gitkeep` holds an empty directory, `.DS_Store` is git-ignored. */
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store']);

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
    } else if (!entry.isFile() || !IGNORED_FILES.has(entry.name)) {
      errors.push(`${dir}/${entry.name}: only ${kind} files are allowed here; subfolders and links are not read`);
    }
  }
  return files;
}

function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Validates benchmark definitions and evaluation result files, including the rules a schema
 * cannot express: flat directories, size, cross-references, score bounds, full runs, duplicate
 * evidence and filename/content agreement. `today` is a UTC date, `YYYY-MM-DD`.
 */
export async function validateEvals(
  contentRoot: string,
  errors: string[],
  warnings: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  /** Model id to its card file. */
  const models = new Map<string, string>();
  for (const file of await list(join(contentRoot, 'models'), /\.mdx?$/)) models.set(file.replace(/\.mdx?$/, ''), file);
  /** Model id to whether its card overrides that id with a frontmatter `slug`; filled on first reference. */
  const slugged = new Map<string, boolean>();

  const benchmarks = new Map<string, BenchmarkData>();
  for (const file of await listFlat(contentRoot, 'benchmarks', '.md', 'benchmark', errors)) {
    const rel = `benchmarks/${file}`;
    const id = file.slice(0, -'.md'.length);
    if (!CONTENT_ID.test(id)) errors.push(`${rel}: filename must be a lowercase id like my-benchmark.md`);
    const raw = await readFile(join(contentRoot, 'benchmarks', file), 'utf8');
    const frontmatter = raw.match(FRONTMATTER);
    if (!frontmatter) {
      errors.push(`${rel}: missing YAML frontmatter (the --- block at the top)`);
      continue;
    }
    if (/^\+\+\+/m.test(frontmatter[1])) {
      errors.push(`${rel}: frontmatter contains a +++ line; Astro would stop parsing there`);
      continue;
    }
    let data: unknown;
    try {
      data = Bun.YAML.parse(frontmatter[1]);
    } catch (error) {
      errors.push(`${rel}: frontmatter is not valid YAML (${(error as Error).message})`);
      continue;
    }
    const parsed = benchmarkSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    benchmarks.set(id, parsed.data);
  }

  // A contributor ahead of UTC may submit a run dated "tomorrow" by the UTC calendar.
  const latestDate = new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  /** Evidence hash to the first result file that carried it. */
  const evidenceOwners = new Map<string, string>();

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
    const result = parsed.data;

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
    const evidenceOwner = evidenceOwners.get(result.evidence.sha256);
    if (evidenceOwner) {
      errors.push(`${rel}: same evidence.sha256 as evals/${evidenceOwner}; one run is one file`);
    } else {
      evidenceOwners.set(result.evidence.sha256, file);
    }
    if (!isRealDate(result.run.date)) {
      errors.push(`${rel}: run.date ${result.run.date} is not a real date`);
    } else if (result.run.date > latestDate) {
      errors.push(`${rel}: run.date ${result.run.date} is in the future`);
    }

    const card = models.get(result.model);
    if (!card) {
      errors.push(`${rel}: model "${result.model}" has no card in models/. Add the model card first.`);
    } else {
      let hasSlug = slugged.get(result.model);
      if (hasSlug === undefined) {
        const cardFrontmatter = (await readFile(join(contentRoot, 'models', card), 'utf8')).match(FRONTMATTER);
        hasSlug = cardFrontmatter !== null && /^slug\s*:/m.test(cardFrontmatter[1]);
        slugged.set(result.model, hasSlug);
      }
      if (hasSlug) {
        errors.push(`${rel}: model card sets \`slug\`, which changes its id; remove it (models/${card})`);
      }
    }

    const benchmark = benchmarks.get(result.benchmark);
    if (!benchmark) {
      errors.push(`${rel}: benchmark "${result.benchmark}" is not defined (or failed validation) in benchmarks/`);
      continue;
    }
    const { min, max } = benchmark.metric;
    if (min !== undefined && result.score < min) {
      errors.push(`${rel}: score ${result.score} is below the benchmark minimum ${min}`);
    }
    if (max !== undefined && result.score > max) {
      errors.push(`${rel}: score ${result.score} is above the benchmark maximum ${max}`);
    }
    if (result.benchmark_version !== benchmark.version) {
      // The definition only describes the current version, so an older run's item count cannot be checked.
      warnings.push(
        `${rel}: result is for benchmark version ${result.benchmark_version}; `
        + `the current version is ${benchmark.version}, so it will not appear on the leaderboard`,
      );
    } else if (benchmark.items > 0 && result.n !== benchmark.items) {
      errors.push(
        `${rel}: n ${result.n} must equal the benchmark's ${benchmark.items} items; partial runs are not accepted`,
      );
    }
  }
}
