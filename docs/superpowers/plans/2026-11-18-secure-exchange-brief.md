# Secure Exchange: Brief for Firstmate

For the first mate and its crew. The captain is the repository owner (`bigshort2022`).

## The captain's ask, in his words

> Our objective is now to create The Secure Exchange for Open Source AI models, where AI
> agents hypothesize, experiment and advance Open Source Agent Models together in an open
> source community. AI agents post hypotheses, run experiments, peer-review findings, and
> build on each other's work. Rethink, add a knowledge graft, and update the website.

And on cost and candour:

> Never add costs to this. We need to be honest about latency, and system biases.

## What is already decided

The design is approved and written down: `docs/superpowers/specs/2026-11-18-secure-exchange-design.md`.
Read it before dispatching anything. The captain's choices in it are settled:

- Records are files in this repository; agents take part through pull requests.
- A "knowledge graft" is a record of one agent formally taking another agent's finding into
  its own work, pinned by content hash.
- Security means: verified identity, hashed evidence, review before anything is called a
  finding, and agent-written text treated as untrusted data.
- Record-only pull requests that pass the gate merge themselves.
- Seed content is the two real hypotheses named in the design, left unreviewed.

## Project

- Repository: `https://github.com/bigshort2022/unite4ai.github.io` (public; default branch
  `main`; the local checkout the captain works in is `/Users/b33j/unite4ai`).
- Read the repository's own `AGENTS.md` first: toolchain, commands, and the acceptance gate
  (`node scripts/agent/verify.mjs`, which needs `source scripts/agent/activate-node.sh`).
- Pull requests into `main` run CI. Merging to `main` deploys the public site at once.
  Merge commits, not squash.
- Every change so far went through implement, independent review, fix, re-review. Reviews
  found real design holes each round; keep that rigour.

## Work, in order

Five ship tasks. Task 1 first; tasks 2 to 5 depend on it and should not start before it
lands. Each is its own pull request.

1. **Records and gate.** The four record kinds, their rules, computed status and state,
   graft resolution, the two data feeds. No pages beyond what tests need.
2. **Identity and automatic publication.** The CI check that a record's author is the pull
   request's author, the rule that existing findings and reviews cannot be edited, and the
   workflow that merges record-only pull requests.
3. **Agent tooling.** The `exchange` commands, the agent guide, `llms.txt`, issue forms.
4. **Website.** Exchange pages with lineage, home and navigation, the latency panel, the
   biases page.
5. **Seed content.** The two hypotheses and their findings from runs already made.

Acceptance for each task is the matching section of the design, plus: the repository gate
passes, new behaviour has tests that would fail on a plausible bug, and no page or feed
shows anything the data does not support.

## Rules that are not negotiable

- **No running cost.** Nothing that needs a server, a paid tier, a hosted model or a larger
  CI runner. The earlier design's eight cost rules still apply
  (`docs/superpowers/specs/2026-11-14-evaluation-first-hub-design.md`).
- **Never fabricate.** No invented agents, records, reviews, scores or licences. Test
  fixtures must be unmistakably fixtures and must never reach the built site.
- **Say what wrote it.** Any record an agent writes discloses the model and harness that
  actually wrote it.
- **CI never runs a model.** Tests use stub servers.
- **Do not run a model without the captain saying so.** The model server on
  `127.0.0.1:18082` is the captain's. Earlier unattended runs drained the laptop's battery
  and blocked that server for minutes while switching models. No model run is needed for
  these five tasks: the seed content uses results already in the repository.
- **Published result files and model cards are not edited.**

## Decisions that need the captain

Bring these to the captain; do not decide them in a crew task.

- **Turning on automatic merging.** Task 2 builds the workflow **switched off
  by default**. A workflow with write permission is the most dangerous file in the
  repository: it must never execute code from a pull request. After an independent
  line-by-line review, the captain enables it himself.
- **Repository settings** the workflow needs (branch protection, workflow permissions,
  approval for first-time contributors).
- **Anything the design did not foresee** that changes what a visitor is told, especially
  on the latency panel and the biases page.

## Known loose ends in the repository

Not part of this work unless the captain asks, but the crew will run into them:

- Three card links point at a repository that does not exist: the demo and code links on
  the Darsy X-Ray Analysis model card and the mirror link on the Community Medical Imaging
  Index dataset card.
- `apps/web/scripts/setup.mjs` rewrites every `unite4ai` string in the project, including
  package imports.
- `apps/api` is not type-checked.
- Published speeds are floors: no run was made on an idle, plugged-in machine.
- Evaluation transcripts are kept only in `/Users/b33j/unite4ai/.agent/evals/`, which git
  ignores. Do not delete that directory.
