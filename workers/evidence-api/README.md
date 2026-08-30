# Unite4AI Evidence API Worker

Edge proxy for Sustainable Places evidence and geocoding feeds.

## Deploy

```bash
cd workers/evidence-api
npm install -g wrangler   # or use npx
wrangler secret put NREL_API_KEY
wrangler deploy
```

Route the worker to `/api/*` on your domain, then set `PUBLIC_API_BASE` when building the Astro site (empty string uses same-origin `/api` paths).

## Endpoints

- `GET /api/evidence?lat=&lng=` — cached NASA POWER, Open-Meteo, NREL PVWatts
- `GET /api/geocode?q=` — cached Nominatim geocoding with proper User-Agent

## Cache TTLs

| Feed | TTL |
|------|-----|
| NASA POWER climatology | 24h |
| Open-Meteo forecast | 15m |
| NREL PVWatts | 7d |
| Geocode | 7d |
