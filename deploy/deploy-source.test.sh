#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/deploy/deploy-source.sh"

test_dir="$(mktemp -d /tmp/tsz-deploy-source-test.XXXXXX)"
cleanup_test() {
  remove_deploy_build_tree >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup_test EXIT
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
  "rev-parse "*"^{tree}") printf '%s\n' "$FAKE_TREE" ;;
  "cat-file -e "*"^{commit}") [[ "${FAKE_MISSING_COMMIT:-0}" = 0 ]] || exit 1 ;;
  "fetch --no-tags --quiet origin main") [[ "${FAKE_FETCH_FAIL:-0}" = 0 ]] || exit 1 ;;
  "archive --format=tar "*)
    [[ "${FAKE_ARCHIVE_FAIL:-0}" = 0 ]] || exit 1
    tar -cf - -C "$FAKE_ARCHIVE_DIR" .
    ;;
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

# 构建树里的 pnpm install 在用例里只记录一次调用：这里要证的是「谁调用、以什么顺序、
# 失败时怎么办」，真正装依赖由端到端部署覆盖。
cat >"$fake_bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD $*" >>"$FAKE_PNPM_CALLS"
[[ "${FAKE_PNPM_FAIL:-0}" = 0 ]] || exit 1
FAKE_PNPM
chmod +x "$fake_bin/git" "$fake_bin/gh" "$fake_bin/pnpm"

export PATH="$fake_bin:$PATH"
export FAKE_PNPM_CALLS="$test_dir/pnpm-calls"
: >"$FAKE_PNPM_CALLS"

# 用例整轮在假部署根里跑，不碰开发者自己的工作区：本文件挂在 pre-push 的 test:cov 上，
# 按 .env.example 配好本地环境的人不该因此被拦。
deploy_root="$test_dir/deploy-root"
mkdir -p "$deploy_root"
cd "$deploy_root"

# git archive 的产物由 FAKE_ARCHIVE_DIR 决定：干净树用来验放行，脏树用来验 fail-closed。
clean_archive="$test_dir/archive-clean"
mkdir -p "$clean_archive/apps/web" "$clean_archive/apps/admin"
printf 'workspace\n' >"$clean_archive/pnpm-workspace.yaml"

export FAKE_ARCHIVE_DIR="$clean_archive"
export FAKE_HEAD="$(printf 'a%.0s' {1..40})"
export FAKE_TREE="$(printf 'b%.0s' {1..40})"
export FAKE_REMOTE_SHA="$FAKE_HEAD"
export FAKE_ORIGIN="git@github.com:LonelyFellas/tsz.git"
export FAKE_CI_TSV=$'123456789\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/123456789'

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

# 被测函数一律在当前 shell 里跑（不套子 shell），否则 DEPLOY_BUILD_ROOT 这类副作用
# 留不下来，失败用例造出的构建目录也就没法清理。
run_status=0
run_output=""
run_under_test() {
  run_status=0
  "$@" >"$test_dir/last-output" 2>&1 || run_status=$?
  run_output="$(cat "$test_dir/last-output")"
}

expect_failure() {
  local label="$1"
  shift
  run_under_test "$@"
  [[ "$run_status" != 0 ]] || fail "$label unexpectedly succeeded"
}

# 门要连「因何而拒」一起锁：只断言失败的话，用例可能被别的失败
# (CI 未过、导出失败……)顺带带过，门本身被摘掉也照样绿。
expect_rejection() {
  local label="$1"
  local expected="$2"
  shift 2
  run_under_test "$@"
  [[ "$run_status" != 0 ]] || fail "$label unexpectedly succeeded"
  case "$run_output" in
    $expected) ;;
    *) fail "$label rejected for the wrong reason: $run_output" ;;
  esac
}

expect_warning() {
  local label="$1"
  local expected="$2"
  shift 2
  run_under_test "$@"
  [[ "$run_status" = 0 ]] || fail "$label unexpectedly failed: $run_output"
  case "$run_output" in
    $expected) ;;
    *) fail "$label did not warn: $run_output" ;;
  esac
}

# S01 目标 commit 取自 origin/main，不取自工作区 HEAD。
prepare_deploy_source web
[[ "$DEPLOY_GIT_SHA" = "$FAKE_REMOTE_SHA" ]] || fail "S01 git sha"
[[ "$DEPLOY_GIT_TREE" = "$FAKE_TREE" ]] || fail "S01 git tree"
[[ "$DEPLOY_REPOSITORY" = "LonelyFellas/tsz" ]] || fail "S01 repository"
[[ "$DEPLOY_CI_RUN_ID" = 123456789 ]] || fail "S01 run id"

