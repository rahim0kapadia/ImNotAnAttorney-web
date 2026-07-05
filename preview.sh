#!/usr/bin/env bash
# Vercel-preview stand-in: push any branch to the box at http://152.53.194.188:8080.
# Run from the laptop (repo root). Usage:
#   ./preview.sh [branch]   deploy a preview (default: current HEAD)
#   ./preview.sh down       stop the preview
set -euo pipefail
BOX=root@152.53.194.188
SSH="ssh -i $HOME/.ssh/bullrun -o BatchMode=yes"
if [ "${1:-}" = "down" ]; then
  $SSH $BOX "cd /opt/inaa-preview && docker compose -p inaa-preview -f docker-compose.preview.yml down"
  echo "preview stopped."
  exit 0
fi
BRANCH="${1:-HEAD}"
git archive --format=tar "$BRANCH" | $SSH $BOX "mkdir -p /opt/inaa-preview && tar -x -C /opt/inaa-preview"
$SSH $BOX "cp /opt/inaa/.env /opt/inaa-preview/.env && cd /opt/inaa-preview && docker compose -p inaa-preview -f docker-compose.preview.yml up -d --build --wait"
echo "preview live: http://152.53.194.188:8080  (stop: ./preview.sh down)"
