#!/usr/bin/env bash
# Hold the shared lock while the frontend transaction runs. The backend holds
# the same lock while creating its persistent transaction lock.
set -euo pipefail
stage="$1"
component="$2"
expected_api_sha="$3"
[[ "$stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]]
[[ "$component" = web || "$component" = admin ]]
[[ "$expected_api_sha" =~ ^[0-9a-f]{40}$ ]]
exec 8>/opt/tsz-cross-deploy.lock
flock -n 8 || { echo 'Cross-component deployment lock is busy' >&2; exit 1; }
[[ ! -e /opt/tsz-rust/deploy.lock ]] || { echo 'API deployment is active' >&2; exit 1; }
systemctl is-active --quiet tsz-rust
/usr/bin/node - "$expected_api_sha" <<'NODE'
const assert = require('node:assert/strict');
const manifest = require('/opt/tsz-deploy-manifests/api.json');
assert.equal(manifest.component, 'api');
assert.equal(manifest.source.repository, 'LonelyFellas/tsz-rust');
assert.equal(manifest.source.remote_ref, 'refs/heads/main');
assert.equal(manifest.source.git_sha, process.argv[2]);
NODE
bash "$stage/publish-release.sh" "$stage" "$component"
