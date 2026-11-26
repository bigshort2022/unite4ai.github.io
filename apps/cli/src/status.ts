import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CLI } from './terminal.ts';

const CONTENT_DIR = 'apps/web/src/content';
const collections = [
  ['models', /\.mdx?$/],
  ['datasets', /\.mdx?$/],
  ['benchmarks', /\.md$/],
  ['evals', /\.json$/],
  ['hypotheses', /\.md$/],
  ['findings', /\.json$/],
  ['reviews', /\.json$/],
] as const;

export async function localStatus(repoRoot: string): Promise<string> {
  const content = join(repoRoot, CONTENT_DIR);
  if (!(await lstat(content)).isDirectory()) throw new Error(`${CONTENT_DIR} must be a real directory`);
  const rows = await Promise.all(collections.map(async ([name, extension]) => {
    const directory = join(content, name);
    try {
      if (!(await lstat(directory)).isDirectory()) throw new Error(`${CONTENT_DIR}/${name} must be a real directory`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return `  ${name},null,missing`;
      throw error;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    const count = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.') && extension.test(entry.name)).length;
    return `  ${name},${count},${count === 0 ? 'empty' : 'present'}`;
  }));

  return `content_dir: ${CONTENT_DIR}
collections[${rows.length}]{name,count,state}:
${rows.join('\n')}
help[3]{command,purpose}:
  ${CLI} validate,check local content
  ${CLI} exchange review --help,inspect review flags
  ${CLI} eval --help,inspect runner flags without running a model`;
}
