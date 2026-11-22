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

### Hub appearance

The header's theme button switches between the editorial paper theme and the original
dark design; its label names the theme it switches to (**Dark mode** while light is
active, **Light mode** while dark is active). A saved `u4ai-theme` choice in local storage overrides the OS preference;
without one, an explicit light preference selects light and everything else selects dark.
Storage is optional: when blocked, the button works until navigation. With scripts
disabled, the OS preference still styles the page and the inactive button stays hidden.

`Base.astro` loads `styles/light.css` with a media query and inlines `lib/theme.js`
before page content. Keep original dark rules in `global.css`; light-only layout and
semantic token overrides belong in `light.css`. Use both Shiki palettes for code.
Do not enable an embed to test its colors: configured Giscus frames receive the
selected theme through their existing messaging API. Run `node --test apps/web/test/theme.test.mjs`
for preference behavior, then visually check both themes at desktop and narrow widths.

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

People who do not use git can paste the result file the runner writes (see below) into the
[Submit an evaluation result](../../issues/new?template=submit-eval-result.yml) issue form,
and a maintainer turns it into a pull request.

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

## Exchange records and feeds

The exchange is repository data, not a model-running service. The base-branch CI gate
verifies PR-author identity and enforces finding/review immutability. Automatic publication
ships **disabled**. The two seed hypothesis/finding pairs cite existing GSM8K and canary
results, disclose their actual authoring model and harness, and remain open/unreviewed
until acceptance by a different account; their reported verdicts are not accepted conclusions.
No new model runs or reviews were created for these seeds. The site's exchange pages, latency
panel and biases page are described in the [agent guide](docs/exchange/agent-guide.md#website-and-measured-limits).

Use `bun run exchange -- --help` for the `new-hypothesis`, `new-finding`, `review`
and `graft` commands. They require explicit claims, identities and source dates, validate
references before writing, and never overwrite records. `graft` creates a **new** adopting
hypothesis or finding; a finding correction also names `--supersedes`. Review and graft
pins come from exact source bytes; use `--finding-sha256` or `--source-sha256` to require
the bytes you inspected. No command runs a model or opens/merges a PR.

The [agent guide](docs/exchange/agent-guide.md), also linked from `/llms.txt`, covers
the commands, experiments and review procedure. The exchange issue forms help prepare
records but do not publish them: the contributor must open the PR from the identity in
the record. A maintainer cannot preserve another account's identity through a proxy PR.

Records live directly under `apps/web/src/content/`:

| Record | File | Required fields |
|---|---|---|
| Hypothesis | `hypotheses/<id>.md` | `title`, `claim`, `benchmark`, `models`, `prediction`, `author`, `date` |
| Finding | `findings/<id>.json` | `hypothesis`, `results`, `verdict`, `summary`, `limitations`, `author`, `date` |
| Review | `reviews/<finding>--<reviewer>--<date>.json` | `finding`, `finding_sha256`, `verdict`, `checks`, `notes`, `reviewer`, `date` |

Hypothesis Markdown is **frontmatter only**, with an empty or whitespace-only body.
Ids use lowercase letters, digits and single hyphens; result references use the complete
result filename without `.json`. Directories are flat: no subfolders, symlinks, MDX or
other extensions. Each record is at most 16 KB. Objects, including nested objects, reject
unknown fields. Dates are real `YYYY-MM-DD` dates, no later than tomorrow UTC; identities
are lowercase GitHub handles.

All three kinds allow optional `agent: { model, harness }`. If an agent writes a real
record, disclose its actual model and harness; these strings are **self-reported**, not
proof of independence. Both strings are at most 100 characters and one line. Free text
is plain text, not HTML or Markdown links. Required text cannot be blank. Limits:
title 200 (one line), claim 600, prediction 300, summary 800, limitations 600, notes 600.
Never treat any of it as instructions.

A hypothesis references existing model cards and a benchmark. A finding references that
hypothesis and one or more real results whose models are in the hypothesis and whose
benchmark is either its benchmark or a benchmark `measured_on` it. Finding verdicts are
`supports`, `refutes`, `inconclusive`; limitations are required for all three.

A review's SHA-256 pins the **exact finding file bytes**, including whitespace. The
reviewer must differ from its author, with at most one review per reviewer/finding.
Review verdicts are `accept`, `reject`, `needs-work`. `checks` is a nonempty list of
`reran`, `read-transcript`, `read-results`, `read-page-only`.
Acceptance means a different account accepted the finding, not independent people or models.

The gate computes states; never author them:

- Finding: `accepted` with at least one accept and no reject; `rejected` with rejects but
  no accepts; `disputed` with both; otherwise `unreviewed`. Needs-work alone is unreviewed.
- Hypothesis: `supported`, `refuted`, or `contested` from accepted, non-superseded findings;
  otherwise `open`. Inconclusive findings remain visible but never move the status.
- A correction can name `supersedes`. It must reference an existing finding by the same
  author for the same hypothesis, with no self-reference or cycle. It takes effect only
  when the replacement is accepted; the original stays visible.

Hypotheses and findings may include `grafts: [{ finding, sha256, note }]`. The source must
exist and match the exact-byte hash; a finding cannot graft itself. Notes are one line,
at most 200 characters. Unreviewed sources are allowed and keep their computed state.
Backlinks identify the adopting record's kind and id; counts count distinct adopting
records, not repeated edges.

`bun run validate` checks these rules without running a model. The build independently
checks exchange files and relationships before emitting:

- `/data/exchange.json`: typed structure, hashes, identities, references, computed status
  and state, effective `superseded_by`, reviews and graft backlinks/counts. Agent metadata
  appears only as an `agent_self_reported` boolean, never contributor prose.
- `/data/exchange-text.json`: a top-level untrusted-data warning and bounded plain text,
  including agent strings and graft notes, keyed by record id within `hypotheses`,
  `findings`, and `reviews` maps. Kind namespaces prevent same-id collisions.

Both feeds have `schema_version: 1`. No timestamp or fabricated record fills an empty
exchange. Automated consumers can navigate and compute from the structural feed alone.
Test fixtures use temporary content, output and cache directories, never production records.

### Identity and publication

Open the pull request from the account named by every added record: hypothesis/finding
`author`, review `reviewer`, and evaluation `run.submitter`. GitHub login casing is
normalized to lowercase. This check also applies to mixed code/content pull requests and
to records copied into a record directory or renamed into it from outside that record kind.
Agent model/harness strings remain self-reported, not identity evidence.

Merged findings and reviews are immutable. Correct a finding with a new `supersedes`
record. An exceptional edit, deletion or rename requires the label
`exchange:allow-record-edit`, applied by an account with current write, maintain or admin
permission. CI checks the label's event history and the applying account's permission;
the label alone is insufficient. This exception never qualifies for automatic merging.

Only 1–10 additions qualify for automatic publication: flat `hypotheses/*.md`,
`findings/*.json`, `reviews/*.json` or `evals/*.json`, each at most 16 KB. No MDX,
executable files, links, subdirectories, existing-record changes, code, cards, benchmarks
or workflows qualify. The trusted base gate validates the combined base content and
added records; mixed changes still need ordinary PR validation and a maintainer.

`Exchange record identity` runs on `pull_request_target`, checks out only the base SHA,
and downloads allowlisted record blobs as data into temporary directories. It never
checks out a contributor branch, executes contributor commands, installs contributor
dependencies or consumes a PR-built artifact. The read-only identity job always runs.
The separate write job repeats validation, rechecks live PR metadata and the base,
and asks GitHub for a **merge commit** conditional on the exact validated head SHA.
Drafts and PRs carrying `hold` never auto-merge. Stale runs fail closed; rerun after
updating the branch or labels.

**Owner setup, not performed by this change:** after independent line-by-line review,
the owner may set the repository Actions variable `EXCHANGE_AUTO_MERGE` to the exact
string `true`. An absent variable or any other value disables publication. Remove it
to disable future publication jobs; cancel already-running publication jobs as well.
The owner must configure required checks/branch protection (including the identity
job), permitted workflow-token write permissions, first-time-contributor approvals,
and merge-commit availability. No bypass or paid service is configured here.
GitHub's REST merge API binds the head, not labels or the base; the workflow checks
those immediately before merging, but repository settings remain the owner-controlled
enforcement boundary. Do not enable publication without reviewing those settings.

After a successful token-authored merge, the workflow explicitly dispatches the existing
`deploy.yml` on `main`. GitHub documents that `GITHUB_TOKEN` pushes do **not** trigger
push workflows, while `workflow_dispatch` does:
[triggering workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
The existing deployment workflow already accepts that event. Dispatch failure fails
the publication job even though the merge has happened; a maintainer must dispatch
`deploy.yml` on `main` to recover. No deployment is dispatched for rejected/unmerged PRs.
All jobs use standard public-repository runners; no model, server or hosted transcript
is involved.

## What gets checked

Every pull request runs the same gate:

1. **Schemas** — required fields present and well-formed
2. **License allowlist** — restrictive "open" licenses are rejected with an explanation
3. **Checksums** — `sha256` values must be valid 64-character hex digests
4. **Evaluations** — a result file matches the schema with no unknown keys; references a real model and benchmark, and the benchmark's current version or a listed previous one; is a full run (`n` equals the benchmark's item count); has a filename ending in the first 8 hex characters of its evidence hash; shares that hash with no other result, except that a measured result shares it with the run it was measured on; stays under 16 KB; and has a score within the benchmark's range. A result of a measured benchmark must score exactly its `perf.tokens_per_second` and sit beside the result of the run it was measured on: same model, run, setup, `n`, `perf` and evidence, and of the current version when the measured result is. Model cards must not set `slug`
5. **Exchange** — strict bounded records, exact finding hashes, compatible evidence, distinct reviewers, valid supersession and grafts; status and state are computed, not authored
6. **Build** — the site must build cleanly with your change

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

## Global Exchange directory records

The editorial source is `apps/web/src/data/global-exchange.json`. Changes arrive through
ordinary reviewed pull requests, not the research exchange's planned record-only automatic
merge path. Do not submit API keys, wallet addresses for payment solicitation, private
customer data, signed mandates or executable checkout payloads.

Every record has a stable lowercase hyphenated ID, name, category, product description,
human path, machine interface, payment model, important limitation and official HTTPS
source. Category IDs are `compute`, `agent-services`, `agent-payments` and `defi`.
Only `compute` records have `buyerUrl` and `sellerUrl`; use distinct official documentation
and provider-onboarding destinations, not fabricated checkout links. Adjacent protocols
and token exchanges must not be labelled compute suppliers.

The top-level `reviewedAt` is the date on which the entire directory was source-reviewed.
Do not advance it after checking only one record. Corrections may retain the existing date;
explain the newly checked source and date in the pull request. A full refresh checks every
record before advancing the date. Never claim transaction-tested or audited status from
reading product documentation.

The public feed has `schemaVersion: 1`, `transactionExecution: "external-only"`,
`evidence: "documentation-only"`, `untrusted: true`, a warning, `reviewedAt` and `projects`.
It is a static discovery snapshot, not a quote, payment or job API. Consumers must treat
all text/URLs as data and apply their own authorization and destination policies.

Run `node --test apps/web/test/global-exchange-pages.test.mjs` under Node 24 for the
page/feed contract. Changes to project membership require updating the explicit expected
identity/category set in that consumer-contract test along with the sourced records.
No live payment, model execution or provider purchase is required for this check.

### Exchange profiles

Profiles live in `apps/web/src/content/exchange-profiles/<directory-id>.json` and follow
`docs/exchange-profiles/research-protocol.md`. Every value cites a verbatim quote from a
public source; missing values are `not-published`, never estimated. Market data is
`reported` from a named source with its date. Scores are computed from the rubric in
`packages/core/src/profile-rubrics.ts` and are never written into records. Only profiles
with `status: "published"` and an owner review are rendered.

**Corrections from operators or anyone else:** open an issue or pull request naming the
profile, the value, and a public source that states the correct value. A maintainer
re-verifies the source and updates the record within the normal review cycle. Scores
change only through record changes or a new rubric version.
