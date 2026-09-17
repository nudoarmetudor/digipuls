#!/usr/bin/env bash
# Deploys when origin/main has moved. Run every minute from the deploy user's
# crontab (infra/README.md). The repository is public, so the box needs no
# credentials to read it, and no secret has to live in GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "=== $(date -u +%FT%TZ) main moved to $(git rev-parse --short origin/main)"
  ./infra/deploy.sh
fi
