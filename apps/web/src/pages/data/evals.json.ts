import type { APIRoute } from 'astro';
import { byCodeUnit } from '@unite4ai/core';
import { evalRunPath, loadEvals } from '../../lib/evals';

/**
 * Public, static data feed: benchmark definitions, aggregated groups, and repeat-run evidence links.
 * Built at deploy time from the content collections; no timestamp, so identical content
 * produces an identical file.
 */
export const GET: APIRoute = async () => {
  const { benchmarks, groups, runCount, runsById, replicationIndex } = await loadEvals();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const replications = [];
  for (const { id: benchmark } of benchmarks) {
    for (const [id, entry] of replicationIndex(benchmark)) {
      const run = runsById.get(id)!;
      const { runtime, runtime_version, format, quantization, served_model, hardware } = run.setup;
      const { runs, temperature, top_p } = run.repeat!;
      replications.push({
        result: id,
        benchmark,
        benchmark_version: run.benchmark_version,
        model: run.model,
        submitter: run.run.submitter,
        n: run.n,
        repeat_method: { runs, temperature, top_p },
        setup: { runtime, runtime_version, format, quantization, served_model, hardware },
        api: run.api === undefined ? undefined : { provider: run.api.provider, model_card: run.api.model_card },
        href: `${base}${evalRunPath(benchmark, id)}`,
        consistent_submitters: entry.consistent_submitters,
        independent_replicators: entry.independent_replicators,
        contested: entry.contested,
        peers: entry.peers,
      });
    }
  }
  replications.sort((a, b) => byCodeUnit(a.result, b.result));
  const body = {
    schema_version: 1,
    notice: 'Results are self-reported. consistent_submitters counts distinct recorded GitHub handles, not independently verified operators. independent_replicators is zero because this feed does not verify independence. Each benchmark page lists exact runs, commands and evidence hashes.',
    note: "Groups include runs of previous benchmark versions; compare only groups whose benchmark_version equals the benchmark's version.",
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.data.name,
      category: b.data.category,
      version: b.data.version,
      previous_versions: b.data.previous_versions,
      metric: b.data.metric.name,
      unit: b.data.metric.unit,
      higher_is_better: b.data.metric.higher_is_better,
      scoring: b.data.scoring,
      items: b.data.items,
      license: b.data.license,
      source_url: b.data.source_url,
      repeat: b.data.repeat ?? null,
    })),
    groups,
    runs: runCount,
    replications,
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
