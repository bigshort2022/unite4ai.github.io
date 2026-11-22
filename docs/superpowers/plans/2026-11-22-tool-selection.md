# Tool Selection Implementation Plan (agent evidence, plan 2 of 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tool-selection-v1`, a repeat-run benchmark of 100 generated requests (85 with exactly one correct tool call, 15 with none) that measures whether a model picks the right tool among near misses, fills its arguments exactly, and declines when no listed tool fits.

**Architecture:** A committed generator (`scripts/benchmarks/tool-selection.mjs`) writes a self-contained JSONL item file from a fixed seed; the file is vendored under `apps/web/public/data/benchmarks/` and pinned by SHA-256 like the canary set. A new suite (`apps/cli/src/eval/tool-selection.ts`) renders each item as a system message plus the request and its tools as JSON, and judges the last JSON object of the visible reply against the expected call. The benchmark page fixes the repeat method (5 runs, temperature 0.7) that plan 1's runner, statistics and gate already implement.

**Tech Stack:** Bun 1.4 workspace, TypeScript (`apps/cli`), plain ESM (`scripts/`), Astro 7 content collections, `node:test` + `node:assert/strict` under `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-22-agent-evidence-design.md`, section "Tool selection, version 1 (`tool-selection-v1`)". Delivery step 2. Builds on plan 1 (`docs/superpowers/plans/2026-11-22-repeat-runs.md`, merged in #35).

---

## Scope

In: generator and committed items, suite and judge, benchmark page, runner registration, the result-submission form, contributor docs, and the existing tests that list every benchmark.

Not here: computed floors (random choice, always-first) and registered baselines (plan 4); the BFCL calibration slice that is scored in this same prompted format (plan 3); native tool-calling (a later benchmark). No model is run by this plan; tests use local stub servers only.

## Decisions made while planning

The spec fixed the item counts, domains, prompt shape and scoring rule. Where it was silent:

| Question | Decision |
|---|---|
| What makes a no-call item | The tool its request needs is left out; the rest of its domain (its near misses) stays. The 15 left-out tools were picked so that no remaining tool can do the job in one call (`search_news` and `fetch_url` were rejected: `search_web` could arguably serve). |
| How many tools per item | All tools of the item's domain (4 to 7), filled up from other domains to a random size of 8 to 16. |
| Duplicate requests | Every request is unique among calls and among no-calls; a call and a no-call may share a request, because they offer different tools. |
| Optional parameters | Left out, `null`, or equal to the declared `default` all count as left out. Items never set an optional parameter to its default. `git_push.remote` defaults to `origin`, so the conventional remote is not marked wrong. |
| Free text in requests | Quoted, so a sentence's final period is never part of a value. |
| Types | Strings compare after trimming spaces; integers must be JSON numbers (`3.0` is 3, `"3"` is wrong); booleans exact. |
| Token limit | 1024 new tokens, reasoning included. A reply cut off before its JSON object has no answer and is wrong, so the suite does not need the end signal. |
| Where the answer is | The last JSON object in the visible reply, taken as wide as it parses; reasoning blocks are removed first, with the canary suite's rule moved into a shared `reply.ts`. |
| Category, scoring kind | `quality`, `exact-match`. |

## Before you start

```bash
cd /Users/b33j/unite4ai
git fetch origin
git worktree add ../unite4ai-tool-selection -b tool-selection origin/main   # skip if it exists
cd ../unite4ai-tool-selection
bun install --frozen-lockfile
npm ci --prefix sites/sustainability
source scripts/agent/activate-node.sh
```

Run one test file with `bun test <path>`. `bun run typecheck` covers `packages/schema`, `packages/core` and `apps/cli`; `bun run check` covers `apps/web`. Commit with the eval `commit` namespace (`d = await commit.draft(repo=...)`, `await d.only(...)`, `await d.commit(...)`); never `git add`/`git commit`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `apps/cli/src/eval/reply.ts` | create | `visibleReply`: the reply with reasoning blocks removed, shared by suites |
| `apps/cli/src/eval/canary.ts` | modify | Import `visibleReply` instead of its private copy |
| `scripts/benchmarks/tool-selection.mjs` | create | Seeded generator: tool catalogue, value pools, request templates, item assembly |
| `apps/web/public/data/benchmarks/tool-selection-v1.jsonl` | create (generated) | The 100 items, pinned by hash |
| `apps/cli/src/eval/tool-selection.ts` | create | Item parsing, prompt, `lastJsonObject`, `judge` |
| `apps/cli/src/eval/suites.ts` | modify | Register `tool-selection-v1` |
| `apps/web/src/content/benchmarks/tool-selection-v1.md` | create | Definition (repeat method) and published method |
| `.github/ISSUE_TEMPLATE/submit-eval-result.yml` | modify | Offer the new runnable benchmark |
| `CONTRIBUTING.md` | modify | Runnable benchmarks and the new run's size |
| `apps/cli/test/tool-selection.test.mjs` | create | Items, suite, scoring, page and an end-to-end run |
| `apps/web/test/evals-pages.test.mjs` | modify | Feed and evaluations-page assertions that list every benchmark |

---

### Task 1: Shared visible-reply helper

**Files:**
- Create: `apps/cli/src/eval/reply.ts`
- Modify: `apps/cli/src/eval/canary.ts`

This is a pure move: the canary suite's tests already cover the behaviour, so no new test.

- [ ] **Step 1: Create the module**

Create `apps/cli/src/eval/reply.ts`:

````ts
/**
 * The reply with the model's reasoning removed: `<think>…</think>` blocks, everything up to a
 * closing tag that has no opener (some servers stream the reasoning and then only the closing
 * tag), and everything from an opener that is never closed (the reply ran out of tokens
 * mid-thought).
 */
export function visibleReply(reply: string): string {
  return reply
    .replace(/<think>[\s\S]*?<\/think>/g, ' ')
    .replace(/^[\s\S]*<\/think>/, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
}
````

- [ ] **Step 2: Use it in the canary suite**

In `apps/cli/src/eval/canary.ts`, add `import { visibleReply } from './reply.ts';` below the `ChatMessage` import, and delete the private `visibleReply` function and its doc comment (the block that starts `The reply with the model's reasoning removed`). `judge` keeps calling `visibleReply`.

- [ ] **Step 3: Run the canary tests and the type check**

Run: `bun test apps/cli/test/canary.test.mjs && bun run typecheck`
Expected: all canary tests pass; 0 type errors.

- [ ] **Step: Commit**

Subject: `refactor(eval): share the visible-reply rule between suites`. Files: `apps/cli/src/eval/reply.ts`, `apps/cli/src/eval/canary.ts`.

---

### Task 2: Generator and committed items

**Files:**
- Create: `scripts/benchmarks/tool-selection.mjs`
- Create (generated): `apps/web/public/data/benchmarks/tool-selection-v1.jsonl`
- Test: `apps/cli/test/tool-selection.test.mjs` (created here; Tasks 3 and 4 extend it)

- [ ] **Step 1: Write the failing tests**

Create `apps/cli/test/tool-selection.test.mjs`:

````js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';

const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/tool-selection-v1.jsonl', import.meta.url));
/** Version "1" is these bytes. A change to the items needs a new version, with its own seed, file and hash. */
const V1_SHA256 = '95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const ITEMS = buildItems();
const byName = (item, name) => item.tools.find((tool) => tool.name === name);
const domainOf = (name) => Object.entries(TOOLS).find(([, tools]) => tools.some((tool) => tool.name === name))[0];

// ─── Items ───────────────────────────────────────────────────────────────────

test('the committed data file is exactly what the generator produces, and version 1 is frozen', () => {
  const committed = readFileSync(DATA, 'utf8');
  assert.equal(committed, toJsonl(ITEMS));
  assert.equal(sha256(committed), V1_SHA256, 'changed items are a new benchmark version, not version 1');
  assert.deepEqual(buildItems(), ITEMS, 'the generator is deterministic');
});

test('100 items with unique ids, 15 of them with no correct call, each offering 8 to 16 distinct tools', () => {
  assert.equal(ITEMS.length, 100);
  assert.equal(new Set(ITEMS.map((item) => item.id)).size, 100);
  assert.equal(ITEMS.filter((item) => item.expected.tool === null).length, NONE_COUNT);
  for (const item of ITEMS) {
    assert.equal(item.system, SYSTEM);
    assert.ok(item.tools.length >= 8 && item.tools.length <= 16, `${item.id}: ${item.tools.length} tools`);
    assert.equal(new Set(item.tools.map((tool) => tool.name)).size, item.tools.length, `${item.id}: a tool is offered twice`);
  }
});

test('every item offers its whole domain, so its near misses are always there', () => {
  for (const item of ITEMS) {
    const leftOut = item.expected.tool === null ? NONE_TARGETS.find((name) => domainOf(name) === item.domain && !byName(item, name)) : null;
    for (const tool of TOOLS[item.domain]) {
      if (tool.name !== leftOut) assert.ok(byName(item, tool.name), `${item.id}: ${tool.name} is missing`);
    }
  }
});

test('a call item offers its tool and its arguments fit the schema; a no-call item lacks the tool its request needs', () => {
  for (const item of ITEMS.filter((entry) => entry.expected.tool !== null)) {
    const { properties, required } = byName(item, item.expected.tool).parameters;
    const args = item.expected.arguments;
    for (const name of required) assert.ok(name in args, `${item.id}: required ${name} missing`);
    for (const [name, value] of Object.entries(args)) {
      const schema = properties[name];
      assert.ok(schema, `${item.id}: unknown argument ${name}`);
      assert.equal(typeof value, schema.type === 'integer' ? 'number' : schema.type, `${item.id}: ${name} has the wrong type`);
      if (schema.type === 'integer') assert.ok(Number.isInteger(value), `${item.id}: ${name} is not an integer`);
      if (schema.enum) assert.ok(schema.enum.includes(value), `${item.id}: ${name} is not one of its values`);
      if (typeof value === 'string') assert.ok(item.request.includes(value) || name === 'status', `${item.id}: ${name} is not written in the request`);
      if (schema.default !== undefined) assert.notEqual(value, schema.default, `${item.id}: ${name} repeats its default`);
    }
  }
  const noCall = ITEMS.filter((item) => item.expected.tool === null);
  assert.deepEqual(noCall.map((item) => item.expected.arguments), noCall.map(() => ({})));
  assert.deepEqual(
    NONE_TARGETS.filter((name) => noCall.some((item) => item.domain === domainOf(name) && !byName(item, name))).sort(),
    [...NONE_TARGETS].sort(),
    'each left-out tool is missing from an item of its domain',
  );
});

/** Every request a template can make: 2,000 draws from a fixed stream cover the small pools. */
const madeBy = new Map();
function requestsOf(template) {
  if (!madeBy.has(template)) {
    const next = generator(1);
    const pick = (pool) => POOLS[pool][Math.floor(next() * POOLS[pool].length)];
    madeBy.set(template, new Set(Array.from({ length: 2000 }, () => template(pick).request)));
  }
  return madeBy.get(template);
}
const asks = (name, request) => TEMPLATES[name].some((template) => requestsOf(template).has(request));

test('each request comes from its expected tool, or, with no call, from the tool left out and from no offered tool', () => {
  for (const item of ITEMS) {
    const offeredAsk = item.tools.filter((tool) => asks(tool.name, item.request)).map((tool) => tool.name);
    if (item.expected.tool === null) {
      assert.deepEqual(offeredAsk, [], `${item.id}: an offered tool makes this request`);
      const leftOut = NONE_TARGETS.filter((name) => !byName(item, name) && asks(name, item.request));
      assert.equal(leftOut.length, 1, `${item.id}: ${leftOut.length} left-out tools make this request`);
    } else {
      assert.deepEqual(offeredAsk, [item.expected.tool], `${item.id}: made by ${offeredAsk.join(', ')}`);
    }
  }
});

test('every tool is the answer to some item, and requests are unique among calls and among no-calls', () => {
  const answered = new Set(ITEMS.map((item) => item.expected.tool).filter(Boolean));
  assert.deepEqual([...answered].sort(), Object.values(TOOLS).flat().map((tool) => tool.name).sort());
  const calls = ITEMS.filter((item) => item.expected.tool !== null).map((item) => item.request);
  const noCalls = ITEMS.filter((item) => item.expected.tool === null).map((item) => item.request);
  assert.equal(new Set(calls).size, calls.length);
  assert.equal(new Set(noCalls).size, noCalls.length);
});

test('the data file is under 1 MB', () => {
  assert.ok(readFileSync(DATA).length < 1024 * 1024);
});
````

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/cli/test/tool-selection.test.mjs`
Expected: FAIL with `Cannot find module '../../../scripts/benchmarks/tool-selection.mjs'`.

- [ ] **Step 3: Write the generator**

Create `scripts/benchmarks/tool-selection.mjs` (it is executable like its canary sibling: `chmod +x`):

````js
#!/usr/bin/env node
/**
 * tool-selection-v1: 100 requests, each with 8 to 16 tools to choose from. 85 have exactly one
 * correct call; 15 have none, because the tool they need is left out while its near misses stay.
 * Run this file to regenerate the committed JSONL:
 *   node scripts/benchmarks/tool-selection.mjs
 * Any change to SEED, SYSTEM, TOOLS, POOLS or the generation rules is a new benchmark version:
 * version 1 is the committed file, and a test pins its hash.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OUTPUT = resolve(import.meta.dirname, '../../apps/web/public/data/benchmarks/tool-selection-v1.jsonl');

/** A new version takes a new seed, so its items are new. */
export const SEED = 20261201;
export const ITEM_COUNT = 100;
export const NONE_COUNT = 15;
export const MIN_TOOLS = 8;
export const MAX_TOOLS = 16;

export const SYSTEM = 'You choose and call tools for a user. You are given the user\'s request and a list of tools, '
  + 'each with a JSON Schema for its arguments. Reply with exactly one JSON object and nothing else, in this form: '
  + '{"tool": "<tool name>", "arguments": {"<argument name>": <value>}}. Use only a listed tool and only its '
  + 'parameters. Give every required parameter, and give an optional parameter only when the request asks for a '
  + 'value other than its default. Copy names, paths, identifiers and other values exactly as the request gives '
  + 'them. If none of the listed tools can carry out the request in one call, reply {"tool": null, "arguments": {}}.';

const str = (description) => ({ type: 'string', description });
const int = (description, defaultValue) => ({ type: 'integer', description, ...(defaultValue === undefined ? {} : { default: defaultValue }) });
const bool = (description, defaultValue) => ({ type: 'boolean', description, default: defaultValue });
const oneOf = (values, description) => ({ type: 'string', enum: values, description });

/** A tool as the model sees it: name, description, JSON Schema of its arguments. */
function tool(name, description, properties, required) {
  return { name, description, parameters: { type: 'object', properties, required } };
}

/**
 * Six domains of tools. Tools in one domain are near misses of each other: an item offers all
 * tools of its own domain, so the model must tell `search_web` from `search_news`,
 * `create_event` from `update_event`, `send_message` from `reply_message`, and so on.
 */
export const TOOLS = {
  files: [
    tool('read_file', 'Read the full text of a file on the local disk.', { path: str('Path of the file.') }, ['path']),
    tool('write_file', 'Create a file, or replace the whole content of an existing file, with the given text.', { path: str('Path of the file.'), content: str('The complete new content.') }, ['path', 'content']),
    tool('append_file', 'Add text to the end of an existing file, keeping what is already there.', { path: str('Path of the file.'), content: str('Text to add at the end.') }, ['path', 'content']),
    tool('delete_file', 'Delete a file from the local disk.', { path: str('Path of the file.') }, ['path']),
    tool('move_file', 'Move or rename a file on the local disk.', { source: str('Current path.'), destination: str('New path.') }, ['source', 'destination']),
    tool('search_files', 'Search the text inside local files for a phrase.', { query: str('Phrase to look for.'), directory: str('Only search inside this directory.') }, ['query']),
    tool('list_directory', 'List the files and folders in a local directory.', { path: str('Path of the directory.'), include_hidden: bool('Also list hidden entries.', false) }, ['path']),
  ],
  web: [
    tool('search_web', 'Search the public web and return matching pages.', { query: str('Search terms.'), max_results: int('How many results to return.', 5) }, ['query']),
    tool('search_news', 'Search recent news articles.', { query: str('Search terms.'), days: int('Only articles from the last this many days.', 7) }, ['query']),
    tool('search_images', 'Search the public web for images.', { query: str('Search terms.') }, ['query']),
    tool('fetch_url', 'Download the text of one web page by its address.', { url: str('Full address of the page.') }, ['url']),
  ],
  calendar: [
    tool('create_event', 'Add a new event to the calendar.', { title: str('Title of the event.'), date: str('Day, as YYYY-MM-DD.'), time: str('Start time, as HH:MM in 24-hour time.'), duration_minutes: int('Length in minutes.', 30) }, ['title', 'date', 'time']),
    tool('update_event', 'Change the day or start time of an existing event.', { event_id: str('Identifier of the event.'), date: str('New day, as YYYY-MM-DD.'), time: str('New start time, as HH:MM in 24-hour time.') }, ['event_id']),
    tool('delete_event', 'Remove an existing event from the calendar.', { event_id: str('Identifier of the event.') }, ['event_id']),
    tool('list_events', 'List the events on one day.', { date: str('Day, as YYYY-MM-DD.') }, ['date']),
    tool('invite_attendee', 'Invite a person to an existing event by email address.', { event_id: str('Identifier of the event.'), email: str('Email address of the person.') }, ['event_id', 'email']),
  ],
  git: [
    tool('git_commit', 'Record the staged changes in the current repository with a message.', { message: str('Commit message.') }, ['message']),
    tool('git_create_branch', 'Create a new branch from the current one and switch to it.', { name: str('Name of the new branch.') }, ['name']),
    tool('git_checkout', 'Switch to a branch that already exists.', { branch: str('Name of the branch.') }, ['branch']),
    tool('git_push', 'Push a branch to a remote repository.', { branch: str('Name of the branch.'), remote: { type: 'string', description: 'Name of the remote.', default: 'origin' } }, ['branch']),
    tool('git_status', 'Show which files have changed in the current repository.', {}, []),
    tool('git_log', 'Show the most recent commits of the current branch.', { limit: int('How many commits to show.', 10) }, []),
  ],
  messaging: [
    tool('send_message', 'Start a new chat conversation with a person, by their chat username.', { recipient: str('Chat username.'), text: str('Message text.') }, ['recipient', 'text']),
    tool('reply_message', 'Reply inside an existing chat thread.', { message_id: str('Identifier of the message to reply to.'), text: str('Reply text.') }, ['message_id', 'text']),
    tool('send_email', 'Send an email to an email address.', { to: str('Email address.'), subject: str('Subject line.'), body: str('Body text.') }, ['to', 'subject', 'body']),
    tool('search_messages', 'Search past chat messages.', { query: str('Words to look for.'), sender: str('Only messages from this chat username.') }, ['query']),
  ],
  tickets: [
    tool('create_ticket', 'Open a new ticket in the issue tracker.', { title: str('Title of the ticket.'), priority: oneOf(['low', 'medium', 'high'], 'Priority.') }, ['title', 'priority']),
    tool('update_ticket_status', 'Change the status of an existing ticket.', { ticket_id: str('Identifier of the ticket.'), status: oneOf(['open', 'in_progress', 'closed'], 'New status.') }, ['ticket_id', 'status']),
    tool('assign_ticket', 'Assign an existing ticket to a person.', { ticket_id: str('Identifier of the ticket.'), assignee: str('Username of the person.') }, ['ticket_id', 'assignee']),
    tool('comment_ticket', 'Add a comment to an existing ticket.', { ticket_id: str('Identifier of the ticket.'), text: str('Comment text.') }, ['ticket_id', 'text']),
    tool('search_tickets', 'Find tickets whose title or text matches.', { query: str('Words to look for.'), status: oneOf(['open', 'in_progress', 'closed'], 'Only tickets with this status.') }, ['query']),
  ],
};

/** Values a request can name. Each is written into the request exactly as the call must give it. */
export const POOLS = {
  path: ['notes/todo.md', 'reports/q3-summary.txt', 'src/app/config.yaml', 'docs/setup.md', 'data/customers.csv', 'drafts/letter.txt', 'logs/build.log', 'scripts/deploy.sh'],
  newPath: ['archive/2026/todo.md', 'reports/old/q3-summary.txt', 'backup/config.yaml', 'docs/install.md'],
  directory: ['src', 'docs', 'reports', 'notes'],
  line: ['Call the plumber on Friday.', 'Remember to renew the domain.', 'Budget approved by finance.', 'Next review in January.'],
  text: ['Meeting moved to 3pm.', 'Draft is ready for review.', 'Thanks, that fixed it.', 'I will be ten minutes late.'],
  phrase: ['invoice', 'deadline', 'password reset', 'quarterly budget', 'database migration'],
  topic: ['solar panel efficiency', 'electric bike regulations', 'sourdough starter', 'heat pump installation', 'rail strikes'],
  url: ['https://example.org/pricing', 'https://example.com/docs/install', 'https://example.net/blog/2026/release-notes', 'https://example.org/about/team'],
  title: ['Dentist appointment', 'Team retrospective', 'Budget review', 'Call with supplier', 'Quarterly planning'],
  date: ['2026-12-03', '2026-12-08', '2026-12-11', '2026-12-15', '2026-12-17'],
  time: ['09:30', '11:00', '14:15', '16:45'],
  duration: [15, 45, 60, 90],
  eventId: ['EV-104', 'EV-219', 'EV-337', 'EV-482'],
  email: ['alice@example.com', 'bob.ng@example.org', 'carla@example.net', 'dev-team@example.com'],
  username: ['alice', 'bob.ng', 'carla', 'dmitri'],
  messageId: ['MSG-1042', 'MSG-2210', 'MSG-3307', 'MSG-4518'],
  commitMessage: ['Fix login redirect', 'Update README with setup steps', 'Remove unused config keys', 'Add tests for parser'],
  branch: ['feature/search-filters', 'fix/date-parsing', 'release/2026-12', 'docs/api-guide'],
  remote: ['upstream', 'backup'],
  count: [3, 8, 20],
  days: [1, 3, 30],
  ticketTitle: ['Login page times out', 'Export to CSV drops rows', 'Typo on pricing page', 'Search ignores accents'],
  priority: ['low', 'medium', 'high'],
  ticketId: ['TCK-17', 'TCK-205', 'TCK-388', 'TCK-940'],
  status: ['open', 'in_progress', 'closed'],
  statusWords: { open: 'open', in_progress: 'in-progress', closed: 'closed' },
};

/**
 * Request templates per tool. Each takes a `pick` function that draws a value from a pool and
 * returns the request text and the exact arguments of the correct call.
 */
export const TEMPLATES = {
  read_file: [
    (pick) => { const path = pick('path'); return { request: `Show me what is written in the file ${path}.`, arguments: { path } }; },
  ],
  write_file: [
    (pick) => { const path = pick('path'); const content = pick('line'); return { request: `Replace everything in ${path} with this single line: "${content}"`, arguments: { path, content } }; },
  ],
  append_file: [
    (pick) => { const path = pick('path'); const content = pick('line'); return { request: `Add this line to the end of ${path}, keeping what is already there: "${content}"`, arguments: { path, content } }; },
  ],
  delete_file: [
    (pick) => { const path = pick('path'); return { request: `Delete the file ${path}.`, arguments: { path } }; },
  ],
  move_file: [
    (pick) => { const source = pick('path'); const destination = pick('newPath'); return { request: `Rename ${source} to ${destination}.`, arguments: { source, destination } }; },
  ],
  search_files: [
    (pick) => { const query = pick('phrase'); return { request: `Which of my local files mention "${query}"?`, arguments: { query } }; },
    (pick) => { const query = pick('phrase'); const directory = pick('directory'); return { request: `Look through the files in the ${directory} directory for the phrase "${query}".`, arguments: { query, directory } }; },
  ],
  list_directory: [
    (pick) => { const path = pick('directory'); return { request: `What is in the ${path} directory?`, arguments: { path } }; },
    (pick) => { const path = pick('directory'); return { request: `List everything in the ${path} directory, hidden files included.`, arguments: { path, include_hidden: true } }; },
  ],
  search_web: [
    (pick) => { const query = pick('topic'); return { request: `Search the web for ${query}.`, arguments: { query } }; },
    (pick) => { const query = pick('topic'); const max = pick('count'); return { request: `Find me the top ${max} web pages about ${query}.`, arguments: { query, max_results: max } }; },
  ],
  search_news: [
    (pick) => { const query = pick('topic'); return { request: `What has been in the news about ${query} this past week?`, arguments: { query } }; },
    (pick) => { const query = pick('topic'); const days = pick('days'); return { request: `Find news articles about ${query} from the last ${days} days.`, arguments: { query, days } }; },
  ],
  search_images: [
    (pick) => { const query = pick('topic'); return { request: `Find some pictures of ${query}.`, arguments: { query } }; },
  ],
  fetch_url: [
    (pick) => { const url = pick('url'); return { request: `Get me the text of the page at ${url}.`, arguments: { url } }; },
  ],
  create_event: [
    (pick) => { const title = pick('title'); const date = pick('date'); const time = pick('time'); return { request: `Put "${title}" on my calendar on ${date} at ${time}.`, arguments: { title, date, time } }; },
    (pick) => { const title = pick('title'); const date = pick('date'); const time = pick('time'); const minutes = pick('duration'); return { request: `Schedule "${title}" for ${minutes} minutes on ${date}, starting at ${time}.`, arguments: { title, date, time, duration_minutes: minutes } }; },
  ],
  update_event: [
    (pick) => { const id = pick('eventId'); const date = pick('date'); return { request: `Move event ${id} to ${date}; keep the same time.`, arguments: { event_id: id, date } }; },
    (pick) => { const id = pick('eventId'); const time = pick('time'); return { request: `Event ${id} should start at ${time} instead, same day.`, arguments: { event_id: id, time } }; },
  ],
  delete_event: [
    (pick) => { const id = pick('eventId'); return { request: `Cancel event ${id} and take it off my calendar.`, arguments: { event_id: id } }; },
  ],
  list_events: [
    (pick) => { const date = pick('date'); return { request: `What do I have on ${date}?`, arguments: { date } }; },
  ],
  invite_attendee: [
    (pick) => { const id = pick('eventId'); const email = pick('email'); return { request: `Add ${email} as a guest to event ${id}.`, arguments: { event_id: id, email } }; },
  ],
  git_commit: [
    (pick) => { const message = pick('commitMessage'); return { request: `Commit the staged changes with the message "${message}".`, arguments: { message } }; },
  ],
  git_create_branch: [
    (pick) => { const name = pick('branch'); return { request: `Start a new branch called ${name}.`, arguments: { name } }; },
  ],
  git_checkout: [
    (pick) => { const branch = pick('branch'); return { request: `Switch to the existing branch ${branch}.`, arguments: { branch } }; },
  ],
  git_push: [
    (pick) => { const branch = pick('branch'); return { request: `Push the branch ${branch}.`, arguments: { branch } }; },
    (pick) => { const branch = pick('branch'); const remote = pick('remote'); return { request: `Push ${branch} to the ${remote} remote.`, arguments: { branch, remote } }; },
  ],
  git_status: [
    () => ({ request: 'Which files have I changed in this repository?', arguments: {} }),
    () => ({ request: 'Is anything modified but not yet committed here?', arguments: {} }),
    () => ({ request: 'Give me the status of my working tree.', arguments: {} }),
  ],
  git_log: [
    () => ({ request: 'Show me the latest commits on this branch.', arguments: {} }),
    (pick) => { const limit = pick('count'); return { request: `Show me the last ${limit} commits.`, arguments: { limit } }; },
    () => ({ request: 'What has been committed here recently?', arguments: {} }),
  ],
  send_message: [
    (pick) => { const recipient = pick('username'); const text = pick('text'); return { request: `Send ${recipient} a chat message saying: "${text}"`, arguments: { recipient, text } }; },
  ],
  reply_message: [
    (pick) => { const id = pick('messageId'); const text = pick('text'); return { request: `Answer message ${id} in its thread with: "${text}"`, arguments: { message_id: id, text } }; },
  ],
  send_email: [
    (pick) => { const to = pick('email'); const subject = pick('title'); const body = pick('text'); return { request: `Email ${to} with the subject "${subject}" and the text: "${body}"`, arguments: { to, subject, body } }; },
  ],
  search_messages: [
    (pick) => { const query = pick('phrase'); return { request: `Find the chat messages where someone mentioned "${query}".`, arguments: { query } }; },
    (pick) => { const query = pick('phrase'); const sender = pick('username'); return { request: `Find chat messages from ${sender} that mention "${query}".`, arguments: { query, sender } }; },
  ],
  create_ticket: [
    (pick) => { const title = pick('ticketTitle'); const priority = pick('priority'); return { request: `Open a ${priority} priority ticket titled "${title}".`, arguments: { title, priority } }; },
  ],
  update_ticket_status: [
    (pick) => { const id = pick('ticketId'); const status = pick('status'); return { request: `Set the status of ticket ${id} to ${POOLS.statusWords[status]}.`, arguments: { ticket_id: id, status } }; },
  ],
  assign_ticket: [
    (pick) => { const id = pick('ticketId'); const assignee = pick('username'); return { request: `Give ticket ${id} to ${assignee}.`, arguments: { ticket_id: id, assignee } }; },
  ],
  comment_ticket: [
    (pick) => { const id = pick('ticketId'); const text = pick('text'); return { request: `Leave a note on ticket ${id}: "${text}"`, arguments: { ticket_id: id, text } }; },
  ],
  search_tickets: [
    (pick) => { const query = pick('phrase'); return { request: `Find tickets about "${query}".`, arguments: { query } }; },
    (pick) => { const query = pick('phrase'); const status = pick('status'); return { request: `Find ${POOLS.statusWords[status]} tickets about "${query}".`, arguments: { query, status } }; },
  ],
};

/**
 * The tools whose requests become the 15 items with no correct call: each is left out of its
 * item while the rest of its domain, its near misses, stay.
 */
export const NONE_TARGETS = [
  'append_file', 'delete_file', 'move_file', 'list_events', 'git_commit',
  'delete_event', 'invite_attendee', 'update_event', 'git_push', 'git_create_branch',
  'send_email', 'reply_message', 'assign_ticket', 'comment_ticket', 'update_ticket_status',
];

/** mulberry32: a small seeded generator with the same output on every platform. */
export function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOMAIN_OF = new Map(Object.entries(TOOLS).flatMap(([domain, tools]) => tools.map((t) => [t.name, domain])));
const ALL_TOOLS = Object.values(TOOLS).flat();

/** Fisher–Yates with the given generator; returns a new array. */
function shuffled(list, next) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The tools an item offers: its domain's (less `leftOut`), filled up from other domains, in random order. */
function toolsFor(domain, leftOut, next) {
  const own = TOOLS[domain].filter((t) => t.name !== leftOut);
  const size = MIN_TOOLS + Math.floor(next() * (MAX_TOOLS - MIN_TOOLS + 1));
  const others = shuffled(ALL_TOOLS.filter((t) => DOMAIN_OF.get(t.name) !== domain), next);
  return shuffled([...own, ...others.slice(0, Math.max(size - own.length, 0))], next);
}

export function buildItems() {
  const next = generator(SEED);
  const pick = (pool) => POOLS[pool][Math.floor(next() * POOLS[pool].length)];
  /**
   * A request no earlier item of the same kind has used: values are drawn again until the text
   * is new. A call and an item with no call may share a request; they offer different tools.
   */
  const unique = (seen, template) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const drawn = template(pick);
      if (!seen.has(drawn.request)) {
        seen.add(drawn.request);
        return drawn;
      }
    }
    throw new Error('ran out of distinct requests; add values to POOLS');
  };
  const names = ALL_TOOLS.map((t) => t.name);
  const drafts = [];
  const calls = new Set();
  for (let i = 0; i < ITEM_COUNT - NONE_COUNT; i += 1) {
    const name = names[i % names.length];
    const templates = TEMPLATES[name];
    const { request, arguments: args } = unique(calls, templates[Math.floor(i / names.length) % templates.length]);
    const domain = DOMAIN_OF.get(name);
    drafts.push({ domain, request, tools: toolsFor(domain, null, next), expected: { tool: name, arguments: args } });
  }
  const nones = new Set();
  for (const name of NONE_TARGETS) {
    const { request } = unique(nones, TEMPLATES[name][0]);
    const domain = DOMAIN_OF.get(name);
    drafts.push({ domain, request, tools: toolsFor(domain, name, next), expected: { tool: null, arguments: {} } });
  }
  return shuffled(drafts, next).map((draft, index) => ({
    id: `ts-${String(index + 1).padStart(3, '0')}`,
    system: SYSTEM,
    ...draft,
  }));
}

export function toJsonl(items) {
  return `${items.map((item) => JSON.stringify(item)).join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  const items = buildItems();
  writeFileSync(OUTPUT, toJsonl(items));
  console.log(`wrote ${items.length} items to ${OUTPUT}`);
}
````

- [ ] **Step 4: Generate the items**

Run: `node scripts/benchmarks/tool-selection.mjs && shasum -a 256 apps/web/public/data/benchmarks/tool-selection-v1.jsonl`
Expected: `wrote 100 items to …/tool-selection-v1.jsonl` and the hash `95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db`. A different hash means the generator was not copied exactly; fix the copy, never the pinned hash. The file is 422,152 bytes.

- [ ] **Step 5: Run the tests**

Run: `bun test apps/cli/test/tool-selection.test.mjs`
Expected: 7 pass, 0 fail.

- [ ] **Step: Commit**

Subject: `feat(benchmarks): tool-selection-v1 generator and its 100 items`. Files: `scripts/benchmarks/tool-selection.mjs`, `apps/web/public/data/benchmarks/tool-selection-v1.jsonl`, `apps/cli/test/tool-selection.test.mjs`.

---

### Task 3: Suite and judge

**Files:**
- Create: `apps/cli/src/eval/tool-selection.ts`
- Modify: `apps/cli/src/eval/suites.ts`
- Test: `apps/cli/test/tool-selection.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `apps/cli/test/tool-selection.test.mjs`, replace everything from the first line through the line `const domainOf = …` with:

````js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';
import { SUITES } from '../src/eval/suites.ts';
import { judge, lastJsonObject } from '../src/eval/tool-selection.ts';

const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/tool-selection-v1.jsonl', import.meta.url));
/** Version "1" is these bytes. A change to the items needs a new version, with its own seed, file and hash. */
const V1_SHA256 = '95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const ITEMS = buildItems();
const byName = (item, name) => item.tools.find((tool) => tool.name === name);
const domainOf = (name) => Object.entries(TOOLS).find(([, tools]) => tools.some((tool) => tool.name === name))[0];
````

and append at the end of the file:

````js
// ─── Suite ───────────────────────────────────────────────────────────────────

test('the suite reads its vendored copy of the data', () => {
  assert.equal(SUITES['tool-selection-v1'].localSource, '../../public/data/benchmarks/tool-selection-v1.jsonl');
});

test('the suite builds the published prompt: system message, then the request and its tools as indented JSON', () => {
  const [first] = SUITES['tool-selection-v1'].items(readFileSync(DATA, 'utf8'), 100);
  assert.deepEqual(first.messages, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Request: ${ITEMS[0].request}\n\nTools:\n${JSON.stringify(ITEMS[0].tools, null, 2)}` },
  ]);
  assert.equal(first.expected, JSON.stringify(ITEMS[0].expected));
});

