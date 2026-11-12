#!/usr/bin/env bun
/**
 * Sync registry content from markdown → JSON snapshot + optional D1 upsert.
 * Usage: bun run sync:d1 [--remote]
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { opennessScore } from '@unite4ai/core';
import type { ModelData, DatasetData } from '@unite4ai/schema';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONTENT = join(ROOT, 'apps/web/src/content');
const PUBLIC_JSON = join(ROOT, 'apps/web/public/data/registry-index.json');
const SNAPSHOT = join(ROOT, 'apps/api/src/generated/registry-snapshot.json');
const remote = process.argv.includes('--remote');

function slugFromFile(filename: string): string {
  return basename(filename).replace(/\.mdx?$/, '');
}

async function loadCollection<T>(dir: string): Promise<Array<{ id: string; data: T }>> {
  const entries: Array<{ id: string; data: T }> = [];
  let files: string[] = [];
  try {
    files = await readdir(join(CONTENT, dir));
  } catch {
    return entries;
  }
  for (const file of files.filter((f) => /\.mdx?$/.test(f))) {
    const raw = await readFile(join(CONTENT, dir, file), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const data = parseYaml(match[1]) as T;
    entries.push({ id: slugFromFile(file), data });
  }
  return entries;
}

const modelEntries = await loadCollection<ModelData>('models');
const datasetEntries = await loadCollection<DatasetData>('datasets');

const models = modelEntries.map(({ id, data }) => ({
  id,
  name: data.name,
  summary: data.summary,
  license: data.license,
  maintainers: data.maintainers,
  openness: data.openness,
  openness_score: opennessScore(data.openness),
  artifacts: data.artifacts ?? [],
  inference: data.inference,
  eval_bundle: data.eval_bundle,
  tasks: data.tasks ?? [],
  domains: data.domains ?? [],
  sdg_alignment: data.sdg_alignment ?? [],
  community_led: data.community_led ?? false,
  featured: data.featured ?? false,
  updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated).slice(0, 10),
}));

const datasets = datasetEntries.map(({ id, data }) => ({
  id,
  name: data.name,
  summary: data.summary,
  license: data.license,
  maintainers: data.maintainers,
  artifacts: data.artifacts ?? [],
  storage: data.storage,
  domains: data.domains ?? [],
  sdg_alignment: data.sdg_alignment ?? [],
  community_led: data.community_led ?? false,
  featured: data.featured ?? false,
  updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated).slice(0, 10),
}));

const payload = {
  generated_at: new Date().toISOString(),
  models,
  datasets,
};

await mkdir(dirname(PUBLIC_JSON), { recursive: true });
await mkdir(dirname(SNAPSHOT), { recursive: true });
await writeFile(PUBLIC_JSON, `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(SNAPSHOT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Wrote ${models.length} models, ${datasets.length} datasets → registry-index.json + registry-snapshot.json`);

if (remote) {
  const apiDir = join(ROOT, 'apps/api');
  for (const model of models) {
    const sql = `INSERT INTO models (id, name, summary, license, maintainers, openness, openness_score, artifacts, inference, eval_bundle, tasks, domains, sdg_alignment, community_led, featured, updated, search_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, summary=excluded.summary, license=excluded.license,
        maintainers=excluded.maintainers, openness=excluded.openness, openness_score=excluded.openness_score,
        artifacts=excluded.artifacts, inference=excluded.inference, eval_bundle=excluded.eval_bundle,
        tasks=excluded.tasks, domains=excluded.domains, sdg_alignment=excluded.sdg_alignment,
        community_led=excluded.community_led, featured=excluded.featured, updated=excluded.updated,
        search_text=excluded.search_text`;
    const searchText = [model.name, model.summary, ...model.domains].join(' ').toLowerCase();
    spawnSync('bunx', ['wrangler', 'd1', 'execute', 'unite4ai-registry', '--remote', '--command', sql.replace(/\n/g, ' '), '--bind', JSON.stringify([
      model.id, model.name, model.summary, model.license,
      JSON.stringify(model.maintainers), JSON.stringify(model.openness), model.openness_score,
      JSON.stringify(model.artifacts), JSON.stringify(model.inference ?? null),
      JSON.stringify(model.eval_bundle ?? null), JSON.stringify(model.tasks),
      JSON.stringify(model.domains), JSON.stringify(model.sdg_alignment),
      model.community_led ? 1 : 0, model.featured ? 1 : 0, model.updated, searchText,
    ])], { cwd: apiDir, stdio: 'inherit' });
  }
  console.log('Remote D1 sync attempted (requires wrangler auth + database_id in wrangler.toml)');
}

console.log('Done.');
