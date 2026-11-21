import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { parse } = createRequire(new URL('../../packages/core/package.json', import.meta.url))('yaml');
import { makeExchangeRoot, hypothesis, finding, review, markdown, RESULT_ID } from '../../packages/core/test/fixtures/exchange.mjs';
import { result } from '../../packages/core/test/fixtures/evals.mjs';

// Public consumer tests: invented records live only in OS temporary directories.
import { processPullRequest } from './exchange-pr.mjs';
const prefix = 'apps/web/src/content/';
const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture(t, additions = { 'hypotheses/fixture-new.md': markdown(hypothesis()) }, options = {}) {
  const root = makeExchangeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const files = Object.entries(additions).map(([name, text]) => {
    const bytes = Buffer.from(text);
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    return { filename: prefix + name, status: 'added', sha, bytes };
  });
  const pr = { number: 42, state: 'open', draft: false, user: { login: 'Fixture-Author' },
    head: { sha: head }, base: { sha: base, ref: 'main', repo: { full_name: 'fixture/repo' } },
    changed_files: files.length, labels: [] };
  let reads = 0;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/pulls/42' && method === 'GET') { reads++; return structuredClone(options.live?.(reads, pr) ?? pr); }
    if (path.startsWith('/pulls/42/files?')) {
      const page = Number(new URL(`https://fixture.invalid${path}`).searchParams.get('page'));
      return files.slice((page - 1) * 100, page * 100);
    }
    if (path === `/git/trees/${head}?recursive=1`) return { truncated: options.truncated ?? false, tree: files.filter(f => f.bytes).map(f => ({ path: f.filename, sha: f.sha, type: 'blob', mode: '100644', size: f.bytes.length, ...options.entry })) };
    if (path.startsWith('/git/blobs/')) {
      const f = files.find(f => path.endsWith(f.sha));
      return { sha: f.sha, size: f.bytes.length, encoding: 'base64', content: f.bytes.toString('base64'), ...options.blob };
    }
    if (path.startsWith('/issues/42/events?')) return options.events ?? [];
    if (path.startsWith('/collaborators/')) return { permission: options.permission ?? 'read' };
    if (path === '/git/ref/heads/main') return { object: { sha: options.main ?? base } };
    if (path === '/pulls/42/merge') return options.merge ?? { merged: true, sha: 'c'.repeat(40) };
    if (path === '/actions/workflows/deploy.yml/dispatches') return null;
    throw new Error(`Unexpected API ${method} ${path}`);
  };
  return { root, calls, files, pr, run: (extra = {}) => processPullRequest({ api, number: 42, repository: 'fixture/repo', trustedBase: base, contentRoot: root, ...extra }) };
}