test('the suite refuses a source with the wrong number of items or an item whose answer is not offered', () => {
  const suite = SUITES['tool-selection-v1'];
  const lines = readFileSync(DATA, 'utf8').trim().split('\n');
  assert.throws(() => suite.items(lines.slice(0, 10).join('\n'), 100), /has 10 items; the benchmark needs 100/);
  const call = ITEMS.findIndex((item) => item.expected.tool !== null);
  const broken = ITEMS.map((item, index) => (index === call ? { ...item, tools: item.tools.filter((tool) => tool.name !== item.expected.tool) } : item));
  assert.throws(() => suite.items(toJsonl(broken), 100), new RegExp(`item ${call + 1}: expected tool "${ITEMS[call].expected.tool}" is not among its tools`));
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

const ITEM = {
  id: 'fixture',
  system: SYSTEM,
  domain: 'files',
  request: 'Look through the files in the docs directory for the phrase "invoice".',
  tools: TOOLS.files,
  expected: { tool: 'search_files', arguments: { query: 'invoice', directory: 'docs' } },
};
const LIST = { ...ITEM, request: 'What is in the docs directory?', expected: { tool: 'list_directory', arguments: { path: 'docs' } } };
const LOG = {
  ...ITEM,
  domain: 'git',
  request: 'Show me the last 3 commits.',
  tools: TOOLS.git,
  expected: { tool: 'git_log', arguments: { limit: 3 } },
};
const NONE = { ...ITEM, tools: TOOLS.files.filter((tool) => tool.name !== 'search_files'), expected: { tool: null, arguments: {} } };
const reply = (answer) => JSON.stringify(answer);
const correct = (text, item = ITEM) => judge(text, item).correct;

test('the last JSON object in the text is the answer, however much text or fencing surrounds it', () => {
  assert.deepEqual(lastJsonObject('I will search.\n```json\n{"tool": "x", "arguments": {"a": {"b": 1}}}\n```'), { tool: 'x', arguments: { a: { b: 1 } } });
  assert.deepEqual(lastJsonObject('{"tool": "a"} then {"tool": "b"}'), { tool: 'b' });
  assert.deepEqual(lastJsonObject('{"tool": "a", "arguments": {}} and a stray }'), { tool: 'a', arguments: {} });
  assert.equal(lastJsonObject('no object here'), null);
  assert.equal(lastJsonObject('{"tool": "cut off'), null);
});

test('the exact call is correct, with spaces around strings ignored and a reasoning block removed', () => {
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: 'docs' } })), true);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { directory: ' docs ', query: 'invoice' } })), true);
  const thought = `<think>Maybe {"tool": "search_web", "arguments": {"query": "invoice"}}</think>${reply(ITEM.expected)}`;
  assert.equal(correct(thought), true);
  const verdict = judge(`Here you go: ${reply(ITEM.expected)}`, ITEM);
  assert.deepEqual(verdict, { correct: true, extracted: JSON.stringify(ITEM.expected) });
});

