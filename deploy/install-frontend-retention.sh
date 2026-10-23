#!/usr/bin/env bash
# 仅在服务器显式执行；输入必须是已合入 main 且精确 CI 成功的部署目录。
set -euo pipefail
cd "$(dirname "$0")"
exec 9>/opt/tsz-frontend-deploy.lock
flock -n 9 || { echo '已有前端发布或清理正在运行，未安装' >&2; exit 1; }
[[ ! -e /opt/tsz-frontend-transaction && ! -L /opt/tsz-frontend-transaction ]] || {
  echo '存在未完成发布，未安装' >&2; exit 1;
}
/usr/bin/node --check frontend-retention.mjs
/usr/bin/node --check releases.mjs
bash -n prune-frontend.sh
systemd-analyze verify systemd/tsz-frontend-retention.service systemd/tsz-frontend-retention.timer

root=/opt/tsz-deploy-tools/frontend-retention
unit_dir=/etc/systemd/system
timer=tsz-frontend-retention.timer
units=(tsz-frontend-retention.service "$timer")
[[ ! -L "$root" && ( ! -e "$root" || -d "$root" ) ]] || { echo '异常工具目录，未安装' >&2; exit 1; }
for leftover in /opt/tsz-deploy-tools/.frontend-retention.*; do
  [[ ! -e "$leftover" && ! -L "$leftover" ]] || { printf '存在未完成安装备份：%s\n' "$leftover" >&2; exit 1; }
done
for unit in "${units[@]}"; do
  [[ ! -L "$unit_dir/$unit" && ( ! -e "$unit_dir/$unit" || -f "$unit_dir/$unit" ) ]] || {
    printf '异常或被屏蔽的单元：%s\n' "$unit" >&2; exit 1;
  }
done
# 在替换任何已安装文件前完整预检；只做规划，不清理。
/usr/bin/node --input-type=module - "$PWD/releases.mjs" <<'NODE'
import { pathToFileURL } from 'node:url';
const { planPrune } = await import(pathToFileURL(process.argv[2]));
for (const component of ['web', 'admin']) await planPrune(`/opt/tsz-releases/${component}`);
NODE

mkdir -p /opt/tsz-deploy-tools
stage=$(mktemp -d /opt/tsz-deploy-tools/.frontend-retention.XXXXXX)
changed=false
had_tools=false
was_enabled=false
was_active=false
systemctl is-enabled --quiet "$timer" && was_enabled=true
systemctl is-active --quiet "$timer" && was_active=true
cleanup() {
  local status=$? failed=0
  trap - EXIT INT TERM
  if [[ "$status" != 0 && "$changed" = true ]]; then
    systemctl stop "$timer" || failed=1
    rm -rf -- "$root" || failed=1
    if [[ "$had_tools" = true ]]; then mv "$stage/previous-tools" "$root" || failed=1; fi
    for unit in "${units[@]}"; do
      if [[ -e "$stage/$unit" || -L "$stage/$unit" ]]; then
        cp -a "$stage/$unit" "$unit_dir/$unit" || failed=1
      else
        rm -f "$unit_dir/$unit" || failed=1
      fi
    done
    if [[ "$was_enabled" = true ]]; then systemctl enable "$timer" || failed=1
    else systemctl disable "$timer" || failed=1; fi
    systemctl daemon-reload || failed=1
    if [[ "$was_active" = true ]]; then systemctl start "$timer" || failed=1; fi
  fi
  if [[ "$failed" = 0 ]]; then rm -rf -- "$stage"
  else printf '恢复失败，保留安装备份：%s\n' "$stage" >&2; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$stage/tools"
for file in releases.mjs frontend-retention.mjs prune-frontend.sh; do
  install -m 644 "$file" "$stage/tools/$file"
done
for unit in "${units[@]}"; do
  if [[ -e "$unit_dir/$unit" || -L "$unit_dir/$unit" ]]; then cp -a "$unit_dir/$unit" "$stage/$unit"; fi
done
if [[ -d "$root" ]]; then
  mv "$root" "$stage/previous-tools"
  had_tools=true
fi
changed=true
mv "$stage/tools" "$root"
for unit in "${units[@]}"; do
  install -m 644 "systemd/$unit" "$unit_dir/$unit"
done
systemctl daemon-reload
systemctl enable "$timer"
systemctl restart "$timer"
systemctl is-active --quiet "$timer"
printf '前端每日清理已启用；当前持发布锁，不主动执行清理。\n'
