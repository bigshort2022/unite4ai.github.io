// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// ─────────────────────────────────────────────────────────────
// EDIT THESE TWO LINES ONLY.
//
// Option A — project page  https://<user>.github.io/unite4ai
//   site: 'https://<user>.github.io',  base: '/unite4ai'
//
// Option B — user/org page https://<org>.github.io
//   site: 'https://<org>.github.io',   base: '/'
//
// Option C — custom domain https://unite4ai.org
//   site: 'https://unite4ai.org',      base: '/'
// ─────────────────────────────────────────────────────────────
const SITE = 'https://unite4ai.com';
const BASE = '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  build: { format: 'directory' },
  markdown: {
    shikiConfig: {
      themes: { dark: 'github-dark', light: 'github-light' },
      defaultColor: 'dark',
    },
  },
  // Two entries that claim one URL fail the build instead of one silently winning.
  prerenderConflictBehavior: 'error',
  // Fixture content stores stay outside the production cache. Test builds set
  // U4AI_EXCHANGE_DIR, so each gets its own empty caller-owned cache; the shared fixture
  // cache only serves manual builds that override just the evaluation data.
  ...(process.env.U4AI_EXCHANGE_DIR
    ? { cacheDir: `${process.env.U4AI_EXCHANGE_DIR}/.astro-cache` }
    : process.env.U4AI_EVALS_DIR ? { cacheDir: './node_modules/.astro-fixtures' } : {}),
  vite: {
    ssr: { noExternal: ['@unite4ai/core', '@unite4ai/schema'] },
    optimizeDeps: { include: ['@unite4ai/core', '@unite4ai/schema'] },
  },
});
