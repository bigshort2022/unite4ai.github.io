// scripts/profiles/verify-evidence.ts — usage: bun run profile:verify <directory-id>
// Refetches every page evidence URL and confirms its quote is on the page. Network, on demand only.
// Certificate and DNS evidence is not page text: it is listed as MANUAL and re-confirmed with profile:passive.
import { readFileSync } from 'node:fs';
import { quotePresent } from '../../packages/core/src/profile-checks.ts';

const id = process.argv[2];
if (!id) { console.error('usage: bun run profile:verify <directory-id>'); process.exit(2); }
const profile = JSON.parse(readFileSync(`apps/web/src/content/exchange-profiles/${id}.json`, 'utf8'));
let failed = 0;
const manual: { id: string; kind: string; url: string }[] = [];
for (const e of profile.evidence) {
  if (e.kind === 'certificate' || e.kind === 'dns') { manual.push({ id: e.id, kind: e.kind, url: e.url }); continue; }
  let status: string;
  if (!URL.canParse(e.url) || new URL(e.url).protocol !== 'https:') {
    status = 'not an https URL (not fetched)';
  } else {
    try {
      const res = await fetch(e.url, { headers: { accept: 'text/markdown, text/html;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      status = !res.ok ? `http ${res.status}` : quotePresent(await res.text(), res.headers.get('content-type') ?? '', e.quote) ? 'ok' : 'quote missing';
    } catch (error) {
      status = `unreachable (${(error as Error).message})`;
    }
    await new Promise((r) => setTimeout(r, 500)); // be polite to public endpoints
  }
  if (status !== 'ok') failed++;
  console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${e.id} ${e.url} ${status === 'ok' ? '' : status}`);
}
if (manual.length) {
  console.log('Not refetched — re-confirm with bun run profile:passive <official-url>:');
  for (const m of manual) console.log(`MANUAL ${m.id} ${m.kind} ${m.url}`);
}
console.log(JSON.stringify({ id, evidence: profile.evidence.length, failed, manual: manual.length }));
process.exit(failed ? 1 : 0);
