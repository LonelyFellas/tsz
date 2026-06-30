#!/usr/bin/env bash
# One-shot deploy/update for the frontend tier (web + admin + nginx).
#
#   ./deploy.sh
#
# Pulls the latest code, rebuilds the Next standalone images (pnpm + Next build
# caches are reused via BuildKit cache mounts), rolls the containers, and waits
# for nginx to serve. Run it from the app host. The backend runs separately
# (tshb-go) and is reached via host.docker.internal — this script never touches it.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://localhost/"   # nginx default server -> web
HEALTH_TIMEOUT=120               # Next cold start can take a moment

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building and rolling containers"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for ${HEALTH_URL} (up to ${HEALTH_TIMEOUT}s)"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
until curl -fsS -o /dev/null "$HEALTH_URL"; do
  if (( SECONDS >= deadline )); then
    echo "ERROR: site did not respond within ${HEALTH_TIMEOUT}s. Recent logs:" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=40 nginx web admin >&2
    exit 1
  fi
  sleep 2
done

echo "==> Deployed. Container status:"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Done."
