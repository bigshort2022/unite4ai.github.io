#!/usr/bin/env bash
# Put the Node.js 24 toolchain this project requires (package.json "engines") first on PATH.
# Source this file; do not execute it. Works with nvm, or with a host that already has Node 24.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 24 >/dev/null
  nvm alias default 24 >/dev/null
  export PATH="$(dirname "$(nvm which 24)"):$PATH"
elif node --version 2>/dev/null | grep -q '^v24\.'; then
  :
else
  echo "Node.js 24 is required. Install nvm (https://github.com/nvm-sh/nvm) or Node 24." >&2
  return 1 2>/dev/null || exit 1
fi
