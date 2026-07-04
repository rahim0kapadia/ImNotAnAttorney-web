#!/usr/bin/env bash
# One-command redeploy. Run on the box: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f
echo "deployed. logs: docker compose logs -f inaa"
