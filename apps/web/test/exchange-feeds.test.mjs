import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { hypothesis, finding, review, hash, markdown } from '../../../packages/core/test/fixtures/exchange.mjs';
import { result } from '../../../packages/core/test/fixtures/evals.mjs';
import { repeatSummary } from '../../../packages/core/src/repeat.ts';
import { estimatedApiCost } from '../../../packages/core/src/eval-cost.ts';

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

function withBuildFixture(run, { customEvals = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-exchange-build-fixture-'));
  const out = join(root, 'output');
  for (const dir of ['hypotheses', 'findings', 'reviews']) mkdirSync(join(root, dir));
  const evals = customEvals ? join(root, 'evals') : './test/fixtures/evals';
  if (customEvals) mkdirSync(evals);
  const paths = {
    hypothesis: join(root, 'hypotheses/fixture-hypothesis.md'),
    finding: join(root, 'findings/fixture-finding.json'),
    review: join(root, `reviews/${REVIEW_ID}.json`),
  };
  const build = () => spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
    cwd: WEB, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, U4AI_EXCHANGE_DIR: root, U4AI_EVALS_DIR: evals },
  });
  const feed = (name) => JSON.parse(readFileSync(join(out, `data/${name}.json`), 'utf8'));
  const page = (path) => readFileSync(join(out, path), 'utf8');
  try { run({ paths, build, feed, page, evals }); } finally { rmSync(root, { recursive: true, force: true }); }
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
    const task = old.match(/<textarea\b[^>]*\bdata-ax-prompt[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
    assert.match(task ?? '', new RegExp(`unite4ai-axi review fixture-finding --finding-sha256 ${hash(JSON.stringify(records['fixture-finding']))}`));
    assert.doesNotMatch(task, /Fixture|--confirm/);
    assert.match(old, new RegExp(`href=\"/evals/gsm8k-200#run-${RESULT}\"`));
    assert.match(page('evals/gsm8k-200/index.html'), new RegExp(`id=\"run-${RESULT}\"`));
    const model = page('registry/models/darsy-xray-analysis/index.html');
    assert.ok(model.includes('href="/exchange/hypotheses/fixture-hypothesis"'));
    assert.ok(model.includes('href="/exchange/findings/fixture-correction"'));
    const exchange = page('exchange/index.html');
    assert.ok(exchange.includes('href="/exchange/findings/fixture-unreviewed"'));
    assert.ok(!page('index.html').includes('href="/exchange/findings/fixture-unreviewed"'));
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

test('a switch page publishes directed links, both intervals and each hosted cost source without inventing a registry card', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, feed, page, evals }) => {
    const benchmark = 'tool-selection-v1';
    const method = { runs: 5, temperature: 0.7, top_p: 1 };
    const repeat = repeatSummary(method, {
      item_pass_histogram: [15, 50, 0, 0, 0, 35], run_correct: [45, 45, 45, 45, 45], seconds_total: 300,
      prompt_tokens_total: 100_000, completion_tokens_total: 100_000,
    });
    const prices = estimatedApiCost(repeat, { snapshot_date: '2026-11-10', snapshot_sha256: 'c'.repeat(64),
      input_usd_per_million: 1, output_usd_per_million: 2 });
    const invoice = { kind: 'invoice', invoice_sha256: 'd'.repeat(64), total_usd: 0.03, usd_per_success: 0.03 / 225 };
    const writeRun = (run) => {
      const id = `${run.model}--${benchmark}--alice--2026-11-10--${run.evidence.sha256.slice(0, 8)}`;
      writeFileSync(join(evals, `${id}.json`), JSON.stringify(run));
      return id;
    };
    const makeApiRun = (model, sha, cost, metrics = repeat) => {
      const setup = { ...result().setup, runtime: 'api', runtime_version: 'client-v1', served_model: `${model}-served`,
        format: 'other', quantization: 'undisclosed' };
      return writeRun(result({ model, benchmark, n: 100, score: metrics.pass_k, repeat: metrics, setup, cost, evidence: { sha256: sha.repeat(64) },
        api: { provider: 'fixture-api', model_card: `https://example.org/${model}`, terms_url: 'https://example.org/terms',
          terms_checked_on: '2026-11-10', expected_usd: 1, approved_usd: 2 } }));
    };
    const incumbent = makeApiRun('hosted-incumbent', 'a', prices);
    const candidate = makeApiRun('hosted-candidate', 'b', invoice);
    const pair = { incumbent, candidate };
    const noSuccess = repeatSummary(method, {
      item_pass_histogram: [100, 0, 0, 0, 0, 0], run_correct: [0, 0, 0, 0, 0], seconds_total: 42,
    });
    const failedHosted = makeApiRun('hosted-candidate', 'e', { kind: 'invoice', invoice_sha256: 'f'.repeat(64), total_usd: 0.05 }, noSuccess);
    const failedLocal = writeRun(result({ model: 'darsy-xray-analysis', benchmark, n: 100, score: noSuccess.pass_k,
      repeat: noSuccess, evidence: { sha256: '1'.repeat(64) } }));
    writeFileSync(paths.hypothesis, markdown(hypothesis({ benchmark, models: ['hosted-incumbent', 'hosted-candidate', 'darsy-xray-analysis'] })));
    writeFileSync(paths.finding, JSON.stringify(finding({ results: [candidate, incumbent], verdict: 'inconclusive', switch: pair })));
    writeFileSync(join(dirname(paths.finding), 'fixture-no-success.json'), JSON.stringify(finding({
      results: [failedHosted, failedLocal], verdict: 'inconclusive', switch: { incumbent: failedLocal, candidate: failedHosted },
    })));
    const built = build();
    assert.equal(built.status, 0, `${built.stdout}${built.stderr}`);

    assert.deepEqual(feed('exchange').findings[0].switch, pair);
    assert.equal('switch' in feed('exchange-text').findings['fixture-finding'], false);
    const hypothesisHtml = page('exchange/hypotheses/fixture-hypothesis/index.html');
    const findingHtml = page('exchange/findings/fixture-finding/index.html');
    const benchmarkHtml = page(`evals/${benchmark}/index.html`);
    assert.match(hypothesisHtml, /hosted-incumbent \(API-only\).*hosted-candidate \(API-only\)/s);
    assert.match(findingHtml, /<caption[^>]*>[^<]*switch[^<]*<\/caption>/i);
    assert.match(findingHtml, /scope="col">Incumbent<\/th>.*scope="col">Candidate<\/th>/s);
    const exactRunRow = findingHtml.match(/<th scope="row">Exact run<\/th>(.*?)<\/tr>/s)?.[1];
    assert.ok(exactRunRow);
    const tableLinks = [...exactRunRow.matchAll(/<td[^>]*>\s*<a href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(tableLinks.length, 2);
    assert.ok(tableLinks[0].endsWith(`/evals/${benchmark}#run-${incumbent}`), 'incumbent cell links its exact run');
    assert.ok(tableLinks[1].endsWith(`/evals/${benchmark}#run-${candidate}`), 'candidate cell links its exact run');
    assert.match(findingHtml, /Pass@1.*95%.*Correct on all k runs.*95%/s);
    assert.match(findingHtml, /Intervals for correctness on all runs overlap/);
    for (const [score, [low, high]] of [[repeat.pass_1, repeat.pass_1_ci], [repeat.pass_k, repeat.pass_k_ci]]) {
      assert.ok(findingHtml.includes(`${score}% [${low}%, ${high}%]`));
    }
    assert.match(findingHtml, /List-price estimate.*models\.dev.*Contributor-reported invoice/s);
    assert.ok(findingHtml.includes('c'.repeat(64)));
    assert.ok(findingHtml.includes('d'.repeat(64)));
    assert.ok(findingHtml.includes(`${prices.usd_per_success} USD per success`));
    assert.ok(findingHtml.includes(`${invoice.usd_per_success} USD per success`));
    assert.ok(findingHtml.includes(`${prices.total_usd} USD total`));
    assert.ok(findingHtml.includes(`${invoice.total_usd} USD total`));
    assert.match(findingHtml, /Cost comparison unavailable/i);
    assert.match(findingHtml, /not proof of equivalence or non-inferiority/);
    for (const [id, model] of [[incumbent, 'hosted-incumbent'], [candidate, 'hosted-candidate']]) {
      assert.ok(benchmarkHtml.includes(`id="run-${id}"`));
      assert.ok(findingHtml.includes(`href="https://example.org/${model}"`));
      assert.ok(!findingHtml.includes(`/registry/models/${model}`));
      assert.ok(!hypothesisHtml.includes(`/registry/models/${model}`));
    }
    const failedHtml = page('exchange/findings/fixture-no-success/index.html');
    const failedCostRow = failedHtml.match(/<th scope="row">Cost per success<\/th>(.*?)<\/tr>/s)?.[1];
    assert.ok(failedCostRow);
    assert.match(failedCostRow, /No successful attempts.*42 seconds total.*Source: local run timing.*No successful attempts.*0\.05 USD total.*Contributor-reported invoice/s);
    assert.doesNotMatch(failedCostRow, />0 (?:seconds|USD) per success/);
  }, { customEvals: true });
});

