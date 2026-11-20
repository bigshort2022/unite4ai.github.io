import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { hypothesis, finding, review, hash, markdown } from '../../../packages/core/test/fixtures/exchange.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const RESULT = 'darsy-xray-analysis--gsm8k-200--fixture-bot--2026-10-01--44444444';

// Actual static endpoint output is the contract, not source-text assertions or in-tree fixtures.
// Each build is its own test with its own budget; every test gets a fresh, isolated fixture root.
const h = hypothesis({ benchmark: 'gsm8k-200', models: ['darsy-xray-analysis'],
  agent: { model: 'fixture-model-not-a-real-agent', harness: 'fixture-harness' } });
const f = finding({ results: [RESULT] });
const bytes = JSON.stringify(f, null, 2);
const r = review(bytes);
const REVIEW_ID = 'fixture-finding--fixture-reviewer--2026-11-11';

function withBuildFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-exchange-build-fixture-'));
  const out = join(root, 'output');
  for (const dir of ['hypotheses', 'findings', 'reviews']) mkdirSync(join(root, dir));
  const paths = {
    hypothesis: join(root, 'hypotheses/fixture-hypothesis.md'),
    finding: join(root, 'findings/fixture-finding.json'),
    review: join(root, `reviews/${REVIEW_ID}.json`),
  };
  const build = () => spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
    cwd: WEB, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, U4AI_EXCHANGE_DIR: root, U4AI_EVALS_DIR: './test/fixtures/evals' },
  });
  const feed = (name) => JSON.parse(readFileSync(join(out, `data/${name}.json`), 'utf8'));
  const page = (path) => readFileSync(join(out, path), 'utf8');
  try { run({ paths, build, feed, page }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('an unreviewed finding leaves the hypothesis open and its graft labelled unreviewed', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, feed }) => {
    writeFileSync(paths.hypothesis, markdown({ ...h, grafts: [{ finding: 'fixture-finding', sha256: hash(bytes), note: 'Fixture lineage.' }] }));
    writeFileSync(paths.finding, bytes);
    const initial = build();
    assert.equal(initial.status, 0, `${initial.stdout}${initial.stderr}`);
    const structure = feed('exchange');
    assert.equal(structure.hypotheses[0].status, 'open');
    assert.equal(structure.hypotheses[0].grafts[0].state, 'unreviewed');
    assert.deepEqual(structure.hypotheses[0].unreviewed_findings, ['fixture-finding']);
    assert.equal(structure.findings[0].graft_count, 1);
    assert.equal(structure.findings[0].sha256, hash(bytes));
  });
});

test('an accepted review supports the hypothesis and prose appears only in the untrusted-text feed', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, feed }) => {
    writeFileSync(paths.hypothesis, markdown({ ...h, grafts: [{ finding: 'fixture-finding', sha256: hash(bytes), note: 'Fixture lineage.' }] }));
    writeFileSync(paths.finding, bytes);
    writeFileSync(paths.review, JSON.stringify(r));
    const accepted = build();
    assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
    const structure = feed('exchange');
    const text = feed('exchange-text');
    assert.equal(structure.hypotheses[0].status, 'supported');
    assert.equal(structure.findings[0].state, 'accepted');
    assert.equal(structure.reviews[0].finding_sha256, hash(bytes));
    assert.deepEqual(structure.findings[0].results, [RESULT]);
    for (const prose of [h.title, h.claim, h.prediction, h.agent.model, h.agent.harness, f.summary, f.limitations, r.notes, 'Fixture lineage.']) {
      assert.equal(JSON.stringify(structure).includes(prose), false, prose);
    }
    assert.equal(text.hypotheses['fixture-hypothesis'].title, h.title);
    assert.equal(text.findings['fixture-finding'].limitations, f.limitations);
    assert.equal(text.reviews[REVIEW_ID].notes, r.notes);
    assert.match(text.warning, /UNTRUSTED THIRD-PARTY CONTENT/);
  });
});

