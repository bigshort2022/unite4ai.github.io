import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { apiCostProblems, estimatedApiCost } from '@unite4ai/core/eval-cost';
import { repeatSummary } from '@unite4ai/core/repeat';
import { prepareApiRun } from '../src/eval/api.ts';
import { parseEvalArgs } from '../src/eval/args.ts';
import { streamChat } from '../src/eval/client.ts';

const BASE_URL = 'https://billing.example.test/v1';
const KEY = 'test-fixture-not-a-credential';
const DAY = '2026-11-10';
const APPROVAL = {
  benchmark: 'gsm8k-200', benchmark_version: '2', served_model: 'test/model', submitter: 'alice',
  base_url: BASE_URL, provider: 'test-provider', model_card: 'https://docs.example.test/models/test',
  terms_url: 'https://docs.example.test/terms', terms_checked_on: '2026-11-09', expected_usd: 0.03, approved_usd: 0.05,
};
const REQUIRED = [
  '--benchmark', 'gsm8k-200', '--model', 'model-a', '--served-model', 'test/model', '--submitter', 'alice',
  '--runtime', 'api', '--runtime-version', 'v1', '--format', 'other', '--quantization', 'undisclosed',
];

function files(t) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-api-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const approvalFile = join(root, 'private-approval.json');
  const snapshotFile = join(root, 'private-prices.json');
  return { root, approvalFile, snapshotFile };
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

test('paid CLI options require owner approval, an explicit endpoint and the dedicated env key', (t) => {
  const { root, approvalFile } = files(t);
  const env = { U4AI_EVAL_API_KEY: KEY, AGENT_MODEL_BASE_URL: BASE_URL };
  const approval = ['--api-approval', approvalFile];
  const endpoint = ['--base-url', BASE_URL];
  assert.throws(() => parseEvalArgs([...REQUIRED, ...endpoint], { root, env }), /--api-approval/);
  assert.throws(() => parseEvalArgs([...REQUIRED, ...approval], { root, env }), /--base-url/);
  assert.throws(() => parseEvalArgs([...REQUIRED, ...endpoint, ...approval], { root, env: { OPENAI_API_KEY: KEY } }), /U4AI_EVAL_API_KEY/);
  assert.throws(() => parseEvalArgs([...REQUIRED, ...endpoint, ...approval, '--price-date', DAY], { root, env }), /--price-snapshot.*--price-date.*--price-sha256/);
  const local = REQUIRED.map((arg) => arg === 'api' ? 'mlx-lm' : arg);
  assert.throws(() => parseEvalArgs([...local, ...approval], { root, env }), /--runtime api/);
  const localEnv = { get U4AI_EVAL_API_KEY() { assert.fail('local runs must not read the API key'); } };
  assert.equal(parseEvalArgs(local, { root, env: localEnv }).apiRequest, undefined);
  const secretUrl = 'https://owner:password@models.example.test/v1?access=secret#private';
  const localOptions = parseEvalArgs([...local, '--base-url', secretUrl], { root, env });
  assert.equal(localOptions.baseUrl, secretUrl);
  assert.match(localOptions.command, /--base-url https:\/\/models.example.test\/v1$/);
});

test('the owner approval binds the exact HTTPS endpoint and benchmark configuration', (t) => {
  const { root, approvalFile } = files(t);
  const load = (approval, endpoint = BASE_URL) => {
    writeFileSync(approvalFile, JSON.stringify(approval));
    const options = parseEvalArgs([...REQUIRED, '--base-url', endpoint, '--api-approval', approvalFile], {
      root, env: { U4AI_EVAL_API_KEY: KEY },
    });
    return prepareApiRun(options, '2', DAY);
  };
  assert.equal(load(APPROVAL).metadata.provider, APPROVAL.provider);
  for (const [change, error] of [
    [{ benchmark: 'other' }, /benchmark/], [{ benchmark_version: '1' }, /benchmark_version/],
    [{ served_model: 'test/other' }, /served_model/], [{ submitter: 'bob' }, /submitter/],
    [{ base_url: `${BASE_URL}/other` }, /base_url/], [{ base_url: `${BASE_URL}/` }, /base_url/],
    [{ terms_url: undefined }, /terms_url/], [{ terms_url: 'http://docs.example.test/terms' }, /terms_url/],
    [{ terms_checked_on: '2026-11-11' }, /terms_checked_on/], [{ terms_checked_on: '2026-02-30' }, /terms_checked_on/],
    [{ provider: undefined }, /provider/], [{ provider: '   ' }, /provider/], [{ expected_usd: -1 }, /expected_usd/],
    [{ expected_usd: 0.06 }, /expected_usd/], [{ approved_usd: 0 }, /approved_usd/],
    [{ approved_usd: undefined }, /approved_usd/], [{ unexpected: true }, /unknown/],
  ]) {
    assert.throws(() => load({ ...APPROVAL, ...change }), error);
  }
  for (const endpoint of [
    BASE_URL.replace('https:', 'http:'), BASE_URL.replace('https://', 'https://owner@'),
    BASE_URL.replace('https://', 'https://@'), `${BASE_URL}?access=secret`, `${BASE_URL}#secret`, `${BASE_URL}?`, `${BASE_URL}#`,
  ]) {
    assert.throws(() => load({ ...APPROVAL, base_url: endpoint }, endpoint), /HTTPS/);
  }
  const keyInPath = `${BASE_URL}/${KEY.replace('-', '%2D')}`;
  for (const [approval, endpoint] of [
    [{ ...APPROVAL, key: KEY }, BASE_URL],
    [{ ...APPROVAL, terms_url: `https://docs.example.test/terms/${KEY}` }, BASE_URL],
    [{ ...APPROVAL, base_url: keyInPath }, keyInPath],
  ]) {
    assert.throws(() => load(approval, endpoint), (error) => {
      assert.match(error.message, /API key/);
      assert.doesNotMatch(error.message, /test-fixture|%2Dfixture/);
      return true;
    });
  }
});

