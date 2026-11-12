#!/usr/bin/env node
/**
 * Probe the local model endpoint. `/models` on mlx-lm is cached metadata, so readiness is
 * proven only by a real (tiny) completion. Never starts a server.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const envFile = join(ROOT, '.env.agent');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const base = (process.env.AGENT_MODEL_BASE_URL || 'http://127.0.0.1:18082/v1').replace(/\/$/, '');
const timeoutMs = Number(process.env.AGENT_MODEL_TIMEOUT || 120) * 1000;

function fail(status, detail) {
  console.log(JSON.stringify({ status, base_url: base, detail }));
  process.exit(1);
}

let model = process.env.AGENT_MODEL || '';
try {
  const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) fail('unreachable', `GET /models → ${res.status}`);
  const body = await res.json();
  if (!model) model = body.data?.[0]?.id ?? '';
} catch (error) {
  fail('unreachable', error.cause?.message || error.message);
}
if (!model) fail('no_model', 'server lists no models; set AGENT_MODEL in .env.agent');

const t0 = Date.now();
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 8, temperature: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) fail('not_ready', `POST /chat/completions → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const reply = body.choices?.[0]?.message?.content?.trim() ?? '';
  console.log(JSON.stringify({ status: 'ready', base_url: base, model, reply, latency_s: (Date.now() - t0) / 1000 }));
} catch (error) {
  fail('not_ready', error.cause?.message || error.message);
}
