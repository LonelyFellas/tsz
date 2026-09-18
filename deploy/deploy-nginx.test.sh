#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/deploy/deploy-source.sh"

test_dir="$(mktemp -d /tmp/tsz-deploy-nginx-test.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
fake_bin="$test_dir/bin"
mkdir -p "$fake_bin"

# 假 ssh：「服务器上的命令」连同 stdin（远端事务脚本）在本机原样执行。服务器目录经
# DEPLOY_NGINX_CONF_DIR 指进测试目录，这里要证的是换装事务本身：备份、替换、测试、回滚。
cat >"$fake_bin/ssh" <<'FAKE_SSH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" = tshb-test ]] || { printf 'unexpected ssh host: %s\n' "$1" >&2; exit 90; }
shift
printf 'ssh %s\n' "$*" >>"$FAKE_CALLS"
exec bash -c "$*"
FAKE_SSH

cat >"$fake_bin/rsync" <<'FAKE_RSYNC'
#!/usr/bin/env bash
set -euo pipefail
printf 'rsync %s\n' "$*" >>"$FAKE_CALLS"
[[ " $* " = *" --no-o --no-g "* ]] || { echo 'rsync to tshb-test must keep root owner' >&2; exit 92; }
args=("$@")
src="${args[$(($# - 2))]}"
dest="${args[$(($# - 1))]}"
[[ "$dest" = tshb-test:* ]] || exit 91
dest="${dest#tshb-test:}"
[[ -z "${FAKE_RSYNC_FAIL_ON:-}" || "${dest##*/}" != "$FAKE_RSYNC_FAIL_ON" ]] || exit 23
cp "$src" "$dest"
FAKE_RSYNC

# 与真 nginx -t 一样看磁盘上的整份配置：conf.d 里任何一份带 BROKEN 标记就判不通过。
# 所以 nginx -t 失败本身就证明新配置确实被换上去过，之后文件复原只可能是回滚做的。
# FAKE_NGINX_WIPE_STAGE 模拟事务进行中暂存目录（含备份）被别人删掉。
cat >"$fake_bin/nginx" <<'FAKE_NGINX'
#!/usr/bin/env bash
set -euo pipefail
printf 'nginx %s\n' "$*" >>"$FAKE_CALLS"
[[ "$*" = -t ]] || exit 90
if [[ -n "${FAKE_NGINX_WIPE_STAGE:-}" ]]; then
  rm -rf "${FAKE_CONF_DIR%/*}"/.tsz-deploy-nginx.*
