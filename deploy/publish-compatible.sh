#!/usr/bin/env bash
# Reserve the backend deployment lock throughout the frontend transaction.
set -euo pipefail
stage="$1"
component="$2"
expected_api_sha="$3"
[[ "$stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]]
[[ "$component" = web || "$component" = admin ]]
[[ "$expected_api_sha" =~ ^[0-9a-f]{40}$ ]]
lock=/opt/tsz-rust/deploy.lock
owner="$(/usr/bin/node -e 'console.log(require("crypto").randomUUID())')"
mkdir -m 700 "$lock" || { echo 'API deployment lock is busy' >&2; exit 1; }
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [[ -f "$lock/owner" && "$(cat "$lock/owner")" = "$owner" ]]; then
    rm -f "$lock/owner" "$lock/git_sha"
    rmdir "$lock" || status=1
  else
    echo 'API lock ownership changed; manual recovery required' >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$owner" > "$lock/owner"
printf '%s\n' "$expected_api_sha" > "$lock/git_sha"
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
