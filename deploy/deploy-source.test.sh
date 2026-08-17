#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/deploy/deploy-source.sh"

test_dir="$(mktemp -d /tmp/tsz-deploy-source-test.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
fake_bin="$test_dir/bin"
mkdir -p "$fake_bin"

cat >"$fake_bin/git" <<'FAKE_GIT'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "status --porcelain")
    [[ "${FAKE_GIT_STATUS_FAIL:-0}" = 0 ]] || exit 1
    printf '%s' "${FAKE_GIT_STATUS:-}"
    ;;
  "rev-parse HEAD") printf '%s\n' "$FAKE_HEAD" ;;
  "rev-parse HEAD^{tree}") printf '%s\n' "$FAKE_TREE" ;;
  "remote get-url origin") printf '%s\n' "$FAKE_ORIGIN" ;;
  "ls-remote --exit-code origin refs/heads/main") printf '%s\trefs/heads/main\n' "$FAKE_REMOTE_SHA" ;;
  *) printf 'unexpected git call: %s\n' "$*" >&2; exit 90 ;;
esac
FAKE_GIT

cat >"$fake_bin/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_GH_FAIL:-0}" = 1 ]]; then
  exit 1
fi
printf '%s\n' "${FAKE_CI_TSV:-}"
FAKE_GH
chmod +x "$fake_bin/git" "$fake_bin/gh"

export PATH="$fake_bin:$PATH"
export FAKE_HEAD="$(printf 'a%.0s' {1..40})"
export FAKE_TREE="$(printf 'b%.0s' {1..40})"
export FAKE_REMOTE_SHA="$FAKE_HEAD"
export FAKE_ORIGIN="git@github.com:LonelyFellas/tsz.git"
export FAKE_CI_TSV=$'123456789\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/123456789'

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_failure() {
  local label="$1"
  shift
  if ("$@" >/dev/null 2>&1); then
    fail "$label unexpectedly succeeded"
  fi
}

prepare_deploy_source web
[[ "$DEPLOY_GIT_SHA" = "$FAKE_HEAD" ]] || fail "S01 git sha"
[[ "$DEPLOY_GIT_TREE" = "$FAKE_TREE" ]] || fail "S01 git tree"
[[ "$DEPLOY_REPOSITORY" = "LonelyFellas/tsz" ]] || fail "S01 repository"
[[ "$DEPLOY_CI_RUN_ID" = 123456789 ]] || fail "S01 run id"

export FAKE_GIT_STATUS="dirty"
expect_failure "S02 dirty checkout" prepare_deploy_source web
export FAKE_GIT_STATUS=""
export FAKE_GIT_STATUS_FAIL=1
expect_failure "S02 unreadable checkout" prepare_deploy_source web
export FAKE_GIT_STATUS_FAIL=0

prepare_deploy_source web
export FAKE_REMOTE_SHA="$(printf 'c%.0s' {1..40})"
expect_failure "S03 remote main advanced" recheck_deploy_source web
export FAKE_REMOTE_SHA="$FAKE_HEAD"

ci_cases=(
  ""
  $'123\tqueued\t-\thttps://github.com/LonelyFellas/tsz/actions/runs/123'
  $'123\tcompleted\tfailure\thttps://github.com/LonelyFellas/tsz/actions/runs/123'
)
for ci_case in "${ci_cases[@]}"; do
  export FAKE_CI_TSV="$ci_case"
  expect_failure "S04 untrusted CI" prepare_deploy_source web
done
export FAKE_GH_FAIL=1
expect_failure "S04 GitHub API failure" prepare_deploy_source web
export FAKE_GH_FAIL=0
export FAKE_CI_TSV=$'123456789\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/123456789'

export FAKE_ORIGIN="https://example.com/LonelyFellas/tsz.git"
expect_failure "S05 non-GitHub origin" prepare_deploy_source web
export FAKE_ORIGIN="git@github.com:LonelyFellas/tsz.git"
export FAKE_CI_TSV=$'not-a-number\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/not-a-number'
expect_failure "S05 invalid run metadata" prepare_deploy_source web
export FAKE_CI_TSV=$'9999999999999999\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/9999999999999999'
expect_failure "S05 unsafe run metadata" prepare_deploy_source web
export FAKE_CI_TSV=$'123\tcompleted\tsuccess\thttps://example.com/123'
expect_failure "S05 invalid run URL" prepare_deploy_source web

env_fixture="$test_dir/env-fixture"
mkdir -p "$env_fixture/apps/web" "$env_fixture/apps/admin"
(
  cd "$env_fixture"
  : >apps/web/.env.local
  expect_failure "S06 ignored Next environment" reject_ignored_build_env web
  rm apps/web/.env.local
  : >apps/admin/.env.test
  expect_failure "S06 ignored Vite environment" reject_ignored_build_env admin
)

export SHOULD_NOT_LEAK="secret"
sanitized="$({ run_sanitized_build ALLOWED_VALUE=kept bash -c \
  'printf "%s:%s" "$ALLOWED_VALUE" "${SHOULD_NOT_LEAK-unset}"'; })"
[[ "$sanitized" = "kept:unset" ]] || fail "S07 sanitized build environment"

printf 'deploy-source tests: PASS\n'
