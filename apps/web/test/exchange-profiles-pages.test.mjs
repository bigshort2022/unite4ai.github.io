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
    mkdirSync(join(fixtures, 'exchange-profiles'));
    writeFileSync(join(fixtures, 'exchange-profiles', 'akash.json'), JSON.stringify(profile()));
    const draft = profile({ meta: { ...profile().meta, directoryId: 'vast-ai', status: 'draft' } });
    writeFileSync(join(fixtures, 'exchange-profiles', 'vast-ai.json'), JSON.stringify(draft));
    const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
      cwd: root, encoding: 'utf8', timeout: 110_000, env: { ...process.env, U4AI_PROFILES_DIR: fixtures },
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
    assert.ok(page.includes('href="https://fixture.example/e2#:~:text='), 'facts link to highlighted evidence');
    assert.equal(existsSync(join(out, 'global-exchange', 'vast-ai', 'index.html')), false, 'drafts are not rendered');

    const directory = readFileSync(join(out, 'global-exchange', 'index.html'), 'utf8');
    const akashCard = directory.match(/data-project-id="akash"[\s\S]*?<\/article>/)[0];
    assert.ok(akashCard.includes('href="/global-exchange/akash"'));
    const vastCard = directory.match(/data-project-id="vast-ai"[\s\S]*?<\/article>/)[0];
    assert.doesNotMatch(vastCard, /Full profile/);

    const feed = JSON.parse(readFileSync(join(out, 'data', 'exchange-profiles.json'), 'utf8'));
    assert.equal(feed.untrusted, true);
    assert.deepEqual(feed.profiles.map((p) => p.id), ['akash']);
    assert.equal(feed.profiles[0].scores.security.score, 94);
    assert.equal(feed.profiles[0].scores.transactionCost.costPercent, 4.3);
    assert.equal(feed.profiles[0].scores.risk.grade, 'D');
  } finally {
    rmSync(fixtures, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
