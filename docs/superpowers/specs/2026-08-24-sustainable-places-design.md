# Sustainable Places Research Workspace Design

## Purpose

The Sustainable Places workspace helps real estate developers and infrastructure investors identify and compare globally viable live-work-play sites.
The United States receives the deepest initial coverage while every data adapter reports its geographic coverage explicitly.
The workspace supports climate-resilient housing, mixed-use districts, renewable microgrids, small-scale data centers, geothermal district energy, and hybrid renewable plus long-duration storage developments.

## Product Surface

The workspace is a dedicated `/places` page linked from the primary navigation and previewed on the homepage.
It uses a dark operational map inspired by high-density geospatial intelligence products without copying proprietary branding or interface assets.

The desktop layout has four persistent regions:

1. A left rail for ranked candidates, development archetypes, map layers, and source status.
2. A central OpenStreetMap-derived basemap for search, map selection, and data overlays.
3. A right rail for site evidence, TEA results, assumptions, uncertainty, and metric definitions.
4. A bottom provenance strip for observation time, forecast horizon, model vintage, and source health.

Mobile devices use the same information hierarchy in collapsible sheets rather than shrinking all four regions into unreadable columns.

## Prototype Scope

The rough version proves the interaction model and the calculation boundary.
It includes ranked example sites, coordinate search, click-to-evaluate selection, editable archetypes, visual resource layers, transparent TEA metrics, and source provenance.
It requests global climate normals from NASA POWER, a seven-day forecast from Open-Meteo, and solar production estimates from NREL PVWatts when those services are reachable.
It falls back to clearly labeled demonstration values when a browser request is unavailable or rate-limited.

Average energy price, state incentives, geothermal, hydropower, wind, grid, hazard, parcel, and zoning inputs are represented by adapter-ready source records in this first slice.
They must never be labeled live unless a successful request supplied the displayed value.

## Data Model

Every displayed signal uses a common evidence shape:

```ts
interface EvidenceValue {
  key: string;
  label: string;
  value: number | string | null;
  unit: string;
  source: string;
  sourceUrl: string;
  observedAt: string | null;
  coverage: 'global' | 'us' | 'state' | 'local';
  status: 'live' | 'modeled' | 'cached' | 'unavailable';
  confidence: 'high' | 'medium' | 'low';
}
```

Live adapters normalize upstream responses into this shape.
The UI renders status, recency, confidence, and a source link next to each value.

## TEA Model

The first model calculates net present value, internal rate of return, simple payback, undiscounted return on investment, levelized energy cost, and a risk-adjusted site score.
Inputs include capital expenditure, annual revenue or savings, operating expenditure, incentives, project life, discount rate, salvage value, energy price, and resource performance.
All assumptions are editable and all units are visible.

The TEA panel separates three categories:

- Financial outputs derived from user assumptions and normalized evidence.
- Site suitability scores derived from energy, infrastructure, climate, and policy evidence.
- Confidence based on evidence coverage, recency, and source status.

The interface describes outputs as screening estimates rather than investment advice.

## Source Strategy

The prototype uses or catalogs the following authoritative sources:

- OpenStreetMap-derived vector tiles for the basemap and geographic context.
- NASA POWER for global solar and meteorological climatology.
- Open-Meteo for the near-term weather forecast.
- NREL PVWatts for photovoltaic production estimates.
- NREL REopt for later server-side distributed-energy optimization.
- NREL NSRDB, WIND Toolkit, reV, Geothermal Data Repository, dGeo, and hydropower datasets for deeper US resource layers.
- EIA for US state and sector electricity prices.
- DSIRE and official federal or state publications for incentive policy.
- FEMA, NOAA, USGS, EPA, and state GIS programs for hazard and environmental constraints.

The production backend will own credentials, caching, retries, quotas, source snapshots, and geospatial preprocessing.
The browser will consume normalized, versioned responses rather than call every upstream system directly.

## Accessibility and Trust

All controls have visible labels, keyboard focus, and minimum touch targets.
Metric definitions are available through concise inline help and an expanded calculation explanation.
Color is never the only indicator of suitability, source status, or risk.
Reduced-motion preferences disable nonessential map and panel transitions.

## Validation

Pure financial functions receive unit tests with hand-derived expected values.
The Astro build test verifies that the route and navigation render in production output.
The local browser check verifies desktop and mobile layout, layer toggles, site selection, archetype switching, search, metric definitions, and fallback behavior.
