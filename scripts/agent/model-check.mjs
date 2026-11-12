#!/usr/bin/env node
/**
 * Probe the local model endpoint. `/models` on mlx-lm is cached metadata, so readiness is
 * proven only by a real (tiny) completion. Never starts a server, and never guesses a model:
 * posting an id the server has not loaded makes mlx-lm/Ollama swap to it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const envFile = join(ROOT, '.env.agent');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    const quoted = m[2].match(/^(["'])(.*?)\1/);
    process.env[m[1]] = quoted ? quoted[2] : m[2].replace(/(?:^|\s)#.*$/, '').trim();
  }
}

const base = (process.env.AGENT_MODEL_BASE_URL || 'http://127.0.0.1:18082/v1').replace(/\/$/, '');

function fail(status, detail) {
  console.log(JSON.stringify({ status, base_url: base, detail }));
  process.exit(1);
}

const timeoutS = Number(process.env.AGENT_MODEL_TIMEOUT || 120);
if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
  fail('not_ready', `AGENT_MODEL_TIMEOUT must be a positive number of seconds, got ${JSON.stringify(process.env.AGENT_MODEL_TIMEOUT)}`);
}

let model = process.env.AGENT_MODEL || '';
let ids = [];
try {
  const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) fail('unreachable', `GET /models → ${res.status}`);
  const body = await res.json();
  ids = (Array.isArray(body?.data) ? body.data : []).map((m) => m?.id).filter(Boolean);
} catch (error) {
  fail('unreachable', error.cause?.message || error.message);
}
if (!model) {
  if (ids.length > 1) fail('no_model', `server lists ${ids.length} models (${ids.join(', ')}); set AGENT_MODEL in .env.agent`);
  if (ids.length === 0) fail('no_model', 'server lists no models; set AGENT_MODEL in .env.agent');
  model = ids[0];
} else if (ids.length > 0 && !ids.includes(model)) {
  fail('no_model', `AGENT_MODEL "${model}" is not listed by the server (${ids.join(', ')}); posting it would make the server load it`);
}

const t0 = Date.now();
try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 8, temperature: 0 }),
    signal: AbortSignal.timeout(Math.round(timeoutS * 1000)),
  });
  if (!res.ok) fail('not_ready', `POST /chat/completions → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const reply = body.choices?.[0]?.message?.content?.trim() ?? '';
  console.log(JSON.stringify({ status: 'ready', base_url: base, model, reply, latency_s: (Date.now() - t0) / 1000 }));
} catch (error) {
  if (error.name === 'TimeoutError') fail('not_ready', `no completion within ${timeoutS}s (server busy, loading, or weights paged out)`);
  fail('not_ready', error.cause?.message || error.message);
}
