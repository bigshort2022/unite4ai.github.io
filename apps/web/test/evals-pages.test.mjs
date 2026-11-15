import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'u4ai-evals-site-'));
// Astro's glob loader keeps stale entries when a directory is empty, so the build cache
// (cacheDir, not .astro/) must go too or fixture rows would appear in the next real build.
after(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(join(ROOT, 'node_modules/.astro/data-store.json'), { force: true });
});

const page = (path) => readFileSync(join(out, path), 'utf8');

// Builds the site against fixture results into a temp directory; the real dist is untouched.
test('leaderboard and benchmark page render fixture results', { timeout: 120_000 }, () => {
  const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, U4AI_EVALS_DIR: './test/fixtures/evals' },
  });
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);

  const board = page('evals/index.html');
  assert.match(board, /GSM8K \(first 200\)/);
  assert.match(board, /href="\/registry\/models\/darsy-xray-analysis"/);
  // Two groups: gguf (70) ranks above mlx (median of 60 and 64 = 62).
  assert.ok(board.indexOf('Q4_K_M') < board.indexOf('4bit'), 'higher score must rank first');
  assert.match(board, />62</);
  assert.match(board, /60–64/);
  assert.match(board, /reproduced by 1/);
  assert.match(board, /single run/);
  assert.match(board, /self-reported/i);

  const detail = page('evals/gsm8k-200/index.html');
  assert.match(detail, /Known weaknesses/);
  assert.match(detail, /fixture-bot-2/);
  assert.match(detail, /--fixture-three/);
  assert.match(detail, /3{12}/);
});
