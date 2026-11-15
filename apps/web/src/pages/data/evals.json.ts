import type { APIRoute } from 'astro';
import { loadEvals } from '../../lib/evals';

/**
 * Public, static data feed: benchmark definitions and aggregated groups.
 * Built at deploy time from the content collections; no timestamp, so identical content
 * produces an identical file.
 */
export const GET: APIRoute = async () => {
  const { benchmarks, groups, runs } = await loadEvals();
  const body = {
    schema_version: 1,
    notice: 'Results are self-reported by contributors. Each benchmark page lists every run with its reproduce command and evidence hash.',
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.data.name,
      category: b.data.category,
      version: b.data.version,
      metric: b.data.metric.name,
      unit: b.data.metric.unit,
      higher_is_better: b.data.metric.higher_is_better,
      scoring: b.data.scoring,
      items: b.data.items,
      license: b.data.license,
      source_url: b.data.source_url,
    })),
    groups,
    // A run is one transcript, however many result files it backs.
    runs: new Set(runs.map((run) => run.evidence.sha256)).size,
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
