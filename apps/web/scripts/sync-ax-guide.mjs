import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { AX_RULES } from '../src/lib/ax-task.mjs';

const file = new URL('../../../docs/exchange/agent-guide.md', import.meta.url);
const begin = '<!-- ax-rules:start -->';
const end = '<!-- ax-rules:end -->';

export async function syncAxGuide({ check = true } = {}) {
  const guide = await readFile(file, 'utf8');
  const start = guide.indexOf(begin), stop = guide.indexOf(end);
  if (start === -1 || stop <= start || guide.lastIndexOf(begin) !== start || guide.lastIndexOf(end) !== stop) {
    throw new Error('Agent guide must contain exactly one AX rules block');
  }
  const block = `${begin}\n${AX_RULES.map((rule) => `- ${rule}`).join('\n')}\n${end}`;
  if (guide.slice(start, stop + end.length) === block) return;
  if (check) throw new Error('Agent guide AX rules drifted; run node apps/web/scripts/sync-ax-guide.mjs --write');
  await writeFile(file, guide.slice(0, start) + block + guide.slice(stop + end.length));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 3 || (process.argv[2] && !['--write', '--check'].includes(process.argv[2]))) {
    throw new Error('Usage: node apps/web/scripts/sync-ax-guide.mjs [--write|--check]');
  }
  await syncAxGuide({ check: process.argv[2] !== '--write' });
}
