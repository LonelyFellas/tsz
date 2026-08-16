#!/usr/bin/env bash
# C 端 web（Next standalone）部署到 tshb-test：本地 build -> rsync 三件套 -> 重启服务。
# 前置：ssh 别名 tshb-test 可用（root）；服务器 /usr/bin/node 与 .node-version 精确一致，
# 且已安装 systemd unit tsz-web
# （首次搭建：deploy/systemd/tsz-web.service -> /etc/systemd/system/ 后 daemon-reload enable）。
# 用法：deploy/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."

required_node_version="v$(tr -d '[:space:]' < .node-version)"
local_node_version="$(node --version)"
[ "$local_node_version" = "$required_node_version" ] || {
  echo "!! 本地 Node 版本必须是 ${required_node_version}，当前是 ${local_node_version}"
  exit 1
}
server_node_version="$(ssh tshb-test '/usr/bin/node --version')"
[ "$server_node_version" = "$required_node_version" ] || {
  echo "!! tshb-test /usr/bin/node 必须是 ${required_node_version}，当前是 ${server_node_version}"
  exit 1
}

echo "==> build @tsz/web (standalone)"
# NEXT_PUBLIC_* 会在构建时内联进产物。测试服默认使用公网 IP，避免 canonical、
# sitemap 与 Open Graph URL 回退到 localhost；域名启用后可在执行脚本时显式覆盖。
TSZ_DEPLOY_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://47.121.142.19}"
echo "==> canonical site URL: ${TSZ_DEPLOY_SITE_URL}"
NEXT_PUBLIC_SITE_URL="$TSZ_DEPLOY_SITE_URL" pnpm --filter @tsz/web build

echo "==> rsync standalone + static -> tshb-test:/opt/tsz-web"
# standalone 不含 .next/static（Next 约定交给 CDN/自行拷贝），须单独同步到产物内的对应路径。
rsync -az --delete apps/web/.next/standalone/ tshb-test:/opt/tsz-web/
rsync -az --delete apps/web/.next/static/ tshb-test:/opt/tsz-web/apps/web/.next/static/

echo "==> restart tsz-web + sync nginx"
rsync -az deploy/systemd/tsz-web.service tshb-test:/etc/systemd/system/tsz-web.service
rsync -az deploy/nginx/tshb-test.conf tshb-test:/etc/nginx/conf.d/tsz.conf
ssh tshb-test 'systemctl daemon-reload && systemctl restart tsz-web && nginx -t && systemctl reload nginx'

echo "==> smoke"
curl -sS -m 8 -o /dev/null -w "GET / -> %{http_code}\n" http://47.121.142.19/
code=$(curl -sS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me)
echo "GET /api/v1/auth/me -> ${code} (无 token，预期 401)"
[ "$code" = "401" ] || { echo "!! API 反代异常"; exit 1; }
ssh tshb-test 'systemctl is-active tsz-web' >/dev/null || { echo "!! tsz-web 未运行"; exit 1; }
echo "✓ done"
