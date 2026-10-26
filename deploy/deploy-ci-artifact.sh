#!/usr/bin/env bash
# Downloaded packages are data. Run only the exact source checkout's verification tools.
prepare_deploy_artifact() {
  local component="$1" destination="$2" id
  prepare_deploy_tools "$component" >&2 || return 1
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 60 artifact-discovery gh api --paginate --slurp "repos/$DEPLOY_REPOSITORY/actions/runs/$DEPLOY_CI_RUN_ID/artifacts?per_page=100" \
    > "$destination/artifacts.json" || return 1
  id="$(node "$DEPLOY_BUILD_ROOT/deploy/release-artifact.mjs" select "$component" \
    "$destination/artifacts.json" "$destination/artifact-record.json")" || return 1
  [[ "$id" =~ ^[1-9][0-9]*$ ]] || return 1
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 300 artifact-download gh api "repos/$DEPLOY_REPOSITORY/actions/artifacts/$id/zip" > "$destination/download.zip" || return 1
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/unpack-release.py" zip "$destination/download.zip" "$destination/bundle" || return 1
  DEPLOY_RELEASE_ID="$(node "$DEPLOY_BUILD_ROOT/deploy/release-artifact.mjs" verify "$component" \
    "$destination/bundle" "$destination/artifact")" || return 1
  local required_node
  required_node="v$(git show "$DEPLOY_GIT_SHA:.node-version" | tr -d '[:space:]')"
  node --input-type=module - "$destination/bundle/release.json" "$required_node" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.equal('v' + JSON.parse(fs.readFileSync(process.argv[2])).node, process.argv[3]);
NODE
}

publish_deploy_artifact() {
  local component="$1" destination="$2" remote_stage
  node --input-type=module - "$destination/artifact-record.json" "$destination/bundle/release.json" "$DEPLOY_CI_RUN_ATTEMPT" <<'NODE'
import fs from 'node:fs';
const artifact = JSON.parse(fs.readFileSync(process.argv[2]));
const receipt = JSON.parse(fs.readFileSync(process.argv[3]));
console.log(`CI artifact ${artifact.id}; producer attempt ${receipt.identity.attempt}; latest successful CI attempt ${process.argv[4]}`);
NODE
  recheck_deploy_source "$component"
  remote_stage="$(ssh tshb-test 'mktemp -d /opt/tsz-release-stage.XXXXXX')"
  [[ "$remote_stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]] || {
    deploy_source_error "invalid remote staging path"; return 1;
  }
  rsync -az --no-o --no-g --timeout=180 "$destination/artifact/" "tshb-test:$remote_stage/artifact/"
  rsync -az --no-o --no-g --timeout=180 "$destination/bundle/candidate.json" "tshb-test:$remote_stage/candidate.json"
  rsync -az --no-o --no-g --timeout=180 "$destination/bundle/release.json" "tshb-test:$remote_stage/ci-release.json"
  printf '%s\n' "$DEPLOY_RELEASE_ID-$(node -e 'console.log(require("crypto").randomUUID())')" > "$destination/release-id"
  rsync -az --no-o --no-g --timeout=180 "$destination/release-id" "tshb-test:$remote_stage/release-id"
  local file
  for file in releases.mjs provenance.mjs publish-release.sh install-nginx-local.sh; do
    rsync -az --no-o --no-g --timeout=180 "$DEPLOY_BUILD_ROOT/deploy/$file" "tshb-test:$remote_stage/$file"
  done
  rsync -az --no-o --no-g --timeout=180 "$DEPLOY_BUILD_ROOT/deploy/nginx/" "tshb-test:$remote_stage/nginx/"
  rsync -az --no-o --no-g --timeout=180 "$DEPLOY_BUILD_ROOT/deploy/systemd/" "tshb-test:$remote_stage/systemd/"
  recheck_deploy_source "$component"
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 480 remote-publish \
    ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes tshb-test \
    "bash '$remote_stage/publish-release.sh' '$remote_stage' '$component'"
  ssh tshb-test "rm -rf -- '$remote_stage'"
}