test('disabled by default; valid records checked without merging', async t => {
  const f = fixture(t); const out = await f.run();
  assert.equal(out.eligible, true); assert.equal(out.merged, false);
  assert.equal(f.calls.some(c => c.method !== 'GET'), false);
  assert.equal(readFileSync(join(f.root, 'hypotheses/fixture-hypothesis.md'), 'utf8'), markdown(hypothesis()));
});
test('enabled valid addition merges exact validated head using merge commit, then dispatches main deployment', async t => {
  const f = fixture(t); await f.run({ publish: true, enabled: 'true' });
  const writes = f.calls.filter(c => c.method !== 'GET');
  assert.deepEqual(writes, [
    { method: 'PUT', path: '/pulls/42/merge', body: { sha: head, merge_method: 'merge' } },
    { method: 'POST', path: '/actions/workflows/deploy.yml/dispatches', body: { ref: 'main' } },
  ]);
});
test('identity is PR author, including mixed code PRs and all four record kinds', async t => {
  for (const additions of [
    { 'hypotheses/fixture-new.md': markdown(hypothesis({ author: 'impostor' })) },
    { 'findings/fixture-new.json': JSON.stringify(finding({ author: 'impostor' })) },
    { 'reviews/fixture-finding--fixture-reviewer--2026-11-11.json': JSON.stringify(review('{}')) },
    { [`evals/${RESULT_ID}.json`]: JSON.stringify(result()) },
  ]) {
    const f = fixture(t, additions); f.files.push({ filename: 'package.json', status: 'modified' }); f.pr.changed_files++;
    await assert.rejects(f.run({ publish: true, enabled: 'true' }), /identity/);
    assert.equal(f.calls.some(c => c.method !== 'GET'), false);
  }
});
test('hold, draft, wrong enablement and code changes never auto-publish', async t => {
  for (const variant of ['hold', 'draft', 'off', 'code']) {
    const f = fixture(t);
    if (variant === 'hold') f.pr.labels = [{ name: 'hold' }];
    if (variant === 'draft') f.pr.draft = true;
    if (variant === 'code') { f.files.push({ filename: '.github/workflows/pwn.yml', status: 'added' }); f.pr.changed_files++; }
    await f.run({ publish: true, enabled: variant === 'off' ? 'TRUE' : 'true' });
    assert.equal(f.calls.some(c => c.method !== 'GET'), false, variant);
  }
});
test('immutable edits, deletes and renames require a maintainer-applied exception label', async t => {
  for (const status of ['modified', 'removed', 'renamed']) {
    const f = fixture(t, {});
    f.files.push({ filename: status === 'renamed' ? 'elsewhere.json' : prefix + 'findings/old.json', previous_filename: prefix + 'reviews/old.json', status }); f.pr.changed_files++;
    await assert.rejects(f.run(), /immutable/);
  }
  for (const permission of ['read', 'triage', 'write', 'maintain', 'admin']) {
    const f = fixture(t, {}, { permission, events: [{ event: 'labeled', label: { name: 'exchange:allow-record-edit' }, actor: { login: 'fixture-maintainer' } }] });
    f.files.push({ filename: prefix + 'findings/old.json', status: 'modified' }); f.pr.changed_files++;
    f.pr.labels = [{ name: 'exchange:allow-record-edit' }];
    if (['read', 'triage'].includes(permission)) await assert.rejects(f.run(), /immutable/);
    else { const out = await f.run({ publish: true, enabled: 'true' }); assert.equal(out.merged, false); }
  }
});
test('unsafe formats, paths, links, executable bits, oversized records and truncated diffs fail closed', async t => {
  for (const name of ['hypotheses/x.mdx', 'findings/x.md', 'hypotheses/nested/x.md', 'hypotheses/../x.md', 'hypotheses/x.MD']) {
    const f = fixture(t, { [name]: markdown(hypothesis()) }); await assert.rejects(f.run(), /path|format/);
  }
  for (const entry of [{ mode: '120000' }, { mode: '100755' }, { type: 'commit' }, { sha: 'd'.repeat(40) }]) {
    const f = fixture(t, undefined, { entry }); await assert.rejects(f.run(), /regular|head/);
  }
  const large = fixture(t, { 'hypotheses/large.md': 'x'.repeat(16385) }); await assert.rejects(large.run(), /16384/);
  const truncated = fixture(t); truncated.pr.changed_files++; await assert.rejects(truncated.run(), /file count/);
});
test('ten additions allowed, eleven require maintainer; invalid relationships never merge', async t => {
  for (const count of [10, 11]) {
    const f = fixture(t, Object.fromEntries(Array.from({ length: count }, (_, i) => [`hypotheses/fixture-${i}.md`, markdown(hypothesis())])));
    const out = await f.run({ publish: true, enabled: 'true' }); assert.equal(out.merged, count === 10);
  }
  const f = fixture(t, { 'hypotheses/fixture-new.md': markdown(hypothesis({ benchmark: 'missing' })) });
  await assert.rejects(f.run({ publish: true, enabled: 'true' }), /unknown benchmark/);
});
test('live head/base/author changes and a late hold prevent merge after validation', async t => {
  for (const change of [p => { p.head.sha = 'd'.repeat(40); }, p => { p.base.sha = 'e'.repeat(40); }, p => { p.user.login = 'impostor'; }, p => { p.labels = [{ name: 'hold' }]; }]) {
    const f = fixture(t, undefined, { live(read, pr) { const p = structuredClone(pr); if (read > 1) change(p); return p; } });
    try { await f.run({ publish: true, enabled: 'true' }); } catch (error) { assert.match(error.message, /changed/); }
    assert.equal(f.calls.some(c => c.method !== 'GET'), false);
  }
});
test('workflow semantic model separates read checks from opt-in privileged publication', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/exchange-records.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main']);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.jobs.publish.needs, 'identity');
  assert.equal(workflow.jobs.publish.if, "vars.EXCHANGE_AUTO_MERGE == 'true'");
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: 'write', 'pull-requests': 'write', issues: 'read', actions: 'write' });
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps.find(s => s.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
  }
});

test('valid finding, review and evaluation additions use the shared gate', async t => {
  const f = fixture(t, { 'findings/fixture-new.json': JSON.stringify(finding()) });
  assert.equal((await f.run({ publish: true, enabled: 'true' })).merged, true);

  const source = JSON.stringify(finding({ author: 'another-fixture-account' }));
  const { writeFileSync } = await import('node:fs');
  const r = fixture(t, { 'reviews/fixture-finding--fixture-author--2026-11-11.json':
    JSON.stringify(review(source, { reviewer: 'fixture-author' })) });
  writeFileSync(join(r.root, 'findings/fixture-finding.json'), source);
  assert.equal((await r.run({ publish: true, enabled: 'true' })).merged, true);

  const data = result();
  data.run.submitter = 'fixture-author';
  data.evidence.sha256 = 'e'.repeat(64);
  const e = fixture(t, { 'evals/model-a--bench-a--fixture-author--2026-11-10--eeeeeeee.json': JSON.stringify(data) });
  assert.equal((await e.run({ publish: true, enabled: 'true' })).merged, true);
});

test('truncated trees, corrupted blobs, base drift and refused merges never dispatch deployment', async t => {
  for (const options of [
    { truncated: true }, { blob: { content: Buffer.from('corrupt').toString('base64') } },
    { main: 'f'.repeat(40) }, { merge: { merged: false } },
  ]) {
    const f = fixture(t, undefined, options);
    await assert.rejects(f.run({ publish: true, enabled: 'true' }), /Incomplete|bytes|changed|refused/);
    assert.equal(f.calls.some(c => c.path.endsWith('/dispatches')), false);
  }
});