test('a standalone build rejects invalid switch costs even without the content gate', { timeout: 120_000 }, () => {
  withBuildFixture(({ paths, build, evals }) => {
    const benchmark = 'tool-selection-v1';
    const repeat = repeatSummary({ runs: 5, temperature: 0.7, top_p: 1 }, {
      item_pass_histogram: [40, 0, 0, 0, 0, 60], run_correct: [60, 60, 60, 60, 60], seconds_total: 600,
    });
    const writeRun = (model, digit, fields) => {
      const id = `${model}--${benchmark}--alice--2026-11-10--${digit.repeat(8)}`;
      writeFileSync(join(evals, `${id}.json`), JSON.stringify(result({
        model, benchmark, n: 100, score: repeat.pass_k, repeat, evidence: { sha256: digit.repeat(64) }, ...fields,
      })));
      return id;
    };
    const apiFields = (served_model, total_usd, usd_per_success) => ({
      setup: { ...result().setup, runtime: 'api', served_model, format: 'other', quantization: 'undisclosed' },
      api: { provider: 'fixture-api', model_card: `https://example.org/${served_model}`, terms_url: 'https://example.org/terms',
        terms_checked_on: '2026-11-10', expected_usd: 1, approved_usd: 2 },
      cost: { kind: 'invoice', invoice_sha256: 'd'.repeat(64), total_usd, usd_per_success },
    });
    const a = writeRun('hosted-a', 'a', apiFields('served-a', 0.3, 0.3 / 300));
    const b = writeRun('hosted-b', 'b', apiFields('served-b', 0.6, 0.0001));
    const c = writeRun('darsy-xray-analysis', 'c', {});
    const d = writeRun('darsy-xray-analysis', 'd', {
      setup: { ...result().setup, quantization: '8bit' }, repeat: { ...repeat, seconds_per_success: 0.01 },
    });
    writeFileSync(paths.hypothesis, markdown(hypothesis({ benchmark, models: ['hosted-a', 'hosted-b', 'darsy-xray-analysis'] })));
    for (const [incumbent, candidate] of [[a, b], [c, d]]) {
      writeFileSync(join(dirname(paths.finding), `fixture-${candidate.slice(-1)}.json`), JSON.stringify(
        finding({ results: [incumbent, candidate], switch: { incumbent, candidate } }),
      ));
    }
    const rejected = build();
    assert.notEqual(rejected.status, 0, 'invalid inferred per-success costs must stop publication');
    const diagnostic = `${rejected.stdout}${rejected.stderr}`;
    assert.match(diagnostic, /cost\.usd_per_success must be .* from total USD and successful attempts/);
    assert.match(diagnostic, /repeat\.seconds_per_success .* successful attempts/);
  }, { customEvals: true });
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
