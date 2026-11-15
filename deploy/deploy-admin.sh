#!/usr/bin/env bash
# Publish the verified test-mode CI package; compatibility flags select package settings.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh
source deploy/deploy-ci-artifact.sh
source deploy/deploy-metrics.sh
source deploy/deploy-transport.sh

deploy_metrics_init admin local
deploy_phase source-check
deploy_tmp=""
cleanup() {
  local status=$? cleanup_status=0
  if [[ "$status" = 0 ]]; then deploy_phase local-cleanup
  else deploy_phase local-cleanup failure; fi
  remove_deploy_build_tree || cleanup_status=1
  deploy_transport_cleanup
  if [[ -n "$deploy_tmp" ]]; then
    deploy_metrics_remote_summary "$deploy_tmp/remote-publish.log"
    rm -rf -- "$deploy_tmp" || cleanup_status=1
  fi
  if [[ "$cleanup_status" = 0 ]]; then deploy_phase_end success
  else deploy_phase_end failure; status=1; fi
  deploy_metrics_finish "$status"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Reject invalid settings before even querying the server.
node --input-type=module -e 'import {buildConfig} from "./deploy/release-artifact.mjs"; buildConfig("admin");'
prepare_deploy_source admin
deploy_tmp="$(mktemp -d /tmp/tsz-admin-deploy.XXXXXX)"
deploy_transport_init "$deploy_tmp"
deploy_phase node-check
required_node_version="v$(git show "$DEPLOY_GIT_SHA:.node-version" | tr -d '[:space:]')"
[[ "$(node --version)" = "$required_node_version" ]] || { echo "!! local Node must be $required_node_version" >&2; exit 1; }
[[ "$(deploy_ssh tshb-test '/usr/bin/node --version')" = "$required_node_version" ]] || { echo "!! server Node must be $required_node_version" >&2; exit 1; }
started="$SECONDS"
echo '==> download and verify admin CI package'
prepare_deploy_artifact admin "$deploy_tmp"
echo "==> package ready after $((SECONDS - started))s"
select_deploy_component admin "$deploy_tmp"
if [[ "$DEPLOY_COMPONENT_ACTION" = skip ]]; then
  echo '✓ admin unchanged; existing accepted version verified; remote writes=0; local build=0'
  exit 0
fi
publish_deploy_artifact admin "$deploy_tmp"
echo "✓ admin accepted; total $((SECONDS - started))s; local build=0"
