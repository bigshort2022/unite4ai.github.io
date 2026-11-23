import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildRegistryIndex } from '@unite4ai/core';

export const prerender = true;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const GET: APIRoute = async () => {
  const [modelEntries, datasetEntries] = await Promise.all([
    getCollection('models'),
    getCollection('datasets'),
  ]);

  // The shared index preserves input order; keep its projection and add the established detail fields.
  const models = buildRegistryIndex(modelEntries).map((item, index) => {
    const { maintainers, openness, artifacts, inference, eval_bundle, tasks } = modelEntries[index].data;
    return Object.assign(item, { maintainers, openness, artifacts, inference, eval_bundle, tasks, href: `${base}${item.href}/` });
  }).sort((a, b) => a.id.localeCompare(b.id));
  const datasets = buildRegistryIndex(datasetEntries, 'datasets').map((item, index) => {
    const { maintainers, artifacts, storage } = datasetEntries[index].data;
    return Object.assign(item, { maintainers, artifacts, storage, href: `${base}${item.href}/` });
  }).sort((a, b) => a.id.localeCompare(b.id));

  // The site build is the snapshot boundary, not the Worker sync or a registry-wide update date.
  return new Response(`${JSON.stringify({ schema_version: 1, models, datasets })}\n`, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
