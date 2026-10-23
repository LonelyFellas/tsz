#!/usr/bin/env bash
set -euo pipefail
exec 9>/opt/tsz-frontend-deploy.lock
# 只有锁竞争算正常跳过，权限/IO 错误仍须让 systemd 报失败。
if flock -n -E 75 9; then
  cd "$(dirname "$0")"
  exec /usr/bin/node frontend-retention.mjs
else
  status=$?
  if [[ "$status" = 75 ]]; then
    printf '已有前端发布或清理正在运行，本次跳过\n'
    exit 0
  fi
  exit "$status"
fi
