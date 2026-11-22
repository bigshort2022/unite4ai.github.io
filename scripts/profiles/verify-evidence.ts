// scripts/profiles/verify-evidence.ts — usage: bun run profile:verify <directory-id>
// Refetches every evidence URL and confirms its quote is on the page. Network, on demand only.
import { readFileSync } from 'node:fs';
import { quotePresent } from '../../packages/core/src/profile-checks.ts';

const id = process.argv[2];
if (!id) { console.error('usage: bun run profile:verify <directory-id>'); process.exit(2); }
const profile = JSON.parse(readFileSync(`apps/web/src/content/exchange-profiles/${id}.json`, 'utf8'));
let failed = 0;
for (const e of profile.evidence) {
  let status: string;
  try {
    const res = await fetch(e.url, { headers: { accept: 'text/markdown, text/html;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    status = !res.ok ? `http ${res.status}` : quotePresent(await res.text(), res.headers.get('content-type') ?? '', e.quote) ? 'ok' : 'quote missing';
  } catch (error) {
    status = `unreachable (${(error as Error).message})`;
  }
  if (status !== 'ok') failed++;
  console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${e.id} ${e.url} ${status === 'ok' ? '' : status}`);
  await new Promise((r) => setTimeout(r, 500)); // be polite to public endpoints
}
console.log(JSON.stringify({ id, evidence: profile.evidence.length, failed }));
process.exit(failed ? 1 : 0);
