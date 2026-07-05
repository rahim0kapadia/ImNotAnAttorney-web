#!/usr/bin/env bash
# One-command redeploy. Run on the box: ./deploy.sh
# Source arrives via git-archive push from the laptop (no git repo on box):
#   git -C <worktree> archive --format=tar feat/self-host-netcup | ssh root@box "tar -x -C /opt/inaa"
set -euo pipefail
cd "$(dirname "$0")"
# keep previous image for instant rollback: ./deploy.sh rollback
if [ "${1:-}" = "rollback" ]; then
  docker tag inaa-app:prev inaa-app:latest
  docker rollout inaa
  echo "rolled back to previous image (zero-downtime)."
  exit 0
fi
docker tag inaa-app:latest inaa-app:prev 2>/dev/null || true
docker compose build inaa
docker rollout inaa # scale 2 -> health-wait new -> retire old; Caddyfile lb_try covers the swap
docker compose up -d # apply caddy/compose-level changes, no-op otherwise
docker image prune -f
echo "deployed + healthy (zero-downtime). logs: docker compose logs -f inaa   rollback: ./deploy.sh rollback"
