#!/usr/bin/env bash
# Activate the Node.js 24 toolchain this project requires (see package.json "engines").
#
# The Cloud Agent base image ships an older Node on PATH (via /exec-daemon) that would
# otherwise shadow the version we install, so we resolve the Node 24 bin directory with
# nvm and push it to the front of PATH. Source this file; do not execute it.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24 >/dev/null
nvm alias default 24 >/dev/null
export PATH="$(dirname "$(nvm which 24)"):$PATH"
