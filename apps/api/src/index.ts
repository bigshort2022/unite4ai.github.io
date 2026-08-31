import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  createReoptJob,
  fetchAllEvidence,
  getCachedEvidence,
  getCachedGeocode,
  getReoptJob,
  setCachedEvidence,
  setCachedGeocode,
} from './evidence';
import {
  getDataset,
  getModel,
  listDatasets,
  listModels,
  searchRegistry,
  verifySha256Metadata,
  type Env,
} from './registry';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.get('/api/health', (c) => c.json({ ok: true, service: 'unite4ai-api', version: 3 }));

app.get('/api/evidence', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: 'lat and lng required' }, 400);
  }
  const hit = getCachedEvidence(lat, lng);
  if (hit) {
    return c.json({ ...(hit as object), cache: 'hit' }, 200, {
      'Cache-Control': 'public, max-age=900',
    });
  }
  const result = await fetchAllEvidence(lat, lng, c.env.NREL_API_KEY ?? 'DEMO_KEY');
  setCachedEvidence(lat, lng, result);
  return c.json(result, 200, { 'Cache-Control': 'public, max-age=900' });
});

app.get('/api/geocode', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ error: 'q required' }, 400);
  const hit = getCachedGeocode(q);
  if (hit) {
    return c.json(hit, 200, { 'Cache-Control': 'public, max-age=604800' });
  }
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
    {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'Unite4AI-API/3.0 (https://unite4ai.com)',
      },
    },
  );
  const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
  if (!results[0]) return c.json({ error: 'No results' }, 404);
  const payload = {
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon),
    label: results[0].display_name.split(',').slice(0, 2).join(','),
  };
  setCachedGeocode(q, payload);
  return c.json(payload, 200, { 'Cache-Control': 'public, max-age=604800' });
});

app.post('/api/reopt', async (c) => {
  let body: { latitude?: number; longitude?: number; archetype?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const { latitude, longitude, archetype } = body ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return c.json({ error: 'latitude and longitude required' }, 400);
  }
  const job = createReoptJob({ latitude: latitude!, longitude: longitude!, archetype });
  return c.json(job, 202);
});

app.get('/api/reopt', (c) => {
  const jobId = c.req.query('jobId');
  const job = jobId ? getReoptJob(jobId) : null;
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

app.post('/api/vitals', () => new Response(null, { status: 204 }));

app.get('/api/v1/models', async (c) => {
  const q = c.req.query('q');
  const domain = c.req.query('domain');
  const minOpenness = c.req.query('min_openness');
  const models = await listModels(c.env?.DB, {
    q,
    domain,
    minOpenness: minOpenness != null ? Number(minOpenness) : undefined,
  });
  return c.json({ models, count: models.length, source: c.env?.DB ? 'd1' : 'snapshot' });
});

app.get('/api/v1/models/:id', async (c) => {
  const model = await getModel(c.env?.DB, c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json(model);
});

app.get('/api/v1/datasets', async (c) => {
  const q = c.req.query('q');
  const domain = c.req.query('domain');
  const datasets = await listDatasets(c.env?.DB, { q, domain });
  return c.json({ datasets, count: datasets.length, source: c.env?.DB ? 'd1' : 'snapshot' });
});

app.get('/api/v1/datasets/:id', async (c) => {
  const dataset = await getDataset(c.env?.DB, c.req.param('id'));
  if (!dataset) return c.json({ error: 'Dataset not found' }, 404);
  return c.json(dataset);
});

app.post('/api/v1/verify/sha256', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = verifySha256Metadata(body);
  if ('error' in result && result.status === 400) {
    return c.json({ error: result.error }, 400);
  }
  return c.json(result.payload);
});

app.get('/api/v1/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ error: 'q required' }, 400);
  const models = await listModels(c.env?.DB, {});
  const datasets = await listDatasets(c.env?.DB, {});
  return c.json(searchRegistry(models, datasets, q));
});

/** Small eval bundles only — requires ARTIFACTS R2 binding (optional, Phase 2). */
app.get('/api/v1/artifacts/:key', async (c) => {
  const bucket = c.env.ARTIFACTS;
  if (!bucket) {
    return c.json({
      error: 'Artifact hosting not configured',
      hint: 'Unite4AI indexes external mirrors; R2 stores small eval bundles only when enabled.',
    }, 503);
  }
  const key = c.req.param('key');
  const object = await bucket.get(key);
  if (!object) return c.json({ error: 'Artifact not found' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  return new Response(object.body, { headers });
});

export default app;
