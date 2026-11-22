import { createHash } from 'node:crypto';
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evalResultSchema, EVAL_RESULT_MAX_BYTES, EXCHANGE_RECORD_MAX_BYTES } from '../../packages/schema/src/index.ts';
import { readExchangeRecords } from '../../packages/core/src/read-exchange.ts';
import { validateContent } from '../../packages/core/src/validate.ts';

const PREFIX = 'apps/web/src/content/';
const RECORD = /^apps\/web\/src\/content\/(hypotheses|findings|reviews|evals)\//;
const SAFE_PATH = /^apps\/web\/src\/content\/(hypotheses\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|(?:findings|reviews|evals)\/[a-z0-9][a-z0-9-]*\.json)$/;
const IMMUTABLE = /^apps\/web\/src\/content\/(findings|reviews)\//;
const SHA = /^[a-f0-9]{40}$/;
const EDIT_LABEL = 'exchange:allow-record-edit';
const labels = pr => pr.labels.map(label => label.name.toLowerCase()).sort();
const binding = pr => JSON.stringify([pr.head.sha, pr.base.sha, pr.base.ref, pr.base.repo.full_name,
  pr.user.login.toLowerCase(), pr.state, pr.draft, pr.changed_files, labels(pr)]);

async function pages(api, path, maxPages = 30) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await api('GET', `${path}?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid paginated response');
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error('Pagination limit exceeded; refusing incomplete metadata');
}

async function editAuthorized(api, number, pr) {
  if (!labels(pr).includes(EDIT_LABEL)) return false;
  const events = await pages(api, `/issues/${number}/events`);
  const event = events.filter(e => ['labeled', 'unlabeled'].includes(e.event)
    && e.label?.name?.toLowerCase() === EDIT_LABEL).at(-1);
  if (event?.event !== 'labeled' || !event.actor?.login) return false;
  const actor = encodeURIComponent(event.actor.login);
  const access = await api('GET', `/collaborators/${actor}/permission`);
  return ['write', 'maintain', 'admin'].includes(access.permission);
}

/** Only transport is injected. The real reader and gate always run, including offline tests. */
export async function processPullRequest({ api, number, repository, trustedBase, contentRoot,
  publish = false, enabled = '' }) {
  if (!Number.isSafeInteger(number) || number < 1 || !SHA.test(trustedBase)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid trusted invocation');
  const pr = await api('GET', `/pulls/${number}`);
  if (pr.number !== number || pr.base.ref !== 'main' || pr.base.repo.full_name !== repository
    || pr.base.sha !== trustedBase || !SHA.test(pr.head.sha)) throw new Error('PR base/head changed or invalid');
  if (pr.state !== 'open') throw new Error('PR is not open');
  const author = pr.user.login.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(author)) throw new Error('Invalid PR author identity');
  const files = await pages(api, `/pulls/${number}/files`);
  if (files.length !== pr.changed_files || new Set(files.map(f => f.filename)).size !== files.length) {
    throw new Error('PR file count changed or incomplete');
  }
  if (files.some(f => !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(f.status))) {
    throw new Error('Unknown file change status');
  }
  const edits = files.some(f => (f.status !== 'added' && IMMUTABLE.test(f.filename))
    || (f.previous_filename && IMMUTABLE.test(f.previous_filename)));
  if (edits && !await editAuthorized(api, number, pr)) throw new Error(`Existing findings/reviews are immutable; maintainer ${EDIT_LABEL} required`);

  const kind = path => RECORD.exec(path ?? '')?.[1];
  const additions = files.filter(f => kind(f.filename) && (['added', 'copied'].includes(f.status)
    || (f.status === 'renamed' && kind(f.previous_filename) !== kind(f.filename))));
  for (const file of additions) {
    if (!SAFE_PATH.test(file.filename)) throw new Error('Refused record path or format');
  }
  const eligible = files.length > 0 && files.length <= 10 && files.length === additions.length
    && files.every(f => f.status === 'added');
  const temporary = await mkdtemp(join(tmpdir(), 'u4ai-pr-data-'));
  try {
    const addedRoot = join(temporary, 'added');
    await mkdir(addedRoot);
    if (additions.length) {
      // Immutable SHA, never a contributor-controlled URL, ref name, archive or checkout.
      const tree = await api('GET', `/git/trees/${pr.head.sha}?recursive=1`);
      if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete head tree');
      const entries = new Map(tree.tree.map(entry => [entry.path, entry]));
      for (const file of additions) {
        const entry = entries.get(file.filename);
        if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new Error('Record must be a regular non-executable file');
        if (!SHA.test(file.sha) || entry.sha !== file.sha) throw new Error('Record differs from pinned head');
        const limit = file.filename.startsWith(`${PREFIX}evals/`) ? EVAL_RESULT_MAX_BYTES : EXCHANGE_RECORD_MAX_BYTES;
        if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limit) throw new Error(`Record exceeds ${limit}-byte limit`);
        const blob = await api('GET', `/git/blobs/${entry.sha}`);
        if (blob.encoding !== 'base64' || blob.sha !== entry.sha || blob.size !== entry.size
          || typeof blob.content !== 'string' || blob.content.length > limit * 2) throw new Error('Invalid record blob');
        const bytes = Buffer.from(blob.content, 'base64');
        const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (bytes.length !== entry.size || digest !== entry.sha) throw new Error('Record bytes differ from pinned head');
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const path = join(addedRoot, file.filename.slice(PREFIX.length));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
        if (file.filename.startsWith(`${PREFIX}evals/`)) {
          const result = evalResultSchema.parse(JSON.parse(bytes.toString('utf8')));
          if (result.run.submitter !== author) throw new Error('Result submitter identity must equal PR author');
        }
      }
      const { records, errors } = await readExchangeRecords(addedRoot);
      if (errors.length) throw new Error(errors.join('\n'));
      for (const kind of ['hypotheses', 'findings', 'reviews']) {
        for (const record of records[kind]) {
          if ((kind === 'reviews' ? record.data.reviewer : record.data.author) !== author) {
            throw new Error('Record identity must equal PR author');
          }
        }
      }
    }
    if (eligible) {
      const candidate = join(temporary, 'candidate');
      // Only trusted base content and allowlisted bytes enter this data-only scratch tree.
      await cp(contentRoot, candidate, { recursive: true, dereference: false });
      // Exchange profiles are checked against the trusted directory data that sits beside the content root.
      await mkdir(join(temporary, 'data'));
      try {
        await copyFile(join(contentRoot, '..', 'data', 'global-exchange.json'), join(temporary, 'data', 'global-exchange.json'));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const file of additions) {
        const relative = file.filename.slice(PREFIX.length);
        try {
          await lstat(join(candidate, relative));
          throw new Error('Added record already exists on trusted base');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await mkdir(dirname(join(candidate, relative)), { recursive: true });
        await writeFile(join(candidate, relative), await readFile(join(addedRoot, relative)), { flag: 'wx', mode: 0o600 });
      }
      const validation = await validateContent(candidate);
      if (validation.errors.length) throw new Error(validation.errors.join('\n'));
    }
    // No artifact/check conclusion is trusted for publication. The write job repeats this gate.
    const live = await api('GET', `/pulls/${number}`);
    if (binding(live) !== binding(pr)) throw new Error('PR changed during validation; rerun required');
    if (!publish || enabled !== 'true' || !eligible || live.draft || labels(live).includes('hold')) {
      return { eligible, merged: false, head: pr.head.sha };
    }
    const main = await api('GET', '/git/ref/heads/main');
    if (main.object.sha !== trustedBase) throw new Error('Base changed during validation; rerun required');
    // GitHub atomically refuses a different head. Repository protections remain in force.
    const merge = await api('PUT', `/pulls/${number}/merge`, { sha: pr.head.sha, merge_method: 'merge' });
    if (!merge.merged || !SHA.test(merge.sha)) throw new Error('GitHub refused merge');
    // GITHUB_TOKEN push events do not trigger deploy.yml; workflow_dispatch does.
    await api('POST', '/actions/workflows/deploy.yml/dispatches', { ref: 'main' });
    return { eligible: true, merged: true, head: pr.head.sha, merge: merge.sha };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function githubApi(repository, token) {
  return async (method, path, body) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GitHub ${method} request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.GITHUB_TOKEN) throw new Error('Missing workflow token');
    const outcome = await processPullRequest({ api: githubApi(process.env.GITHUB_REPOSITORY, process.env.GITHUB_TOKEN),
      repository: process.env.GITHUB_REPOSITORY, number: Number(process.env.PR_NUMBER),
      trustedBase: process.env.TRUSTED_BASE_SHA, contentRoot: join(process.cwd(), PREFIX),
      publish: process.argv[2] === '--publish', enabled: process.env.EXCHANGE_AUTO_MERGE });
    console.log(JSON.stringify(outcome));
  } catch (error) {
    // JSON escaping prevents contributor text from becoming Actions log commands.
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
