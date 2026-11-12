#!/usr/bin/env bash
# Cloud Agent dependency setup — delegates to the shared agent setup.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/agent/setup.sh"
