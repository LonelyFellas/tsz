#!/usr/bin/env bash
# Orchestrate one frontend release composition. Component scripts retain the
# atomic remote publication and rollback responsibilities.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh
source deploy/deploy-transport.sh

state_file="${DEPLOY_COMPOSITION_STATE:?DEPLOY_COMPOSITION_STATE is required}"
mkdir -p "$(dirname "$state_file")"
release_id="${DEPLOY_EXPECTED_SHA:?DEPLOY_EXPECTED_SHA is required}-ci-${DEPLOY_EXPECTED_CI_RUN_ID:?}-${DEPLOY_EXPECTED_CI_RUN_ATTEMPT:?}"

write_state() {
  node deploy/release-state.mjs "$@" >/dev/null
}

run_component() {
  local component="$1" marker="$state_file.$component-superseded"
  shift
  rm -f "$marker"
  DEPLOY_SUPERSEDED_MARKER="$marker" "$@"
  if [[ -f "$marker" ]]; then
    write_state transition "$state_file" superseded
    echo "release composition superseded during $component"
    exit 0
  fi
}

write_remote_composition() {
  local state="$1" api_sha="$2"
  [[ "$state" =~ ^[a-z-]+$ && "$api_sha" =~ ^[0-9a-f]{40}$ ]]
  deploy_ssh tshb-test "exec 8>/opt/tsz-cross-deploy.lock && flock -n 8 && /usr/bin/node --input-type=module - '$state' '$DEPLOY_EXPECTED_SHA' '$DEPLOY_EXPECTED_CI_RUN_ID' '$DEPLOY_EXPECTED_CI_RUN_ATTEMPT' '$api_sha' /opt/tsz-deploy-manifests" < deploy/release-composition.mjs
}

cleanup_status=0
on_exit() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    node deploy/release-state.mjs transition "$state_file" failed "" "${DEPLOY_ACTIVE_COMPONENT:-web}" "" >/dev/null 2>&1 || true
  fi
  deploy_transport_cleanup || cleanup_status=1
  if [[ "$cleanup_status" != 0 ]]; then status=1; fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node deploy/release-state.mjs init "$state_file" "$release_id" "$DEPLOY_EXPECTED_SHA" "$DEPLOY_EXPECTED_CI_RUN_ID" "$DEPLOY_EXPECTED_CI_RUN_ATTEMPT" >/dev/null
deploy_transport_init "$(dirname "$state_file")"

api_sha="$(node deploy/deploy-metrics.mjs run web local api-contract -- node deploy/wait-api-contract.mjs --compatible)"
write_state transition "$state_file" dependencies-ready
write_state transition "$state_file" contract-compatible "$api_sha"

DEPLOY_ACTIVE_COMPONENT=web
write_state transition "$state_file" web-deploying "" web
run_component web env DEPLOY_EXPECTED_API_SHA="$api_sha" ./deploy/deploy-web.sh
write_state transition "$state_file" web-accepted "" web "$DEPLOY_EXPECTED_SHA"
write_remote_composition web-accepted "$api_sha"

api_sha="$(node deploy/deploy-metrics.mjs run admin local api-contract -- node deploy/wait-api-contract.mjs --compatible)"
write_state transition "$state_file" admin-deploying "$api_sha" admin
DEPLOY_ACTIVE_COMPONENT=admin
run_component admin env DEPLOY_EXPECTED_API_SHA="$api_sha" ./deploy/deploy-admin.sh
write_remote_composition accepted "$api_sha"
write_state transition "$state_file" accepted "$api_sha" admin "$DEPLOY_EXPECTED_SHA"
DEPLOY_ACTIVE_COMPONENT=""
echo "release composition accepted: $release_id"
