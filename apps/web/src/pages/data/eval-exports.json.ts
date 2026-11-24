import type { APIRoute } from 'astro';
import { EXPORT_FILES, exportJson, exportPath, loadEvalExports } from '../../lib/eval-exports.ts';

export const prerender = true;

export const GET: APIRoute = async ({ site, url }) => {
  const results = await loadEvalExports(site ?? url);
  return exportJson({
    schema_version: 1,
    notice: 'Self-reported result records; not independent replication or upstream acceptance. No transcripts are hosted.',
    results: results.map(({ input: { run, resultUrl }, hf }) => ({
      id: run.id,
      benchmark: run.benchmark,
      benchmark_version: run.benchmark_version,
      model: run.model,
      result_url: resultUrl,
      every_eval_ever: exportPath(run.id, EXPORT_FILES.eee),
      evidence: exportPath(run.id, EXPORT_FILES.evidence),
      hugging_face: hf.status === 'ready'
        ? { status: hf.status, model: hf.model, yaml: exportPath(run.id, EXPORT_FILES.hf) }
        : hf,
    })),
  });
};