expect_failure "S01 unknown component" prepare_deploy_source api

# S02 工作区状态只提醒不拒绝——产物来自 git 对象，脏工作区影响不到它。
export FAKE_GIT_STATUS="dirty"
expect_warning "S02 dirty checkout" '*工作区有未提交改动，不会进入产物*' \
  prepare_deploy_source web
export FAKE_GIT_STATUS=""
export FAKE_GIT_STATUS_FAIL=1
prepare_deploy_source web >/dev/null 2>&1 ||
  fail "S02 unreadable checkout must not block the deploy"
export FAKE_GIT_STATUS_FAIL=0

# 本地在别的分支上照样部署 origin/main，只是要说清楚。
export FAKE_HEAD="$(printf 'd%.0s' {1..40})"
expect_warning "S02 detached worktree" '*不是 origin/main，产物仍按 origin/main 构建*' \
  prepare_deploy_source web
prepare_deploy_source web >/dev/null 2>&1
[[ "$DEPLOY_GIT_SHA" = "$FAKE_REMOTE_SHA" ]] || fail "S02 target must stay origin/main"
export FAKE_HEAD="$FAKE_REMOTE_SHA"

# S03 origin/main 前进后必须拒绝：构建树是旧 commit 导出的，不能再往服务器写。
prepare_deploy_source web >/dev/null
prepare_deploy_build_tree web >/dev/null
export FAKE_REMOTE_SHA="$(printf 'c%.0s' {1..40})"
expect_rejection "S03 remote main advanced" '*origin/main advanced after source gate*' \
  recheck_deploy_source web
export FAKE_REMOTE_SHA="$FAKE_HEAD"
recheck_deploy_source web || fail "S03 recheck must pass when main is unchanged"
remove_deploy_build_tree || fail "S03 cleanup"
DEPLOY_BUILD_ROOT=""

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
export FAKE_CI_TSV=$'123456789\tcompleted\tsuccess\thttps://github.com/LonelyFellas/tsz/actions/runs/123456789'

# 目标 commit 本地没有时先 fetch；fetch 也拿不到就拒绝，绝不退回工作区构建。
export FAKE_MISSING_COMMIT=1
export FAKE_FETCH_FAIL=1
expect_rejection "S05 unfetchable target" '*cannot fetch origin/main*' \
  prepare_deploy_source web
export FAKE_FETCH_FAIL=0
expect_rejection "S05 target still missing after fetch" '*still missing after fetch*' \
  prepare_deploy_source web
export FAKE_MISSING_COMMIT=0
prepare_deploy_source web >/dev/null

# S06 部署场景仍然 fail-closed：构建树里出现 Next/Vite 会读的 ignored .env* 一律拒绝，
# helper 与两个入口(prepare_deploy_build_tree/recheck)都要拒，光锁 helper 挡不住入口漏调。
polluted="$test_dir/polluted"
mkdir -p "$polluted/apps/web" "$polluted/apps/admin"
: >"$polluted/apps/web/.env.local"
expect_rejection "S06 ignored Next environment" \
  '*ignored build environment file exists: *apps/web/.env.local*' \
  reject_ignored_build_env web "$polluted"
expect_failure "S06 build root is required" reject_ignored_build_env web ""

: >"$FAKE_PNPM_CALLS"
export FAKE_ARCHIVE_DIR="$polluted"
expect_rejection "S06 build tree rejects Next environment" \
  "*ignored build environment file exists: ${DEPLOY_BUILD_ROOT_PREFIX}*/apps/web/.env.local*" \
  prepare_deploy_build_tree web
[[ -n "$DEPLOY_BUILD_ROOT" ]] || fail "S06 failed build tree must stay cleanable"
[[ ! -s "$FAKE_PNPM_CALLS" ]] || fail "S06 must reject before installing dependencies"
remove_deploy_build_tree || fail "S06 cleanup"
DEPLOY_BUILD_ROOT=""

rm "$polluted/apps/web/.env.local"
: >"$polluted/apps/admin/.env.test"
expect_rejection "S06 build tree rejects Vite environment" \
  "*ignored build environment file exists: ${DEPLOY_BUILD_ROOT_PREFIX}*/apps/admin/.env.test*" \
  prepare_deploy_build_tree admin
