import type { EvalExportInput } from './eval-export-types.ts';

const HF_REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function resolveHfModel(served: string | undefined, artifacts: readonly { kind: string; url: string }[]) {
  if (!served || !HF_REPO.test(served)) return undefined;
  for (const artifact of artifacts) {
    if (artifact.kind !== 'weights' || !URL.canParse(artifact.url)) continue;
    const url = new URL(artifact.url);
    if (url.origin !== 'https://huggingface.co' || url.username || url.password) continue;
    const [, owner, repo, action] = url.pathname.split('/');
    if (`${owner}/${repo}` === served && (!action || action === 'tree' || action === 'resolve' || action === 'blob')) return served;
  }
  return undefined;
}

export function renderExportEvidence({ run, benchmark, resultUrl, hfModel }: EvalExportInput) {
  const current = run.benchmark_version === benchmark.version;
  const { date, submitter, harness } = run.run;
  const { runtime, runtime_version, served_model, format, quantization, hardware } = run.setup;
  const { sha256, bytes } = run.evidence;
  return {
    schema_version: 1,
    result_id: run.id,
    source_url: resultUrl,
    attribution: 'self-reported',
    model: run.model,
    ...(hfModel === undefined ? {} : { hf_model: hfModel }),
    benchmark: run.benchmark,
    benchmark_version: run.benchmark_version,
    current_version: current,
    score: run.score,
    n: run.n,
    ...(current ? {
      metric: benchmark.metric,
      ...(benchmark.source_sha256 === undefined ? {}
        : { benchmark_source: { url: benchmark.source_url, sha256: benchmark.source_sha256 } }),
      measured_on: benchmark.measured_on,
    } : {}),
    run: { date, submitter, harness },
    setup: { runtime, runtime_version, served_model, format, quantization, hardware },
    ...(run.repeat === undefined ? {} : { repeat: run.repeat }),
    ...(run.perf === undefined ? {} : { perf: run.perf }),
    ...(run.api === undefined ? {} : { api: run.api }),
    ...(run.cost === undefined ? {} : { cost: run.cost }),
    evidence: { sha256, bytes },
  };
}
