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
  local component="$1"
  shift
  local marker="$state_file.$component-superseded"
  local result_marker="$state_file.$component-result"
  rm -f "$marker"
  rm -f "$result_marker"
  DEPLOY_SUPERSEDED_MARKER="$marker" DEPLOY_COMPONENT_RESULT_MARKER="$result_marker" "$@"
  if [[ -f "$marker" ]]; then
    write_state transition "$state_file" superseded
    echo "release composition superseded during $component"
    exit 0
  fi
  [[ -f "$result_marker" ]] || {
    echo "missing accepted result for $component" >&2
    return 1
  }
  DEPLOY_COMPONENT_ACCEPTED_SHA="$(cat "$result_marker")"
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
    if [[ -n "${DEPLOY_ACTIVE_COMPONENT:-}" ]]; then
      node deploy/release-state.mjs transition "$state_file" failed "" "$DEPLOY_ACTIVE_COMPONENT" "" >/dev/null 2>&1 || true
    else
      node deploy/release-state.mjs transition "$state_file" failed >/dev/null 2>&1 || true
    fi
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
DEPLOY_ACTIVE_COMPONENT=""

web_api_sha="$(node deploy/deploy-metrics.mjs run web local api-contract -- node deploy/wait-api-contract.mjs --compatible)"
write_state transition "$state_file" dependencies-ready
write_state transition "$state_file" contract-compatible "$web_api_sha"

DEPLOY_ACTIVE_COMPONENT=web
write_state transition "$state_file" web-deploying "" web
run_component web env DEPLOY_EXPECTED_API_SHA="$web_api_sha" ./deploy/deploy-web.sh
DEPLOY_ACTIVE_COMPONENT=""
write_state transition "$state_file" web-accepted "" web "$DEPLOY_COMPONENT_ACCEPTED_SHA"
write_remote_composition web-accepted "$web_api_sha"

DEPLOY_ACTIVE_COMPONENT=admin
admin_api_sha="$(node deploy/deploy-metrics.mjs run admin local api-contract -- node deploy/wait-api-contract.mjs --compatible)"
if [[ "$admin_api_sha" != "$web_api_sha" ]]; then
  echo "API contract changed between Web and Admin publication" >&2
  write_state transition "$state_file" failed
  DEPLOY_ACTIVE_COMPONENT=""
  exit 1
fi
write_state transition "$state_file" admin-deploying "$admin_api_sha" admin
run_component admin env DEPLOY_EXPECTED_API_SHA="$admin_api_sha" ./deploy/deploy-admin.sh
DEPLOY_ACTIVE_COMPONENT=""
write_remote_composition accepted "$admin_api_sha"
write_state transition "$state_file" accepted "$admin_api_sha" admin "$DEPLOY_COMPONENT_ACCEPTED_SHA"
echo "release composition accepted: $release_id"
