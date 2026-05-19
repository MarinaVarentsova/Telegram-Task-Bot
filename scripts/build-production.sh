#!/bin/bash
# Production build script — runs during `replit deploy` build phase.
# Builds the Node.js API server AND installs Python bot dependencies
# so the Python child process can import aiogram/aiohttp/etc. at runtime.
set -euo pipefail

echo "=== [build] Building API Server (Node.js) ==="
pnpm --filter @workspace/api-server run build

echo "=== [build] Installing Python bot dependencies ==="
pip install --quiet --disable-pip-version-check -r bot/requirements.txt

echo "=== [build] All done ==="
