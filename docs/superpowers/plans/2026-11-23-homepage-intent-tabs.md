# Homepage Intent Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended for this one dependent slice) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Learn, Learn (Policy), and Join directly after Leading results, with real next steps for building, checking local data center proposals, and joining the community.

**Architecture:** A homepage-only Astro component renders all actions in static HTML. A small bundled script exposes accessible tabs over the same panels. The new Voice guide is a standalone static page.

**Tech Stack:** Astro, TypeScript DOM APIs, scoped CSS, existing Unite4AI design tokens.

---

**Spec:** [Homepage intent tabs](../specs/2026-11-23-homepage-intent-tabs-design.md). The new `/policy/data-centers` guide is the only new route. No evaluation, dependency, CSP, navigation, or membership changes.

### Task 1: Add the homepage chooser and verify it on the rendered site

**Files:**
- Create `apps/web/src/components/HomeIntentTabs.astro` — panel content, static fallback, tab semantics, and scoped styles.
- Modify `apps/web/src/pages/index.astro` — mount the component between Leading results and the open stack preview.
- Create `apps/web/src/pages/policy/data-centers.astro` — explain how to find local proposals, check claims, and comment through official channels.
- Existing coverage: `apps/web/test/deployment.test.mjs` and `apps/web/test/evals-pages.test.mjs` guard the hero and results ordering. Leave both unchanged.

- [ ] **Step 1: Start the dev server**

Run from the repo root in a supervised terminal:

```sh
source scripts/agent/activate-node.sh
bun --cwd apps/web run dev --host 127.0.0.1 --port 4321
```

Use the local URL reported by Astro; examples below use `http://127.0.0.1:4321/`.

- [ ] **Step 2: Run the static smoke assertion before implementing**

This one-shot check exercises output, not source text. It should currently fail with `the three paths must appear between results and the stack preview`. Run the same command after Step 4:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const page = await fetch('http://127.0.0.1:4321/');
assert.equal(page.status, 200);
const html = await page.text();
const results = html.indexOf('id="leading-results-title"');
const chooser = html.indexOf('What do you want to do?', results);
const stack = html.indexOf('id="stack-preview-title"');
assert.ok(results >= 0 && results < chooser && chooser < stack,
  'the three paths must appear between results and the stack preview');
