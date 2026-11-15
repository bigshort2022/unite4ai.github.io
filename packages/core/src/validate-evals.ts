/// <reference types="bun" />
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EVAL_RESULT_MAX_BYTES,
  benchmarkSchema,
  evalResultSchema,
  type BenchmarkData,
} from '@unite4ai/schema';

interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

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

function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Validates benchmark definitions and evaluation result files, including the rules a schema
 * cannot express: size, cross-references, score bounds and filename/content agreement.
 */
export async function validateEvals(
  contentRoot: string,
  errors: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  const modelIds = new Set((await list(join(contentRoot, 'models'), /\.mdx?$/)).map((file) => file.replace(/\.mdx?$/, '')));

  const benchmarks = new Map<string, BenchmarkData>();
  for (const file of await list(join(contentRoot, 'benchmarks'), /\.md$/)) {
    const rel = `benchmarks/${file}`;
    const raw = await readFile(join(contentRoot, 'benchmarks', file), 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) {
      errors.push(`${rel}: missing YAML frontmatter (the --- block at the top)`);
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
    benchmarks.set(file.replace(/\.md$/, ''), parsed.data);
  }

  for (const file of await list(join(contentRoot, 'evals'), /\.json$/)) {
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

    const expected = `${result.model}--${result.benchmark}--${result.run.submitter}--${result.run.date}.json`;
    if (file !== expected) {
      errors.push(`${rel}: filename must be "${expected}" (model--benchmark--submitter--date)`);
    }
    if (!isRealDate(result.run.date)) {
      errors.push(`${rel}: run.date ${result.run.date} is not a real date`);
    } else if (result.run.date > today) {
      errors.push(`${rel}: run.date ${result.run.date} is in the future`);
    }
    if (!modelIds.has(result.model)) {
      errors.push(`${rel}: model "${result.model}" has no card in models/. Add the model card first.`);
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
    if (benchmark.items > 0 && result.n > benchmark.items) {
      errors.push(`${rel}: n ${result.n} exceeds the benchmark's ${benchmark.items} items`);
    }
  }
}
