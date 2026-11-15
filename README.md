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
bun run typecheck    # tsc over packages/ and the CLI (CI)
bun run build        # static site + Pagefind
bun test             # all tests
bun run sync:d1      # refresh registry JSON from markdown
bun run eval -- --help   # run a benchmark against a local model
```

## Coding agents

`bun run agent:setup` prepares the host (Node 24, Bun, both sites' dependencies). `bun run agent:verify` is the acceptance gate: CI's validate/typecheck/build/test commands for the hub, plus the sustainability site's `npm test`, `astro check` and build, which CI does not run. `AGENTS.md` is the repo card models receive. For agents on a locally hosted LLM see [docs/agents/local-llm.md](docs/agents/local-llm.md).

## API worker

See [apps/api/README.md](apps/api/README.md). Deploy to Cloudflare Workers (free tier: 100k req/day).

## Submit content

- Web form: `/submit` on the site
- CLI: `bun run publish:cli -- new-model my-slug`
- Git PR: add markdown under `apps/web/src/content/`
- Evaluation results: one JSON file per run under `apps/web/src/content/evals/` (see CONTRIBUTING)
- Evaluation results without git: paste the result file into the `Submit an evaluation result` issue form (see CONTRIBUTING)

## Cost

Static site on GitHub Pages: **$0**. Evaluations follow the same rule: leaderboards and the data feed (`/data/evals.json`) are static files, runs happen on contributors' hardware, and raw output is referenced by hash instead of stored. Cloudflare Worker + D1 free tiers cover registry API until ~100k requests/day.

The Sustainable Places app lives in [`sites/sustainability/`](sites/sustainability/README.md), a standalone npm/Astro project staged for its own repo and `sustainability.unite4ai.com`; it is not part of the Bun workspace.
