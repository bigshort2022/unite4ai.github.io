import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
