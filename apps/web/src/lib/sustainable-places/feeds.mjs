import { cacheKey, getCachedEvidence, setCachedEvidence } from './evidence-cache.mjs';
import {
  fallbackEvidence,
  FEED_REQUESTS,
  fetchAllEvidence,
} from './evidence-service.mjs';

export {
  normalizeForecast,
  normalizePower,
  normalizePvWatts,
} from './evidence-service.mjs';

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_BASE
  ? import.meta.env.PUBLIC_API_BASE.replace(/\/$/, '')
  : '';

async function fetchFromApi(latitude, longitude, signal) {
  if (!API_BASE) {
    const url = `/api/evidence?lat=${latitude}&lng=${longitude}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Evidence API failed with ${response.status}`);
    return response.json();
  }
  const response = await fetch(`${API_BASE}/api/evidence?lat=${latitude}&lng=${longitude}`, { signal });
  if (!response.ok) throw new Error(`Evidence API failed with ${response.status}`);
  return response.json();
}

export async function geocodeQuery(query, signal) {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const coordinates = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordinates) {
    const latitude = Number(coordinates[1]);
    const longitude = Number(coordinates[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude, label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
    }
    return null;
  }

  const apiUrl = API_BASE
    ? `${API_BASE}/api/geocode?q=${encodeURIComponent(trimmed)}`
    : `/api/geocode?q=${encodeURIComponent(trimmed)}`;

  try {
    const response = await fetch(apiUrl, { signal });
    if (response.ok) {
      const result = await response.json();
      if (result?.latitude && result?.longitude) return result;
    }
  } catch {
    // Fall through to direct Nominatim when edge API is unavailable.
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmed)}`,
    { signal, headers: { 'Accept-Language': 'en' } },
  );
  if (!response.ok) throw new Error('Geocoding request failed');
  const results = await response.json();
  if (!results[0]) return null;
  return {
    latitude: Number(results[0].lat),
    longitude: Number(results[0].lon),
    label: results[0].display_name.split(',').slice(0, 2).join(','),
  };
}

/**
 * Progressive evidence fetch — invokes onUpdate after each feed settles.
 */
export async function fetchLocationEvidenceProgressive({
  latitude,
  longitude,
  signal,
  onUpdate,
  useCache = true,
}) {
  if (useCache) {
    const cached = getCachedEvidence(latitude, longitude);
    if (cached) {
      onUpdate?.(cached);
      return cached;
    }
  }

  try {
    const apiResult = await fetchFromApi(latitude, longitude, signal);
    if (apiResult?.evidence) {
      setCachedEvidence(latitude, longitude, apiResult);
      onUpdate?.(apiResult);
      return apiResult;
    }
  } catch {
    // Edge API unavailable — fall back to direct upstream requests.
  }

  const observedAt = new Date().toISOString();
  const fallback = fallbackEvidence(observedAt);
  const health = {};
  const records = [];

  const publish = () => {
    const snapshot = { observedAt, health: { ...health }, evidence: [...records] };
    for (const record of fallback) {
      if (!snapshot.evidence.some((candidate) => candidate.key === record.key)) {
        snapshot.evidence.push(record);
      }
    }
    onUpdate?.(snapshot);
    return snapshot;
  };

  await Promise.allSettled(
    FEED_REQUESTS.map(async ([feedKey, request]) => {
      try {
        const value = await request(latitude, longitude, observedAt, { signal });
        health[feedKey] = 'live';
        records.push(...value);
      } catch {
        health[feedKey] = 'unavailable';
      }
      publish();
    }),
  );

  const result = publish();
  setCachedEvidence(latitude, longitude, result);
  return result;
}

/** Backward-compatible batch fetch. */
export async function fetchLocationEvidence({ latitude, longitude, signal } = {}) {
  const cached = getCachedEvidence(latitude, longitude);
  if (cached) return cached;

  try {
    const apiResult = await fetchFromApi(latitude, longitude, signal);
    if (apiResult?.evidence) {
      setCachedEvidence(latitude, longitude, apiResult);
      return apiResult;
    }
  } catch {
    // Fall through.
  }

  const result = await fetchAllEvidence({ latitude, longitude, signal });
  setCachedEvidence(latitude, longitude, result);
  return result;
}

export { cacheKey };
