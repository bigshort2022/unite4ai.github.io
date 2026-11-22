import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { profile } from '../../../packages/core/test/fixtures/profile.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('published profiles render with scores and evidence; drafts never render', { timeout: 120_000 }, () => {
  const fixtures = mkdtempSync(join(tmpdir(), 'u4ai-profile-fixtures-'));
  const out = mkdtempSync(join(tmpdir(), 'u4ai-profile-site-'));
  try {
    for (const kind of ['exchange-profiles', 'hypotheses', 'findings', 'reviews']) mkdirSync(join(fixtures, kind));
    const akash = profile();
    akash.identity.formedOn.value = 2018;
    akash.costComponents.push({ kind: 'minimum-charge', amount: null, appliesTo: 'buyer', scope: 'Small leases', searched: ['https://fixture.example/search'], evidence: ['e3'] });
    writeFileSync(join(fixtures, 'exchange-profiles', 'akash.json'), JSON.stringify(akash));
    const vast = profile({ meta: { ...profile().meta, directoryId: 'vast-ai' } });
    vast.priceQuotes = [{ ...vast.priceQuotes[0], amount: '2.10', sampleSize: 30 }];
    writeFileSync(join(fixtures, 'exchange-profiles', 'vast-ai.json'), JSON.stringify(vast));
    const draft = profile({ meta: { ...profile().meta, directoryId: 'golem', status: 'draft' } });
    draft.priceQuotes = [{ ...draft.priceQuotes[0], amount: '9.99' }];
    writeFileSync(join(fixtures, 'exchange-profiles', 'golem.json'), JSON.stringify(draft));
    const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
      cwd: root, encoding: 'utf8', timeout: 110_000,
      // Exchange dir isolates the build cache under fixtures/.astro-cache, removed below.
      env: { ...process.env, U4AI_PROFILES_DIR: fixtures, U4AI_EXCHANGE_DIR: fixtures },
    });
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

    const page = readFileSync(join(out, 'global-exchange', 'akash', 'index.html'), 'utf8');
    assert.match(page, /Security Score[\s\S]*?94[\s\S]*?grade A/);
    assert.match(page, /Risk Score[\s\S]*?33[\s\S]*?grade D/);
    assert.match(page, /Transaction Cost Score[\s\S]*?79[\s\S]*?grade C/);
    assert.match(page, /Rubric version 1/);
    assert.match(page, /not a judgement of the company/);
    assert.match(page, /informational, not legal advice/i);
    assert.match(page, /Not published/);
    assert.match(page, /Scores depend on what is published: an operator that documents more can score differently from one that documents less\./);
    const quotes = page.match(/<h2 id="prices">[\s\S]*?<\/table>/)[0];
    assert.match(quotes, /<th>Level<\/th>/);
    assert.match(quotes, /<td>reported<\/td>/);
    const comparable = page.match(/<h3 id="comparable">[\s\S]*?<\/table>/)[0];
    assert.match(comparable, /same workload, currency, unit and statistic only; no conversion/);
    assert.match(comparable, /<a href="\/global-exchange\/vast-ai">Vast\.ai<\/a><\/td><td>2\.10 USD per GPU-hour<\/td><td>30<\/td>/);
    assert.doesNotMatch(page, /9\.99|global-exchange\/golem/, 'draft quotes never appear');
    assert.match(page, /<li>Holds customer funds \(20\): present /);
    assert.match(page, /<li>Operating entity not identifiable \(15\): absent /);
    assert.match(page, /<li>Third-party security audit published \(20\): pass /);
    assert.match(page, /minimum-charge \(buyer, Small leases\): amount not published\s*<a href="https:\/\/fixture\.example\/e3#:~:text=/);
    assert.match(page, /<dt>Market cap \(USD\)<\/dt><dd>1,000,000 /);
    assert.match(page, /<dt>Token price \(USD\)<\/dt><dd>0\.5 /);
    assert.match(page, /<dt>Date of formation<\/dt><dd>2018 /);
    assert.match(page, /<dt>Volume<\/dt><dd>1,200 USD/);
    assert.match(page, /<dt>KYC required<\/dt>/);
    assert.match(page, /2026-11-22\. Drafted by fixture-model/);
    assert.ok(page.includes('href="https://fixture.example/e2#:~:text='), 'facts link to highlighted evidence');
    assert.equal(existsSync(join(out, 'global-exchange', 'golem', 'index.html')), false, 'drafts are not rendered');

    const directory = readFileSync(join(out, 'global-exchange', 'index.html'), 'utf8');
    const akashCard = directory.match(/data-project-id="akash"[\s\S]*?<\/article>/)[0];
    assert.ok(akashCard.includes('href="/global-exchange/akash"'));
    const golemCard = directory.match(/data-project-id="golem"[\s\S]*?<\/article>/)[0];
    assert.doesNotMatch(golemCard, /Full profile/);

    const feed = JSON.parse(readFileSync(join(out, 'data', 'exchange-profiles.json'), 'utf8'));
    assert.equal(feed.untrusted, true);
    assert.deepEqual(feed.profiles.map((p) => p.id), ['akash', 'vast-ai']);
    assert.equal(feed.profiles[0].scores.security.score, 94);
    assert.equal(feed.profiles[0].scores.transactionCost.costPercent, 4.3);
    assert.equal(feed.profiles[0].scores.risk.grade, 'D');
  } finally {
    rmSync(fixtures, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
