import { stripVTControlCharacters } from 'node:util';

export const CLI = 'bun apps/cli/src/index.ts';

export class UsageError extends Error {
  override name = 'UsageError';
}

export function isHelp(arg: string | undefined): boolean {
  return arg === '--help' || arg === '-h';
}

// TOON permits quote, backslash, newline, carriage return and tab escapes, not JSON's other
// control escapes. Strip terminal sequences and normalize unsupported controls before quoting.
function toonString(value: string): string {
  return JSON.stringify(stripVTControlCharacters(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\p{Cf}\p{Zl}\p{Zp}]/gu, ' '));
}

export function reportError(command: string, error: unknown, hint: string): void {
  console.log(`status: error
kind: ${error instanceof UsageError ? 'usage' : 'domain'}
command: ${toonString(command)}
message: ${toonString(error instanceof Error ? error.message : String(error))}
hint: ${toonString(hint)}`);
}
