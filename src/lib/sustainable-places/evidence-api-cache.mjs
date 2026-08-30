import { FEED_TTLS } from './evidence-service.mjs';
import { cacheKey } from './evidence-cache.mjs';

const store = new Map();

export function getServerCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > entry.ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.payload;
}

export function setServerCached(key, payload, ttlMs) {
  store.set(key, { storedAt: Date.now(), ttlMs, payload });
}

export function evidenceCacheKey(latitude, longitude) {
  return cacheKey(latitude, longitude, 2);
}

export function minFeedTtl() {
  return Math.min(...Object.values(FEED_TTLS));
}

export { FEED_TTLS };
