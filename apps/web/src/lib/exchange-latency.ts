import { median } from '@unite4ai/core/evals';

export const REQUEST_BUDGET = 40;
export const TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
const RECORD_PATH = /^apps\/web\/src\/content\/(hypotheses\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|(?:findings|reviews|evals)\/[a-z0-9][a-z0-9-]*\.json)$/;
const FILE_STATUSES: Record<string, true> = { added: true, modified: true, removed: true, renamed: true, copied: true, changed: true, unchanged: true };
interface Pull { number: number; state: string; base: { ref: string }; created_at: string; merged_at: string | null }
interface FileChange { filename: string; status: string }
export interface LatencyMetric { value: number | null; inspected: number; matched: number; error: string | null }

/** Complete populations only. A budget/transport failure never publishes a partial total. */
export async function collectExchangeLatency(repository: string, fetcher: typeof fetch = fetch,
  options: { requestBudget?: number; timeoutMs?: number } = {}) {
  let requests = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  const requestBudget = options.requestBudget ?? REQUEST_BUDGET;
  async function list(path: string, query = ''): Promise<unknown[]> {
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
      if (data.length < PAGE_SIZE) return rows;
    }
  }
  async function collect(state: 'open' | 'closed'): Promise<LatencyMetric> {
    let inspected = 0;
    let matched = 0;
    try {
      const raw = await list('pulls', `state=${state}&base=main&sort=created&direction=asc&`);
      const numbers = new Set<number>();
      const pulls = raw as Pull[];
      for (const pull of pulls) {
        if (!pull || !Number.isSafeInteger(pull.number) || pull.number < 1 || numbers.has(pull.number)
          || pull.state !== state || pull.base?.ref !== 'main' || !Number.isFinite(Date.parse(pull.created_at))
          || (pull.merged_at !== null && (!Number.isFinite(Date.parse(pull.merged_at))
            || Date.parse(pull.merged_at) < Date.parse(pull.created_at) || state === 'open'))) {
          throw new Error('Invalid or changing GitHub PR metadata; population incomplete.');
        }
        numbers.add(pull.number);
      }
      const durations: number[] = [];
      for (const pull of pulls) {
        if (state === 'closed' && pull.merged_at === null) { inspected++; continue; }
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
        if (pull.merged_at !== null) durations.push(Date.parse(pull.merged_at) - Date.parse(pull.created_at));
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
    return { waiting, median: merged, requests };
  } finally { clearTimeout(timer); }
}
