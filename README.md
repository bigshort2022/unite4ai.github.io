# Unite4AI

AI as a global public resource: an open model and dataset registry, a free school, and a community building in public. The homepage leads with the rotating OPEN wordmark. Top navigation groups Global Exchange under Exchange, Registry under Stack, and Experiments under Playground; their direct URLs remain unchanged. `/exchange` houses hypotheses, findings, review states and record pull request latency, while `/evals` provides detailed evaluation results.

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
bun run sync:d1      # refresh the bundled Worker registry snapshot
bun run eval -- --help   # run a benchmark against a local model
bun run exchange -- --help   # scaffold exchange records (docs/exchange/agent-guide.md)
```

To check site search locally, build first and then run `bun run preview`. Pagefind's index is generated during the build, not by `bun run dev`.

The chooser below the homepage hero links to the hands-on open model lesson, the data center policy guide (`/policy/data-centers`), and ways to contribute or meet the community. The same links are available with JavaScript disabled.

## Coding agents

`bun run agent:setup` prepares the host (Node 24, Bun, both sites' dependencies). `bun run agent:verify` is the acceptance gate: CI's validate/typecheck/build/test commands for the hub, plus the sustainability site's `npm test`, `astro check` and build, which CI does not run. `AGENTS.md` is the repo card models receive. For agents on a locally hosted LLM see [docs/agents/local-llm.md](docs/agents/local-llm.md).

## API worker

See [apps/api/README.md](apps/api/README.md). Deploy to Cloudflare Workers (free tier: 100k req/day).

The static site's [registry feed](https://unite4ai.com/data/registry-index.json) builds with the registry pages from the same Astro content collections. It updates on site publication, not on Worker snapshot refresh, and may be cached. Start at [`/llms.txt`](https://unite4ai.com/llms.txt) for the public feed contracts.

## Submit content

- Web form: `/submit` prepares an editable draft locally. Sign in separately to paste and post it as a public GitHub issue.
- CLI: `bun run publish:cli -- new-model my-slug`
- Git PR: add markdown under `apps/web/src/content/`
- School: [Learn about Sovereign AI](https://unite4ai.com/school/sovereign-ai/) offers four account-free exercises and optional source links; edit `apps/web/src/pages/school/sovereign-ai.astro`.
- News & Notes: add a Markdown post under `apps/web/src/content/posts/`; it appears in the newest-first `/blog/` archive and on `/community/`.
- Evaluation results: one JSON file per run under `apps/web/src/content/evals/` (see CONTRIBUTING)
- Evaluation results without git: paste the result file into the `Submit an evaluation result` issue form (see CONTRIBUTING)

## Cost

Static site on GitHub Pages: **$0**. Evaluations follow the same rule: leaderboards and the data feed (`/data/evals.json`) are static files, runs happen on contributors' hardware, and raw output is referenced by hash instead of stored. Cloudflare Worker + D1 free tiers cover registry API until ~100k requests/day.

The Sustainable Places app lives in [`sites/sustainability/`](sites/sustainability/README.md), a standalone npm/Astro project staged for its own repo and `sustainability.unite4ai.com`; it is not part of the Bun workspace.

## AI stack guides

`/stack` links Model Task Taxonomy, Observability, Targets, Model Layer, Actuation,
Quantization, Verification, Distributions, Distribution and the existing Governance page.
Topic content lives in `apps/web/src/lib/stack-topics.ts`; Astro prerenders one page per
record through `apps/web/src/pages/stack/[topic].astro`.

Targets describes execution environments. Distributions describes model/runtime bundles;
Distribution describes publishing and delivery channels. These guides do not redefine
registry schema enums or claim new measured results.

## Global Exchange

`/global-exchange` compares twenty documented compute, agent-service, payment and DeFi
projects. `/data/global-exchange.json` is the matching versioned, static agent-discovery
feed. Edit `apps/web/src/data/global-exchange.json` through a reviewed contribution with
current official sources; do not hand-edit build output or generated registry data.

Compute entries link to external buyer documentation and provider onboarding. Other
categories describe adjacent services or infrastructure, not guaranteed GPU inventory.
Unite4AI does not custody funds, execute purchases, dispatch jobs or arbitrate disputes.
External costs, credentials, eligibility and terms remain with the user and provider.

The commercial discovery directory is separate from the research exchange planned at `/exchange`.
Research provenance is in `reports/Global Exchange competitor landscape.md` and its
linked source notes.
