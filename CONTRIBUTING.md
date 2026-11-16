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

Using a coding agent (hosted or local LLM)? Run `bun run agent:setup` once and point it at `AGENTS.md`. `bun run agent:verify` runs CI's validate/typecheck/build/test commands for the hub, plus the sustainability site's `npm test`, `astro check` and build, which CI does not run; its last line is a JSON verdict. Details in [docs/agents/local-llm.md](docs/agents/local-llm.md).

## Submitting an evaluation result

Evaluation results are data in this repository. One result is one JSON file directly in
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
- A speed only compares on the same machine with the same runtime. To reproduce a
  `decode-speed-gsm8k-200` row, copy its device, accelerator, memory and runtime exactly
  (`--device`, `--accelerator`, `--memory-gb`, `--runtime`); anything else is a new row.

The runner does the bookkeeping for you. Runnable benchmarks today: `gsm8k-200` (quality) and
`canary-injection-v1` (security). Point it at any OpenAI-compatible local server (mlx-lm,
Ollama, llama.cpp, vLLM):

```bash
bun run eval -- --benchmark gsm8k-200 --model <model-card-id> \
  --served-model <the id your server lists for the model it has loaded> \
  --submitter <your-github-handle> \
  --runtime mlx-lm --runtime-version 0.32.2 --format mlx --quantization 4bit \
  --base-url http://127.0.0.1:18082/v1
```

Always pass `--served-model` the id of the model the server has loaded: posting any other id
makes mlx-lm and Ollama swap models. The runner refuses an id the server does not list, but
that is a weak guard on mlx-lm and Ollama, because they also list models that are not loaded.
It sends one request at a time at temperature 0 and keeps a transcript in `.agent/evals/` so
an interrupted run resumes, on the same day or a later one. When every item is answered it
writes the result file into `apps/web/src/content/evals/` with the transcript's hash, dated
the day the run completed. A `gsm8k-200` run that measured decode speed also writes a second
file for `decode-speed-gsm8k-200`, with the same date and transcript hash. Submit the two
files together: a speed result is rejected without the result of the run it was measured on.
Keep the transcript: it is your evidence. Running a finished configuration again rewrites the
same files; move its transcript away to start a new run. If the model can think before it
answers, say with `--notes` whether thinking was enabled.

`gsm8k-200` is at version 2: a reply may use up to 2048 new tokens (`canary-injection-v1`
allows 512), and a reply that is cut off at that limit counts as wrong. The runner knows a
reply was cut off from the server's finish reason or its token count, so a server that reports
neither cannot run `gsm8k-200`: the run stops at the first such reply. A transcript of
version 1 is not continued: a version 2 run starts its own.

A 2048-token benchmark can take hours on a slow machine. One invocation runs for at most
14400 seconds (four hours); change that with `--max-seconds`. The limit is checked between
replies, so a run can overrun it by one reply timeout. The runner waits up to 600 seconds for
one reply; raise that with `--request-timeout <seconds>` (at least 1). A reply that does not
finish in time fails its item and the run stops without a result. Whichever limit stopped
the run, re-running the same command resumes it.

`bun run validate` checks the files the same way CI does. Results of a previous benchmark
version stay in the repository and are listed on the benchmark page, not on the leaderboard;
the check passes them with a warning.

Adding a benchmark is a pull request with one markdown file in `apps/web/src/content/benchmarks/`.
Scoring must be deterministic (exact match, multiple choice, canary detection, or a measured
quantity), the data must be openly licensed, and the page must state the benchmark's weaknesses.
A benchmark of a measured quantity names, in `measured_on`, the benchmark whose runs it is
measured on; its results are accepted only beside the result of that run, with the same
transcript hash. No other two results may share a hash.
When the method changes, raise `version` and add the old one to `previous_versions`: results for
a listed previous version are kept but leave the leaderboard, and any other version is rejected.
Raising a benchmark's version requires raising the version of every benchmark measured on it:
a current measured result needs a run of the current version.

## What gets checked

Every pull request runs the same gate:

1. **Schemas** — required fields present and well-formed
2. **License allowlist** — restrictive "open" licenses are rejected with an explanation
3. **Checksums** — `sha256` values must be valid 64-character hex digests
4. **Evaluations** — a result file matches the schema with no unknown keys; references a real model and benchmark, and the benchmark's current version or a listed previous one; is a full run (`n` equals the benchmark's item count); has a filename ending in the first 8 hex characters of its evidence hash; shares that hash with no other result, except that a measured result shares it with the run it was measured on; stays under 16 KB; and has a score within the benchmark's range. A result of a measured benchmark must score exactly its `perf.tokens_per_second` and sit beside the result of the run it was measured on: same model, run, setup, `n`, `perf` and evidence, and of the current version when the measured result is. Model cards must not set `slug`
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

Content under CC BY 4.0, code under MIT (see `LICENSE`). By opening a pull request you agree to these.

## First time?

Say so in your pull request. A maintainer will walk you through it. Everyone here had a first one.
