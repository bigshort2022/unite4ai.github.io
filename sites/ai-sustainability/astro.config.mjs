// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ─────────────────────────────────────────────────────────────
// AI Sustainability — the "Sustainable Places" site intelligence app,
// hosted on its own subdomain of unite4ai.com.
//
// If you deploy to a different host, change SITE (and public/CNAME).
// ─────────────────────────────────────────────────────────────
const SITE = 'https://sustainability.unite4ai.com';
const BASE = '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
