/**
 * Load precomputed regional data blobs for Sustainable Places.
 */
const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, '')
  : '';

let eiaCache;
let dsireCache;
let hazardCache;

async function loadJson(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

export async function getEiaPrices() {
  if (!eiaCache) eiaCache = loadJson('/data/eia-electricity-prices.json');
  return eiaCache;
}

export async function getDsireIncentives() {
  if (!dsireCache) dsireCache = loadJson('/data/dsire-incentives.json');
  return dsireCache;
}

export async function getHazardIndex() {
  if (!hazardCache) hazardCache = loadJson('/data/hazard-index.json');
  return hazardCache;
}

export async function lookupEnergyPrice(stateCode) {
  const data = await getEiaPrices();
  const code = (stateCode ?? 'default').toUpperCase();
  return data.states[code] ?? data.states.default;
}

export async function lookupHazards(regionId) {
  const data = await getHazardIndex();
  return data.regions.find((r) => r.id === regionId) ?? null;
}
