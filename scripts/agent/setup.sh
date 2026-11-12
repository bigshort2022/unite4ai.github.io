#!/usr/bin/env bash
# Idempotent host setup for coding agents (local-LLM or Cloud). Installs only under $HOME.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/agent/activate-node.sh
source "$ROOT/scripts/agent/activate-node.sh"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"

echo "node $(node --version) · bun $(bun --version) · npm $(npm --version)"

bun install --frozen-lockfile
( cd sites/ai-sustainability && npm ci )

mkdir -p .agent/logs .agent/requests
[ -f .env.agent ] || cp .env.agent.example .env.agent

echo "setup complete"
