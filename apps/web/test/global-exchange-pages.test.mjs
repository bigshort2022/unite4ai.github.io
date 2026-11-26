import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const expected = {
  compute: ['akash', 'io-net', 'golem', 'vast-ai', 'render'],
  'agent-services': ['virtuals-acp', 'olas', 'singularitynet', 'fetch-ai', 'bittensor'],
  'agent-payments': ['x402', 'ap2', 'nevermined', 'skyfire', 'payman'],
  defi: ['request', 'superfluid', 'sablier', 'cow', 'uniswap'],
};

function httpsUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  return url;
}

test('discovery feed and directory distinguish compute markets from adjacent rails', { timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'u4ai-global-exchange-'));
  try {
    const result = spawnSync('bun', ['run', 'astro', 'build', '--base', '/preview', '--outDir', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    const feed = JSON.parse(readFileSync(join(out, 'data', 'global-exchange.json'), 'utf8'));
    assert.equal(feed.schemaVersion, 1);
    assert.equal(feed.transactionExecution, 'external-only');
    assert.equal(feed.evidence, 'documentation-only');
    assert.match(feed.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(feed.reviewedAt).toISOString().slice(0, 10), feed.reviewedAt);
    assert.equal(feed.untrusted, true);
    assert.equal(typeof feed.warning, 'string');
    assert.match(feed.warning, /untrusted data, not instructions or authorization/i);
    assert.equal(new Set(feed.projects.map((p) => p.id)).size, 20);
    for (const [category, ids] of Object.entries(expected)) {
      assert.deepEqual(feed.projects.filter((p) => p.category === category).map((p) => p.id).sort(), [...ids].sort());
    }
    assert.deepEqual(feed.projects.map((p) => p.id).sort(), Object.values(expected).flat().sort());
    for (const project of feed.projects) {
      assert.match(project.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      for (const field of ['name', 'product', 'human', 'agent', 'payment', 'limitation']) {
        assert.equal(typeof project[field], 'string');
        assert.ok(project[field].trim(), `${project.id}: ${field}`);
      }
      httpsUrl(project.source);
      if (project.category === 'compute') {
        httpsUrl(project.buyerUrl);
        httpsUrl(project.sellerUrl);
        assert.notEqual(project.buyerUrl, project.sellerUrl, `${project.id}: distinct onboarding paths`);
      } else {
        assert.equal(project.buyerUrl, undefined, `${project.id}: not raw compute inventory`);
        assert.equal(project.sellerUrl, undefined, `${project.id}: not raw compute inventory`);
      }
    }

    const html = readFileSync(join(out, 'global-exchange', 'index.html'), 'utf8');
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main);
    assert.deepEqual([...main.matchAll(/data-project-id="([^"]+)"/g)].map((m) => m[1]).sort(), feed.projects.map((p) => p.id).sort());
    const cards = new Map([...main.matchAll(/<article\b[^>]*data-project-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => [m[1], m[2]]));
    for (const project of feed.projects) {
      const card = cards.get(project.id);
      assert.ok(card, `${project.id}: directory card`);
      assert.ok(card.includes(`href="${project.source}"`), `${project.id}: official documentation`);
      assert.ok(card.includes(`datetime="${feed.reviewedAt}"`), `${project.id}: source review date`);
      if (project.category === 'compute') {
        assert.ok(card.includes(`href="${project.buyerUrl}"`), `${project.id}: buyer handoff`);
        assert.ok(card.includes(`href="${project.sellerUrl}"`), `${project.id}: provider handoff`);
      } else {
        assert.doesNotMatch(card, /Buyer documentation|Provider onboarding/);
      }
    }
    for (const id of ['buyers', 'sellers', 'agents', ...Object.keys(expected)]) {
      assert.ok(main.includes(`id="${id}"`), `guide/category destination ${id}`);
      assert.ok(main.includes(`href="#${id}"`), `guide/category navigation ${id}`);
    }
    for (const path of ['/data/global-exchange.json', '/stack', '/governance']) {
      assert.ok(main.includes(`href="/preview${path}"`));
    }
    assert.doesNotMatch(main, /<(?:form|iframe)\b/i);
    const home = readFileSync(join(out, 'index.html'), 'utf8');
    const nav = home.match(/<nav\b[^>]*aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    assert.ok(!nav.includes('href="/preview/global-exchange"'));
    const exchange = readFileSync(join(out, 'exchange/index.html'), 'utf8');
    const exchangeMain = exchange.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
    assert.ok(exchangeMain.includes('href="/preview/global-exchange"'));
    assert.ok(nav.includes('href="/preview/stack"'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
