#!/usr/bin/env bash
# Idempotent dependency setup for the unite4ai Bun workspace.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=.cursor/activate-node.sh
source .cursor/activate-node.sh

# Astro's CLI runs on Node; Bun manages the workspace and lockfile.
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"

echo "Using Node $(node --version) / Bun $(bun --version)"
bun install --frozen-lockfile
