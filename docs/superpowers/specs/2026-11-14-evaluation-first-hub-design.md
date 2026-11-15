# Evaluation-First Hub Design

## Objective

Unite4AI is an open alternative to Hugging Face whose centre is **model evaluation** (in the spirit of Artificial Analysis: comparable numbers for quality, speed and resource use) and **full use of a diverse range of local models** (any runtime, format, quantization and hardware a contributor has).

Hard constraint: **the site should stay free of additional running costs.** Every design choice below is checked against it.

This supersedes `2026-11-14-ai-security-sites-design.md` (branch `ai-security-sites`, never built). Security and sustainability become **evaluation categories** in the hub, not separate sites. The Sustainable Places app stays where it is as a side project.

## Where the repo stands

| Objective | Today | Gap |
|---|---|---|
| Hugging Face alternative | Registry, openness score, checksum verification, CLI, school | 1 model, 1 dataset |
| Model evaluation | `openness.evaluation` grade; optional `eval_bundle` (URL + sha256) | No scores, benchmarks, or comparison pages |
| Local models | `inference.protocol` enum; 3-entry compute catalog | Nothing runs a model; no record of formats, quantizations, hardware |

## Cost review

What is free today and must stay that way (limits verified 2026-11-14):

| Service | Free allowance | What would start costing |
|---|---|---|
| GitHub Pages ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)) | Published site ≤ 1 GB; soft 100 GB/month bandwidth; source repo recommended ≤ 1 GB | Nothing is billed; GitHub asks you to move. Not allowed for commercial SaaS. |
| GitHub Actions ([billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) | Standard runners free in **public** repos | Larger runners (billed even in public repos); making the repo private |
| Git files ([limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)) | Files < 100 MiB; release assets have no total size or bandwidth limit | Git LFS beyond its quota |
| Cloudflare Workers / D1 ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | 100,000 requests/day, 10 ms CPU; D1 5 GB, 5 M rows read/day | Workers Paid is $5/month minimum |
| Cloudflare R2 ([pricing](https://developers.cloudflare.com/r2/pricing/)) | 10 GB-month, 1 M writes, 10 M reads | **Billed beyond the free tier** (10 M reads/day ≈ $104/month in Cloudflare's own example) |

Current footprint: built site 1.1 MB, repository 2.2 MB. No Worker is deployed; the D1 sync step in `sync-d1.yml` is off unless `CF_D1_SYNC_ENABLED` is set.

### Cost rules (enforced, not aspirational)

1. **Static only.** Evaluation data, leaderboards and the public data feed are files built by Astro. No piece of this roadmap needs a server. Workers, D1 and R2 stay undeployed; the registry API remains optional and is not a dependency of any page.
2. **No R2, no Workers Paid, no KV, no Git LFS, no larger runners.** R2 is the one free tier here that turns into a bill on overage.
3. **Results are small; raw output is not hosted.** A result file is ≤ 16 KB (validator error above that). Raw transcripts stay with the submitter; the result carries their `sha256` and an optional HTTPS link. This is the existing "index, don't host" rule applied to evaluations.
4. **Benchmark data is not rehosted** unless it is ≤ 1 MB and openly licensed. Otherwise the runner fetches it from its source, pinned by `sha256`.
5. **Deterministic scoring only.** Exact match, multiple choice, canary-string detection, and measured quantities. No hosted LLM judge, because that is a per-run API bill. A *local* judge model is allowed later.
6. **CI never runs a model.** It validates schema, cross-references, sizes and hashes' format. Runs happen on contributors' hardware.
7. **The repository stays public.** Private would end free Pages and free Actions.
8. **Size guard.** A test fails when `apps/web/dist` exceeds 250 MB, a quarter of the Pages limit.

### What the constraint rules out

Hosted inference, a hosted "try this model" playground, running submitted evaluations on project infrastructure, hosting weights, and judge-scored benchmarks via paid APIs. All evaluation is **community-run and community-reproduced**.

### Costs that exist regardless

The `unite4ai.com` domain registration (already held; subdomains are free). Contributors' own hardware and electricity.

### If traffic outgrows Pages

The 100 GB/month limit is soft. The zero-cost exits are a free CDN in front of Pages or moving static hosting to Cloudflare, where static asset requests are free and unlimited. Neither changes the design, because everything is static files.

## Roadmap

Each piece is its own spec → plan → PR. This document specifies **piece 1** in detail.

| # | Piece | Outcome | Running cost |
|---|---|---|---|
| 0 | Rename `sites/ai-sustainability` → `sites/sustainability` | Directory name without the `ai-` prefix; tooling paths follow | None |
| 1 | **Evaluation data model and leaderboards** | Results are data in git; leaderboards and model pages render them | None (static) |
| 2 | Local evaluation runner (`unite4ai eval`) | Any OpenAI-compatible local endpoint (mlx-lm, Ollama, llama.cpp, vLLM) → a result file ready to submit; first benchmark suite; model cards for the models evaluated; first real results | None (runs on contributor hardware) |
| 3 | Local-run matrix | Per model: formats, quantizations, hardware needs, measured speed | None (derived from results) |
| 4 | Security and efficiency suites | Prompt-injection canary tests; tokens/s, memory, energy per token | None |

## Piece 1: evaluation data model and leaderboards

### Data

Two new collections in `apps/web/src/content/`, with schemas in `@unite4ai/schema`.

**`benchmarks/<id>.md`** (prose body describes method and known weaknesses):

```ts
{
  name: string;
  summary: string;                       // ≤ 300 chars
  category: 'quality' | 'security' | 'efficiency';
  version: string;                       // bump when items or scoring change
  metric: { name: string; unit: string; higher_is_better: boolean; min?: number; max?: number };
  scoring: 'exact-match' | 'multiple-choice' | 'canary' | 'measured';   // rule 5
  items: number;                         // item count, 0 for 'measured'
  source_url: string;                    // https
  source_sha256?: string;                // pin for fetched data (rule 4)
  license: OpenLicense;                  // same allowlist as models
  updated: Date;
}
```

**`evals/<model>--<benchmark>--<submitter>--<YYYY-MM-DD>--<first 8 hex of evidence.sha256>.json`** (one run):

```ts
{
  schema_version: 1;
  model: string;                         // id of a model card
  benchmark: string;                     // id of a benchmark
  benchmark_version: string;
  score: number;
  n: number;                             // items actually evaluated
  run: { date: string; submitter: string; harness: { name: string; version: string }; command: string };
  setup: {
    runtime: 'mlx-lm' | 'ollama' | 'llama.cpp' | 'vllm' | 'transformers' | 'other';
    runtime_version: string;
    format: 'mlx' | 'gguf' | 'safetensors' | 'other';
    quantization: string;                // "4bit-DWQ", "Q4_K_M", "none"
    hardware: { device: string; accelerator: 'apple-silicon' | 'nvidia' | 'amd' | 'cpu' | 'other'; memory_gb: number };
  };
  perf?: { tokens_per_second?: number; time_to_first_token_ms?: number; peak_memory_gb?: number; energy_wh_per_1k_tokens?: number };
  evidence: { sha256: string; url?: string; bytes?: number };   // rule 3
}
```

### Validation (extends `validateContent`, runs in CI)

Tightened after the first review of the implementation (2026-11-14); the repository is the source of truth for exact messages.

- **Flat directories.** `evals/` and `benchmarks/` hold files only. A subfolder, link or stray file is an error (`.gitkeep` and `.DS_Store` are ignored), and the site's loaders read the same flat set, so nothing can be loaded without being validated.
- **One id grammar.** Model and benchmark ids are lowercase, digits and single hyphens (`my-model-7b`). A model card referenced by a result may not override its id with `slug`. Validator ids therefore equal the site's ids.
- **Strict shape.** JSON parses and matches the schema with no unknown keys; file ≤ 16 KB. Free-text fields are single-line and bounded.
- **References.** `model` and `benchmark` exist. A result for a benchmark version other than the current one stays valid with a warning, and is shown only on the benchmark page under "previous versions".
- **Score and size.** `score` lies within the benchmark's `min`/`max` when set. For the current version, `n` must equal `items` (full runs only) unless the benchmark is `measured`.
- **Identity.** `run.submitter` is a lowercase GitHub handle. The filename's parts equal the file's `model`, `benchmark`, `run.submitter`, `run.date` and evidence prefix. Two files may not share an `evidence.sha256`.
- **Dates.** `run.date` is a real date and not later than tomorrow (UTC).
- **Evidence.** `evidence.sha256` is 64 hex chars; `evidence.url`, if present, is HTTPS.
- **Benchmarks.** Licence on the allowlist; `scoring` is one of the four deterministic kinds; `source_url` is HTTPS; `min ≤ max`; `items` > 0 except for `measured` benchmarks, which have 0.
- **Build.** The site build fails when a result references a model or benchmark that the site does not have.

### Aggregation (`packages/core/src/evals.ts`, pure functions)

Runs are grouped by **model + benchmark + benchmark_version + format + quantization**. A group reports the median score, the min–max range, the run count, and `submitters` (distinct handles). A group with one submitter is labelled **not yet reproduced**; with more, **reproduced by N** (N counts the other submitters). Results are self-reported, so the page says so, and reproduction count is the trust signal. No tolerance heuristics in this piece: the range is shown as is.

### Pages

- **`/evals`**: one leaderboard per benchmark (current version only), grouped by category, each sorted by the metric's direction. Columns: model, score (median, range), setup (runtime, format, quantization, accelerator), speed when present, reproduction badge. Client-side filter by category, runtime and accelerator, in vanilla JS like `/registry`.
- **`/evals/[benchmark]`**: the benchmark's method, weaknesses, licence, source, and the full table including every individual run with its reproduce command and evidence hash.
- **Model page** (`/registry/models/[id]`): an "Evaluations" section listing that model's groups by benchmark, and a "Runs locally on" list of distinct setups seen in its results.
- **`/data/evals.json`**: the aggregated groups as a static file from an Astro endpoint, built at deploy, not committed. This is the public data feed.
- **Navigation**: "Evals" is added after "Registry". The home page stats gain an evaluations count.

Empty states are real states: until piece 2 produces results, `/evals` explains how results arrive and lists the benchmarks defined so far.

### What ships as content

One benchmark definition whose facts can be verified from its source at implementation time, so the pages and validator have a real entry. **No evaluation results ship in this piece**: there is no runner yet, and invented scores would poison the one thing the product is for. Tests use fixtures under the test directory.

### Tests

- Schema and validator: each rule above has a failing fixture and a passing one (oversize file, unknown model, score out of range, filename mismatch, future date, non-deterministic scoring kind).
- Aggregation: grouping key, median and range, single-run versus reproduced, sort direction for `higher_is_better: false`.
- Build: `/evals` and `/data/evals.json` are emitted; the size guard (rule 8).

### Out of scope for piece 1

The runner, model cards for local LLMs, a side-by-side compare page, any API route, any hosted component, and changes to `sites/*`.

## Risks

- **Self-reported numbers can be wrong or gamed.** Mitigation is structural: reproduce command, evidence hash, and reproduction count on every row. Piece 2 makes reproducing a one-command job.
- **The model registry is nearly empty.** Leaderboards need model cards; piece 2 adds cards for the models it evaluates, with licence facts checked against each model's source.
- **Repo growth.** At 16 KB per result, 10,000 results are ≤ 160 MB of JSON in the repo and well under that in the built feed. Past that, results move to a second public repository consumed at build time; still free.