const section = html.slice(chooser, html.indexOf('</section>', chooser));
const links = Array.from(section.matchAll(/<a\b[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g),
  ([, href, text]) => [href, text.trim()]);
assert.deepEqual(links, [
  ['/school/run-open-weights', 'Build'],
  ['/stack/compute', 'Compute'],
  ['/policy/data-centers', 'Voice'],
  ['/contribute', 'Contribution Guide'],
  ['/community', 'Community'],
]);
for (const [path, label] of links) {
  const destination = await fetch(new URL(path, page.url));
  assert.equal(destination.status, 200, path);
  if (label === 'Voice') {
    assert.match(await destination.text(), /Local data centers: learn and speak up/);
  }
}
console.log('Homepage: all five actions follow Leading results and resolve');
JS
```

- [ ] **Step 3: Create `HomeIntentTabs.astro`**

```astro
---
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';

const paths = [
  {
    id: 'learn', label: 'Learn', heading: 'Build with open AI.',
    body: 'Run an open model locally, then compare compute options if you need more capacity.',
    actions: [
      { label: 'Build', route: '/school/run-open-weights' },
      { label: 'Compute', route: '/stack/compute' },
    ],
    art: 'M50 74c-11-9-25-9-39-5V25c14-4 28-4 39 5 11-9 25-9 39-5v44c-14-4-28-4-39 5Zm0 0V30m-28 7c7-1 13 0 18 2m-18 9c7-1 13 0 18 2m20-11c5-2 11-3 18-2m-18 13c5-2 11-3 18-2',
  },
  {
    id: 'policy', label: 'Learn (Policy)', heading: 'Understand data center proposals near you.',
    body: 'Find out who decides, where to check claims about power, water, noise, and local costs, and how to raise concerns on the public record.',
    actions: [{ label: 'Voice', route: '/policy/data-centers' }],
    art: 'M24 14h37l15 15v31M24 14v72h28m9-72v15h15M35 40h29M35 51h24M35 62h13m29 26H60l5-10v-8a7 7 0 0 1 14 0v8l5 10h-7m-10 4a5 5 0 0 0 10 0',
  },
  {
    id: 'join', label: 'Join', heading: 'Take part in Unite4AI.',
    body: 'Share a model, dataset, or course, or meet people through public discussions and events. No contribution is required before saying hello.',
    actions: [
      { label: 'Contribution Guide', route: '/contribute' },
      { label: 'Community', route: '/community' },
    ],
    art: 'M13 30a8 8 0 0 1 8-8h41a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H38L25 75V62h-4a8 8 0 0 1-8-8Zm64 6h2a8 8 0 0 1 8 8v25a8 8 0 0 1-8 8h-4v12L63 77H44m-17-35h2m12 0h2m12 0h2',
  },
];
---
<section class="wrap section home-intents" aria-labelledby="home-intent-title" data-home-intents>
  <h2 id="home-intent-title">What do you want to do?</h2>
  <div class="intent-tabs" hidden>
    {paths.map(({ id, label }) => (
      <button type="button" id={`home-intent-tab-${id}`}>{label}</button>
    ))}
  </div>
  {paths.map(({ id, heading, body, actions, art }) => (
    <article class="intent-panel" id={`home-intent-panel-${id}`}>
      <div>
        <h3>{heading}</h3>
        <p>{body}</p>
        <div class="intent-actions">
          {actions.map(({ label, route }, i) => (
            <a class:list={['btn', i === 0 ? 'btn-primary' : 'btn-ghost']} href={href(route)}>{label}</a>
          ))}
        </div>
      </div>
      <div class:list={['intent-art', `art-${id}`]} aria-hidden="true">
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" focusable="false">
          <path d={art} />
        </svg>
      </div>
    </article>
  ))}
</section>

<style>
  .home-intents { padding-top: 0; }
  .intent-tabs {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .5rem; margin: 1.25rem 0 .65rem;
  }
  .intent-tabs button {
    font: inherit; font-weight: 700; line-height: 1.1; min-height: 44px;
    padding: .65rem .25rem; overflow-wrap: anywhere; cursor: pointer;
    border: 1px solid var(--u-border-bright); border-radius: var(--u-radius-sm);
    color: var(--u-text-dim); background: var(--u-bg-elev);
  }
  .intent-tabs button[aria-selected='true'] {
    color: var(--u-text); border-color: var(--u-cyan); box-shadow: inset 0 -3px var(--u-cyan);
  }
  .intent-panel {
    display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    align-items: center; gap: 1rem; min-height: 14rem; margin-top: .65rem;
    padding: clamp(1rem, 3vw, 1.75rem); border: 1px solid var(--u-border-bright);
    border-radius: var(--u-radius); background: var(--u-bg-elev);
  }
  .intent-panel p { color: var(--u-text-dim); max-width: 48ch; }
  .intent-actions { display: flex; flex-wrap: wrap; gap: .65rem; }
  .intent-art {
    --intent-accent: var(--u-blue);
    display: grid; place-items: center; justify-self: center;
    width: min(100%, 10rem); aspect-ratio: 1; color: var(--intent-accent);
    background: radial-gradient(circle, color-mix(in srgb, currentColor 22%, transparent), transparent 70%);
  }
  .intent-art svg { width: 78%; height: auto; }
  .art-policy { --intent-accent: var(--u-violet); }
  .art-join { --intent-accent: var(--u-magenta); }
  .intent-tabs[hidden], .intent-panel[hidden] { display: none; }
  @media (max-width: 550px) {
    .intent-panel { grid-template-columns: minmax(0, 1fr); }
    .intent-art { display: none; }
  }
</style>

<script>
  const root = document.querySelector('[data-home-intents]');
  const tablist = root?.querySelector<HTMLElement>('.intent-tabs');
  if (root && tablist) {
    const tabs = Array.from(tablist.querySelectorAll('button'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('.intent-panel'));

    function select(index: number) {
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[i].hidden = !active;
      });
    }

    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-labelledby', 'home-intent-title');
    tabs.forEach((tab, i) => {
      const panel = panels[i];
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        let next: number;
        switch (event.key) {
          case 'ArrowLeft': next = (i + tabs.length - 1) % tabs.length; break;
          case 'ArrowRight': next = (i + 1) % tabs.length; break;
          case 'Home': next = 0; break;
          case 'End': next = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        select(next);
        tabs[next].focus();
      });
    });
    select(0);
    tablist.hidden = false;
  }
</script>
```

- [ ] **Step 4: Mount the component immediately after Leading results**

Add this import alongside `NoResults` in `apps/web/src/pages/index.astro`:

```astro
import HomeIntentTabs from '../components/HomeIntentTabs.astro';
```

Add this line between the section ending after the Leading results empty-state branch and the section with `aria-labelledby="stack-preview-title"`:

```astro
  <HomeIntentTabs />
