#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
docker build -t tsz-deploy-test -f "$root/deploy/test-runtime/Dockerfile" "$root/deploy/test-runtime"
docker run --rm -v "$root:/repo:ro" tsz-deploy-test bash /repo/deploy/test-runtime/run.sh
