# AI Stack Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the requested AI stack topics as useful static pages and expose the existing Governance page in the same page list.

**Architecture:** Keep the current Stack overview and existing Governance route. One typed editorial data file supplies nine static topic pages through an Astro dynamic route; no registry schema, backend, dependencies or generated artifacts change. This plan is independent of the Global Exchange directory plan.

**Tech Stack:** Astro static generation, TypeScript, Bun, Node 24 `node:test`, existing CSS and Base layout.

---

## Scope and contract

Status: in-progress — implemented and verified locally; not merged or deployed. Depends: none. Implements: `docs/superpowers/specs/2026-11-19-global-exchange-pages-design.md`. Tracking: [issue #24](https://github.com/bigshort2022/unite4ai.github.io/issues/24).

Read the approved design and repository agent card before editing. The old approved research exchange remains a separate workstream. Do not rewrite evaluation cards/results, change existing stack classifications, edit generated registry JSON, add packages, run a model, deploy or merge.

Canonical labels correct the user's spelling: Quantization, Verification and Governance. Targets means execution/deployment targets. Distributions means packaged model/runtime bundles; Distribution means publishing channels. Governance already exists: enhance it rather than create a competing route.

## File map

| File | Responsibility |
|---|---|
| Create `apps/web/src/lib/stack-topics.ts` | Nine editorial topic records; not a second registry taxonomy schema |
| Create `apps/web/src/pages/stack/[topic].astro` | Prerender a page per topic, escape text and preserve base-aware links |
| Modify `apps/web/src/pages/stack/index.astro:2-4,26-108` | Import topic records and append the linked page list inside existing Base |
| Modify `apps/web/src/pages/governance.astro:2-4,46-50` | Directory policy section and base-aware operational-metrics link |
| Create `apps/web/test/stack-topics-pages.test.mjs` | Consumer-visible route/link/base-path regression coverage |
| Modify `README.md:38-48` | Document public topic routes and editorial source |

Line ranges describe the inspected checkout. Re-read only changed regions if another worker moves them. One integration owner handles Stack, Governance and README edits; preserve concurrent changes.

## Task 1: Render nine real topic pages

**Files:** Create `apps/web/test/stack-topics-pages.test.mjs`, `apps/web/src/lib/stack-topics.ts`, `apps/web/src/pages/stack/[topic].astro`.

- [ ] **Step 1: Add the route/base-path regression test**

Create `apps/web/test/stack-topics-pages.test.mjs`:

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const destinations = {
  'model-task-taxonomy': '/registry',
  observability: '/evals',
  targets: '/stack/compute',
  'model-layer': '/registry',
  actuation: '/governance',
  quantization: '/evals',
  verification: '/evals',
  distributions: '/registry',
  distribution: '/contribute',
};

test('topic pages work under a project base and link back to existing resources', { timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'u4ai-stack-topics-'));
  try {
    const result = spawnSync('bun', ['run', 'astro', 'build', '--base', '/preview', '--outDir', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    for (const [slug, destination] of Object.entries(destinations)) {
      const html = readFileSync(join(out, 'stack', slug, 'index.html'), 'utf8');
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
      assert.ok(main, `${slug}: accessible main content`);
      assert.match(main, /<h1\b/);
      assert.ok(main.includes('href="/preview/stack"'), `${slug}: back to Stack`);
      assert.ok(main.includes(`href="/preview${destination}"`), `${slug}: related resource`);
      assert.doesNotMatch(main, /href="\/(?:stack|registry|evals|governance|contribute)(?:["/])/);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
```

This catches missing routes and broken GitHub project-page links. It deliberately does not assert exact prose or CSS.

- [ ] **Step 2: Run the test before implementing**

```bash
source scripts/agent/activate-node.sh
node --test apps/web/test/stack-topics-pages.test.mjs
```

Expected: failing test because `stack/model-task-taxonomy/index.html` does not exist after a successful build. A compiler/environment failure is not the intended red signal; resolve its cause before continuing.

- [ ] **Step 3: Add the topic records**

Create `apps/web/src/lib/stack-topics.ts`:

```ts
interface Topic {
  slug: string;
  title: string;
  summary: string;
  sections: { title: string; text: string }[];
  destination: string;
  destinationLabel: string;
}

export const stackTopics: Topic[] = [
  {
    slug: 'model-task-taxonomy', title: 'Model Task Taxonomy',
    summary: 'Describe the work before choosing a model or buying compute.',
    sections: [
      { title: 'Task families', text: 'Separate generation, classification, retrieval, embeddings, vision, speech, tool use and rendering. A task can combine families: retrieval followed by generation is not evaluated like retrieval alone. These are editorial categories, not additional registry schema values.' },
      { title: 'Define the contract', text: 'Record input format, output format, language, context size and an acceptance criterion. Classification needs a label set; retrieval needs a corpus and relevance measure; generation needs a rubric; tool use needs permitted actions and a stopping rule.' },
      { title: 'Select evidence', text: 'Compare results on the same task definition and benchmark version. A general leaderboard does not establish fitness for private data, a different language or a tool workflow. Check licence and deployment constraints before selecting a model.' },
    ], destination: '/registry', destinationLabel: 'Browse model and dataset cards',
  },
  {
    slug: 'observability', title: 'Observability',
    summary: 'Make runs explainable without leaking prompts, credentials or private data.',
    sections: [
      { title: 'Identify a run', text: 'Record a run identifier, model revision, runtime version, hardware, configuration and timestamps. Link the benchmark version and command so later comparisons can distinguish a model change from a setup change.' },
      { title: 'Measure the right units', text: 'Distinguish time to first output, total latency, throughput, token counts and resource utilization. Record concurrency and whether setup time is included. Label estimated cost separately from an invoice and include its currency and billing unit.' },
      { title: 'Keep evidence safely', text: 'Redact secrets and personal data before publishing logs. A transcript hash can identify an artifact without hosting the raw text; it does not prove that the measurement was honest. The evaluation pages show self-reported evidence, not live service monitoring.' },
    ], destination: '/evals', destinationLabel: 'Inspect published evaluation evidence',
  },
  {
    slug: 'targets', title: 'Targets',
    summary: 'Choose an execution environment that fits the task and its data constraints.',
    sections: [
      { title: 'Deployment choices', text: 'Local CPU or GPU execution keeps control on your machine. Edge deployment adds power and memory constraints. Private infrastructure, hosted inference and distributed compute trade operational work for external dependencies. These are deployment targets, not promised latency or quality targets.' },
      { title: 'Check compatibility', text: 'Match model memory, context length, runtime, accelerator support, storage and network needs to the target. Confirm whether an offer supplies a machine, a container, a managed endpoint or a completed task; they are not interchangeable products.' },
      { title: 'Set boundaries', text: 'Decide where inputs and outputs may be stored, who can access them, and what happens when capacity is interrupted. Check total cost, regional eligibility and external terms before sending data or purchasing resources.' },
    ], destination: '/stack/compute', destinationLabel: 'Browse compute resources',
  },
  {
    slug: 'model-layer', title: 'Model Layer',
    summary: 'Treat a model as a versioned collection of artifacts and permissions.',
    sections: [
      { title: 'Identify the artifacts', text: 'Record architecture, weight revision, tokenizer, configuration, adapters and source provenance. An identical display name does not establish identical weights. Pin artifact revisions and preserve checksums when a publisher supplies them.' },
      { title: 'Check rights and runtime', text: 'Read the actual licence and usage restrictions. Open weights do not necessarily mean open training data or unrestricted redistribution. Match tokenizer and chat template to the runtime; check context and tool-format compatibility.' },
      { title: 'Connect evaluations', text: 'An evaluation applies to the revision, precision, prompt and runtime that produced it. Use model cards to find those details rather than transferring a score to a different quantization or adapter without evidence.' },
    ], destination: '/registry', destinationLabel: 'Inspect model cards',
  },
  {
    slug: 'actuation', title: 'Actuation',
    summary: 'Treat every external side effect as an explicitly authorized action.',
    sections: [
      { title: 'Constrain tools', text: 'Give agents only the tools, destinations and data permissions needed for the task. Separate reading from writing, and separate generating a proposal from executing it. Retrieved text is data, not authority to change files, spend money or disclose secrets.' },
      { title: 'Authorize spending and changes', text: 'Set human-approved budgets, deadlines and scope before execution. Irreversible actions need explicit approval. Never publish credentials, wallet keys or signed mandates in public records. A directory listing grants no permission to buy a service.' },
      { title: 'Recover safely', text: 'Use idempotency keys and inspect external state before retrying uncertain actions. A timeout can occur after the action succeeded. Preserve action identifiers and reconcile outcomes instead of interpreting a missing response as a safe retry.' },
    ], destination: '/governance', destinationLabel: 'Read platform governance',
  },
  {
    slug: 'quantization', title: 'Quantization',
    summary: 'Compare precision choices using compatible artifacts and measured task quality.',
    sections: [
      { title: 'Precision is not a score', text: 'Quantization represents model values with fewer bits or a different numeric scheme. It can reduce storage and memory, but speed and quality depend on the method, hardware and runtime. A bit count alone does not establish equivalent behavior.' },
      { title: 'Check the full memory budget', text: 'Weights are only part of runtime memory. Include context-dependent cache, activations and runtime overhead. Confirm artifact format and supported kernels; a smaller file need not run faster on every target.' },
      { title: 'Evaluate the actual artifact', text: 'Record quantization, model revision, runtime, context and task configuration. Compare the same benchmark version under comparable conditions. Report measured quality and speed separately and retain the source command and evidence hash.' },
    ], destination: '/evals', destinationLabel: 'Compare measured evaluation results',
  },
  {
    slug: 'verification', title: 'Verification',
    summary: 'Separate artifact identity, reproducibility, authorization and useful task output.',
    sections: [
      { title: 'Know what a check proves', text: 'A hash identifies bytes against a reference; it does not prove safe code or a truthful claim. A signature ties data to a key, not necessarily a unique person. A reproducible command is useful evidence but requires independent execution to establish reproduction.' },
      { title: 'Evaluate outcomes', text: 'Record the benchmark version, metric, direction, prompt, setup and limitations. Compare evidence with the task acceptance criteria. Independent review is stronger than a provider assertion, but a different account is not proof of an independent organization.' },
      { title: 'Do not confuse settlement with delivery', text: 'A paid invoice, token transfer or funded stream proves a payment-related state, not correct compute output. Provider badges and directory inclusion are not guarantees of capacity, confidentiality or successful completion.' },
    ], destination: '/evals', destinationLabel: 'Inspect evaluation methods and results',
  },
  {
    slug: 'distributions', title: 'Distributions',
    summary: 'Package model artifacts and runtime requirements into reproducible bundles.',
    sections: [
      { title: 'Define the bundle', text: 'Here, a distribution is a model/runtime package, not a probability distribution. Its manifest identifies weights, tokenizer, configuration, adapters, runtime requirements and licences. Pin versions rather than depend on an unbounded latest tag.' },
      { title: 'Make setup reproducible', text: 'State supported operating systems, accelerator/runtime versions, memory needs and startup command. Separate downloaded artifacts from generated caches and document integrity checks against publisher references.' },
      { title: 'Preserve provenance', text: 'Keep upstream sources, modifications and redistribution rights visible. A bundle should link evaluations of its actual configuration, not inherit a different artifact score. Inspect installation instructions before executing downloaded code.' },
    ], destination: '/registry', destinationLabel: 'Find artifact and provenance records',
  },
  {
    slug: 'distribution', title: 'Distribution',
    summary: 'Publish and deliver artifacts without confusing discovery with hosting.',
    sections: [
      { title: 'Choose a delivery channel', text: 'A registry card describes a model; a repository release, artifact host or mirror delivers its files. Keep canonical sources and versions explicit. This page concerns publishing channels, while Distributions concerns what is inside a bundle.' },
      { title: 'Publish usable references', text: 'Include a licence, source revision, download location, file format, size and integrity reference where available. A mirror should preserve provenance and name any modifications rather than silently replace upstream files.' },
      { title: 'Correct records transparently', text: 'Use reviewed contributions for registry changes and document moved or withdrawn sources. Do not invent licences, evaluation results or availability claims. Users remain responsible for checking external hosts and the rights attached to downloaded artifacts.' },
    ], destination: '/contribute', destinationLabel: 'Read contribution instructions',
  },
];
```

- [ ] **Step 4: Create the static route**

Create `apps/web/src/pages/stack/[topic].astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import { stackTopics } from '../../lib/stack-topics';

export function getStaticPaths() {
  return stackTopics.map((topic) => ({ params: { topic: topic.slug }, props: { topic } }));
}

const { topic } = Astro.props;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';
---
<Base title={topic.title} description={topic.summary}>
  <section class="wrap section">
    <a href={href('/stack')}>Back to the open AI stack</a>
    <h1>{topic.title}</h1>
    <p class="lede">{topic.summary}</p>
    {topic.sections.map((section) => (
      <section>
        <h2>{section.title}</h2>
        <p>{section.text}</p>
      </section>
    ))}
    <p><a href={href(topic.destination)}>{topic.destinationLabel}</a></p>
  </section>
</Base>
```

- [ ] **Step 5: Run the regression test once after implementation**

```bash
source scripts/agent/activate-node.sh
node --test apps/web/test/stack-topics-pages.test.mjs
```

Expected: one passing test; all nine pages rendered under `/preview`, with base-prefixed links. Do not claim a result without observing it.

- [ ] **Step 6: Commit only this task's changes**

Use the eval commit namespace, not `git add` or `git commit`. Read `xd://eval/commit` before first use, inspect the draft, then:

```js
const d = await commit.draft();
await d.commit('feat(web): add AI stack topic pages', ['- Render nine task, model, execution and delivery guides with base-aware links']);
```

## Task 2: Expose the page list and clarify governance

**Files:** Modify `apps/web/src/pages/stack/index.astro`, `apps/web/src/pages/governance.astro`, `apps/web/test/stack-topics-pages.test.mjs`.

- [ ] **Step 1: Extend the existing regression test**

Inside its `try` block, after the topic loop, add:

```js
    const stack = readFileSync(join(out, 'stack', 'index.html'), 'utf8');
    for (const slug of Object.keys(destinations)) {
      assert.ok(stack.includes(`href="/preview/stack/${slug}"`), `Stack discovers ${slug}`);
    }
    assert.ok(stack.includes('href="/preview/governance"'));
    const governance = readFileSync(join(out, 'governance', 'index.html'), 'utf8');
    assert.ok(governance.includes('href="/preview/governance/metrics"'));
    assert.doesNotMatch(governance, /href="\/governance\/metrics"/);
```

- [ ] **Step 2: Run the targeted test and observe missing discovery links**

```bash
source scripts/agent/activate-node.sh
node --test apps/web/test/stack-topics-pages.test.mjs
```

Expected: assertion failure for a missing topic link on Stack, not an unrelated build error.

- [ ] **Step 3: Add the list without replacing the existing overview**

Add this import to `apps/web/src/pages/stack/index.astro`:

```ts
import { stackTopics } from '../../lib/stack-topics';
```

Insert this complete section immediately before the closing `</Base>`:

```astro
  <section class="wrap section" aria-labelledby="topic-pages-title">
    <h2 id="topic-pages-title">Explore the AI stack</h2>
    <div class="grid grid-2">
      {stackTopics.map((topic) => (
        <article class="card">
          <h3><a href={href(`/stack/${topic.slug}`)}>{topic.title}</a></h3>
          <p>{topic.summary}</p>
        </article>
      ))}
      <article class="card">
        <h3><a href={href('/governance')}>Governance</a></h3>
        <p>Read the rules for contributions, directory corrections and accountability.</p>
      </article>
    </div>
  </section>
```

- [ ] **Step 4: Enhance the existing Governance route**

After the imports in `apps/web/src/pages/governance.astro`, add:

```ts
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';
```

Before its final full-text links paragraph, insert:

```astro
    <h2>Directory inclusion and corrections</h2>
    <p>
      Directory records describe externally operated projects using cited public sources.
      Inclusion is not endorsement, a security audit, proof of live inventory or a promise
      of successful task delivery. Propose corrections with source evidence through a
      repository pull request; maintainers review changes before publication.
    </p>
    <p>
      Buyers and providers contract and transact externally under the destination's terms.
      Unite4AI does not hold funds, execute payments, dispatch compute, arbitrate commercial
      disputes or guarantee refunds. Do not publish credentials or private payment details.
    </p>
```

Replace only the existing metrics anchor:

```astro
      <a href={href('/governance/metrics')}>Operational metrics</a>
```

- [ ] **Step 5: Run the targeted test**

```bash
source scripts/agent/activate-node.sh
node --test apps/web/test/stack-topics-pages.test.mjs
```

Expected: one passing test including all topic-discovery links and the base-aware governance metrics link.

- [ ] **Step 6: Commit the page-list and policy change**

```js
const d = await commit.draft();
await d.commit('feat(web): expose stack guides and directory governance', ['- Preserve existing routes and explain external transaction responsibilities']);
```

## Task 3: Document and verify the actual surface

**Files:** Modify `README.md`; no further runtime files unless the specified checks find a defect in this change.

- [ ] **Step 1: Append the documentation section**

Append to `README.md`:

```markdown
## AI stack guides

`/stack` links Model Task Taxonomy, Observability, Targets, Model Layer, Actuation,
Quantization, Verification, Distributions, Distribution and the existing Governance page.
Topic content lives in `apps/web/src/lib/stack-topics.ts`; Astro prerenders one page per
record through `apps/web/src/pages/stack/[topic].astro`.

Targets describes execution environments. Distributions describes model/runtime bundles;
Distribution describes publishing and delivery channels. These guides do not redefine
registry schema enums or claim new measured results.
```

- [ ] **Step 2: Start the development surface**

```bash
source scripts/agent/activate-node.sh
bun run dev -- --host 127.0.0.1
```

Use the URL actually printed by Astro. Open a new browser tab, not a borrowed user tab. Inspect `/stack`, all nine topic links, and `/governance`; use desktop and mobile widths. Confirm readable headings, working back/resource links, no overflow and keyboard-accessible links. Read the matching browser skill before using browser tools. No wallet, provider account or model server is needed.

- [ ] **Step 3: Run the required acceptance gate**

```bash
source scripts/agent/activate-node.sh
node scripts/agent/verify.mjs --only hub
```

Expected: exit zero and final JSON reporting successful hub validation/typecheck/build/tests. Record the actual JSON, not a fabricated example. If both plans execute as one integrated batch, run this gate once after both are integrated; otherwise run it at this plan's completion. Stop the development server afterward.

- [ ] **Step 4: Commit the docs and verified closeout**

```js
const d = await commit.draft();
await d.commit('docs(web): document AI stack guides', ['- Record topic ownership and verification of the published page surfaces']);
```

## Validation

- [x] Nine topic routes exist; Governance is reused, not duplicated.
- [x] Stack exposes all ten subjects without removing existing content.
- [x] Targets, Distributions and Distribution have the approved distinct meanings.
- [x] `/preview` base-path regression and root-base acceptance build pass.
- [x] Browser proof covers topic navigation and mobile readability.
- [x] No generated content, dependencies, backend, model execution or deployment changes.

## Risks / unknowns

- Concurrent work can add research-exchange navigation or change Stack. Apply additive edits to current files; do not overwrite that work.
- The knowledge taxonomy is editorial. Converting it into validated registry fields requires a separate approved schema change.
- Source/provider details change; the companion Global Exchange plan owns those records rather than duplicating them here.

## Notes

Implemented on `feat/global-exchange-pages` in the isolated worktree at
`~/.config/superpowers/worktrees/unite4ai/global-exchange`. Source review passed both
specification and quality stages. The combined targeted run passed both page-contract tests.
Browser verification opened all nine topic routes, exercised Stack/topic/Governance links,
and confirmed 320px content widths after correcting the shared `.grid-2` minimum.
The integrated acceptance gate passed; its exact result is recorded in the companion
Global Exchange plan's Notes.

Execution differed from the historical step sequence: tests were written before code,
but agents skipped mid-flight checks; the parent ran integrated tests afterward.
No failing pre-implementation test run is claimed. The step checkboxes above retain
the original execution recipe; the Validation list records observed acceptance.

## Follow-ups

None within this approved scope. Global Exchange is a separate independently runnable plan: `2026-11-19-global-exchange-directory.md`.
