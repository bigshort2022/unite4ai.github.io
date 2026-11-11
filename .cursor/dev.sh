#!/usr/bin/env bash
# Launch the Astro dev server on port 4321.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=.cursor/activate-node.sh
source .cursor/activate-node.sh

exec npm run dev -- --host 0.0.0.0
