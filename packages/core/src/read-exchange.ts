import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONTENT_ID, EXCHANGE_RECORD_MAX_BYTES, hypothesisSchema, findingSchema, reviewSchema } from '@unite4ai/schema';
import type { ExchangeRecords } from './exchange.ts';

/** The gate and the build parse frontmatter with this one YAML 1.2 parser, so timestamps stay text and fail the date rule. */
export async function readExchangeRecords(root: string): Promise<{ records: ExchangeRecords; errors: string[] }> {
  const records: ExchangeRecords = { hypotheses: [], findings: [], reviews: [] };
  const errors: string[] = [];
  for (const kind of ['hypotheses', 'findings', 'reviews'] as const) {
    const directory = join(root, kind);
    try {
      if (!(await lstat(directory)).isDirectory()) {
        errors.push(`${kind}: must be a real flat directory, not a link`);
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`${kind}: cannot read directory`);
      continue;
    }
    const extension = kind === 'hypotheses' ? '.md' : '.json';
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = `${kind}/${entry.name}`;
      if (entry.isFile() && ['.gitkeep', '.DS_Store'].includes(entry.name)) continue;
      if (!entry.isFile() || !entry.name.endsWith(extension)) {
        errors.push(`${file}: only ${extension} files are allowed; subfolders and links are not read`);
        continue;
      }
      const id = entry.name.slice(0, -extension.length);
      if (kind !== 'reviews' && !CONTENT_ID.test(id)) {
        errors.push(`${file}: filename must be a lowercase id`);
        continue;
      }
      const path = join(directory, entry.name);
      if ((await lstat(path)).size > EXCHANGE_RECORD_MAX_BYTES) {
        errors.push(`${file}: exceeds the ${EXCHANGE_RECORD_MAX_BYTES}-byte record limit`);
        continue;
      }
      let data: unknown;
      let sha256: string;
      try {
        const bytes = await readFile(path);
        sha256 = createHash('sha256').update(bytes).digest('hex');
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (kind === 'hypotheses') {
          const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
          if (!match || /^\+\+\+/m.test(match[1])) {
            errors.push(`${file}: requires YAML frontmatter delimited by ---`);
            continue;
          }
          if (match[2].trim() !== '') {
            errors.push(`${file}: Markdown body must be empty; use bounded frontmatter text`);
            continue;
          }
          data = parseYaml(match[1]);
        } else data = JSON.parse(raw);
      } catch (error) {
        errors.push(`${file}: cannot parse record (${(error as Error).message})`);
        continue;
      }
      // Keep the collection/data type correlation explicit, without casting unvalidated records.
      if (kind === 'hypotheses') {
        const parsed = hypothesisSchema.safeParse(data);
        if (parsed.success) records.hypotheses.push({ id, data: parsed.data, sha256 });
        else errors.push(`${file}: ${parsed.error.message}`);
      } else if (kind === 'findings') {
        const parsed = findingSchema.safeParse(data);
        if (parsed.success) records.findings.push({ id, data: parsed.data, sha256 });
        else errors.push(`${file}: ${parsed.error.message}`);
      } else {
        const parsed = reviewSchema.safeParse(data);
        if (parsed.success) records.reviews.push({ id, data: parsed.data, sha256 });
        else errors.push(`${file}: ${parsed.error.message}`);
      }
    }
  }
  return { records, errors };
}
