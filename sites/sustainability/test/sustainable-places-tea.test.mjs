import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateTea, scoreSite } from '../src/lib/sustainable-places/tea.mjs';

const viableProject = {
  capex: 1_000_000,
  annualRevenue: 180_000,
  annualOpex: 50_000,
  incentives: 200_000,
  horizonYears: 10,
  discountRate: 0.08,
  salvageValue: 100_000,
  annualEnergyMWh: 1_250,
};

test('calculateTea discounts project cash flows and salvage value', () => {
  const result = calculateTea(viableProject);

  assert.equal(result.initialInvestment, 800_000);
  assert.equal(result.annualNetCashFlow, 130_000);
  assert.equal(Math.round(result.npv), 118_630);
  assert.equal(result.paybackYears, 6.15);
  assert.equal(result.roiPercent, 75);
});

test('calculateTea reports no payback when annual cash flow is not positive', () => {
  const result = calculateTea({
    ...viableProject,
    annualRevenue: 40_000,
  });

  assert.equal(result.paybackYears, null);
  assert.ok(result.npv < 0);
});

test('scoreSite applies transparent weights and keeps scores bounded', () => {
  const result = scoreSite({
    resource: 80,
    infrastructure: 70,
    climate: 60,
    policy: 90,
    confidence: 80,
  });

  assert.deepEqual(result, {
    overall: 75,
    resource: 80,
    infrastructure: 70,
    climate: 60,
    policy: 90,
    confidence: 80,
  });

  assert.equal(scoreSite({
    resource: 200,
    infrastructure: -10,
    climate: 50,
    policy: 50,
    confidence: 50,
  }).overall, 53);
});