test('a near miss, a missing, wrong or extra argument, or no object at all is wrong', () => {
  assert.equal(correct(reply({ tool: 'search_web', arguments: { query: 'invoice' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'Invoice', directory: 'docs' } })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: 'docs', limit: 5 } })), false);
  assert.equal(correct(reply({ tool: 'search_files' })), false);
  assert.equal(correct(reply({ name: 'search_files', arguments: ITEM.expected.arguments })), false);
  assert.equal(correct(reply({ tool: 'search_files', arguments: ['invoice', 'docs'] })), false);
  assert.deepEqual(judge('I would search the files for it.', ITEM), { correct: false, extracted: null });
  // The answer is the last object, even when an earlier one was right.
  assert.equal(correct(`${reply(ITEM.expected)} or maybe ${reply({ tool: 'search_web', arguments: { query: 'invoice' } })}`), false);
});

test('an optional parameter the request does not set may be left out, null or its default, and nothing else', () => {
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs' } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: false } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: null } }), LIST), true);
  assert.equal(correct(reply({ tool: 'list_directory', arguments: { path: 'docs', include_hidden: true } }), LIST), false);
  // Without a default, an unset optional parameter must be left out.
  const unset = { ...ITEM, expected: { tool: 'search_files', arguments: { query: 'invoice' } } };
  assert.equal(correct(reply({ tool: 'search_files', arguments: { query: 'invoice', directory: '' } }), unset), false);
});

