const MEMORY = new Map();
const STORAGE_KEY = 'unite4ai-evidence-v1';
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function cacheKey(latitude, longitude, precision = 2) {
  const lat = Number(latitude).toFixed(precision);
  const lng = Number(longitude).toFixed(precision);
  return `${lat},${lng}`;
}

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStorage(entries) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — memory cache still works.
  }
}

export function getCachedEvidence(latitude, longitude, ttlMs = DEFAULT_TTL_MS) {
  const key = cacheKey(latitude, longitude);
  const now = Date.now();
  const memoryHit = MEMORY.get(key);
  if (memoryHit && now - memoryHit.storedAt < ttlMs) return memoryHit.payload;

  const stored = readStorage()[key];
  if (stored && now - stored.storedAt < ttlMs) {
    MEMORY.set(key, stored);
    return stored.payload;
  }
  return null;
}

export function setCachedEvidence(latitude, longitude, payload) {
  const key = cacheKey(latitude, longitude);
  const entry = { storedAt: Date.now(), payload };
  MEMORY.set(key, entry);
  const all = readStorage();
  all[key] = entry;
  writeStorage(all);
}
