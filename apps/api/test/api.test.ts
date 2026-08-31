import { describe, expect, test } from 'bun:test';
import app from '../src/index';

describe('registry API', () => {
  test('GET /api/health returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('GET /api/v1/models returns snapshot models', async () => {
    const res = await app.request('/api/v1/models');
    expect(res.status).toBe(200);
    const body = await res.json() as { models: Array<{ id: string }>; source: string };
    expect(body.source).toBe('snapshot');
    expect(body.models.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/v1/models/:id returns model detail', async () => {
    const res = await app.request('/api/v1/models/darsy-xray-analysis');
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; openness_score: number };
    expect(body.id).toBe('darsy-xray-analysis');
    expect(typeof body.openness_score).toBe('number');
  });

  test('GET /api/v1/search requires q', async () => {
    const res = await app.request('/api/v1/search');
    expect(res.status).toBe(400);
  });

  test('POST /api/v1/verify/sha256 returns verify metadata', async () => {
    const res = await app.request('/api/v1/verify/sha256', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/model.bin',
        sha256: 'a'.repeat(64),
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { verify_command: string };
    expect(body.verify_command).toContain('sha256sum');
  });
});

describe('evidence API', () => {
  test('GET /api/evidence requires lat/lng', async () => {
    const res = await app.request('/api/evidence');
    expect(res.status).toBe(400);
  });
});
