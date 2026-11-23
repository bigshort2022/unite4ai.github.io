import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isEvalDate, type SnapshotPrices } from '@unite4ai/core/eval-cost';
import { evalApiSchema, type EvalResult } from '@unite4ai/schema';

export interface ApiRequestOptions {
  approvalFile: string;
  key: string;
  priceSnapshot?: { file: string; date: string; sha256: string };
}

/** The endpoint and model sent with this key come from the same checked approval. */
export interface ApprovedApiEndpoint {
  completionUrl: string;
  servedModel: string;
  key: string;
}

function readBytes(file: string, label: string): Uint8Array {
  try {
    return readFileSync(file);
  } catch {
    throw new Error(`could not read the ${label} file`);
  }
}

function parseObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`the ${label} file must contain valid JSON`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error(`the ${label} file must contain a JSON object`);
  return data as Record<string, unknown>;
}

/** The key is ASCII. Decode URL escapes even when the rest of a value isn't valid percent encoding. */
export function containsApiKey(value: unknown, key: string): boolean {
  if (typeof value !== 'string' || key.length === 0) return false;
  if (value.includes(key)) return true;
  return value.includes('%')
    && value.replace(/%([a-f\d]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))).includes(key);
}

/** Unlike URL.username/search/hash, this also rejects empty userinfo, queries and fragments. */
function cleanEndpoint(value: string): boolean {
  const authority = /^https:\/\/([^/]+)(?:\/|$)/.exec(value)?.[1];
  if (authority === undefined || authority.includes('@') || /[?#\\\s\p{Cc}\p{Cf}]/u.test(value)) return false;
  const url = URL.parse(value);
  return url !== null && (url.href === value || url.href === `${value}/`);
}

function own(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null || !Object.hasOwn(record, key)) return undefined;
  return (record as Record<string, unknown>)[key];
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function loadPrices(
  snapshot: NonNullable<ApiRequestOptions['priceSnapshot']>, today: string, provider: string, model: string,
): SnapshotPrices | undefined {
  if (!isEvalDate(snapshot.date) || snapshot.date > today) throw new Error('--price-date must be a calendar date no later than today (UTC)');
  if (!/^[a-f0-9]{64}$/.test(snapshot.sha256)) throw new Error('--price-sha256 must be a lowercase hex SHA-256');
  const bytes = readBytes(snapshot.file, 'price snapshot');
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) throw new Error('price snapshot hash mismatch');
  const catalog = parseObject(bytes, 'price snapshot');
  const cost = own(own(own(own(catalog, provider), 'models'), model), 'cost');
  const input = own(cost, 'input');
  const output = own(cost, 'output');
  if (!isPrice(input) || !isPrice(output)) return undefined;
  return {
    snapshot_date: snapshot.date,
    snapshot_sha256: snapshot.sha256,
    input_usd_per_million: input,
    output_usd_per_million: output,
  };
}

export function prepareApiRun(
  options: { benchmark: string; servedModel: string; submitter: string; baseUrl: string; apiRequest?: ApiRequestOptions },
  version: string,
  today: string,
): { endpoint: ApprovedApiEndpoint; metadata: NonNullable<EvalResult['api']>; prices?: SnapshotPrices } {
  const request = options.apiRequest;
  if (!request?.approvalFile) throw new Error('--runtime api requires --api-approval');
  if (!request.key || /[^\x21-\x7e]/.test(request.key)) throw new Error('--runtime api requires a valid U4AI_EVAL_API_KEY from the environment');
  const approval = parseObject(readBytes(request.approvalFile, 'API approval'), 'API approval');
  if ([options.baseUrl, options.servedModel, options.benchmark, options.submitter, ...Object.values(approval)]
    .some((value) => containsApiKey(value, request.key))) {
    throw new Error('the API key must not appear in API approval or endpoint details');
  }
  if (!cleanEndpoint(options.baseUrl)) throw new Error('API --base-url must be an exact HTTPS URL without credentials, a query, or a fragment');
  if (!isEvalDate(today)) throw new Error('the API run date must be a UTC calendar date');

  const {
    benchmark, benchmark_version, served_model, submitter, base_url, ...publicFields
  } = approval;
  for (const [field, approved, actual] of [
    ['benchmark', benchmark, options.benchmark],
    ['benchmark_version', benchmark_version, version],
    ['served_model', served_model, options.servedModel],
    ['submitter', submitter, options.submitter],
    ['base_url', base_url, options.baseUrl],
  ]) {
    if (approved !== actual) throw new Error(`API approval ${field} does not match this run`);
  }
  const parsed = evalApiSchema.safeParse(publicFields);
  if (!parsed.success) {
    // Unknown field names and validation inputs are not public; an approval may contain mistakes.
    const problems = parsed.error.issues.map((issue) => issue.code === 'unrecognized_keys'
      ? 'unknown field' : `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`invalid API approval: ${problems.join('; ')}`);
  }
  const metadata = parsed.data;
  if (metadata.terms_checked_on > today) throw new Error('API approval terms_checked_on must not be after today (UTC)');
  if (request.priceSnapshot !== undefined && [request.priceSnapshot.date, request.priceSnapshot.sha256]
    .some((value) => containsApiKey(value, request.key))) {
    throw new Error('the API key must not appear in pricing evidence');
  }
  const prices = request.priceSnapshot === undefined ? undefined
    : loadPrices(request.priceSnapshot, today, metadata.provider, options.servedModel);
  return {
    endpoint: {
      completionUrl: `${options.baseUrl.replace(/\/$/, '')}/chat/completions`,
      servedModel: options.servedModel,
      key: request.key,
    },
    metadata,
    ...(prices === undefined ? {} : { prices }),
  };
}