test('an integer must be a JSON number: 3.0 is 3, "3" is wrong', () => {
  assert.equal(correct('{"tool": "git_log", "arguments": {"limit": 3.0}}', LOG), true);
  assert.equal(correct(reply({ tool: 'git_log', arguments: { limit: '3' } }), LOG), false);
  assert.equal(correct(reply({ tool: 'git_log', arguments: { limit: 4 } }), LOG), false);
});

test('with no correct call, only a null tool with no arguments is correct', () => {
  assert.equal(correct(reply({ tool: null, arguments: {} }), NONE), true);
  assert.equal(correct(reply({ tool: null }), NONE), true);
  assert.equal(correct(reply({ tool: null, arguments: { query: 'invoice' } }), NONE), false);
  assert.equal(correct(reply({ tool: 'search_web', arguments: { query: 'invoice' } }), NONE), false);
  assert.equal(correct('I cannot do that with these tools.', NONE), false);
  // And a null answer to an item that has a call is wrong.
  assert.equal(correct(reply({ tool: null, arguments: {} })), false);
});
````

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/cli/test/tool-selection.test.mjs`
Expected: FAIL with `Cannot find module '../src/eval/tool-selection.ts'`.

- [ ] **Step 3: Write the suite module**

Create `apps/cli/src/eval/tool-selection.ts`:

````ts
/**
 * Tool-selection suite, benchmark version 1. The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/tool-selection-v1.md); change them together and bump the
 * version. The items come from scripts/benchmarks/tool-selection.mjs.
 */
import type { ChatMessage } from './gsm8k.ts';
import { visibleReply } from './reply.ts';

/** Recorded in every transcript; bump when the prompt or the scoring rule changes. */
export const PROMPT_VERSION = 'tool-selection-1';

/** New tokens allowed per reply, reasoning included. */
export const MAX_TOKENS = 1024;

type Value = string | number | boolean;

export interface ParameterSchema {
  type: 'string' | 'integer' | 'boolean';
  description: string;
  enum?: string[];
  default?: Value;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, ParameterSchema>; required: string[] };
}

export interface ToolItem {
  id: string;
  system: string;
  domain: string;
  request: string;
  tools: ToolDefinition[];
  /** `tool` is null when no listed tool can carry out the request. */
  expected: { tool: string | null; arguments: Record<string, Value> };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseItems(source: string, count: number): ToolItem[] {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length !== count) throw new Error(`source has ${lines.length} items; the benchmark needs ${count}`);
  return lines.map((line, index) => {
    const row = JSON.parse(line) as Record<string, unknown>;
    for (const key of ['id', 'system', 'domain', 'request'] as const) {
      if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`item ${index + 1}: missing "${key}"`);
    }
    if (!Array.isArray(row.tools) || row.tools.length === 0) throw new Error(`item ${index + 1}: missing "tools"`);
    const expected = row.expected;
    if (!isObject(expected) || !(typeof expected.tool === 'string' || expected.tool === null) || !isObject(expected.arguments)) {
      throw new Error(`item ${index + 1}: missing "expected"`);
    }
    if (expected.tool !== null && !row.tools.some((tool) => isObject(tool) && tool.name === expected.tool)) {
      throw new Error(`item ${index + 1}: expected tool "${expected.tool}" is not among its tools`);
    }
    return row as unknown as ToolItem;
  });
}

export function buildMessages(item: ToolItem): ChatMessage[] {
  return [
    { role: 'system', content: item.system },
    { role: 'user', content: `Request: ${item.request}\n\nTools:\n${JSON.stringify(item.tools, null, 2)}` },
  ];
}

/**
 * The last JSON object in the text: of the spans from a `{` to a `}` that parse as an object, the
 * one that ends last, taking the widest such span. Code fences and prose around it do not matter.
 */
export function lastJsonObject(text: string): Record<string, unknown> | null {
  const opens: number[] = [];
  const closes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') opens.push(index);
    else if (text[index] === '}') closes.push(index);
  }
  for (const end of closes.reverse()) {
    let found: Record<string, unknown> | null = null;
    for (const start of opens) {
      if (start > end) break;
      try {
        const value: unknown = JSON.parse(text.slice(start, end + 1));
        // The first success is the widest span, because opens run from left to right.
        if (isObject(value)) {
          found = value;
          break;
        }
      } catch {
        // Not a whole object from this brace; a narrower span may be.
      }
    }
    if (found !== null) return found;
  }
  return null;
}

/** Whether a given argument value is the expected one under the parameter's type. */
function same(schema: ParameterSchema, given: unknown, expected: Value): boolean {
  switch (schema.type) {
    case 'string':
      return typeof given === 'string' && given.trim() === expected;
    case 'integer':
      return typeof given === 'number' && given === expected;
    case 'boolean':
      return given === expected;
  }
}

/**
 * Whether the answer is the expected call. The tool name must match exactly. Arguments must name
 * only the tool's parameters and include every expected one with its value; a parameter the
 * request does not set must be left out or given its default. A null argument counts as left out.
 * With no correct call, the answer must be a null tool with no arguments.
 */
function matches(answer: Record<string, unknown>, item: ToolItem): boolean {
  if (!('tool' in answer)) return false;
  const raw = answer.arguments ?? {};
  if (!isObject(raw)) return false;
  const given = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null));
  if (item.expected.tool === null) return answer.tool === null && Object.keys(given).length === 0;
  if (answer.tool !== item.expected.tool) return false;

  const { properties } = (item.tools.find((tool) => tool.name === item.expected.tool) as ToolDefinition).parameters;
  if (Object.keys(given).some((name) => !(name in properties))) return false;
  return Object.entries(properties).every(([name, schema]) => {
    const expected = item.expected.arguments[name];
    if (expected !== undefined) return name in given && same(schema, given[name], expected);
    return !(name in given) || (schema.default !== undefined && same(schema, given[name], schema.default));
  });
}

/** The answer is the last JSON object in the visible reply; a reply without one is wrong. */
export function judge(reply: string, item: ToolItem): { correct: boolean; extracted: string | null } {
  const answer = lastJsonObject(visibleReply(reply));
  if (answer === null) return { correct: false, extracted: null };
  return { correct: matches(answer, item), extracted: JSON.stringify(answer) };
}
````

Note the brace scan: it collects positions first instead of walking back with `lastIndexOf`, because `lastIndexOf('{', -1)` searches from index 0 and would loop forever on a reply that starts with `{` (found while planning; the test `'{"tool": "a"} then {"tool": "b"}'` covers it).

- [ ] **Step 4: Register the suite**

In `apps/cli/src/eval/suites.ts`, add `import * as toolSelection from './tool-selection.ts';` below the `./gsm8k.ts` import; after the `canaryInjection` suite add:

````ts
const toolSelectionSuite: Suite = {
  promptVersion: toolSelection.PROMPT_VERSION,
  maxTokens: toolSelection.MAX_TOKENS,
  localSource: '../../public/data/benchmarks/tool-selection-v1.jsonl',
  items: (source, count) => toolSelection.parseItems(source, count).map((item, index) => ({
    index,
    messages: toolSelection.buildMessages(item),
    expected: JSON.stringify(item.expected),
    // A reply cut off before its JSON object has no answer and is wrong; how it ended adds nothing.
    judge: (reply) => toolSelection.judge(reply, item),
  })),
};
````

and add `'tool-selection-v1': toolSelectionSuite,` as the last entry of `SUITES`.

- [ ] **Step 5: Run the tests and the type check**

Run: `bun test apps/cli/test/tool-selection.test.mjs && bun run typecheck`
Expected: 16 pass, 0 fail; 0 type errors.

- [ ] **Step: Commit**

Subject: `feat(eval): tool-selection suite: prompt with tools as JSON, judge by the last JSON object`. Files: `apps/cli/src/eval/tool-selection.ts`, `apps/cli/src/eval/suites.ts`, `apps/cli/test/tool-selection.test.mjs`.

---

### Task 4: Benchmark page, end-to-end run and the lists of benchmarks

**Files:**
- Create: `apps/web/src/content/benchmarks/tool-selection-v1.md`
- Modify: `.github/ISSUE_TEMPLATE/submit-eval-result.yml`
- Test: `apps/cli/test/tool-selection.test.mjs`, `apps/web/test/evals-pages.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `apps/cli/test/tool-selection.test.mjs`, replace everything from the first line through the line `const domainOf = …` with:

````js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatProblems } from '@unite4ai/core/repeat';
import { validateContent } from '@unite4ai/core/validate';
import { NONE_COUNT, NONE_TARGETS, POOLS, SYSTEM, TEMPLATES, TOOLS, buildItems, generator, toJsonl } from '../../../scripts/benchmarks/tool-selection.mjs';
import { runEval } from '../src/eval/run.ts';
import { SUITES } from '../src/eval/suites.ts';
import { judge, lastJsonObject } from '../src/eval/tool-selection.ts';

