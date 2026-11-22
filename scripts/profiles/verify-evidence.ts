// scripts/profiles/verify-evidence.ts — usage: bun run profile:verify <directory-id>
// Refetches every page evidence URL and confirms its quote is on the page. Network, on demand only.
// Certificate evidence is not page text: it is listed as MANUAL and re-confirmed with profile:passive.
import { readFileSync } from 'node:fs';
import { quotePresent } from '../../packages/core/src/profile-checks.ts';

const id = process.argv[2];
if (!id) { console.error('usage: bun run profile:verify <directory-id>'); process.exit(2); }
const profile = JSON.parse(readFileSync(`apps/web/src/content/exchange-profiles/${id}.json`, 'utf8'));
// Some publishers (e.g. SEC EDGAR) refuse requests without a declared User-Agent.
const userAgent = 'unite4ai-profile-verifier/1 (+https://github.com/bigshort2022/unite4ai.github.io)';
// One fetch per URL and Accept variant per run, so pages cited many times are requested once.
const pages = new Map<string, Promise<{ status: number; body: string; type: string }>>();
function page(url: string, accept: string) {
  const key = `${accept} ${url}`;
  if (!pages.has(key)) {
    pages.set(key, (async () => {
      const res = await fetch(url, { headers: { accept, 'user-agent': userAgent }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      const result = { status: res.status, body: res.ok ? await res.text() : '', type: res.headers.get('content-type') ?? '' };
      await Bun.sleep(500); // be polite to public endpoints
      return result;
    })());
  }
  return pages.get(key)!;
}
let failed = 0;
const manual: { id: string; url: string }[] = [];
for (const e of profile.evidence) {
  if (e.kind === 'certificate') { manual.push({ id: e.id, url: e.url }); continue; }
  let status: string;
  if (!URL.canParse(e.url) || new URL(e.url).protocol !== 'https:') {
    status = 'not an https URL (not fetched)';
  } else {
    try {
      // Prefer Markdown, but sites that serve a reduced Markdown copy (no footer, no legal text) get a second, HTML-only look.
      let res = await page(e.url, 'text/markdown, text/html;q=0.9');
      let found = res.status < 300 && quotePresent(res.body, res.type, e.quote);
      if (!found) {
        res = await page(e.url, 'text/html');
        found = res.status < 300 && quotePresent(res.body, res.type, e.quote);
      }
      status = found ? 'ok' : res.status >= 300 ? `http ${res.status}` : 'quote missing';
    } catch (error) {
      status = `unreachable (${(error as Error).message})`;
    }
  }
  if (status !== 'ok') failed++;
  console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${e.id} ${e.url} ${status === 'ok' ? '' : status}`);
}
if (manual.length) {
  console.log('Not refetched — re-confirm with bun run profile:passive <official-url>:');
  for (const m of manual) console.log(`MANUAL ${m.id} certificate ${m.url}`);
}
console.log(JSON.stringify({ id, evidence: profile.evidence.length, failed, manual: manual.length }));
process.exit(failed ? 1 : 0);
