import type { D1Database } from '@cloudflare/workers-types';
import { opennessScore } from '@unite4ai/core';
import type { ModelData, DatasetData } from '@unite4ai/schema';
import snapshot from './generated/registry-snapshot.json';

export interface Env {
  DB?: D1Database;
  NREL_API_KEY?: string;
  ARTIFACTS?: R2Bucket;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<R2Object>;
}

interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Object {
  key: string;
}

export interface RegistryModelRow {
  id: string;
  name: string;
  summary: string;
  license: string;
  maintainers: string[];
  openness: ModelData['openness'];
  openness_score: number;
  artifacts: ModelData['artifacts'];
  inference?: ModelData['inference'];
  eval_bundle?: ModelData['eval_bundle'];
  tasks: string[];
  domains: string[];
  sdg_alignment: number[];
  community_led: boolean;
  featured: boolean;
  updated: string;
}

export interface RegistryDatasetRow {
  id: string;
  name: string;
  summary: string;
  license: string;
  maintainers: string[];
  artifacts: DatasetData['artifacts'];
  storage?: DatasetData['storage'];
  domains: string[];
  sdg_alignment: number[];
  community_led: boolean;
  featured: boolean;
  updated: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToModel(row: Record<string, unknown>): RegistryModelRow {
  return {
    id: String(row.id),
    name: String(row.name),
    summary: String(row.summary),
    license: String(row.license),
    maintainers: parseJson<string[]>(row.maintainers as string, []),
    openness: parseJson(row.openness as string, {
      weights: 'closed',
      training_data: 'closed',
      training_code: 'closed',
      evaluation: 'closed',
    }) as ModelData['openness'],
    openness_score: Number(row.openness_score ?? 0),
    artifacts: parseJson(row.artifacts as string, []),
    inference: parseJson(row.inference as string | null, undefined),
    eval_bundle: parseJson(row.eval_bundle as string | null, undefined),
    tasks: parseJson<string[]>(row.tasks as string, []),
    domains: parseJson<string[]>(row.domains as string, []),
    sdg_alignment: parseJson<number[]>(row.sdg_alignment as string, []),
    community_led: Boolean(row.community_led),
    featured: Boolean(row.featured),
    updated: String(row.updated),
  };
}

function rowToDataset(row: Record<string, unknown>): RegistryDatasetRow {
  return {
    id: String(row.id),
    name: String(row.name),
    summary: String(row.summary),
    license: String(row.license),
    maintainers: parseJson<string[]>(row.maintainers as string, []),
    artifacts: parseJson(row.artifacts as string, []),
    storage: parseJson(row.storage as string | null, undefined),
    domains: parseJson<string[]>(row.domains as string, []),
    sdg_alignment: parseJson<number[]>(row.sdg_alignment as string, []),
    community_led: Boolean(row.community_led),
    featured: Boolean(row.featured),
    updated: String(row.updated),
  };
}

export async function listModels(
  db: D1Database | undefined,
  params: { q?: string; domain?: string; minOpenness?: number },
): Promise<RegistryModelRow[]> {
  let models: RegistryModelRow[];

  if (db) {
    const { results } = await db.prepare('SELECT * FROM models ORDER BY updated DESC').all();
    models = (results ?? []).map((r) => rowToModel(r as Record<string, unknown>));
  } else {
    models = snapshot.models as RegistryModelRow[];
  }

  return filterModels(models, params);
}

export async function getModel(db: D1Database | undefined, id: string): Promise<RegistryModelRow | null> {
  if (db) {
    const row = await db.prepare('SELECT * FROM models WHERE id = ?').bind(id).first();
    return row ? rowToModel(row as Record<string, unknown>) : null;
  }
  return (snapshot.models as RegistryModelRow[]).find((m) => m.id === id) ?? null;
}

export async function listDatasets(
  db: D1Database | undefined,
  params: { q?: string; domain?: string },
): Promise<RegistryDatasetRow[]> {
  let datasets: RegistryDatasetRow[];

  if (db) {
    const { results } = await db.prepare('SELECT * FROM datasets ORDER BY updated DESC').all();
    datasets = (results ?? []).map((r) => rowToDataset(r as Record<string, unknown>));
  } else {
    datasets = snapshot.datasets as RegistryDatasetRow[];
  }

  return filterDatasets(datasets, params);
}

export async function getDataset(db: D1Database | undefined, id: string): Promise<RegistryDatasetRow | null> {
  if (db) {
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').bind(id).first();
    return row ? rowToDataset(row as Record<string, unknown>) : null;
  }
  return (snapshot.datasets as RegistryDatasetRow[]).find((d) => d.id === id) ?? null;
}

function filterModels(models: RegistryModelRow[], params: { q?: string; domain?: string; minOpenness?: number }) {
  let out = models;
  if (params.domain) out = out.filter((m) => m.domains.includes(params.domain!));
  if (params.minOpenness != null) out = out.filter((m) => m.openness_score >= params.minOpenness!);
  if (params.q) {
    const q = params.q.toLowerCase();
    out = out.filter((m) =>
      m.name.toLowerCase().includes(q)
      || m.summary.toLowerCase().includes(q)
      || m.domains.some((d) => d.toLowerCase().includes(q)),
    );
  }
  return out;
}

function filterDatasets(datasets: RegistryDatasetRow[], params: { q?: string; domain?: string }) {
  let out = datasets;
  if (params.domain) out = out.filter((d) => d.domains.includes(params.domain!));
  if (params.q) {
    const q = params.q.toLowerCase();
    out = out.filter((d) =>
      d.name.toLowerCase().includes(q)
      || d.summary.toLowerCase().includes(q)
      || d.domains.some((x) => x.toLowerCase().includes(q)),
    );
  }
  return out;
}

export function searchRegistry(models: RegistryModelRow[], datasets: RegistryDatasetRow[], q: string) {
  const query = q.toLowerCase();
  return {
    models: models.filter((m) =>
      m.name.toLowerCase().includes(query) || m.summary.toLowerCase().includes(query),
    ),
    datasets: datasets.filter((d) =>
      d.name.toLowerCase().includes(query) || d.summary.toLowerCase().includes(query),
    ),
  };
}

export function verifySha256Metadata(body: { url?: string; sha256?: string; bytes?: number }) {
  if (!body.url || !body.sha256) {
    return { error: 'url and sha256 required', status: 400 as const };
  }
  if (!/^[a-f0-9]{64}$/.test(body.sha256)) {
    return { error: 'sha256 must be 64-char hex', status: 400 as const };
  }
  return {
    status: 200 as const,
    payload: {
      url: body.url,
      expected_sha256: body.sha256,
      verify_command: `curl -L -o artifact.bin "${body.url}" && sha256sum artifact.bin`,
      note: 'Compare output to expected_sha256. Use the Stack verify panel for browser-side checks.',
      size_bytes: body.bytes ?? null,
    },
  };
}

export { opennessScore };
