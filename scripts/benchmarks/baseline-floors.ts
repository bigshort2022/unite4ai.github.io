import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ANSWERS, parseItems as parseBfcl } from '../../apps/cli/src/eval/bfcl.ts';
import { parseItems as parseToolSelection } from '../../apps/cli/src/eval/tool-selection.ts';

const ROOT = new URL('../../', import.meta.url);
const BFCL_FIXTURES = 'apps/cli/test/fixtures/bfcl/';

function pinnedText(path: string, sha256: string): string {
  const bytes = readFileSync(new URL(path, ROOT));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) throw new Error(`${path}: SHA-256 mismatch (expected ${sha256}, got ${actual})`);
  return bytes.toString('utf8');
}

function summarize<T>(items: T[], optionCount: (item: T) => number, firstIsGold: (item: T) => boolean) {
  let pass1 = 0;
  let pass5 = 0;
  let firstCorrect = 0;
  for (const item of items) {
    const p = 1 / optionCount(item);
    pass1 += p;
    pass5 += p ** 5;
    if (firstIsGold(item)) firstCorrect += 1;
  }
  return {
    items: items.length,
    randomPass1Pct: 100 * pass1 / items.length,
    randomPass5Pct: 100 * pass5 / items.length,
    // The same first tool wins or loses on all five runs, so both rates are this fraction.
    firstCorrect,
  };
}

/** Tool-name choices only: a correct choice is given gold arguments, without running a model. */
export function baselineFloors() {
  const toolSelection = parseToolSelection(pinnedText(
    'apps/web/public/data/benchmarks/tool-selection-v1.jsonl',
    '95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db',
  ), 100);
  const bfcl = parseBfcl(
    pinnedText(`${BFCL_FIXTURES}BFCL_v4_multiple.json`, 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a'),
    pinnedText(`${BFCL_FIXTURES}BFCL_v4_multiple_possible_answer.json`, ANSWERS.sha256),
    50,
  );
  return {
    // Abstention is an option on every synthetic item, but the first-listed strategy never abstains.
    'tool-selection-v1': summarize(toolSelection, (item) => item.tools.length + 1,
      (item) => item.tools[0].name === item.expected.tool),
    'bfcl-multiple-50': summarize(bfcl, (item) => item.functions.length,
      (item) => item.functions[0].name === item.answer.name),
  };
}

if (import.meta.main) console.log(JSON.stringify(baselineFloors(), null, 2));
