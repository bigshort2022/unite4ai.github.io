import type { APIRoute, GetStaticPaths } from 'astro';
import { EXPORT_FILES, exportJson, loadEvalExports } from '../../../../lib/eval-exports.ts';
import { renderEveryEval } from '../../../../lib/eee-export.ts';
import { renderExportEvidence } from '../../../../lib/eval-export-evidence.ts';
import type { EvalExportInput } from '../../../../lib/eval-export-types.ts';

export const prerender = true;

type ArtifactProps = { format: 'eee' | 'evidence'; input: EvalExportInput } | { format: 'yaml'; yaml: string };

export const getStaticPaths = (async () => {
  const site = import.meta.env.SITE;
  if (!site) throw new Error('Evaluation exports require a configured canonical site');
  const rows = await loadEvalExports(new URL(site));
  return rows.flatMap(({ input, hf }) => {
    const id = input.run.id;
    const paths: { params: { id: string; file: string }; props: ArtifactProps }[] = [
      { params: { id, file: EXPORT_FILES.eee }, props: { format: 'eee', input } },
      { params: { id, file: EXPORT_FILES.evidence }, props: { format: 'evidence', input } },
    ];
    if (hf.status === 'ready') paths.push({ params: { id, file: EXPORT_FILES.hf }, props: { format: 'yaml', yaml: hf.yaml } });
    return paths;
  });
}) satisfies GetStaticPaths;

export const GET: APIRoute<ArtifactProps> = ({ props }) => {
  if (props.format === 'yaml') return new Response(props.yaml, { headers: { 'content-type': 'application/yaml; charset=utf-8' } });
  return exportJson(props.format === 'eee' ? renderEveryEval(props.input) : renderExportEvidence(props.input));
};