const CONTENT_ROOT = fileURLToPath(new URL('../../web/src/content', import.meta.url));
const DATA = fileURLToPath(new URL('../../web/public/data/benchmarks/tool-selection-v1.jsonl', import.meta.url));
const DEFINITION = join(CONTENT_ROOT, 'benchmarks/tool-selection-v1.md');
/** Version "1" is these bytes. A change to the items needs a new version, with its own seed, file and hash. */
const V1_SHA256 = '95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const ITEMS = buildItems();
const byName = (item, name) => item.tools.find((tool) => tool.name === name);
const domainOf = (name) => Object.entries(TOOLS).find(([, tools]) => tools.some((tool) => tool.name === name))[0];
````

and append at the end of the file:

````js
// ─── Page and runner ─────────────────────────────────────────────────────────

test('the benchmark page pins the data and gives the system message word for word', () => {
  const definition = readFileSync(DEFINITION, 'utf8');
  assert.match(definition, new RegExp(`^source_sha256: ${V1_SHA256}$`, 'm'));
  assert.match(definition, /^version: "1"$/m);
  assert.match(definition, /^items: 100$/m);
  assert.match(definition, /^scoring: exact-match$/m);
  assert.match(definition, /^repeat:\n {2}runs: 5\n {2}temperature: 0\.7\n {2}top_p: 1$/m);
  assert.ok(definition.includes(`\n\`\`\`text\n${SYSTEM}\n\`\`\`\n`), 'the system message must be on the page verbatim');
});

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const temps = [];
const servers = [];
after(() => {
  servers.forEach((server) => server.close());
  temps.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/** A content root laid out as in the repository, with the real definition and the vendored data. */
function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-tools-'));
  temps.push(root);
  const contentRoot = join(root, 'src/content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  copyFileSync(DEFINITION, join(contentRoot, 'benchmarks/tool-selection-v1.md'));
  const data = join(root, 'public/data/benchmarks/tool-selection-v1.jsonl');
  mkdirSync(dirname(data), { recursive: true });
  copyFileSync(DATA, data);
  return { contentRoot, workDir: join(root, 'work') };
}

/**
 * A model that answers every item with its expected call, except that it never declines: on an
 * item with no correct call it calls the first tool offered. A request that departs from the
 * published method gets a 500 that says how.
 */
function stubServer() {
  const items = new Map(ITEMS.map((item) => [item.request + JSON.stringify(item.tools), item]));
  const bodies = [];
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const json = (code, payload) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.url === '/v1/models') return json(200, { data: [{ id: 'stub-model' }] });
        if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(404, { error: 'not found' });
        const parsed = JSON.parse(body);
        bodies.push(parsed);
        const fixed = { model: 'stub-model', temperature: 0.7, top_p: 1, max_tokens: 1024, stream: true };
        const wrong = Object.keys(fixed).find((key) => parsed[key] !== fixed[key]);
        if (wrong) return json(500, { error: { message: `stub: ${wrong} must be ${fixed[wrong]}` } });
        const user = parsed.messages[1].content;
        const [, request, tools] = user.match(/^Request: ([\s\S]*?)\n\nTools:\n([\s\S]*)$/);
        const item = items.get(request + JSON.stringify(JSON.parse(tools)));
        if (!item) return json(500, { error: { message: 'stub: not an item as published' } });
        const answer = item.expected.tool === null ? { tool: item.tools[0].name, arguments: {} } : item.expected;
        res.setHeader('content-type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answer) }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 30 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, bodies }));
  });
}

