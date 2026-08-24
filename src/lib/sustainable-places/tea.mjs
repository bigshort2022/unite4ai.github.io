const SCORE_WEIGHTS = Object.freeze({
  resource: 0.3,
  infrastructure: 0.25,
  climate: 0.2,
  policy: 0.15,
  confidence: 0.1,
});

const clampScore = (value) => Math.min(100, Math.max(0, Number(value) || 0));
const round = (value, digits = 2) => Number(value.toFixed(digits));

function discountedSeries(amount, years, rate) {
  let value = 0;
  for (let year = 1; year <= years; year += 1) {
    value += amount / ((1 + rate) ** year);
  }
  return value;
}

function projectNpv(rate, initialInvestment, annualNetCashFlow, horizonYears, salvageValue) {
  return -initialInvestment
    + discountedSeries(annualNetCashFlow, horizonYears, rate)
    + salvageValue / ((1 + rate) ** horizonYears);
}

function solveIrr(initialInvestment, annualNetCashFlow, horizonYears, salvageValue) {
  let low = -0.99;
  let high = 10;
  let lowValue = projectNpv(low, initialInvestment, annualNetCashFlow, horizonYears, salvageValue);
  const highValue = projectNpv(high, initialInvestment, annualNetCashFlow, horizonYears, salvageValue);

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) {
    return null;
  }

  for (let iteration = 0; iteration < 160; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midpointValue = projectNpv(
      midpoint,
      initialInvestment,
      annualNetCashFlow,
      horizonYears,
      salvageValue,
    );

    if (Math.abs(midpointValue) < 0.0001) return midpoint;
    if (lowValue * midpointValue <= 0) {
      high = midpoint;
    } else {
      low = midpoint;
      lowValue = midpointValue;
    }
  }

  return (low + high) / 2;
}

export function calculateTea(input) {
  const capex = Math.max(0, Number(input.capex) || 0);
  const incentives = Math.min(capex, Math.max(0, Number(input.incentives) || 0));
  const annualRevenue = Number(input.annualRevenue) || 0;
  const annualOpex = Math.max(0, Number(input.annualOpex) || 0);
  const horizonYears = Math.max(1, Math.round(Number(input.horizonYears) || 1));
  const discountRate = Math.max(0, Number(input.discountRate) || 0);
  const salvageValue = Math.max(0, Number(input.salvageValue) || 0);
  const annualEnergyMWh = Math.max(0, Number(input.annualEnergyMWh) || 0);

  const initialInvestment = capex - incentives;
  const annualNetCashFlow = annualRevenue - annualOpex;
  const npv = projectNpv(
    discountRate,
    initialInvestment,
    annualNetCashFlow,
    horizonYears,
    salvageValue,
  );
  const irr = solveIrr(initialInvestment, annualNetCashFlow, horizonYears, salvageValue);
  const paybackYears = annualNetCashFlow > 0
    ? Math.min(horizonYears, initialInvestment / annualNetCashFlow)
    : null;
  const totalUndiscountedReturn = annualNetCashFlow * horizonYears + salvageValue - initialInvestment;
  const roiPercent = initialInvestment > 0
    ? (totalUndiscountedReturn / initialInvestment) * 100
    : null;

  const discountedEnergy = discountedSeries(annualEnergyMWh, horizonYears, discountRate);
  const discountedCosts = initialInvestment
    + discountedSeries(annualOpex, horizonYears, discountRate)
    - salvageValue / ((1 + discountRate) ** horizonYears);
  const levelizedCostPerMWh = discountedEnergy > 0 ? discountedCosts / discountedEnergy : null;

  return {
    initialInvestment: round(initialInvestment, 0),
    annualNetCashFlow: round(annualNetCashFlow, 0),
    npv: round(npv, 2),
    irrPercent: irr === null ? null : round(irr * 100, 1),
    paybackYears: paybackYears === null ? null : round(paybackYears, 2),
    roiPercent: roiPercent === null ? null : round(roiPercent, 1),
    levelizedCostPerMWh: levelizedCostPerMWh === null
      ? null
      : round(levelizedCostPerMWh, 2),
  };
}

export function scoreSite(input) {
  const normalized = Object.fromEntries(
    Object.keys(SCORE_WEIGHTS).map((key) => [key, clampScore(input[key])]),
  );
  const overall = Object.entries(SCORE_WEIGHTS).reduce(
    (total, [key, weight]) => total + normalized[key] * weight,
    0,
  );

  return {
    overall: Math.round(overall),
    ...normalized,
  };
}
