# Sustainable Places Research Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a rough but functional geospatial workspace for evaluating sustainable real estate development opportunities and transparent TEA outputs.

**Architecture:** Keep the Astro site static for this prototype, isolate deterministic TEA logic in framework-independent modules, and use browser-side source adapters for safe public feeds.
The map page consumes normalized evidence and can later switch to a serverless data service without changing its information architecture.

**Tech Stack:** Astro 7, vanilla TypeScript-compatible JavaScript, MapLibre GL JS 6, Node test runner, OpenStreetMap-derived vector tiles, NASA POWER, Open-Meteo, and NREL PVWatts.

**Spec:** `docs/superpowers/specs/2026-08-24-sustainable-places-design.md`

## Global Constraints

The prototype must label live, modeled, cached, and unavailable values accurately.
It must support global map navigation with the deepest initial examples and source coverage in the United States.
It must remain compatible with the repository's Node 24 and GitHub Pages build.
It must not expose private API credentials.
It must provide keyboard focus, mobile layouts, reduced-motion behavior, source provenance, and plain-language definitions.

---

### Task 1: Tested TEA and site-scoring core

**Files:**

- Create: `test/sustainable-places-tea.test.mjs`
- Create: `src/lib/sustainable-places/tea.mjs`
- Create: `src/lib/sustainable-places/catalog.mjs`

**Interfaces:**

- Produces: `calculateTea(input)`, `scoreSite(input)`, `ARCHETYPES`, `METRIC_DEFINITIONS`, and `SOURCE_CATALOG`.

- [ ] **Step 1: Write failing tests for discounted cash flow, no-payback handling, and bounded site scores.**

```js
assert.equal(Math.round(calculateTea(fixture).npv), 118630);
assert.equal(calculateTea({ ...fixture, annualRevenue: 0 }).paybackYears, null);
assert.equal(scoreSite(scoreFixture).overall, 74);
```

- [ ] **Step 2: Run the test and confirm it fails because the module is absent.**

Run: `node --test test/sustainable-places-tea.test.mjs`

- [ ] **Step 3: Implement the minimal deterministic calculations and catalogs.**

```js
export function calculateTea(input) {
  const initialInvestment = input.capex - input.incentives;
  const annualNetCashFlow = input.annualRevenue - input.annualOpex;
  const npv = discountedCashFlows(initialInvestment, annualNetCashFlow, input);
  return { initialInvestment, annualNetCashFlow, npv, irr: solveIrr(input), paybackYears: simplePayback(initialInvestment, annualNetCashFlow) };
}
```

- [ ] **Step 4: Run the focused test and confirm it passes.**

Run: `node --test test/sustainable-places-tea.test.mjs`

### Task 2: Production route contract

**Files:**

- Create: `test/sustainable-places-page.test.mjs`
- Modify: `src/layouts/Base.astro`
- Modify: `src/pages/index.astro`
- Create: `src/pages/places.astro`
- Create: `src/styles/places.css`

**Interfaces:**

- Consumes: TEA exports and catalog exports from Task 1.
- Produces: `/places`, the primary navigation entry, and the homepage preview.

- [ ] **Step 1: Write a failing production-build test for the route and navigation.**

```js
assert.match(placesHtml, /Sustainable Places/);
assert.match(homeHtml, /Explore sustainable places/);
assert.match(placesHtml, /Site evidence/);
```

- [ ] **Step 2: Run the focused test and confirm it fails because `/places` does not exist.**

Run: `node --test test/sustainable-places-page.test.mjs`

- [ ] **Step 3: Add the route shell, navigation entry, homepage preview, and scoped responsive stylesheet.**

```astro
<Base title="Sustainable Places">
  <section class="places-shell" aria-label="Sustainable site intelligence workspace">
    <aside class="places-rail">...</aside>
    <div id="places-map" aria-label="Interactive site intelligence map"></div>
    <aside class="tea-panel">...</aside>
  </section>
</Base>
```

- [ ] **Step 4: Run the focused page test and confirm it passes.**

Run: `node --test test/sustainable-places-page.test.mjs`

### Task 3: Interactive map, overlays, and site selection

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/sustainable-places/demo-sites.mjs`
- Modify: `src/pages/places.astro`
- Modify: `src/styles/places.css`

**Interfaces:**

- Consumes: `DEMO_SITES` GeoJSON and layer metadata.
- Produces: MapLibre map initialization, candidate selection, overlay controls, coordinate search, and map click evaluation.

- [ ] **Step 1: Install MapLibre GL JS using the repository package manager.**

Run: `npm install maplibre-gl@6.6.0`

- [ ] **Step 2: Add deterministic GeoJSON candidates and resource or risk layers.**

```js
export const DEMO_SITES = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { id: 'reno-tahoe', name: 'Reno-Tahoe Opportunity Zone' }, geometry: { type: 'Point', coordinates: [-119.8138, 39.5296] } }],
};
```

- [ ] **Step 3: Initialize the map and connect candidate, layer, search, and click events.**

```js
const map = new maplibregl.Map({ container: 'places-map', style: BASEMAP_STYLE, center: [-98.5, 39.5], zoom: 3.2 });
map.on('click', (event) => evaluateLocation(event.lngLat.lat, event.lngLat.lng));
```

- [ ] **Step 4: Run the focused module and page tests.**

Run: `node --test test/sustainable-places-tea.test.mjs test/sustainable-places-page.test.mjs`

### Task 4: Live evidence adapters and transparent fallbacks

**Files:**

- Create: `src/lib/sustainable-places/feeds.mjs`
- Modify: `src/pages/places.astro`
- Modify: `src/layouts/Base.astro`
- Modify: `src/styles/places.css`

**Interfaces:**

- Produces: `fetchLocationEvidence({ latitude, longitude })` returning normalized evidence records and per-source health.

- [ ] **Step 1: Write failing tests for NASA POWER, Open-Meteo, and PVWatts response normalization.**

```js
assert.deepEqual(normalizePower(powerFixture)[0], { key: 'solar', value: 5.82, unit: 'kWh/m²/day', status: 'live', source: 'NASA POWER' });
```

- [ ] **Step 2: Run tests and confirm missing normalizers are the reason for failure.**

Run: `node --test test/sustainable-places-feeds.test.mjs`

- [ ] **Step 3: Implement timeout-aware adapters and return cached demonstration evidence on individual source failures.**

```js
const results = await Promise.allSettled([fetchPower(point), fetchForecast(point), fetchPvWatts(point)]);
return mergeEvidence(results, fallbackEvidence(point));
```

- [ ] **Step 4: Expand the content security policy only for the selected tile and public data origins.**

```html
connect-src 'self' https://api.github.com https://tiles.openfreemap.org https://power.larc.nasa.gov https://api.open-meteo.com https://developer.nrel.gov;
```

- [ ] **Step 5: Run the complete test suite.**

Run: `npm test`

### Task 5: Browser validation and completion evidence

**Files:**

- Modify when validation finds a user-visible defect: `src/pages/places.astro`, `src/styles/places.css`, or a focused module and its regression test.

**Interfaces:**

- Verifies the complete user-visible slice.

- [ ] **Step 1: Start the Astro development server and open `/places`.**

Run: `npm run dev`

- [ ] **Step 2: Verify desktop and mobile layouts, layer toggles, site selection, coordinate search, archetype switching, definitions, map attribution, and source fallback labels.**

- [ ] **Step 3: Run fresh build, diagnostics, validation, tests, and repository-state checks.**

Run: `npm run build`

Run: `npm run check`

Run: `npm run validate`

Run: `npm test`

Run: `git diff --check`

Run: `git status --short`

Run: `git stash list`
