# Homepage Intent Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended for this one dependent slice) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give visitors three ways to act directly after the homepage’s Leading results, without changing the evaluation-first layout.

**Architecture:** A homepage-only Astro component renders all three paths in static HTML. A small bundled script converts those same panels to accessible tabs; there is no second copy of the content or change to CSP.

**Tech Stack:** Astro, TypeScript DOM APIs, scoped CSS, existing Unite4AI design tokens.

---

**Spec:** [Homepage intent tabs](../specs/2026-11-23-homepage-intent-tabs-design.md). No evaluation, route, dependency, CSP, navigation, or membership changes.

### Task 1: Add the homepage chooser and verify it on the rendered site

**Files:**
- Create `apps/web/src/components/HomeIntentTabs.astro` — panel content, static fallback, tab semantics, and scoped styles.
- Modify `apps/web/src/pages/index.astro` — mount the component between Leading results and the open stack preview.
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
  ['/school', 'Browse free courses'],
  ['/contribute', 'See ways to contribute'],
  ['/community', 'Explore the community'],
]);
console.log('Homepage: all three static actions follow Leading results');
JS
```

- [ ] **Step 3: Create `HomeIntentTabs.astro`**

```astro
---
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';

const paths = [
  {
    id: 'learn', label: 'Learn', heading: 'Learn AI by doing it.',
    body: 'Start with the basics or run your first open model. The Open School is free, with no account required.',
    cta: 'Browse free courses', route: '/school',
    art: 'M50 74c-11-9-25-9-39-5V25c14-4 28-4 39 5 11-9 25-9 39-5v44c-14-4-28-4-39 5Zm0 0V30m-28 7c7-1 13 0 18 2m-18 9c7-1 13 0 18 2m20-11c5-2 11-3 18-2m-18 13c5-2 11-3 18-2',
  },
  {
    id: 'contribute', label: 'Contribute', heading: 'Make something here better.',
    body: 'Add a model or dataset, share a course, or help with translation and accessibility. You don’t need to know Git to start.',
    cta: 'See ways to contribute', route: '/contribute',
    art: 'm50 16 34 20v28L50 84 16 64V36Zm0 68V56m34-20L50 56 16 36m17-10 34 20v14m-28 9 4 2',
  },
  {
    id: 'meet', label: 'Meet people', heading: 'Find people working on open AI.',
    body: 'See workshops and office hours, or ask a question in public Discussions. You don’t need to contribute before saying hello.',
    cta: 'Explore the community', route: '/community',
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
  {paths.map(({ id, heading, body, cta, route, art }) => (
    <article class="intent-panel" id={`home-intent-panel-${id}`}>
      <div>
        <h3>{heading}</h3>
        <p>{body}</p>
        <a class="btn btn-ghost" href={href(route)}>{cta}</a>
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
  .intent-art {
    --intent-accent: var(--u-blue);
    display: grid; place-items: center; justify-self: center;
    width: min(100%, 10rem); aspect-ratio: 1; color: var(--intent-accent);
    background: radial-gradient(circle, color-mix(in srgb, currentColor 22%, transparent), transparent 70%);
  }
  .intent-art svg { width: 78%; height: auto; }
  .art-contribute { --intent-accent: var(--u-violet); }
  .art-meet { --intent-accent: var(--u-magenta); }
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

Do not nest it in either section. Rerun the static smoke assertion in Step 2; expect the success line.

- [ ] **Step 5: Exercise the rendered interaction**

Open the local URL in a new isolated Chrome session, not in an existing user tab:

```sh
export CHROME_DEVTOOLS_AXI_SESSION=unite4ai-homepage
chrome-devtools-axi newpage http://127.0.0.1:4321/
```

- Desktop: observe Learn selected and the other panels absent from the accessibility snapshot. Click Contribute. Press `ArrowRight`, `ArrowRight`, `End`, `Home`, and `Tab` in order. Expect Meet people, Learn, Meet people, Learn, then focus on Browse free courses. Click each panel’s link and verify it takes the same tab to its named site page. Return between clicks; a fresh page starts on Learn.
- Mobile: `chrome-devtools-axi emulate --viewport '320x740x3,mobile,touch'`. Scroll to the chooser and activate Meet people. Confirm all labels fit, the reading column has no clipped action, and no extra page scrolling was introduced. The current page-fit check is `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- Fallback: in isolated Chrome DevTools, open the Command Menu, run **Disable JavaScript**, and reload while DevTools is open. All three headed panels and links must be visible without the tab row. Restore JavaScript afterward.
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
await d.only('apps/web/src/components/HomeIntentTabs.astro', 'apps/web/src/pages/index.astro')
await d.commit('feat: add homepage intent tabs', ['- Keep Leading results under the hero and expose three accessible next steps.'])
```