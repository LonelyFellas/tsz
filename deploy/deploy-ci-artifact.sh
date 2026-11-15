#!/usr/bin/env bash
# Downloaded packages are data. Run only the exact source checkout's verification tools.
prepare_deploy_artifact() {
  local component="$1" destination="$2" id
  deploy_phase export-tools
  prepare_deploy_tools "$component" >&2 || return 1
  deploy_phase artifact-discovery
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 60 artifact-discovery gh api --paginate --slurp "repos/$DEPLOY_REPOSITORY/actions/runs/$DEPLOY_CI_RUN_ID/artifacts?per_page=100" \
    > "$destination/artifacts.json" || return 1
  id="$(node "$DEPLOY_BUILD_ROOT/deploy/release-artifact.mjs" select "$component" \
    "$destination/artifacts.json" "$destination/artifact-record.json")" || return 1
  [[ "$id" =~ ^[1-9][0-9]*$ ]] || return 1
  deploy_phase artifact-download
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 300 artifact-download gh api "repos/$DEPLOY_REPOSITORY/actions/artifacts/$id/zip" > "$destination/download.zip" || return 1
  deploy_phase unpack-and-verify
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/unpack-release.py" zip "$destination/download.zip" "$destination/bundle" || return 1
  if [[ "$component" = admin && "${DEPLOY_AUTO_CONFIG:-}" = 1 ]]; then
    local flag value
    for flag in VOICE_EDITOR AZURE_PRONUNCIATION_INPUTS FORM_SPELLING_REGULARITY SENTENCE_FORMATTING; do
      value="$(node - "$destination/bundle/release.json" "$flag" <<'NODE'
const fs = require('node:fs');
const receipt = JSON.parse(fs.readFileSync(process.argv[2]));
const value = receipt.config?.env?.[`VITE_${process.argv[3]}`];
if (value !== 'true' && value !== 'false') process.exit(1);
process.stdout.write(value);
NODE
)" || return 1
      export "DEPLOY_$flag=$value"
    done
  fi
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
  local component="$1" destination="$2" remote_stage upload="$2/upload"
  node --input-type=module - "$destination/artifact-record.json" "$destination/bundle/release.json" "$DEPLOY_CI_RUN_ATTEMPT" <<'NODE'
import fs from 'node:fs';
const artifact = JSON.parse(fs.readFileSync(process.argv[2]));
const receipt = JSON.parse(fs.readFileSync(process.argv[3]));
console.log(`CI artifact ${artifact.id}; producer attempt ${receipt.identity.attempt}; latest successful CI attempt ${process.argv[4]}`);
NODE
  deploy_phase source-recheck-upload
  recheck_deploy_source "$component"
  deploy_phase prepare-upload
  # rsync -a also copies this directory's mode to the remote mktemp stage.
  mkdir -m 700 "$upload"
  # Move the already verified tree without copying or rebuilding its contents.
  mv "$destination/artifact" "$upload/artifact"
  cp "$destination/bundle/candidate.json" "$upload/candidate.json"
  cp "$destination/bundle/release.json" "$upload/ci-release.json"
  printf '%s\n' "$DEPLOY_RELEASE_ID-$(node -e 'console.log(require("crypto").randomUUID())')" > "$upload/release-id"
  local file
  for file in releases.mjs provenance.mjs publish-release.sh publish-compatible.sh install-nginx-local.sh deploy-metrics.sh deploy-metrics.mjs; do
    cp "$DEPLOY_BUILD_ROOT/deploy/$file" "$upload/$file"
  done
  cp -a "$DEPLOY_BUILD_ROOT/deploy/nginx" "$DEPLOY_BUILD_ROOT/deploy/systemd" "$upload/"
  deploy_phase remote-stage
  remote_stage="$(deploy_ssh tshb-test 'mktemp -d /opt/tsz-release-stage.XXXXXX')"
  [[ "$remote_stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]] || {
    deploy_source_error "invalid remote staging path"; return 1;
  }
  deploy_phase upload
  rsync -az --no-o --no-g --timeout=180 --stats -e "$DEPLOY_RSYNC_RSH" \
    "$upload/" "tshb-test:$remote_stage/"
  deploy_phase source-recheck-publish
  recheck_deploy_source "$component"
  local expected_api_sha="${DEPLOY_EXPECTED_API_SHA:-}"
  [[ -z "$expected_api_sha" || "$expected_api_sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  local publish_command="bash '$remote_stage/publish-compatible.sh' '$remote_stage' '$component' '$expected_api_sha'"
  deploy_phase remote-publish
  python3 -I "$DEPLOY_BUILD_ROOT/deploy/run-with-progress.py" 480 remote-publish \
    ssh "${DEPLOY_SSH_OPTIONS[@]}" tshb-test \
    "$publish_command" 2>&1 | tee "$destination/remote-publish.log"
  deploy_phase remote-cleanup
  deploy_ssh tshb-test "rm -rf -- '$remote_stage'"
}