remove_deploy_build_tree || fail "S06 cleanup"
DEPLOY_BUILD_ROOT=""
export FAKE_ARCHIVE_DIR="$clean_archive"

# 构建树事后被污染，写服务器前的 recheck 也必须拒绝。
prepare_deploy_build_tree web >/dev/null
: >"$DEPLOY_BUILD_ROOT/apps/web/.env.local"
expect_rejection "S06 recheck rejects a polluted build tree" \
  '*ignored build environment file exists: *apps/web/.env.local*' \
  recheck_deploy_source web
rm "$DEPLOY_BUILD_ROOT/apps/web/.env.local"
recheck_deploy_source web || fail "S06 clean build tree must pass recheck"
remove_deploy_build_tree || fail "S06 cleanup"
DEPLOY_BUILD_ROOT=""

# S07 构建环境仍然是 allowlist：换了构建目录不等于放弃环境隔离。
export SHOULD_NOT_LEAK="secret"
sanitized="$({ run_sanitized_build ALLOWED_VALUE=kept bash -c \
  'printf "%s:%s" "$ALLOWED_VALUE" "${SHOULD_NOT_LEAK-unset}"'; })"
[[ "$sanitized" = "kept:unset" ]] || fail "S07 sanitized build environment"

# S08 构建树生命周期：导出到带前缀的临时目录、在那里装依赖、用完能删干净。
: >"$FAKE_PNPM_CALLS"
prepare_deploy_build_tree web >/dev/null
build_root="$DEPLOY_BUILD_ROOT"
case "$build_root" in
  "$DEPLOY_BUILD_ROOT_PREFIX"*) ;;
  *) fail "S08 build root must live under the deploy build prefix: $build_root" ;;
esac
# 构建目录必须是不含符号链接的真实路径：macOS 的 /tmp -> /private/tmp 会让
# provenance.mjs 的主模块判定失败，CLI 静默跳过、退出 0，manifest 根本不生成。
[[ "$build_root" = "$(cd "$build_root" && pwd -P)" ]] ||
  fail "S08 build root must be a symlink-free real path: $build_root"
[[ -f "$build_root/pnpm-workspace.yaml" ]] || fail "S08 target commit must be exported"
pnpm_call="$(cat "$FAKE_PNPM_CALLS")"
[[ "$pnpm_call" = *"$(basename "$build_root") install --frozen-lockfile" ]] ||
  fail "S08 dependencies must be installed inside the build tree: $pnpm_call"
remove_deploy_build_tree || fail "S08 remove"
[[ ! -e "$build_root" ]] || fail "S08 build tree must be removed"

# 前缀不对就拒绝删——和部署脚本 cleanup() 对临时目录的谨慎程度保持一致。
outside="$test_dir/outside"
mkdir -p "$outside"
DEPLOY_BUILD_ROOT="$outside"
expect_failure "S08 refuse to clean an unexpected build root" remove_deploy_build_tree
[[ -d "$outside" ]] || fail "S08 unexpected build root must survive"
DEPLOY_BUILD_ROOT=""
remove_deploy_build_tree || fail "S08 empty build root is a no-op"

export FAKE_PNPM_FAIL=1
expect_rejection "S08 install failure" '*dependency install failed in the build tree*' \
  prepare_deploy_build_tree web
remove_deploy_build_tree || fail "S08 cleanup"
DEPLOY_BUILD_ROOT=""
export FAKE_PNPM_FAIL=0

export FAKE_ARCHIVE_FAIL=1
expect_rejection "S08 export failure" '*cannot export the target commit*' \
  prepare_deploy_build_tree web
remove_deploy_build_tree || fail "S08 cleanup"
DEPLOY_BUILD_ROOT=""
export FAKE_ARCHIVE_FAIL=0

# 没过来源门就不许开构建树，免得拿着未校验的 SHA 去导出。
saved_sha="$DEPLOY_GIT_SHA"
DEPLOY_GIT_SHA=""
expect_rejection "S09 build tree needs the source gate" '*source gate has not been prepared*' \
  prepare_deploy_build_tree web
expect_rejection "S09 recheck needs the source gate" '*source gate has not been prepared*' \
  recheck_deploy_source web
DEPLOY_GIT_SHA="$saved_sha"
expect_rejection "S09 recheck needs a build tree" '*build tree has not been prepared*' \
  recheck_deploy_source web

printf 'deploy-source tests: PASS\n'
