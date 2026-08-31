import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeForecast,
  normalizePower,
  normalizePvWatts,
} from '../src/lib/sustainable-places/evidence-service.mjs';

const observedAt = '2026-08-24T16:00:00.000Z';

test('normalizePower exposes annual climate values with source provenance', () => {
  const records = normalizePower({
    properties: {
      parameter: {
        ALLSKY_SFC_SW_DWN: { ANN: 5.82 },
        T2M: { ANN: 14.1 },
        WS10M: { ANN: 4.2 },
        PRECTOTCORR: { ANN: 2.4 },
      },
    },
    header: { range: 'January 2001 - December 2020' },
  }, observedAt);

  assert.deepEqual(records[0], {
    key: 'solar-resource',
    label: 'Solar resource',
    value: 5.82,
    unit: 'kWh/m²/day',
    source: 'NASA POWER',
    sourceUrl: 'https://power.larc.nasa.gov/',
    observedAt,
    coverage: 'global',
    status: 'live',
    confidence: 'medium',
    detail: '20-year climatology',
  });
  assert.equal(records.find((record) => record.key === 'wind-speed').value, 4.2);
});

test('normalizeForecast summarizes a seven-day daily forecast', () => {
  const records = normalizeForecast({
    daily: {
      time: ['2026-08-24', '2026-08-25', '2026-08-26'],
      temperature_2m_max: [28, 30, 32],
      temperature_2m_min: [14, 16, 18],
      precipitation_sum: [0, 1, 2],
      sunshine_duration: [36_000, 32_400, 39_600],
      wind_speed_10m_max: [20, 30, 25],
    },
  }, observedAt);

  assert.equal(records.find((record) => record.key === 'forecast-high').value, 30);
  assert.equal(records.find((record) => record.key === 'forecast-rain').value, 3);
  assert.equal(records.find((record) => record.key === 'forecast-wind').value, 30);
});

test('normalizePvWatts exposes annual production for a one-kilowatt system', () => {
  const records = normalizePvWatts({
    outputs: {
      ac_annual: 1640.44,
      capacity_factor: 18.73,
    },
  }, observedAt);

  assert.equal(records[0].key, 'pv-production');
  assert.equal(records[0].value, 1640);
  assert.equal(records[0].unit, 'kWh/kW/year');
  assert.equal(records[0].status, 'live');
  assert.equal(records[1].value, 18.7);
});
