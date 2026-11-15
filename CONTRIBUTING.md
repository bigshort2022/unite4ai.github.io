# Contributing to Unite4AI

Contribution is membership here. Your first merged pull request makes you a Contributor —
there is no separate signup.

## Three ways in

**1. A web form (no git).** Open an [issue form](../../issues/new/choose), fill in the fields,
submit. A maintainer converts it into a pull request. Most contributions arrive this way.

**2. Browser editing.** Every page has a "Suggest an edit" link. GitHub forks the repo and opens
a pull request when you save.

**3. Clone and PR.**

```bash
git clone https://github.com/<you>/unite4ai.git
cd unite4ai && bun install
git checkout -b my-contribution

# add or edit a file under apps/web/src/content/
bun run validate && bun run build

git commit -am "Add <thing>" && git push origin my-contribution
```

## Local development

Search requires a built Pagefind index. After your first clone:

```bash
bun run build && bun run preview   # full site including search
bun run dev                        # fast iteration; /search needs build first
```

Scaffold a new model card:

```bash
bun run new:model my-model-slug
```

Verify artifact checksums (optional, requires network):

```bash
bun run verify-artifacts
```

Using a coding agent (hosted or local LLM)? Run `bun run agent:setup` once and point it at `AGENTS.md`. `bun run agent:verify` runs CI's validate/build/test commands for the hub, plus the sustainability site's `npm test`, `astro check` and build, which CI does not run; its last line is a JSON verdict. Details in [docs/agents/local-llm.md](docs/agents/local-llm.md).

## Submitting an evaluation result

Evaluation results are data in this repository. One run is one JSON file directly in
`apps/web/src/content/evals/`, named
`<model>--<benchmark>--<your-github-handle>--<YYYY-MM-DD>--<first 8 characters of evidence.sha256>.json`
(handle in lowercase).

- The model must already have a card in `apps/web/src/content/models/`, and the benchmark a
  definition in `apps/web/src/content/benchmarks/`.
- Run it on your own hardware and report the setup honestly: runtime, format, quantization, device.
- Keep the raw output yourself. The result file carries only its `sha256` (and, if you host
  it, an HTTPS link). Files over 16 KB are rejected.
- Include the exact command, so someone else can reproduce the run. A result that others have
  reproduced is shown as such; a lone result is shown as not yet reproduced.
- Reproducing someone else's result is as valuable as a new one: submit your own file for the
  same model, benchmark, format and quantization.

`bun run validate` checks the file the same way CI does.

Adding a benchmark is a pull request with one markdown file in `apps/web/src/content/benchmarks/`.
Scoring must be deterministic (exact match, multiple choice, canary detection, or a measured
quantity), the data must be openly licensed, and the page must state the benchmark's weaknesses.
When the method changes, raise `version` and add the old one to `previous_versions`: results for
a listed previous version are kept but leave the leaderboard, and any other version is rejected.

## What gets checked

Every pull request runs the same gate:

1. **Schemas** — required fields present and well-formed
2. **License allowlist** — restrictive "open" licenses are rejected with an explanation
3. **Checksums** — `sha256` values must be valid 64-character hex digests
4. **Evaluations** — a result file matches the schema with no unknown keys; references a real model and benchmark, and the benchmark's current version or a listed previous one; is a full run (`n` equals the benchmark's item count); has a filename ending in the first 8 hex characters of its evidence hash; shares that hash with no other file for the same benchmark; stays under 16 KB; and has a score within the benchmark's range. Model cards must not set `slug`
5. **Build** — the site must build cleanly with your change

A red check is information, not judgment. The message names the file and the field.

## Content standards

- **Honesty over polish.** "Training data unknown" is a respected answer. A vague claim of openness is not.
- **Every model card needs a limitations section.** Cards without one read as marketing.
- **Every dataset card needs consent basis, PII review status, and named bias gaps.** The schema enforces this.
- **Cite sources.** Link the paper, the license file, the repository.

## Review

Target: a first response within 48 hours. We publish the real median, including when it's bad.

Reviewers will ask questions — about training data, about license claims, about who is missing
from the evaluation set. That scrutiny is the product.

## Licensing your contribution

Content under CC BY 4.0, code under Apache-2.0. By opening a pull request you agree to these.

## First time?

Say so in your pull request. A maintainer will walk you through it. Everyone here had a first one.
