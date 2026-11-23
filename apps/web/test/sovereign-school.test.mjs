import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

test('School links to four usable Sovereign AI paths under a project base', { timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'u4ai-sovereign-school-'));
  try {
    const result = spawnSync('bun', ['run', 'astro', 'build', '--base', '/preview', '--outDir', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    const school = readFileSync(join(out, 'school', 'index.html'), 'utf8');
    assert.match(school, /href="\/preview\/school\/sovereign-ai\/?"/);
    assert.match(school, /href="\/preview\/school\/run-open-weights\/?"/);

    const page = readFileSync(join(out, 'school', 'sovereign-ai', 'index.html'), 'utf8');
    const main = page.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
    assert.match(main, /<h1\b[^>]*>Learn about Sovereign AI<\/h1>/);
    for (const [id, source] of [
      ['data-privacy', /href="\/preview\/school\/run-open-weights\/?"/],
      ['agent-experience', /href="\/preview\/stack\/actuation\/?"/],
      ['ai-education', /href="https:\/\/ai4k12\.org\/activities\/"/],
      ['climate-energy-ai', /href="https:\/\/www\.climatechange\.ai\/events\/summer_school2026\/repository"/],
    ]) {
      assert.ok(main.includes(`href="#${id}"`), `missing navigation for ${id}`);
      const path = main.match(new RegExp(`<section\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`))?.[1] ?? '';
      assert.match(path, source, `missing working destination for ${id}`);
      assert.match(path, /<details\b[\s\S]*?<summary\b[^>]*>Check your answer<\/summary>[\s\S]+?<\/details>/);
    }
    assert.doesNotMatch(main, /<(?:iframe|form)\b/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
