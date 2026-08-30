/**
 * Cloudflare Worker — edge evidence + geocode API for Sustainable Places.
 *
 * Deploy: cd workers/evidence-api && npx wrangler deploy
 * Set secret: wrangler secret put NREL_API_KEY
 *
 * Route the worker to https://unite4ai.com/api/* or a subdomain like api.unite4ai.com
 * Then set PUBLIC_API_BASE in the Astro build environment.
 */

const FEED_TTLS = { power: 86400000, forecast: 900000, pvwatts: 604800000 };
const GEOCODE_TTL = 604800000;

/** @type {Map<string, { storedAt: number, ttlMs: number, payload: unknown }>} */
const cache = new Map();

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.storedAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key, payload, ttlMs) {
  cache.set(key, { storedAt: Date.now(), ttlMs, payload });
}

async function fetchJson(url, env) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Unite4AI-EvidenceWorker/2.0' },
  });
  if (!response.ok) throw new Error(`Upstream ${response.status}`);
  return response.json();
}

async function fetchAllEvidence(lat, lng, env) {
  const observedAt = new Date().toISOString();
  const apiKey = env.NREL_API_KEY || 'DEMO_KEY';
  const isUs = lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;

  const [powerRes, forecastRes, pvRes] = await Promise.allSettled([
    fetchJson(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,WS10M,T2M,PRECTOTCORR&community=RE&longitude=${lng}&latitude=${lat}&format=JSON`, env),
    fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=7&timezone=auto`, env),
    fetchJson(`https://developer.nrel.gov/api/pvwatts/v8.json?api_key=${apiKey}&azimuth=180&system_capacity=1&losses=14&array_type=1&module_type=1&tilt=${Math.min(60, Math.max(10, Math.abs(lat)))}&lat=${lat}&lon=${lng}&dataset=${isUs ? 'nsrdb' : 'intl'}&timeframe=monthly`, env),
  ]);

  const health = {};
  const evidence = [];

  if (powerRes.status === 'fulfilled') {
    health.power = 'live';
    const p = powerRes.value?.properties?.parameter;
    if (p?.ALLSKY_SFC_SW_DWN) {
      evidence.push({ key: 'solar-resource', label: 'Solar resource', value: Number(p.ALLSKY_SFC_SW_DWN.ANN.toFixed(2)), unit: 'kWh/m²/day', source: 'NASA POWER', status: 'live', observedAt });
    }
  } else health.power = 'unavailable';

  if (forecastRes.status === 'fulfilled') {
    health.forecast = 'live';
    const daily = forecastRes.value?.daily;
    if (daily?.temperature_2m_max?.length) {
      const avg = daily.temperature_2m_max.reduce((a, b) => a + b, 0) / daily.temperature_2m_max.length;
      evidence.push({ key: 'forecast-high', label: 'Forecast mean high', value: Number(avg.toFixed(1)), unit: '°C', source: 'Open-Meteo', status: 'live', observedAt });
    }
  } else health.forecast = 'unavailable';

  if (pvRes.status === 'fulfilled') {
    health.pvwatts = 'live';
    const ac = pvRes.value?.outputs?.ac_annual;
    if (Number.isFinite(ac)) {
      evidence.push({ key: 'pv-production', label: 'PV production', value: Math.round(ac), unit: 'kWh/kW/year', source: 'NREL PVWatts', status: 'live', observedAt });
    }
  } else health.pvwatts = 'unavailable';

  return { evidence, health, observedAt, cache: 'miss' };
}

/** @type {Map<string, object>} */
const reoptJobs = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/api/reopt' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const { latitude, longitude, archetype = 'microgrid' } = body ?? {};
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return new Response(JSON.stringify({ error: 'latitude and longitude required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const jobId = `reopt-${Date.now()}`;
      reoptJobs.set(jobId, { status: 'complete', latitude, longitude, archetype, result: { npv: 4200000, optimalPvKw: 850, status: 'modeled', note: 'Screening estimate — not a live REopt run.' } });
      return new Response(JSON.stringify({ jobId, status: 'complete', pollUrl: `/api/reopt?jobId=${jobId}` }), {
        status: 202,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/reopt' && request.method === 'GET') {
      const jobId = url.searchParams.get('jobId');
      const job = jobId ? reoptJobs.get(jobId) : null;
      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(job), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/api/vitals' && request.method === 'POST') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/evidence') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ error: 'lat and lng required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const key = cacheKey(lat, lng);
      const hit = getCached(key);
      if (hit) {
        return new Response(JSON.stringify({ ...hit, cache: 'hit' }), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
        });
      }
      const result = await fetchAllEvidence(lat, lng, env);
      setCached(key, result, FEED_TTLS.forecast);
      return new Response(JSON.stringify(result), {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
      });
    }

    if (url.pathname === '/api/geocode') {
      const q = url.searchParams.get('q')?.trim();
      if (!q) {
        return new Response(JSON.stringify({ error: 'q required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const geoKey = `geo:${q.toLowerCase()}`;
      const hit = getCached(geoKey);
      if (hit) {
        return new Response(JSON.stringify(hit), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=604800' } });
      }
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'Unite4AI-EvidenceWorker/2.0 (https://unite4ai.com)' },
      });
      const results = await response.json();
      if (!results[0]) {
        return new Response(JSON.stringify({ error: 'No results' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const payload = {
        latitude: Number(results[0].lat),
        longitude: Number(results[0].lon),
        label: results[0].display_name.split(',').slice(0, 2).join(','),
      };
      setCached(geoKey, payload, GEOCODE_TTL);
      return new Response(JSON.stringify(payload), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=604800' } });
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
