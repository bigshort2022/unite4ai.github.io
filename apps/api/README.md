# Unite4AI API (Cloudflare Worker)

Hono + TypeScript edge API for registry search, evidence feeds, and verification metadata.

## Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/v1/models` | List models (`?q=`, `?domain=`, `?min_openness=`) |
| `GET /api/v1/models/:id` | Model detail |
| `GET /api/v1/datasets` | List datasets |
| `GET /api/v1/datasets/:id` | Dataset detail |
| `GET /api/v1/search?q=` | Search models + datasets |
| `POST /api/v1/verify/sha256` | Verify command metadata |
| `GET /api/evidence?lat=&lng=` | Sustainable Places evidence |
| `GET /api/geocode?q=` | Geocoding proxy |

## Local development

```bash
cd apps/api
bun run sync:d1          # refresh registry snapshot from markdown content
bun run dev              # wrangler dev
```

## Deploy

1. Create a D1 database: `wrangler d1 create unite4ai-registry`
2. Update `database_id` in `wrangler.toml`
3. Apply migrations: `wrangler d1 migrations apply unite4ai-registry --remote`
4. Set secret: `wrangler secret put NREL_API_KEY`
5. Deploy: `bun run deploy`
6. Route worker to `https://unite4ai.com/api/*` or set `PUBLIC_API_BASE` on the static site build

Without D1 configured, the worker serves registry data from the bundled `registry-snapshot.json` (regenerated on each `sync:d1` run).

## Cost

Free tier: 100k requests/day on Cloudflare Workers. Upgrade to Workers Paid ($5/mo) if evidence API hits the 10ms CPU limit.
