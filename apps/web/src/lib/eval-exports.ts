import { getCollection, type CollectionEntry } from 'astro:content';
import { byCodeUnit } from '@unite4ai/core';
import { evalRunPath } from './evals';
import { resolveHfModel } from './eval-export-evidence.ts';
import { parseHfBindings, renderHfEval } from './hf-eval-export.ts';
import type { EvalExportInput } from './eval-export-types.ts';
import rawBindings from '../data/hf-eval-bindings.json';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const root = '/data/eval-exports';
export const EXPORT_FILES = {
  eee: 'every-eval-ever.json',
  evidence: 'evidence.json',
  hf: 'huggingface.yaml',
} as const;
export type ExportFile = (typeof EXPORT_FILES)[keyof typeof EXPORT_FILES];
const bindings = parseHfBindings(rawBindings);
const RECORD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--\d{4}-\d{2}-\d{2}--[a-f0-9]{8}$/;

export function exportPath(id: string, file: ExportFile) {
  return `${base}${root}/${id}/${file}`;
}

interface ExportCollections {
  entries: CollectionEntry<'evals'>[];
  benchmarks: Map<string, CollectionEntry<'benchmarks'>['data']>;
  models: Map<string, CollectionEntry<'models'>['data']>;
}

async function loadInputs(): Promise<ExportCollections> {
  const [entries, benchmarks, models] = await Promise.all([
    getCollection('evals'), getCollection('benchmarks'), getCollection('models'),
  ]);
  return {
    entries: entries.sort((a, b) => byCodeUnit(a.id, b.id)),
    benchmarks: new Map(benchmarks.map(({ id, data }) => [id, data])),
    models: new Map(models.map(({ id, data }) => [id, data])),
  };
}
let buildInputs: Promise<ExportCollections> | undefined;

export async function loadEvalExports(site: URL) {
  const input = await (import.meta.env.PROD ? buildInputs ??= loadInputs() : loadInputs());
  return input.entries.map(({ id, data }) => {
    if (!RECORD_ID.test(id)) throw new Error(`Invalid evaluation export ID: ${id}`);
    const benchmark = input.benchmarks.get(data.benchmark);
    const model = input.models.get(data.model);
    if (!benchmark) throw new Error(`Missing benchmark for evaluation export: ${id}`);
    const hfModel = data.setup.runtime === 'api' ? undefined : resolveHfModel(data.setup.served_model, model?.artifacts ?? []);
    const absolute = (path: string) => new URL(path, site).href;
    const exportInput: EvalExportInput = {
      run: { id, ...data }, benchmark,
      model: model && {
        name: model.name,
        openWeights: model.openness.weights === 'open' ? true : model.openness.weights === 'closed' ? false : undefined,
      },
      hfModel,
      resultUrl: absolute(`${base}${evalRunPath(data.benchmark, id)}`),
      evidenceUrl: absolute(exportPath(id, EXPORT_FILES.evidence)),
    };
    return { input: exportInput, hf: renderHfEval(exportInput, bindings) };
  });
}

export function exportJson(data: unknown) {
  return new Response(`${JSON.stringify(data, null, 2)}\n`, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