test('a run sends every item five times as published and publishes a result the gate accepts', { timeout: 120_000 }, async () => {
  const workspace = makeWorkspace();
  const stub = await stubServer();
  const outcome = await runEval({
    benchmark: 'tool-selection-v1',
    model: 'model-a',
    servedModel: 'stub-model',
    submitter: 'alice',
    runtime: 'mlx-lm',
    runtimeVersion: '0.32.2',
    format: 'mlx',
    quantization: '4bit',
    baseUrl: stub.baseUrl,
    contentRoot: workspace.contentRoot,
    workDir: workspace.workDir,
    command: 'bun run eval -- --benchmark tool-selection-v1 --model model-a',
    hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 },
    today: '2026-11-22',
  });

  assert.equal(stub.bodies.length, 500);
  assert.deepEqual(stub.bodies.map((body) => body.seed), Array.from({ length: 500 }, (_, position) => position));
  // The stub never declines, so exactly the 85 items with a call are right on every run.
  assert.deepEqual([outcome.n, outcome.runs, outcome.correct, outcome.score], [100, 5, 85, 85]);
  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  assert.deepEqual(result.repeat.item_pass_histogram, [15, 0, 0, 0, 0, 85]);
  assert.deepEqual(repeatProblems(result.repeat, result.n), []);
  assert.deepEqual((await validateContent(workspace.contentRoot)).errors, []);
});
````