test('removed exception labels cannot authorize immutable edits', async t => {
  const f = fixture(t, {}, { permission: 'admin', events: [
    { event: 'labeled', label: { name: 'exchange:allow-record-edit' }, actor: { login: 'fixture-admin' } },
    { event: 'unlabeled', label: { name: 'exchange:allow-record-edit' }, actor: { login: 'fixture-admin' } },
  ] });
  f.pr.labels = [{ name: 'exchange:allow-record-edit' }];
  f.files.push({ filename: prefix + 'reviews/old.json', status: 'removed' }); f.pr.changed_files++;
  await assert.rejects(f.run(), /immutable/);
});

test('renames and copies into record directories get identity, format, mode and size checks, never auto-publish', async t => {
  const into = (f, status) => { f.files[0].status = status; f.files[0].previous_filename = 'docs/fixture-notes.md'; };
  for (const status of ['renamed', 'copied']) {
    const maintainer = { permission: 'admin', events: [{ event: 'labeled', label: { name: 'exchange:allow-record-edit' }, actor: { login: 'fixture-maintainer' } }] };
    for (const [additions, options] of [
      [{ 'hypotheses/fixture-new.md': markdown(hypothesis({ author: 'impostor' })) }],
      [{ 'findings/fixture-new.json': JSON.stringify(finding({ author: 'impostor' })) }, maintainer],
      [{ [`evals/${RESULT_ID}.json`]: JSON.stringify(result()) }],
    ]) {
      const f = fixture(t, additions, options); into(f, status);
      if (options) f.pr.labels = [{ name: 'exchange:allow-record-edit' }];
      f.files.push({ filename: 'package.json', status: 'modified' }); f.pr.changed_files++;
      await assert.rejects(f.run({ publish: true, enabled: 'true' }), /identity/, status);
      assert.equal(f.calls.some(c => c.method !== 'GET'), false);
    }
    const mdx = fixture(t, { 'hypotheses/x.mdx': markdown(hypothesis()) }); into(mdx, status);
    await assert.rejects(mdx.run(), /path|format/);
    const exec = fixture(t, undefined, { entry: { mode: '100755' } }); into(exec, status);
    await assert.rejects(exec.run(), /regular/);
    const large = fixture(t, { 'hypotheses/large.md': 'x'.repeat(16385) }); into(large, status);
    await assert.rejects(large.run(), /16384/);
    const valid = fixture(t); into(valid, status);
    const out = await valid.run({ publish: true, enabled: 'true' });
    assert.deepEqual([out.eligible, out.merged], [false, false]);
    assert.equal(valid.calls.some(c => c.method !== 'GET'), false);
  }
});

test('same-kind moves of existing records are maintenance, cross-kind renames are new identity claims', async t => {
  const label = [{ name: 'exchange:allow-record-edit' }];
  const maintainer = { permission: 'maintain', events: [{ event: 'labeled', label: label[0], actor: { login: 'fixture-maintainer' } }] };
  const move = (f, from) => { f.files[0].status = 'renamed'; f.files[0].previous_filename = prefix + from; };

  const finding_ = fixture(t, { 'findings/fixture-renamed.json': JSON.stringify(finding({ author: 'another-fixture-account' })) }, maintainer);
  move(finding_, 'findings/fixture-old.json'); finding_.pr.labels = label;
  const out = await finding_.run({ publish: true, enabled: 'true' });
  assert.deepEqual([out.eligible, out.merged], [false, false]);
  assert.equal(finding_.calls.some(c => c.method !== 'GET'), false);

  const unlabelled = fixture(t, { 'findings/fixture-renamed.json': JSON.stringify(finding()) });
  move(unlabelled, 'findings/fixture-old.json');
  await assert.rejects(unlabelled.run(), /immutable/);

  const hyp = fixture(t, { 'hypotheses/fixture-renamed.md': markdown(hypothesis({ author: 'another-fixture-account' })) });
  move(hyp, 'hypotheses/fixture-old.md');
  assert.equal((await hyp.run({ publish: true, enabled: 'true' })).merged, false);
  assert.equal(hyp.calls.some(c => c.method !== 'GET'), false);

  const cross = fixture(t, { 'hypotheses/fixture-new.md': markdown(hypothesis({ author: 'impostor' })) });
  move(cross, `evals/${RESULT_ID}.json`);
  await assert.rejects(cross.run({ publish: true, enabled: 'true' }), /identity/);
  assert.equal(cross.calls.some(c => c.method !== 'GET'), false);

  const crossLabelled = fixture(t, { 'hypotheses/fixture-new.md': markdown(hypothesis({ author: 'impostor' })) }, maintainer);
  move(crossLabelled, 'reviews/fixture-old.json'); crossLabelled.pr.labels = label;
  await assert.rejects(crossLabelled.run(), /identity/);
});