```
Do not nest it in either section.

Create `apps/web/src/pages/policy/data-centers.astro`:

```astro
---
import Base from '../../layouts/Base.astro';
---
<Base
  title="Local data centers: learn and speak up"
  description="Find official records for a local data center proposal, check claims, and send a comment to the body making the decision."
>
  <article class="wrap section voice-guide">
    <p class="eyebrow">Learn (Policy)</p>
    <h1>Local data centers: learn and speak up</h1>
    <p class="lede">Start with the project record. It can tell you what is proposed, who decides, and when your input can enter the public record.</p>

    <h2>Find the proposal and the decision-maker</h2>
    <p>Search the official planning or permitting site for your municipality, county, or other relevant authority using the project name, address, or parcel number. Check planning agendas and public notices. Save the case number, project application, staff reports, hearing dates, and name of the body making the decision. If you cannot locate the record, ask the planning or permitting office which agency has it.</p>

    <h2>Check the project’s claims</h2>
    <ul>
      <li><strong>Electricity:</strong> What is the expected demand, and who pays for grid upgrades?</li>
      <li><strong>Water:</strong> How will the site cool its equipment, where will the water come from, and what does the proposal say about use during dry periods?</li>
      <li><strong>Noise and backup power:</strong> What limits are proposed, and when can generators be tested or operated?</li>
      <li><strong>Local costs and benefits:</strong> Which jobs are permanent, what incentives are proposed, and which costs could fall on public agencies?</li>
    </ul>
    <p>Distinguish applicant estimates from agency findings. A pledge is not an enforceable permit condition; check the actual draft or final conditions.</p>

    <h2>Put your concern on the public record</h2>
    <p>Use the official notice to confirm the accepted comment channel, the deadline, and any hearing registration requirements. Include the case number, cite a document and page if you can, state one concern or question, and ask for a response or a specific condition. Keep a copy and any receipt. Comments may be public; check the notice before sharing personal information. Procedures vary by jurisdiction.</p>
    <blockquote>For this case, please identify which document estimates peak water use and explain whether the permit will set a limit for dry periods.</blockquote>
    <p>Unite4AI does not collect or submit public comments. Use the official channel named in the notice.</p>
  </article>
</Base>

<style>
  .voice-guide { max-width: 50rem; }
  .voice-guide h2 { margin-top: 2rem; }
</style>
```

Rerun the static smoke assertion in Step 2; expect the success line.

- [ ] **Step 5: Exercise the rendered interaction**

Open the local URL in a new isolated Chrome session, not in an existing user tab:

```sh
export CHROME_DEVTOOLS_AXI_SESSION=unite4ai-homepage
chrome-devtools-axi newpage http://127.0.0.1:4321/
```

- Desktop: observe Learn selected and the other panels absent from the accessibility snapshot. Click Learn (Policy). Press `ArrowRight`, `ArrowRight`, `End`, `Home`, then `Tab` twice. Expect Join, Learn, Join, Learn, then focus on Build and Compute in order. Activate each of the five links and verify it takes the same tab to its specified page. Check that Voice leads to the guide, not a comment form; the guide explains the official record, the claims to check, and how to comment.
- Mobile: `chrome-devtools-axi emulate --viewport '320x740x3,mobile,touch'`. Scroll to the chooser and activate Join. Confirm labels fit, actions wrap if needed, and opening the panel does not add horizontal scrolling (`document.documentElement.scrollWidth === document.documentElement.clientWidth`).
- Fallback: in isolated Chrome DevTools, open the Command Menu, run **Disable JavaScript**, and reload while DevTools is open. All three headed panels and five links must be visible without the tab row. Restore JavaScript afterward.
- The existing evals-pages tests in the repo gate cover hero/results ordering and separately cover the zero-run empty state. The chooser is mounted after the whole results section, outside the empty-state conditional.

- [ ] **Step 6: Run the repository gate**

```sh
source scripts/agent/activate-node.sh
node scripts/agent/verify.mjs --only hub
```

Expect the final JSON to report `status: pass` for `hub-validate`, `hub-typecheck`, `hub-build`, and `hub-test`. Stop the preview server after checking the site.

- [ ] **Step 7: Commit just the implementation**

Use the selective commit tool; do not take unrelated paths or local mockups:

```python
d = await commit.draft()
await d.only('apps/web/src/components/HomeIntentTabs.astro', 'apps/web/src/pages/index.astro', 'apps/web/src/pages/policy/data-centers.astro')
await d.commit('feat: add homepage intent tabs', ['- Add Learn, Learn (Policy), and Join after Leading results, plus a guide to local data center proposals.'])
```