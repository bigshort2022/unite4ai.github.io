import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bfclCalibrationSchema } from '@unite4ai/schema';

const REPORT = 'calibrations/bfcl-multiple-50-v1.json';

/** The report is required only when there is a result; it must refer to a registered baseline. */
export function bfclCalibrationProblems(raw: unknown, registered: ReadonlySet<string>, hasResults: boolean): string[] {
  if (raw === undefined) return hasResults ? ['required before publishing a BFCL v1 result'] : [];
  const parsed = bfclCalibrationSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  const { transcript_sha256, agreement, disagreement_notes = {} } = parsed.data;
  if (!registered.has(transcript_sha256)) return ['transcript_sha256 must match a registered BFCL v1 result'];
  const problems: string[] = [];
  for (const [index, agrees] of agreement.entries()) {
    if (!agrees && !Object.hasOwn(disagreement_notes, String(index))) {
      problems.push(`answer ${index}: document the scoring disagreement`);
    }
  }
  for (const position of Object.keys(disagreement_notes)) {
    const index = Number(position);
    if (String(index) !== position || agreement[index] !== false) problems.push(`answer ${position}: note does not name a disagreement`);
  }
  return problems;
}

export async function validateBfclCalibration(contentRoot: string, registered: ReadonlySet<string>, hasResults: boolean, errors: string[]): Promise<void> {
  const path = join(contentRoot, REPORT);
  let raw: unknown;
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 160 * 1024) throw new Error('expected a regular JSON file no larger than 160 KiB');
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      errors.push(`${REPORT}: ${(error as Error).message}`);
      return;
    }
  }
  for (const problem of bfclCalibrationProblems(raw, registered, hasResults)) errors.push(`${REPORT}: ${problem}`);
}
