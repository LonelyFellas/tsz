#!/usr/bin/env bash
# admin 前端部署到 tshb-test：本地 build -> rsync 静态产物 -> 同步 nginx 配置并 reload。
# 前置：ssh 别名 tshb-test 可用（root）；服务器已装 nginx（首次搭建见 nginx/tshb-test.conf 头注）。
# 用法：deploy/deploy-admin.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> build @tsz/admin"
pnpm --filter @tsz/admin build

echo "==> rsync dist -> tshb-test:/opt/tsz-admin/dist"
# --delete 仅限 dist 目录：产物文件名带内容 hash，清掉旧版本避免无限堆积。
rsync -az --delete apps/admin/dist/ tshb-test:/opt/tsz-admin/dist/

echo "==> sync nginx conf + reload"
rsync -az deploy/nginx/tshb-test.conf tshb-test:/etc/nginx/conf.d/tsz.conf
ssh tshb-test 'nginx -t && systemctl reload nginx'

echo "==> smoke"
curl -sS -m 8 -o /dev/null -w "GET  /        -> %{http_code}\n" http://47.121.142.19/
curl -sS -m 8 -o /dev/null -w "GET  /login   -> %{http_code}\n" http://47.121.142.19/login
code=$(curl -sS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/admin/profile)
echo "GET  /api/v1/admin/profile -> ${code} (无 token，预期 401)"
[ "$code" = "401" ] || { echo "!! API 反代异常"; exit 1; }
echo "✓ done"
