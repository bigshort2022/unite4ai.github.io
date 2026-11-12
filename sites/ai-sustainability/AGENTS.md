# Sustainable Places — agent card

Astro site for sustainability.unite4ai.com. npm + Node 24, **not** Bun. Run commands in this directory.

- `npm ci` · `npm test` (node:test) · `npx astro check` · `npm run build` (→ `dist/`) · `npm run dev` (port 4321)
- Page: `src/pages/index.astro`. Client: `src/lib/sustainable-places/places-client.mjs` (lazy MapLibre; worker via `?worker&url` + `setWorkerUrl`).
- Feeds: `evidence-service.mjs` (NASA POWER, Open-Meteo, PVWatts), `feeds.mjs` (edge API first, upstream fallback), `evidence-cache.mjs` (memory + sessionStorage, 15 min).
- Deterministic: `tea.mjs`, `catalog.mjs`, `demo-sites.mjs` (tests in `test/`).
- Optional worker: `workers/evidence-api/` (`/api/evidence`, `/api/geocode`). `PUBLIC_API_BASE` adds its origin to the `src/layouts/Base.astro` CSP.
- Rules: label data live/modeled/cached/unavailable truthfully; add any new host to the CSP; never hand-edit `package-lock.json`.
- Gate: `node ../../scripts/agent/verify.mjs --only sustain`.
