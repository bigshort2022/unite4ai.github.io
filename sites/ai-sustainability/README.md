# AI Sustainability

The **Sustainable Places** site-intelligence app — open geospatial screening and
transparent techno-economic assessment (TEA) for climate-resilient development.
It was moved out of the main [Unite4AI](https://unite4ai.com) site so it can live
on its own subdomain: **https://sustainability.unite4ai.com**.

This directory is a complete, self-contained Astro project. It is staged inside the
`unite4ai.github.io` repo for review, but its final home is its **own repository**,
because a subdomain on GitHub Pages requires a separate Pages site.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in ./dist
npm test         # unit tests for the TEA + scoring library
```

Requires Node.js 24.

## Deploying to `sustainability.unite4ai.com`

GitHub Pages serves one custom domain per repository, so this app cannot share the
`unite4ai.github.io` repo. To publish it:

1. **Create a new repository** (e.g. `bigshort2022/ai-sustainability`) and copy the
   contents of this directory to its root:
   ```bash
   # from a fresh clone of the new, empty repo
   cp -r /path/to/unite4ai.github.io/sites/ai-sustainability/. .
   git add -A && git commit -m "Import AI Sustainability site" && git push
   ```
2. **Enable Pages**: repo Settings → Pages → Build and deployment → Source =
   "GitHub Actions". The included `.github/workflows/deploy.yml` handles the build.
3. **Set the custom domain**: `public/CNAME` already contains
   `sustainability.unite4ai.com`. Add it under Settings → Pages → Custom domain too.
4. **Add DNS** at the `unite4ai.com` provider — a `CNAME` record:
   ```
   sustainability   CNAME   <owner>.github.io.
   ```
   (Use the Pages apex/host GitHub shows for the new repo.) Allow time for DNS +
   the "Enforce HTTPS" certificate to provision.

To use a different hostname, change `public/CNAME` and `SITE` in `astro.config.mjs`.

## Notes

- The map currently uses CARTO basemap tiles, which now require an API key and render
  a watermark. Switching the basemap source in `src/pages/index.astro` to the
  keyless `https://tiles.openfreemap.org` provider (already allowed in the CSP) is a
  recommended follow-up.
- The app makes client-side calls to Nominatim, NASA POWER, Open-Meteo, and NREL for
  live location evidence. These third parties are listed in the CSP `connect-src`.
