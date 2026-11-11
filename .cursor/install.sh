#!/usr/bin/env bash
# Idempotent dependency setup for the unite4ai Astro site.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=.cursor/activate-node.sh
source .cursor/activate-node.sh

echo "Using Node $(node --version) / npm $(npm --version)"
npm ci

# esbuild ships a platform-specific binary via a postinstall script that npm's
# install-scripts policy leaves un-run on a fresh `npm ci`. Rebuild it explicitly
# so Astro/Vite can invoke esbuild during dev and build.
npm rebuild esbuild