fi
if grep -q BROKEN "$FAKE_CONF_DIR"/*.conf; then
  echo 'nginx: [emerg] fake broken directive' >&2
  exit 1
fi
FAKE_NGINX

cat >"$fake_bin/systemctl" <<'FAKE_SYSTEMCTL'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >>"$FAKE_CALLS"
[[ -z "${FAKE_SYSTEMCTL_FAIL:-}" ]]
FAKE_SYSTEMCTL
chmod +x "$fake_bin/ssh" "$fake_bin/rsync" "$fake_bin/nginx" "$fake_bin/systemctl"

export PATH="$fake_bin:$PATH"
export FAKE_CALLS="$test_dir/calls"
server="$test_dir/server"
build="$test_dir/build"
DEPLOY_NGINX_CONF_DIR="$server/nginx/conf.d"
export FAKE_CONF_DIR="$DEPLOY_NGINX_CONF_DIR"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

# 每个用例从同一份「服务器现状」起步：两份旧配置 + 一份无关的禅道配置（换装不能碰它）。
reset_case() {
  rm -rf "$server" "$build" "$test_dir/before"
  mkdir -p "$DEPLOY_NGINX_CONF_DIR" "$build/deploy/nginx"
  printf 'old ip entry\n' >"$DEPLOY_NGINX_CONF_DIR/tsz.conf"
  printf 'old domains\n' >"$DEPLOY_NGINX_CONF_DIR/tsz-test-domains.conf"
  printf 'zentao\n' >"$DEPLOY_NGINX_CONF_DIR/zentao-ip.conf"
  cp "$repo_root/deploy/install-nginx-local.sh" "$build/deploy/install-nginx-local.sh"
  printf 'new ip entry\n' >"$build/deploy/nginx/tshb-test.conf"
  printf 'new domains\n' >"$build/deploy/nginx/tshb-test-domains.conf"
  : >"$FAKE_CALLS"
  unset FAKE_RSYNC_FAIL_ON FAKE_NGINX_WIPE_STAGE FAKE_SYSTEMCTL_FAIL
  DEPLOY_NGINX_STAGE=""
}

snapshot_server() {
  cp -Rp "$DEPLOY_NGINX_CONF_DIR" "$test_dir/before"
}

assert_server_unchanged() {
  diff -r "$test_dir/before" "$DEPLOY_NGINX_CONF_DIR" >/dev/null || fail "$1"
}

assert_no_stage_left() {
  local leftovers
  leftovers="$(find "$server/nginx" -mindepth 1 -maxdepth 1 -name '.tsz-deploy-nginx.*')"
  [[ -z "$leftovers" ]] || fail "$1: $leftovers"
}

nginx_calls() {
  grep -E '^(nginx|systemctl) ' "$FAKE_CALLS" || true
}

# N01 配置有效：两份都换成新内容，先 nginx -t 再 reload，无关配置不动，暂存目录不留。
reset_case
install_nginx_configs "$build" || fail "N01 valid configs should install"
[[ "$(cat "$DEPLOY_NGINX_CONF_DIR/tsz.conf")" = "new ip entry" ]] || fail "N01 tsz.conf not replaced"
[[ "$(cat "$DEPLOY_NGINX_CONF_DIR/tsz-test-domains.conf")" = "new domains" ]] ||
  fail "N01 tsz-test-domains.conf not replaced"
[[ "$(cat "$DEPLOY_NGINX_CONF_DIR/zentao-ip.conf")" = "zentao" ]] || fail "N01 unrelated conf touched"
[[ "$(nginx_calls)" = $'nginx -t\nsystemctl reload nginx' ]] || fail "N01 should test, then reload once"
[[ -z "$DEPLOY_NGINX_STAGE" ]] || fail "N01 stage handle should be cleared after success"
assert_no_stage_left "N01 stage dir left behind"

# N02 新配置让 nginx -t 失败：两份都逐字节恢复、不 reload、非零退出，暂存与备份都不留。
# 事务一开始本地句柄就必须交出去：否则本地 trap 会和远端回滚抢着删备份。
reset_case
printf 'BROKEN\n' >"$build/deploy/nginx/tshb-test-domains.conf"
snapshot_server
if install_nginx_configs "$build" 2>"$test_dir/stderr"; then
  fail "N02 invalid config should fail the install"
fi
assert_server_unchanged "N02 original configs should be restored byte for byte"
[[ "$(nginx_calls)" = "nginx -t" ]] || fail "N02 should test the new config and never reload"
grep -qF '已恢复原配置，未 reload' "$test_dir/stderr" || fail "N02 should report the rollback"
[[ -z "$DEPLOY_NGINX_STAGE" ]] || fail "N02 local trap must not own the stage once the transaction started"
assert_no_stage_left "N02 stage or backup left behind"

# N03 服务器上原本没有这份配置（首次装）且 nginx -t 失败：回滚要把新放进去的文件删掉。
reset_case
rm "$DEPLOY_NGINX_CONF_DIR/tsz-test-domains.conf"
printf 'BROKEN\n' >"$build/deploy/nginx/tshb-test-domains.conf"
snapshot_server
if install_nginx_configs "$build" 2>/dev/null; then
  fail "N03 invalid first-time config should fail the install"
fi
assert_server_unchanged "N03 a config absent before should be absent again"
[[ "$(nginx_calls)" = "nginx -t" ]] || fail "N03 should test the new config and never reload"
assert_no_stage_left "N03 stage left behind"

# N04 暂存阶段就失败（第二份 rsync 断了）：服务器配置一个字节不动、不跑 nginx/systemctl；
# 暂存句柄留给部署脚本 EXIT trap 里的 remove_nginx_stage 收掉。
reset_case
export FAKE_RSYNC_FAIL_ON=tsz-test-domains.conf
snapshot_server
if install_nginx_configs "$build" 2>/dev/null; then
  fail "N04 failed staging should fail the install"
fi
assert_server_unchanged "N04 staging failure must not touch live configs"
[[ -z "$(nginx_calls)" ]] || fail "N04 must not test or reload before staging completes"
[[ -n "$DEPLOY_NGINX_STAGE" ]] || fail "N04 stage handle must survive for the trap"
remove_nginx_stage || fail "N04 trap cleanup should remove the stage"
assert_no_stage_left "N04 stage left behind after trap cleanup"

# N05 暂存句柄不是换装函数建出来的路径时，兜底清理拒绝 rm -rf，连 ssh 都不发。
reset_case
mkdir -p "$test_dir/victim"
for bad_stage in "$test_dir/victim" "$server/nginx/.tsz-deploy-nginx.a'b;cd"; do
  DEPLOY_NGINX_STAGE="$bad_stage"
  if remove_nginx_stage 2>/dev/null; then
    fail "N05 unexpected stage path should be refused: $bad_stage"
  fi
done
[[ -d "$test_dir/victim" ]] || fail "N05 unexpected stage path must not be removed"
[[ -z "$(grep '^ssh ' "$FAKE_CALLS" || true)" ]] || fail "N05 refused cleanup must not reach the server"

# N06 事务进行中暂存目录（含备份）被删：回滚绝不能因为「备份不在」就把线上配置删掉，
# 也不能谎报「已恢复」。
reset_case
printf 'BROKEN\n' >"$build/deploy/nginx/tshb-test-domains.conf"
export FAKE_NGINX_WIPE_STAGE=1
if install_nginx_configs "$build" 2>"$test_dir/stderr"; then
  fail "N06 invalid config should fail the install"
fi
[[ -f "$DEPLOY_NGINX_CONF_DIR/tsz.conf" && -f "$DEPLOY_NGINX_CONF_DIR/tsz-test-domains.conf" ]] ||
  fail "N06 live configs must never be deleted when backups are missing"
grep -qF '恢复原配置失败' "$test_dir/stderr" || fail "N06 should report the failed restore"
if grep -qF '已恢复原配置' "$test_dir/stderr"; then
  fail "N06 must not claim the configs were restored"
fi
[[ "$(nginx_calls)" = "nginx -t" ]] || fail "N06 should never reload"

# N07 nginx -t 通过但 reload 失败：非零退出，部署脚本随之停下。
reset_case
export FAKE_SYSTEMCTL_FAIL=1
if install_nginx_configs "$build" 2>/dev/null; then
  fail "N07 reload failure should fail the install"
fi
[[ "$(nginx_calls)" = $'nginx -t\nsystemctl reload nginx' ]] || fail "N07 should test, then try to reload"

printf 'deploy-nginx tests: PASS\n'
