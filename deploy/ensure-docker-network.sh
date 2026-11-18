#!/usr/bin/env bash
set -euo pipefail

network_name="tsz-prod-edge"

if ! docker network inspect "$network_name" >/dev/null 2>&1; then
  docker network create "$network_name" >/dev/null
fi

echo "Docker network ready: $network_name"
