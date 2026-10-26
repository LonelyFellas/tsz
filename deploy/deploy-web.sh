#!/usr/bin/env bash
# Publish the verified Linux CI package; never rebuild it on the deployment host.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh
source deploy/deploy-ci-artifact.sh

prepare_deploy_source web
deploy_tmp="$(mktemp -d /tmp/tsz-web-deploy.XXXXXX)"
cleanup() {
  local status=$?
  remove_deploy_build_tree || status=1
  rm -rf -- "$deploy_tmp"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

required_node_version="v$(git show "$DEPLOY_GIT_SHA:.node-version" | tr -d '[:space:]')"
[[ "$(node --version)" = "$required_node_version" ]] || { echo "!! local Node must be $required_node_version" >&2; exit 1; }
[[ "$(ssh tshb-test '/usr/bin/node --version')" = "$required_node_version" ]] || { echo "!! server Node must be $required_node_version" >&2; exit 1; }
started="$SECONDS"
echo '==> download and verify web CI package'
prepare_deploy_artifact web "$deploy_tmp"
echo "==> package ready after $((SECONDS - started))s"
publish_deploy_artifact web "$deploy_tmp"
echo "✓ web accepted; total $((SECONDS - started))s; local build=0"
