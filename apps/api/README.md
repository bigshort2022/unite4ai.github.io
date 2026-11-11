# Unite4AI API (Cloudflare Worker)

Hono + TypeScript edge API for registry search and verification metadata.

## Endpoints

| Route | Description |
|-------|-------------|
| `GET /api/v1/models` | List models (`?q=`, `?domain=`, `?min_openness=`) |
| `GET /api/v1/models/:id` | Model detail |
| `GET /api/v1/datasets` | List datasets |
| `GET /api/v1/datasets/:id` | Dataset detail |
| `GET /api/v1/search?q=` | Search models + datasets |
| `POST /api/v1/verify/sha256` | Verify command metadata |

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
4. Deploy: `bun run deploy`
5. Route worker to `https://unite4ai.com/api/*`

Without D1 configured, the worker serves registry data from the bundled `registry-snapshot.json` (regenerated on each `sync:d1` run).

## Cost

Free tier: 100k requests/day on Cloudflare Workers.