test('pin a local catalog by bytes and take only the approved provider and exact served model rates', (t) => {
  const { root, approvalFile, snapshotFile } = files(t);
  writeFileSync(approvalFile, JSON.stringify(APPROVAL));
  const catalog = JSON.stringify({ [APPROVAL.provider]: { models: {
    'model-a': { cost: { input: 500, output: 500 } },
    [APPROVAL.served_model]: { cost: { input: 2, output: 4 } },
  } } });
  const load = (bytes, sha = sha256(bytes), date = DAY) => {
    writeFileSync(snapshotFile, bytes);
    const options = parseEvalArgs([
      ...REQUIRED, '--base-url', BASE_URL, '--api-approval', approvalFile,
      '--price-snapshot', snapshotFile, '--price-date', date, '--price-sha256', sha,
    ], { root, env: { U4AI_EVAL_API_KEY: KEY } });
    assert.doesNotMatch(options.command, /test-fixture-not-a-credential|private-approval|private-prices/);
    return prepareApiRun(options, '2', DAY);
  };
  assert.deepEqual(load(catalog).prices, {
    snapshot_date: DAY, snapshot_sha256: sha256(catalog), input_usd_per_million: 2, output_usd_per_million: 4,
  });
  assert.throws(() => load(catalog, '0'.repeat(64)), /price snapshot.*hash mismatch/i);
  assert.throws(() => load(catalog, sha256(catalog), '2026-11-11'), /price-date/);
  assert.equal(load('{"other-provider":{"models":{"test/model":{"cost":{"input":1,"output":2}}}}}').prices, undefined);
  assert.equal(load('{"test-provider":{"models":{"test/model":{"cost":{"input":1}}}}}').prices, undefined);
});

