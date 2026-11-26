# AX Task Handoff Implementation Plan

> **For agentic workers:** Use subagent-driven development. Each copied task is guidance, not approval. Do not run a model, spend money, publish records, or deploy to verify this feature.

**Goal:** Put a persistent AX toggle and one copyable task on each eligible Unite4AI page.

**Architecture:** Astro prerenders all prompt text from typed route data, a single rules module, and an exact public CLI manifest. Client code only controls visibility, remembers a boolean, and copies text. Build verification checks command and site-link contracts without reaching the network.

**Tech stack:** Astro, TypeScript/ES modules, Node 24, Bun, standards-based DOM and Clipboard API. No dependencies or CSP changes.

**Implements:** [The AX button and production system](../specs/2026-11-22-agent-evidence-design.md#the-ax-button). Depends on [Plan 6](2026-11-23-unite4ai-axi.md) and the reviewed CLI [merge](https://github.com/bigshort2022/unite4ai-axi/commit/f256abc5a0029fca8a5985b0b09cf9c37d4437ea). Plan 8 export formats are out of scope.

## 1. Pin and render the task contract

- [ ] Create `apps/web/src/data/axi-command-manifest.json` as the exact upstream manifest bytes, from public CLI commit `f256abc5a0029fca8a5985b0b09cf9c37d4437ea`, SHA-256 `58f887bfa253509e36d7ad37e8a7c2d3bed4decf6f1ee629ded160a1ccf4d945`. Use `apps/web/src/lib/ax-task.mjs` for the source commit, checksum, manifest read/validation, shared rules, exact route classifier and prompt renderer. At this pin, npm has no entry: document a verified `npm install --ignore-scripts https://codeload.github.com/bigshort2022/unite4ai-axi/tar.gz/f256abc5a0029fca8a5985b0b09cf9c37d4437ea` as optional installation, never `npx unite4ai-axi@latest`. Public source installation does not imply npm publication.
- [ ] Validate command arrays against manifest schema v1 (longest matching compound subcommand, exact flag names, flag value arity, required flags, duplicate/surplus flags and positionals). Render only the validated command arrays as `unite4ai-axi …`. Include exact benchmark/model/record IDs; on finding pages, bind the exact inspected finding SHA-256 in the review example and require the agent to verify it. Use named uppercase placeholders only for values the owner/agent must actually determine. Never include a confirmation flag or carry contributor prose into a prompt. Use only canonical route and feed URLs and local-only preview commands. No HTML or template/JSON injection.
- [ ] For measured companions, name the scoring suite and keep the pair together. For model card paths that are not valid evaluation IDs, offer discovery without inventing a run command. If records are newer than the CLI's fixed site checkout or the inspected bytes disagree, route agents to the manual guide. Never move the pin silently.
- [ ] Cover missing routes, delimiters in IDs, malformed finding hashes, unknown commands/flags and missing required values using `node --test apps/web/test/ax-task.test.mjs`. Tests use programmatic data inputs, not source-text grep. Verify against the pinned manifest and exact digest.

## 2. Add the control to the prerendered pages

- [ ] Update `apps/web/src/layouts/Base.astro` and `apps/web/src/pages/exchange/findings/[id].astro`; use an `AxTask.astro` component for the panel and `apps/web/src/lib/ax-ui.js` for client behavior. Classify only `/exchange`, `/exchange/hypotheses/<id>`, `/exchange/findings/<id>`, `/registry/models/<id>`, `/evals/<id>`. Use a native header button labelled AX, `aria-pressed`, `aria-controls`, and initial hidden state until the script initializes. Show the prerendered task before page content; use an editable-selection-compatible readonly field, `Copy agent task`, and a polite status region. Store only an enabled boolean in `localStorage`. A denied clipboard leaves the full text selected for manual copy. Storage denial never breaks current-page toggle/copy. No fetch, model call, auto-submission, additional package, or new CSP origin.
- [ ] In the browser open a local build on a supported page; toggle with keyboard, copy full text, navigate to an unsupported page (no toggle), and back to a supported page (preference persists). Exercise clipboard rejection and manual selection. Confirm clicks issue no requests.

## 3. Build checks and agent discovery

- [ ] Replace `apps/web/public/llms.txt` with a prerendered `apps/web/src/pages/llms.txt.ts` route and `apps/web/src/lib/ax-index.mjs` text builder, preserving existing discovery routes, feeds, and caveats. Include the shared rule lines exactly once. Add `apps/web/scripts/sync-ax-guide.mjs` to generate only the marked `## AX task rules` section of `docs/exchange/agent-guide.md`; keep manual runner docs and distinguish its local Exchange command from the branded AXI tool. Build fails on generated guide drift; no network in verification.
- [ ] Add build-output checks in `apps/web/scripts/check-ax-build.mjs`, called by an Astro `astro:build:done` hook. Verify every emitted eligible page has one AX prompt and every ineligible page has zero. Verify every referenced same-site page/feed (including the existing index links) has an emitted file; parse only the AX prompt, not untrusted page prose. A stable internal route under a non-root base resolves against that build's emitted file layout. Validate manifest/policy before rendering. Add fixture-backed tests for route, policy and link drift and existing exchange fixture pages for real hashes.
- [ ] Verify `source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs`, then open one site PR with this plan and implementation. Record gate JSON and browser proof. Do not claim npm publication, catalog admission or deployment.
