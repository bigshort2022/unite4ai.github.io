import { median } from '@unite4ai/core/evals';

export const REQUEST_BUDGET = 40;
export const TIMEOUT_MS = 30_000;
export const WINDOW_DAYS = 30;
export const CACHE_TTL_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const PAGE_SIZE = 100;
const RECORD_PATH = /^apps\/web\/src\/content\/(hypotheses\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|(?:findings|reviews|evals)\/[a-z0-9][a-z0-9-]*\.json)$/;
const FILE_STATUSES: Record<string, true> = { added: true, modified: true, removed: true, renamed: true, copied: true, changed: true, unchanged: true };
interface Pull { number: number; state: string; base: { ref: string }; created_at: string; updated_at: string; merged_at: string | null }
interface FileChange { filename: string; status: string }
export interface LatencyMetric { value: number | null; inspected: number; matched: number; error: string | null }
export interface LatencyObservation { measuredAt: number; windowDays: number; waiting: LatencyMetric; median: LatencyMetric; requests: number }
export type LatencyStorage = Pick<Storage, 'getItem' | 'setItem'>;

const time = (value: unknown) => typeof value === 'string' ? Date.parse(value) : Number.NaN;

/**
 * Waiting: every currently open PR. Median: PRs merged in the WINDOW_DAYS before measurement, enumerated
 * most recently updated first until a page ends before the window (merged_at never follows updated_at).
 * Complete populations only. A budget/transport failure never publishes a partial total.
 */
export async function collectExchangeLatency(repository: string, fetcher: typeof fetch = fetch,
  options: { requestBudget?: number; timeoutMs?: number; now?: number } = {}): Promise<LatencyObservation> {
  const measuredAt = options.now ?? Date.now();
  const windowStart = measuredAt - WINDOW_DAYS * DAY_MS;
  let requests = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  const requestBudget = options.requestBudget ?? REQUEST_BUDGET;
  async function list(path: string, query = '', complete: (page: unknown[]) => boolean = () => false): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let page = 1; ; page++) {
      if (controller.signal.aborted) throw new Error('GitHub collection timed out; population incomplete.');
      if (requests >= requestBudget) throw new Error('Request budget reached; population incomplete.');
      requests++;
      const response = await fetcher(`https://api.github.com/repos/${repository}/${path}?${query}per_page=${PAGE_SIZE}&page=${page}`, {
        signal: controller.signal, headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit',
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}; population unavailable (possibly rate limited).`);
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length > PAGE_SIZE) throw new Error('Invalid GitHub list metadata.');
      rows.push(...data);
      if (data.length < PAGE_SIZE || complete(data)) return rows;
    }
  }
  async function collect(state: 'open' | 'closed'): Promise<LatencyMetric> {
    let inspected = 0;
    let matched = 0;
    try {
      const pulls = (state === 'open'
        ? await list('pulls', 'state=open&base=main&sort=created&direction=asc&')
        : await list('pulls', 'state=closed&base=main&sort=updated&direction=desc&',
          (page) => time((page.at(-1) as Pull | undefined)?.updated_at) < windowStart)) as Pull[];
      const numbers = new Set<number>();
      let previous = Number.POSITIVE_INFINITY;
      for (const pull of pulls) {
        const created = time(pull?.created_at);
        const updated = time(pull?.updated_at);
        const merged = pull?.merged_at === null ? null : time(pull?.merged_at);
        if (!pull || !Number.isSafeInteger(pull.number) || pull.number < 1 || numbers.has(pull.number)
          || pull.state !== state || pull.base?.ref !== 'main' || !Number.isFinite(created) || !(updated >= created)
          || (merged !== null && (state === 'open' || !(merged >= created) || !(merged <= updated)))
          || (state === 'closed' && updated > previous)) {
          throw new Error('Invalid or changing GitHub PR metadata; population incomplete.');
        }
        numbers.add(pull.number);
        previous = updated;
      }
      const population = state === 'open' ? pulls : pulls.filter((pull) => pull.merged_at !== null && time(pull.merged_at) >= windowStart);
      const durations: number[] = [];
      for (const pull of population) {
        const changes = await list(`pulls/${pull.number}/files`) as FileChange[];
        const paths = new Set<string>();
        for (const file of changes) {
          if (!file || typeof file.filename !== 'string' || !Object.hasOwn(FILE_STATUSES, file.status) || paths.has(file.filename)) {
            throw new Error('Invalid or changing GitHub file metadata; population incomplete.');
          }
          paths.add(file.filename);
        }
        inspected++;
        // File-shape definition from the publication gate; not a claim of gate success or eligibility.
        if (changes.length < 1 || changes.length > 10
          || !changes.every((file) => file.status === 'added' && RECORD_PATH.test(file.filename))) continue;
        matched++;
        if (pull.merged_at !== null) durations.push(time(pull.merged_at) - time(pull.created_at));
      }
      return { value: state === 'open' ? matched : durations.length ? median(durations) : null, inspected, matched, error: null };
    } catch (error) {
      return { value: null, inspected, matched, error: controller.signal.aborted
        ? 'GitHub collection timed out; population incomplete.'
        : error instanceof Error ? error.message : 'GitHub unavailable; population incomplete.' };
    }
  }
  try {
    // Open PRs have priority. Failure of history collection cannot erase a complete waiting count.
    const waiting = await collect('open');
    const merged = await collect('closed');
    return { measuredAt, windowDays: WINDOW_DAYS, waiting, median: merged, requests };
  } finally { clearTimeout(timer); }
}

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function cachedMetric(metric: LatencyMetric | undefined, waiting: boolean): boolean {
  if (!metric || metric.error !== null || !count(metric.inspected) || !count(metric.matched) || metric.matched > metric.inspected) return false;
  return waiting
    ? metric.value === metric.matched
    : metric.matched === 0 ? metric.value === null : typeof metric.value === 'number' && Number.isFinite(metric.value) && metric.value >= 0;
}

/**
 * A fully successful observation is reused in this tab (home and /exchange share it) for CACHE_TTL_MS
 * from its measurement time. Inaccessible, malformed, expired or partially failed observations are never reused.
 */
export async function loadExchangeLatency(repository: string, storage: LatencyStorage | null, fetcher: typeof fetch = fetch,
  options: { requestBudget?: number; timeoutMs?: number; now?: number } = {}): Promise<{ observation: LatencyObservation; cached: boolean }> {
  const now = options.now ?? Date.now();
  const key = `unite4ai:exchange-latency:v1:${repository}:${WINDOW_DAYS}d`;
  try {
    const raw = storage?.getItem(key);
    const value = raw ? JSON.parse(raw) as LatencyObservation : null;
    if (value && value.windowDays === WINDOW_DAYS && Number.isFinite(value.measuredAt)
      && now - value.measuredAt >= 0 && now - value.measuredAt < CACHE_TTL_MS && count(value.requests)
      && cachedMetric(value.waiting, true) && cachedMetric(value.median, false)) {
      return { observation: value, cached: true };
    }
  } catch { /* Unavailable or malformed tab storage means a fresh measurement. */ }
  const observation = await collectExchangeLatency(repository, fetcher, { ...options, now });
  if (observation.waiting.error === null && observation.median.error === null) {
    try { storage?.setItem(key, JSON.stringify(observation)); } catch { /* Storage is optional. */ }
  }
  return { observation, cached: false };
}
