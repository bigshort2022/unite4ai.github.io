const POWER_URL = 'https://power.larc.nasa.gov/';
const FORECAST_URL = 'https://open-meteo.com/';
const PVWATTS_URL = 'https://developer.nrel.gov/docs/solar/pvwatts/v8/';

const round = (value, digits = 1) => Number(Number(value).toFixed(digits));
const average = (values = []) => values.length
  ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length
  : 0;
const maximum = (values = []) => values.length ? Math.max(...values.map(Number)) : 0;
const sum = (values = []) => values.reduce((total, value) => total + Number(value || 0), 0);

function evidence({
  key,
  label,
  value,
  unit,
  source,
  sourceUrl,
  observedAt,
  coverage = 'global',
  status = 'live',
  confidence = 'medium',
  detail,
}) {
  return {
    key,
    label,
    value,
    unit,
    source,
    sourceUrl,
    observedAt,
    coverage,
    status,
    confidence,
    detail,
  };
}

export function normalizePower(payload, observedAt = new Date().toISOString()) {
  const parameters = payload?.properties?.parameter;
  if (!parameters?.ALLSKY_SFC_SW_DWN) throw new Error('NASA POWER response is missing solar data');

  const common = {
    source: 'NASA POWER',
    sourceUrl: POWER_URL,
    observedAt,
    coverage: 'global',
    status: 'live',
    confidence: 'medium',
    detail: '20-year climatology',
  };

  return [
    evidence({
      ...common,
      key: 'solar-resource',
      label: 'Solar resource',
      value: round(parameters.ALLSKY_SFC_SW_DWN.ANN, 2),
      unit: 'kWh/m²/day',
    }),
    evidence({
      ...common,
      key: 'mean-temperature',
      label: 'Mean temperature',
      value: round(parameters.T2M?.ANN ?? 0, 1),
      unit: '°C',
    }),
    evidence({
      ...common,
      key: 'wind-speed',
      label: 'Mean wind speed',
      value: round(parameters.WS10M?.ANN ?? 0, 1),
      unit: 'm/s',
    }),
    evidence({
      ...common,
      key: 'precipitation',
      label: 'Mean precipitation',
      value: round(parameters.PRECTOTCORR?.ANN ?? 0, 1),
      unit: 'mm/day',
    }),
  ];
}

export function normalizeForecast(payload, observedAt = new Date().toISOString()) {
  const daily = payload?.daily;
  if (!daily?.time?.length) throw new Error('Open-Meteo response is missing daily data');

  const common = {
    source: 'Open-Meteo',
    sourceUrl: FORECAST_URL,
    observedAt,
    coverage: 'global',
    status: 'live',
    confidence: 'medium',
    detail: `${daily.time.length}-day forecast`,
  };

  return [
    evidence({
      ...common,
      key: 'forecast-high',
      label: 'Forecast mean high',
      value: round(average(daily.temperature_2m_max), 1),
      unit: '°C',
    }),
    evidence({
      ...common,
      key: 'forecast-low',
      label: 'Forecast mean low',
      value: round(average(daily.temperature_2m_min), 1),
      unit: '°C',
    }),
    evidence({
      ...common,
      key: 'forecast-rain',
      label: 'Forecast precipitation',
      value: round(sum(daily.precipitation_sum), 1),
      unit: 'mm total',
    }),
    evidence({
      ...common,
      key: 'forecast-wind',
      label: 'Forecast peak wind',
      value: round(maximum(daily.wind_speed_10m_max), 1),
      unit: 'km/h',
    }),
  ];
}

