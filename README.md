# Unite4AI

Open-source AI education platform and federated model registry — a trust-first alternative to centralized hubs.

## Monorepo layout

```
apps/web/       Astro static site (unite4ai.com)
apps/api/       Hono TypeScript Cloudflare Worker (registry API)
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

## Coding agents

`bun run agent:setup` prepares the host (Node 24, Bun, both sites' dependencies). `bun run agent:verify` is the acceptance gate: CI's validate/build/test commands for the hub, plus the sustainability site's `npm test`, `astro check` and build, which CI does not run. `AGENTS.md` is the repo card models receive. For agents on a locally hosted LLM see [docs/agents/local-llm.md](docs/agents/local-llm.md).

## API worker

See [apps/api/README.md](apps/api/README.md). Deploy to Cloudflare Workers (free tier: 100k req/day).

## Submit content

- Web form: `/submit` on the site
- CLI: `bun run publish:cli -- new-model my-slug`
- Git PR: add markdown under `apps/web/src/content/`

## Cost

Static site on GitHub Pages: **$0**. Cloudflare Worker + D1 free tiers cover registry API until ~100k requests/day.

The Sustainable Places app lives in [`sites/ai-sustainability/`](sites/ai-sustainability/README.md), a standalone npm/Astro project staged for its own repo and `sustainability.unite4ai.com`; it is not part of the Bun workspace.
