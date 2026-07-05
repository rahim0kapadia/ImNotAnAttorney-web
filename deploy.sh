#!/usr/bin/env bash
# One-command redeploy. Run on the box: ./deploy.sh
# Source arrives via git-archive push from the laptop (no git repo on box):
#   git -C <worktree> archive --format=tar feat/self-host-netcup | ssh root@box "tar -x -C /opt/inaa"
set -euo pipefail
cd "$(dirname "$0")"
docker compose up -d --build
docker image prune -f
echo "deployed. logs: docker compose logs -f inaa"