export function normalizePvWatts(payload, observedAt = new Date().toISOString()) {
  const outputs = payload?.outputs;
  if (!Number.isFinite(Number(outputs?.ac_annual))) {
    throw new Error('NREL PVWatts response is missing annual production');
  }

  const common = {
    source: 'NREL PVWatts',
    sourceUrl: PVWATTS_URL,
    observedAt,
    coverage: 'global',
    status: 'live',
    confidence: 'medium',
    detail: 'One-kilowatt reference system',
  };

  return [
    evidence({
      ...common,
      key: 'pv-production',
      label: 'PV production',
      value: round(outputs.ac_annual, 0),
      unit: 'kWh/kW/year',
    }),
    evidence({
      ...common,
      key: 'pv-capacity-factor',
      label: 'PV capacity factor',
      value: round(outputs.capacity_factor ?? 0, 1),
      unit: '%',
    }),
  ];
}

function fallbackEvidence(observedAt) {
  const common = {
    sourceUrl: '',
    observedAt,
    coverage: 'global',
    status: 'modeled',
    confidence: 'low',
    detail: 'Demonstration value pending a successful source request',
  };

  return [
    evidence({ ...common, key: 'solar-resource', label: 'Solar resource', value: 5.8, unit: 'kWh/m²/day', source: 'Prototype model' }),
    evidence({ ...common, key: 'forecast-high', label: 'Forecast mean high', value: 24, unit: '°C', source: 'Prototype model' }),
    evidence({ ...common, key: 'pv-production', label: 'PV production', value: 1640, unit: 'kWh/kW/year', source: 'Prototype model' }),
    evidence({ ...common, key: 'energy-price', label: 'Average energy price', value: 11.2, unit: '¢/kWh', source: 'Cached state example', coverage: 'state', status: 'cached' }),
  ];
}

async function fetchJson(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Source request failed with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPower(latitude, longitude, observedAt) {
  const query = new URLSearchParams({
    parameters: 'ALLSKY_SFC_SW_DWN,WS10M,T2M,PRECTOTCORR',
    community: 'RE',
    longitude: String(longitude),
    latitude: String(latitude),
    format: 'JSON',
  });
  const payload = await fetchJson(`https://power.larc.nasa.gov/api/temporal/climatology/point?${query}`);
  return normalizePower(payload, observedAt);
}

async function fetchForecast(latitude, longitude, observedAt) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max',
    forecast_days: '7',
    timezone: 'auto',
  });
  const payload = await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`);
  return normalizeForecast(payload, observedAt);
}

async function fetchPvWatts(latitude, longitude, observedAt) {
  const isUs = latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66;
  const query = new URLSearchParams({
    api_key: 'DEMO_KEY',
    azimuth: '180',
    system_capacity: '1',
    losses: '14',
    array_type: '1',
    module_type: '1',
    tilt: String(Math.min(60, Math.max(10, Math.abs(latitude)))),
    lat: String(latitude),
    lon: String(longitude),
    dataset: isUs ? 'nsrdb' : 'intl',
    timeframe: 'monthly',
  });
  const payload = await fetchJson(`https://developer.nrel.gov/api/pvwatts/v8.json?${query}`);
  if (payload.errors?.length) throw new Error(payload.errors.join('; '));
  return normalizePvWatts(payload, observedAt);
}

export async function fetchLocationEvidence({ latitude, longitude }) {
  const observedAt = new Date().toISOString();
  const fallback = fallbackEvidence(observedAt);
  const requests = [
    ['power', () => fetchPower(latitude, longitude, observedAt)],
    ['forecast', () => fetchForecast(latitude, longitude, observedAt)],
    ['pvwatts', () => fetchPvWatts(latitude, longitude, observedAt)],
  ];
  const settled = await Promise.allSettled(requests.map(([, request]) => request()));
  const health = {};
  const records = [];

  settled.forEach((result, index) => {
    const key = requests[index][0];
    if (result.status === 'fulfilled') {
      health[key] = 'live';
      records.push(...result.value);
    } else {
      health[key] = 'unavailable';
    }
  });

  for (const record of fallback) {
    if (!records.some((candidate) => candidate.key === record.key)) records.push(record);
  }

  return { evidence: records, health, observedAt };
}
