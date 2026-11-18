import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { hypothesis, finding, review, hash, markdown } from '../../../packages/core/test/fixtures/exchange.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const RESULT = 'darsy-xray-analysis--gsm8k-200--fixture-bot--2026-10-01--44444444';

// Actual static endpoint output is the contract, not source-text assertions or in-tree fixtures.
test('build emits honest structured and untrusted-text feeds and fails closed on invalid records', { timeout: 120_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-exchange-build-fixture-'));
  const out = join(root, 'output');
  for (const dir of ['hypotheses', 'findings', 'reviews']) mkdirSync(join(root, dir));
  const h = hypothesis({ benchmark: 'gsm8k-200', models: ['darsy-xray-analysis'],
    agent: { model: 'fixture-model-not-a-real-agent', harness: 'fixture-harness' } });
  const f = finding({ results: [RESULT] });
  const bytes = JSON.stringify(f, null, 2);
  const r = review(bytes);
  const hypothesisPath = join(root, 'hypotheses/fixture-hypothesis.md');
  const findingPath = join(root, 'findings/fixture-finding.json');
  const reviewPath = join(root, 'reviews/fixture-finding--fixture-reviewer--2026-11-11.json');
  const build = () => spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
    cwd: WEB, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, U4AI_EXCHANGE_DIR: root, U4AI_EVALS_DIR: './test/fixtures/evals' },
  });
  try {
    writeFileSync(hypothesisPath, markdown({ ...h, grafts: [{ finding: 'fixture-finding', sha256: hash(bytes), note: 'Fixture lineage.' }] }));
    writeFileSync(findingPath, bytes);
    // Initially unreviewed: neither the hypothesis status nor the graft may imply acceptance.
    const initial = build();
    assert.equal(initial.status, 0, `${initial.stdout}${initial.stderr}`);
    let structure = JSON.parse(readFileSync(join(out, 'data/exchange.json'), 'utf8'));
    assert.equal(structure.hypotheses[0].status, 'open');
    assert.equal(structure.hypotheses[0].grafts[0].state, 'unreviewed');
    assert.deepEqual(structure.hypotheses[0].unreviewed_findings, ['fixture-finding']);
    assert.equal(structure.findings[0].graft_count, 1);
    assert.equal(structure.findings[0].sha256, hash(bytes));
    writeFileSync(reviewPath, JSON.stringify(r));
    const accepted = build();
    assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
    structure = JSON.parse(readFileSync(join(out, 'data/exchange.json'), 'utf8'));
    const text = JSON.parse(readFileSync(join(out, 'data/exchange-text.json'), 'utf8'));
    assert.equal(structure.hypotheses[0].status, 'supported');
    assert.equal(structure.findings[0].state, 'accepted');
    assert.equal(structure.reviews[0].finding_sha256, hash(bytes));
    assert.deepEqual(structure.findings[0].results, [RESULT]);
    for (const prose of [h.title, h.claim, h.prediction, h.agent.model, h.agent.harness, f.summary, f.limitations, r.notes, 'Fixture lineage.']) {
      assert.equal(JSON.stringify(structure).includes(prose), false, prose);
    }
    assert.equal(text.hypotheses['fixture-hypothesis'].title, h.title);
    assert.equal(text.findings['fixture-finding'].limitations, f.limitations);
    assert.equal(text.reviews['fixture-finding--fixture-reviewer--2026-11-11'].notes, r.notes);
    assert.match(text.warning, /UNTRUSTED THIRD-PARTY CONTENT/);

    // Invalid candidates fail at the real build interface, exercising the mirrored schemas.
    for (const [path, invalid, message] of [
      [hypothesisPath, markdown({ ...h, title: 'x'.repeat(201) }), /title/],
      [findingPath, JSON.stringify({ ...f, state: 'accepted' }), /state/],
      [reviewPath, JSON.stringify({ ...r, checks: ['invented-check'] }), /checks/],
      [hypothesisPath, markdown(h, '<script>fixture</script>'), /Markdown body must be empty/],
      [findingPath, `${bytes}\n`, /finding_sha256 does not match/],
    ]) {
      writeFileSync(hypothesisPath, markdown(h));
      writeFileSync(findingPath, bytes);
      writeFileSync(reviewPath, JSON.stringify(r));
      writeFileSync(path, invalid);
      const rejected = build();
      assert.notEqual(rejected.status, 0, 'invalid records must stop publication');
      assert.match(`${rejected.stdout}${rejected.stderr}`, message);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