In `apps/web/test/evals-pages.test.mjs`:

1. Directly above the doc comment `/** A benchmark page's leaderboard, without the method prose and run tables that follow it. */`, add:

````js
/** One benchmark's board within a section of the evaluations page. */
const boardOf = (section, id) => section.split('data-eval-board').find((board) => board.includes(`href="/evals/${id}"`));
````

2. In the feed assertions, add `['tool-selection-v1', '1', []],` after `['gsm8k-200', '2', ['1']],`, and `'tool-selection-v1': { runs: 5, temperature: 0.7, top_p: 1 },` after `'gsm8k-200': null,` in the `repeat` map. Benchmarks are ordered by category, then name, so Tool selection follows GSM8K in Quality.
3. In `a benchmark with runs of earlier versions only says which version has no result and where those runs are`, the Quality section now also holds tool selection, which nobody has run. Replace `assert.doesNotMatch(quality, /No results yet/);` with:

````js
  assert.doesNotMatch(boardOf(quality, 'gsm8k-200'), /No results yet/);
  // Nobody has run tool selection in any version.
  assert.match(boardOf(quality, 'tool-selection-v1'), noResultsYet('this benchmark'));
````

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/cli/test/tool-selection.test.mjs apps/web/test/evals-pages.test.mjs apps/web/test/issue-templates.test.mjs`
Expected: FAIL. The page test cannot read `benchmarks/tool-selection-v1.md`; the end-to-end run fails with `benchmark "tool-selection-v1" cannot be run`; the feed lacks the new benchmark; the issue-form test lists `tool-selection-v1` among runnable suites but the form does not offer it.

- [ ] **Step 3: Write the benchmark page**

Create `apps/web/src/content/benchmarks/tool-selection-v1.md`:

````markdown
---
name: Tool selection
summary: A hundred requests, each with 8 to 16 tools to choose from. The score is the share of requests answered with exactly the right call, or correctly with no call, on all five runs.
category: quality
version: "1"
metric:
  name: correct on every run
  unit: "%"
  higher_is_better: true
  min: 0
  max: 100
scoring: exact-match
items: 100
repeat:
  runs: 5
  temperature: 0.7
  top_p: 1
source_url: https://unite4ai.com/data/benchmarks/tool-selection-v1.jsonl
source_sha256: 95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db
license: cc-by-4.0
updated: 2026-11-22
---

## What it measures

Whether a model, given a request and a list of tools, picks the one right tool and fills in
its arguments exactly, and whether it declines when no listed tool fits. This is the first
step of almost every agent action, and the most common way agents fail: calling a tool that
looks right but is not, inventing an argument, or acting when it should not.

Every item offers all the tools of one domain, so the wrong answers are near misses:
`write_file` beside `append_file`, `create_event` beside `update_event`, `send_message`
beside `reply_message` and `send_email`, `git_checkout` beside `git_create_branch`. The rest
of the list comes from other domains. Fifteen items have no correct call: the tool the
request needs is left out while its near misses stay, so the right answer is to call nothing.

## Method

Every item is its own conversation of two messages. The system message is the same for all
hundred:

```text
You choose and call tools for a user. You are given the user's request and a list of tools, each with a JSON Schema for its arguments. Reply with exactly one JSON object and nothing else, in this form: {"tool": "<tool name>", "arguments": {"<argument name>": <value>}}. Use only a listed tool and only its parameters. Give every required parameter, and give an optional parameter only when the request asks for a value other than its default. Copy names, paths, identifiers and other values exactly as the request gives them. If none of the listed tools can carry out the request in one call, reply {"tool": null, "arguments": {}}.
```

The user message is `Request: `, the request, a blank line, `Tools:`, and the item's tools as
JSON indented by two spaces. Each tool has a `name`, a `description` and a JSON Schema under
`parameters`; optional parameters may carry a `default`.

1. An evaluation must use the pinned file at `source_url` and check it against
   `source_sha256`. It has 100 lines; each is one item with its `system` message, `request`,
   `tools` and `expected` call.
2. Each of the 100 items is sent five times: five runs, each one full pass over the items in
   file order, one request at a time. Every request uses temperature 0.7, top-p 1 and at most
   1024 new tokens, and carries a seed equal to its position (run × 100 + item, both counted
   from 0). Whether the server honours the seed is not checked.
3. The **visible reply** is the reply with the model's reasoning removed: a `<think>` block,
   whether or not it is closed, and anything before a `</think>` that has no opening tag.
4. The **answer** is the last JSON object in the visible reply: of the spans from `{` to `}`
   that parse as an object, the one that ends last, taken as wide as it parses. Text and code
   fences around it do not matter. A reply with no JSON object is wrong.
5. An answer to an item with a correct call is **correct** when all of these hold:
   - its `tool` is the expected tool's name, exactly;
   - its `arguments` name only that tool's parameters;
   - every argument the request sets is present with its value: strings equal after trimming
     spaces at either end, integers equal as numbers (a number written as a string is wrong),
     booleans equal;
   - every parameter the request does not set is left out or given its default.

   An argument whose value is `null` counts as left out.
6. An answer to an item with no correct call is correct when its `tool` is `null` and its
   `arguments` are left out or empty.
7. The **score** is the percentage of the 100 items answered correctly on all five runs.
   Every result also gives pass@1, the percentage of the 500 answers that were correct; how
   many items each run got right; and the sample standard deviation of the five run scores.
   All five runs must finish: partial runs are not accepted.
8. **Intervals** count items, not answers. The score has a 95% Wilson interval over the 100
   items; pass@1 has a 95% percentile bootstrap interval over items (2,000 resamples, the
   mulberry32 generator, seed 20261122). The content gate recomputes both from the published
   counts.

The items are generated from a fixed seed by `scripts/benchmarks/tool-selection.mjs`: six
domains (files, web, calendar, git, messaging, tickets) of 4 to 7 tools each, request
templates per tool, and pools of values. Every request is unique among the calls, and among
the items with no call. The data file is generated from the script and checked in.

## Known weaknesses

- **Synthetic.** The tools, requests and values are written for this benchmark. Real tool
  catalogues are larger, messier and less consistently described; a high score here does not
  show that a model will choose well among a real server's tools.
- **One prompted format.** Tools are given as JSON in the prompt and the answer is a JSON
  object in the text. Models trained for native tool calling may do better or worse through
  their server's tool interface, which this version does not test.
- **Exact values.** Values must be copied exactly. A model that writes `14:15:00` for
  `14:15` or `"3"` for `3` is wrong, even though a forgiving tool might accept it.
- **Small and templated.** With 100 items the score's 95% interval spans about 16 points
  near 80% (71 to 87 for 80 of 100). Items built from the same template are not independent,
  so the true uncertainty is if anything larger.
- **Sampling makes runs differ.** At temperature 0.7 two runs of the same setup can
  disagree; that is what the score measures. On a server that ignores the seed, a rerun gives
  other answers and can give another score.
- **No-call items are few.** Fifteen items cannot tell a model that rarely declines from one
  that never does by much, and none of them is in the web domain; read the per-item transcript
  when that matters.
- **Public.** Models can be tuned against it. When results suggest the items have leaked or
  the benchmark is saturated, a new version with a new seed replaces it.
- English only.

## Licence

Written for Unite4AI and released under CC BY 4.0.
````

The "71 to 87 for 80 of 100" figure is `wilsonPercent(80, 100)` = `[71.12, 86.66]`.

- [ ] **Step 4: Offer the benchmark on the result form**

In `.github/ISSUE_TEMPLATE/submit-eval-result.yml`, add `        - tool-selection-v1` after `        - canary-injection-v1` in the `benchmark` dropdown's `options`.

- [ ] **Step 5: Run the tests and the content gate**

Run: `bun test apps/cli/test/tool-selection.test.mjs apps/web/test/evals-pages.test.mjs apps/web/test/issue-templates.test.mjs && bun run validate && bun run check`
Expected: all pass (18 in `tool-selection.test.mjs`); `validate` 0 errors; `astro check` 0 errors.

- [ ] **Step: Commit**

Subject: `feat(benchmarks): tool-selection-v1 page, form option and end-to-end test`. Files: `apps/web/src/content/benchmarks/tool-selection-v1.md`, `.github/ISSUE_TEMPLATE/submit-eval-result.yml`, `apps/cli/test/tool-selection.test.mjs`, `apps/web/test/evals-pages.test.mjs`.

---

### Task 5: Contributor docs

**Files:**
- Modify: `CONTRIBUTING.md` (evaluation section)

- [ ] **Step 1: Edit the text**

Replace

```markdown
The runner does the bookkeeping for you. Runnable benchmarks today: `gsm8k-200` (quality) and
`canary-injection-v1` (security). Point it at any OpenAI-compatible local server (mlx-lm,
```

with

```markdown
The runner does the bookkeeping for you. Runnable benchmarks today: `gsm8k-200` and
`tool-selection-v1` (quality) and `canary-injection-v1` (security). Point it at any
OpenAI-compatible local server (mlx-lm,
```

and rewrap the rest of that paragraph if needed. After the paragraph that ends `A repeat run resumes like any other, at the answer where it stopped.`, add:

```markdown
`tool-selection-v1` is a repeat-run benchmark too: 100 requests, each offering 8 to 16 tools,
answered five times at temperature 0.7 (500 replies, up to 1024 new tokens each). Every prompt
carries its tools as JSON, so prompts are several thousand tokens long and a run takes longer
than the canary's.
```

- [ ] **Step 2: Commit**

Subject: `docs: tool-selection-v1 in the contributor guide`. Files: `CONTRIBUTING.md`.

---

### Task 6: Gate and pull request

- [ ] **Step 1: Run the acceptance gate**

Run: `source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs`
Expected: last line is JSON with `"status":"pass"`.

- [ ] **Step 2: Open the pull request**

```bash
git push -u origin tool-selection
gh-axi pr create --base main --head tool-selection --title "feat: tool-selection-v1 (agent evidence plan 2)" \
  --body "Plan: docs/superpowers/plans/2026-11-22-tool-selection.md. 100 generated requests (85 calls, 15 no-calls) with near-miss tools; judged by the last JSON object of the visible reply; 5 runs at temperature 0.7. Items pinned by hash. No model was run. Gate: pass."
```

Do not merge. The owner reviews.
