import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const destinations = {
  'model-task-taxonomy': '/registry',
  observability: '/evals',
  targets: '/stack/compute',
  'model-layer': '/registry',
  actuation: '/governance',
  quantization: '/evals',
  verification: '/evals',
  distributions: '/registry',
  distribution: '/contribute',
};

test('topic pages work under a project base and link back to existing resources', { timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'u4ai-stack-topics-'));
  try {
    const result = spawnSync('bun', ['run', 'astro', 'build', '--base', '/preview', '--outDir', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    for (const [slug, destination] of Object.entries(destinations)) {
      const html = readFileSync(join(out, 'stack', slug, 'index.html'), 'utf8');
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
      assert.ok(main, `${slug}: accessible main content`);
      assert.match(main, /<h1\b/);
      assert.ok(main.includes('href="/preview/stack"'), `${slug}: back to Stack`);
      assert.ok(main.includes(`href="/preview${destination}"`), `${slug}: related resource`);
      assert.doesNotMatch(main, /href="\/(?:stack|registry|evals|governance|contribute)(?:["/])/);
    }
    const stackHtml = readFileSync(join(out, 'stack', 'index.html'), 'utf8');
    const stack = stackHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(stack, 'Stack: accessible main content');
    for (const slug of Object.keys(destinations)) {
      assert.ok(stack.includes(`href="/preview/stack/${slug}"`), `Stack discovers ${slug}`);
    }
    assert.ok(stack.includes('href="/preview/governance"'));
    const governance = readFileSync(join(out, 'governance', 'index.html'), 'utf8');
    assert.ok(governance.includes('href="/preview/governance/metrics"'));
    assert.doesNotMatch(governance, /href="\/governance\/metrics"/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
