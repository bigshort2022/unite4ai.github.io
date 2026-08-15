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
});
