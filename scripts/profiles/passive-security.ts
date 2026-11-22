// scripts/profiles/passive-security.ts — usage: bun run profile:passive <https-url>
// Reads a public certificate, response headers and /.well-known/security.txt. No scanning or probing.
import { connect } from 'node:tls';
import { evaluatePassive, type PassiveObservation } from '../../packages/core/src/profile-checks.ts';

const url = process.argv[2];
if (!url?.startsWith('https://') || !URL.canParse(url)) { console.error('usage: bun run profile:passive <https-url>'); process.exit(2); }
const host = new URL(url).hostname;

const tls = await new Promise<PassiveObservation['tls']>((resolve) => {
  const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 }, () => {
    const cert = socket.getPeerCertificate();
    resolve({ authorized: socket.authorized, validTo: cert.valid_to ? new Date(cert.valid_to).toISOString() : '', subjectAltNames: (cert.subjectaltname ?? '').split(', ').filter(Boolean) });
    socket.end();
  });
  socket.on('error', () => resolve(null));
  socket.on('timeout', () => { socket.destroy(); resolve(null); });
});

let headers: Record<string, string> | null = null;
try {
  const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  headers = res.ok ? Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v])) : null;
} catch { headers = null; }

let securityTxt: boolean | null = null;
try {
  const res = await fetch(new URL('/.well-known/security.txt', url), { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  securityTxt = res.ok && /^contact:\s*\S/im.test(await res.text());
} catch { securityTxt = null; }

const observation: PassiveObservation = { url, tls, headers, securityTxt };
const observedAt = new Date().toISOString();
console.log(JSON.stringify({ observedAt, observation, outcomes: evaluatePassive(observation, new Date(observedAt)) }, null, 2));