test('authenticated streaming rejects redirects and does not expose HTTP bodies, event errors or invalid payloads', async () => {
  const request = {
    api: { completionUrl: `${BASE_URL}/chat/completions`, servedModel: APPROVAL.served_model, key: KEY },
    messages: [{ role: 'user', content: 'Fixture prompt' }], maxTokens: 16, timeoutMs: 1000,
  };
  const realFetch = globalThis.fetch;
  try {
    for (const [reply, expected] of [
      [new Response(`HTTP detail ${KEY}`, { status: 401 }), /401/],
      [new Response(`data: ${JSON.stringify({ error: { message: `event detail ${KEY}` } })}\n\n`), /error event/],
      [new Response(`data: invalid detail ${KEY}\n\n`), /authenticated request failed/],
      [new Error(`redirect detail ${KEY}`), /authenticated request failed/],
    ]) {
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        if (reply instanceof Error) throw reply;
        return reply;
      };
      await assert.rejects(streamChat(request), (error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /detail|test-fixture-not-a-credential/);
        return true;
      });
      assert.equal(calls.length, 1);
      const [{ url, init }] = calls;
      assert.equal(url, request.api.completionUrl);
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${KEY}`);
      assert.equal(JSON.parse(init.body).model, APPROVAL.served_model);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('paid streaming finishes at [DONE] even when the socket stays open', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(
        'data: {"choices":[{"delta":{"content":"42"},"finish_reason":"stop"}]}\n\n'
        + 'data: {"usage":{"prompt_tokens":8,"completion_tokens":1}}\n\n'
        + 'data: [DONE]\n\n',
      ));
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
    },
  }));
  try {
    const { text, promptTokens, completionTokens } = await streamChat({
      api: { completionUrl: `${BASE_URL}/chat/completions`, servedModel: APPROVAL.served_model, key: KEY },
      messages: [{ role: 'user', content: 'Fixture prompt' }], maxTokens: 16, timeoutMs: 100,
    });
    assert.deepEqual({ text, promptTokens, completionTokens }, { text: '42', promptTokens: 8, completionTokens: 1 });
  } finally {
    globalThis.fetch = realFetch;
  }
});

const counts = { item_pass_histogram: [1, 1, 1], run_correct: [2, 1], seconds_total: 1 };
const repeat = repeatSummary({ runs: 2, temperature: 0.7, top_p: 1 }, {
  ...counts, prompt_tokens_total: 500, completion_tokens_total: 100,
});
const prices = { snapshot_date: DAY, snapshot_sha256: '0'.repeat(64), input_usd_per_million: 2, output_usd_per_million: 4 };
const { provider, terms_url, terms_checked_on, expected_usd, approved_usd } = APPROVAL;
const result = {
  setup: { runtime: 'api', served_model: APPROVAL.served_model, format: 'other', quantization: 'undisclosed' },
  run: { date: DAY },
  api: { provider, terms_url, terms_checked_on, expected_usd, approved_usd }, repeat,
};

test('paid evidence requires a nonblank served model and leaves provider weights undisclosed', () => {
  assert.match(apiCostProblems({ ...result, setup: { ...result.setup, served_model: '   ' } }).join(), /served_model/);
  assert.match(apiCostProblems({ ...result, setup: { ...result.setup, format: 'mlx' } }).join(), /format.*other/);
  assert.match(apiCostProblems({ ...result, setup: { ...result.setup, quantization: '4bit' } }).join(), /quantization.*undisclosed/);
});

test('list-price estimates count all usage and divide by successful attempts, not pass-k', () => {
  const cost = estimatedApiCost(repeat, prices);
  assert.deepEqual(cost, { kind: 'models-dev', ...prices, total_usd: 0.0014, usd_per_success: 0.0014 / 3 });
  assert.deepEqual(apiCostProblems({ ...result, cost }), []);
  assert.match(apiCostProblems({ ...result, cost: { ...cost, total_usd: 0.01 } }).join(), /total_usd/);
  assert.match(apiCostProblems({ ...result, cost: { ...cost, usd_per_success: 0.0014 } }).join(), /usd_per_success/);
  assert.equal(estimatedApiCost({ ...repeat, prompt_tokens_total: undefined }, prices), undefined);
  assert.equal(estimatedApiCost({ ...repeat, completion_tokens_total: undefined }, prices), undefined);
  assert.match(apiCostProblems({ ...result, cost, repeat: { ...repeat, completion_tokens_total: undefined } }).join(), /usage|token/);
});

test('an attributable invoice needs no token counts; money and API metadata are not local evidence', () => {
  const invoice = { kind: 'invoice', invoice_sha256: 'a'.repeat(64), total_usd: 0.06, usd_per_success: 0.06 / 3 };
  const { prompt_tokens_total, completion_tokens_total, ...withoutUsage } = repeat;
  assert.deepEqual(apiCostProblems({ ...result, repeat: withoutUsage, cost: invoice }), []);
  assert.match(apiCostProblems({ ...result, repeat: withoutUsage, cost: { ...invoice, usd_per_success: undefined } }).join(), /usd_per_success/);
  const zero = { ...repeat, run_correct: [0, 0] };
  assert.equal(estimatedApiCost(zero, prices).usd_per_success, undefined);
  assert.deepEqual(apiCostProblems({ ...result, repeat: zero, cost: { ...invoice, usd_per_success: undefined } }), []);
  assert.match(apiCostProblems({ ...result, repeat: zero, cost: { ...invoice, usd_per_success: 0 } }).join(), /usd_per_success/);
  assert.match(apiCostProblems({ ...result, setup: { runtime: 'mlx-lm' }, cost: invoice }).join(), /api.*cost/);
  assert.match(apiCostProblems({ ...result, api: undefined, repeat: undefined, setup: { runtime: 'api' } }).join(), /api.*repeat.*served_model/);
  assert.match(apiCostProblems({ ...result, api: { ...result.api, terms_checked_on: '2026-11-11' } }).join(), /terms_checked_on/);
  assert.match(apiCostProblems({ ...result, cost: { ...estimatedApiCost(repeat, prices), snapshot_date: '2026-11-11' } }).join(), /snapshot_date/);
});
