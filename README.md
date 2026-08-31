# Unite4AI

Open-source AI education platform and federated model registry — a trust-first alternative to centralized hubs.

## Monorepo layout

```
apps/web/       Astro static site (unite4ai.com)
apps/api/       Hono TypeScript Cloudflare Worker (registry + evidence API)
apps/cli/       unite4ai publish CLI
packages/schema Zod content schemas
packages/core   Openness score, stack layers, validation
```

## Quick start

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun install
bun run dev          # Astro dev server
bun run validate     # content gate (CI)
bun run build        # static site + Pagefind
bun test             # all tests
bun run sync:d1      # refresh registry JSON from markdown
```

## API worker

See [apps/api/README.md](apps/api/README.md). Deploy to Cloudflare Workers (free tier: 100k req/day). Set `PUBLIC_API_BASE` in GitHub Actions variables when the worker is live.

## Submit content

- Web form: `/submit` on the site
- CLI: `bun run publish:cli -- new-model my-slug`
- Git PR: add markdown under `apps/web/src/content/`

## Cost

Static site on GitHub Pages: **$0**. Cloudflare Worker + D1 free tiers cover registry API until ~100k requests/day. Optional Workers Paid (~$5/mo) if evidence API hits CPU limits.