test('record pages preserve computed lineage, corrections, review states and escaped untrusted prose', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, feed, page }) => {
    const root = dirname(dirname(paths.finding));
    const records = {
      'fixture-finding': { ...f, summary: 'Fixture &lt;script&gt;alert(1)&lt;/script&gt; & literal text' },
      'fixture-correction': { ...f, verdict: 'refutes', supersedes: 'fixture-finding' },
      'fixture-support': f,
      'fixture-unreviewed': { ...f, verdict: 'inconclusive' },
      'fixture-rejected': { ...f, verdict: 'refutes' },
      'fixture-disputed': f,
      'fixture-pending-a': f,
      'fixture-pending-b': f,
    };
    for (const [id, data] of Object.entries(records)) writeFileSync(join(root, 'findings', `${id}.json`), JSON.stringify(data));
    for (const [id, verdicts] of Object.entries({
      'fixture-finding': ['accept'], 'fixture-correction': ['accept'], 'fixture-support': ['accept'],
      'fixture-unreviewed': ['needs-work'], 'fixture-rejected': ['reject'], 'fixture-disputed': ['accept', 'reject'],
    })) {
      verdicts.forEach((verdict, index) => {
        const reviewer = `fixture-reviewer-${index}`;
        writeFileSync(join(root, 'reviews', `${id}--${reviewer}--2026-11-11.json`),
          JSON.stringify(review(JSON.stringify(records[id]), { finding: id, reviewer, verdict })));
      });
    }
    writeFileSync(paths.hypothesis, markdown({ ...h, title: 'Fixture & claim < 7', grafts: [
      { finding: 'fixture-unreviewed', sha256: hash(JSON.stringify(records['fixture-unreviewed'])), note: 'Fixture & unreviewed source.' },
      { finding: 'fixture-finding', sha256: hash(JSON.stringify(records['fixture-finding'])), note: 'Fixture old source.' },
    ] }));
    const built = build();
    assert.equal(built.status, 0, `${built.stdout}${built.stderr}`);
    assert.equal(feed('exchange').hypotheses[0].status, 'contested');
    const hypothesisPage = page('exchange/hypotheses/fixture-hypothesis/index.html');
    assert.match(hypothesisPage, /Computed status:[\s\S]*?>contested</);
    assert.match(hypothesisPage, /Fixture &amp; claim &lt; 7/);
    assert.match(hypothesisPage, /unreviewed source/);
    assert.match(hypothesisPage, /superseded source/);
    assert.match(hypothesisPage, /needs-work/);
    for (const state of ['accepted', 'unreviewed', 'rejected', 'disputed']) assert.match(hypothesisPage, new RegExp(`>${state}<`));
    const old = page('exchange/findings/fixture-finding/index.html');
    assert.match(old, /Superseded by accepted replacement/);
    assert.ok(old.includes('href="/exchange/findings/fixture-correction"'));
    assert.ok(old.includes('Grafted by (1)'));
    assert.match(old, /Fixture &amp;lt;script&amp;gt;/);
    assert.doesNotMatch(old, /<script>alert/);
    assert.ok(old.includes(hash(JSON.stringify(records['fixture-finding']))), 'review pins exact finding bytes');
    assert.match(old, new RegExp(`href=\"/evals/gsm8k-200#run-${RESULT}\"`));
    assert.match(page('evals/gsm8k-200/index.html'), new RegExp(`id=\"run-${RESULT}\"`));
    const model = page('registry/models/darsy-xray-analysis/index.html');
    assert.ok(model.includes('href="/exchange/hypotheses/fixture-hypothesis"'));
    assert.ok(model.includes('href="/exchange/findings/fixture-correction"'));
    const home = page('index.html');
    assert.ok(home.includes('href="/exchange/findings/fixture-unreviewed"'));
    // Oracle: hand counts of the eight findings above; every labelled row has a different numerator.
    const biases = page('exchange/biases/index.html');
    for (const [label, value] of [
      ['Findings reporting support', '62.5% (5 / 8)'],
      ['Findings reporting refutation', '25.0% (2 / 8)'],
      ['Findings reporting inconclusive results', '12.5% (1 / 8)'],
      ['Findings still unreviewed', '37.5% (3 / 8)'],
    ]) assert.match(biases, new RegExp(`>${label}</th>\\s*<td[^>]*>${value.replace(/[().]/g, '\\$&')}</td>`), label);
  });
});

