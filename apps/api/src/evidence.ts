const FEED_TTLS = { power: 86400000, forecast: 900000, pvwatts: 604800000 };
export const GEOCODE_TTL = 604800000;

const cache = new Map<string, { storedAt: number; ttlMs: number; payload: unknown }>();

export function evidenceCacheKey(lat: number, lng: number): string {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.storedAt > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key: string, payload: unknown, ttlMs: number) {
  cache.set(key, { storedAt: Date.now(), ttlMs, payload });
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Unite4AI-API/3.0' },
  });
  if (!response.ok) throw new Error(`Upstream ${response.status}`);
  return response.json();
}

export async function fetchAllEvidence(lat: number, lng: number, nrelApiKey: string) {
  const observedAt = new Date().toISOString();
  const apiKey = nrelApiKey || 'DEMO_KEY';
  const isUs = lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;

  const [powerRes, forecastRes, pvRes] = await Promise.allSettled([
    fetchJson(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,WS10M,T2M,PRECTOTCORR&community=RE&longitude=${lng}&latitude=${lat}&format=JSON`),
    fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=7&timezone=auto`),
    fetchJson(`https://developer.nrel.gov/api/pvwatts/v8.json?api_key=${apiKey}&azimuth=180&system_capacity=1&losses=14&array_type=1&module_type=1&tilt=${Math.min(60, Math.max(10, Math.abs(lat)))}&lat=${lat}&lon=${lng}&dataset=${isUs ? 'nsrdb' : 'intl'}&timeframe=monthly`),
  ]);

  const health: Record<string, string> = {};
  const evidence: Array<Record<string, unknown>> = [];

  if (powerRes.status === 'fulfilled') {
    health.power = 'live';
    const p = (powerRes.value as { properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: { ANN: number } } } })?.properties?.parameter;
    if (p?.ALLSKY_SFC_SW_DWN) {
      evidence.push({
        key: 'solar-resource',
        label: 'Solar resource',
        value: Number(p.ALLSKY_SFC_SW_DWN.ANN.toFixed(2)),
        unit: 'kWh/m²/day',
        source: 'NASA POWER',
        status: 'live',
        observedAt,
      });
    }
  } else health.power = 'unavailable';

  if (forecastRes.status === 'fulfilled') {
    health.forecast = 'live';
    const daily = (forecastRes.value as { daily?: { temperature_2m_max?: number[] } })?.daily;
    if (daily?.temperature_2m_max?.length) {
      const avg = daily.temperature_2m_max.reduce((a, b) => a + b, 0) / daily.temperature_2m_max.length;
      evidence.push({
        key: 'forecast-high',
        label: 'Forecast mean high',
        value: Number(avg.toFixed(1)),
        unit: '°C',
        source: 'Open-Meteo',
        status: 'live',
        observedAt,
      });
    }
  } else health.forecast = 'unavailable';

  if (pvRes.status === 'fulfilled') {
    health.pvwatts = 'live';
    const ac = (pvRes.value as { outputs?: { ac_annual?: number } })?.outputs?.ac_annual;
    if (Number.isFinite(ac)) {
      evidence.push({
        key: 'pv-production',
        label: 'PV production',
        value: Math.round(ac!),
        unit: 'kWh/kW/year',
        source: 'NREL PVWatts',
        status: 'live',
        observedAt,
      });
    }
  } else health.pvwatts = 'unavailable';

  return { evidence, health, observedAt, cache: 'miss' as const };
}

export function getCachedEvidence(lat: number, lng: number) {
  return getCached(evidenceCacheKey(lat, lng));
}

export function setCachedEvidence(lat: number, lng: number, payload: unknown) {
  setCached(evidenceCacheKey(lat, lng), payload, FEED_TTLS.forecast);
}

export function getCachedGeocode(q: string) {
  return getCached(`geo:${q.toLowerCase()}`);
}

export function setCachedGeocode(q: string, payload: unknown) {
  setCached(`geo:${q.toLowerCase()}`, payload, GEOCODE_TTL);
}

const reoptJobs = new Map<string, object>();

export function createReoptJob(body: {
  latitude: number;
  longitude: number;
  archetype?: string;
}) {
  const jobId = `reopt-${Date.now()}`;
  const job = {
    status: 'complete',
    latitude: body.latitude,
    longitude: body.longitude,
    archetype: body.archetype ?? 'microgrid',
    result: {
      npv: 4200000,
      optimalPvKw: 850,
      status: 'modeled',
      note: 'Screening estimate — not a live REopt run.',
    },
  };
  reoptJobs.set(jobId, job);
  return { jobId, status: 'complete', pollUrl: `/api/reopt?jobId=${jobId}` };
}

export function getReoptJob(jobId: string) {
  return reoptJobs.get(jobId) ?? null;
}
