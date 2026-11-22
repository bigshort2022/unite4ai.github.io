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