// Oracle: Astro's YAML 1.1 frontmatter parser loads an unquoted date as a Date; the gate's parser keeps a string.
test('a hypothesis with an unquoted YAML date builds and publishes the same YYYY-MM-DD the gate sees', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, feed }) => {
    writeFileSync(paths.hypothesis, `---
title: Fixture hypothesis
claim: Fixture model reaches the threshold.
benchmark: gsm8k-200
models: [darsy-xray-analysis]
prediction: Fixture score exceeds 70.
author: fixture-author
date: 2026-11-10
---
`);
    const built = build();
    assert.equal(built.status, 0, `${built.stdout}${built.stderr}`);
    assert.equal(feed('exchange').hypotheses[0].date, '2026-11-10');
  });
});

// Astro would load this as a Date at 07:00 UTC on 2026-11-11, a day the author never wrote.
test('build fails closed on a hypothesis YAML timestamp instead of shifting its date', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build }) => {
    writeFileSync(paths.hypothesis, `---
title: Fixture hypothesis
claim: Fixture model reaches the threshold.
benchmark: gsm8k-200
models: [darsy-xray-analysis]
prediction: Fixture score exceeds 70.
author: fixture-author
date: 2026-11-10 23:00:00 -08:00
---
`);
    const rejected = build();
    assert.notEqual(rejected.status, 0, 'a timestamp must stop publication');
    assert.match(`${rejected.stdout}${rejected.stderr}`, /date.*Expected type `"string"`, received `"object"`/);
  });
});

// Astro would load this as a UTC-midnight Date, indistinguishable from a plain date; the exchange reader must not.
test('build fails closed on a midnight YAML timestamp that the gate also rejects', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build }) => {
    writeFileSync(paths.hypothesis, `---
title: Fixture hypothesis
claim: Fixture model reaches the threshold.
benchmark: gsm8k-200
models: [darsy-xray-analysis]
prediction: Fixture score exceeds 70.
author: fixture-author
date: 2026-11-10T00:00:00Z
---
`);
    const rejected = build();
    assert.notEqual(rejected.status, 0, 'a timestamp must stop publication');
    const output = `${rejected.stdout}${rejected.stderr}`;
    assert.match(output, /Invalid exchange files/);
    assert.match(output, /hypotheses\/fixture-hypothesis\.md[\s\S]*must be YYYY-MM-DD/);
  });
});

// Invalid candidates fail at the real build interface, exercising the mirrored schemas.
for (const [name, file, invalid, message] of [
  ['an over-long hypothesis title', 'hypothesis', markdown({ ...h, title: 'x'.repeat(201) }), /title/],
  ['an authored finding state', 'finding', JSON.stringify({ ...f, state: 'accepted' }), /state/],
  ['an invented review check', 'review', JSON.stringify({ ...r, checks: ['invented-check'] }), /checks/],
  ['a hypothesis Markdown body', 'hypothesis', markdown(h, '<script>fixture</script>'), /Markdown body must be empty/],
  ['finding bytes that no longer match the review hash', 'finding', `${bytes}\n`, /finding_sha256 does not match/],
]) {
  test(`build fails closed on ${name}`, { timeout: 120_000 }, () => {
    withBuildFixture(({ paths, build }) => {
      writeFileSync(paths.hypothesis, markdown(h));
      writeFileSync(paths.finding, bytes);
      writeFileSync(paths.review, JSON.stringify(r));
      writeFileSync(paths[file], invalid);
      const rejected = build();
      assert.notEqual(rejected.status, 0, 'invalid records must stop publication');
      assert.match(`${rejected.stdout}${rejected.stderr}`, message);
    });
  });
}
