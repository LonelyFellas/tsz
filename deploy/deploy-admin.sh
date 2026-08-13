#!/usr/bin/env bash
# admin 前端部署到 tshb-test：本地 build -> rsync 静态产物 -> 同步 nginx 配置并 reload。
# 前置：ssh 别名 tshb-test 可用（root）；服务器已装 nginx（首次搭建见 nginx/tshb-test.conf 头注）。
# 用法：deploy/deploy-admin.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> build @tsz/admin"
# tshb-test 的智能词库与词性目录/配置均使用 tsz-rust 真实接口。
# 保留 test mode 供其他尚未接入的独立 mock 能力使用；words mock 显式关闭。
VITE_WORD_CREATION_WIZARD=true \
  VITE_VOICE_EDITOR=true \
  VITE_VOICE_PREVIEW=false \
  VITE_ADMIN_WORDS_MOCK=false \
  VITE_ADMIN_PART_OF_SPEECH_MOCK=false \
  pnpm --filter @tsz/admin build --mode test

echo "==> rsync dist -> tshb-test:/opt/tsz-admin/dist"
# --delete 仅限 dist 目录：产物文件名带内容 hash，清掉旧版本避免无限堆积。
rsync -az --delete apps/admin/dist/ tshb-test:/opt/tsz-admin/dist/

echo "==> sync nginx conf + reload"
rsync -az deploy/nginx/tshb-test.conf tshb-test:/etc/nginx/conf.d/tsz.conf
ssh tshb-test 'nginx -t && systemctl reload nginx'

echo "==> smoke"
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "GET  /        -> %{http_code}\n" http://127.0.0.1:8081/'
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "GET  /login   -> %{http_code}\n" http://127.0.0.1:8081/login'
code=$(ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile')
echo "GET  /api/v1/admin/profile -> ${code} (无 token，预期 401)"
[ "$code" = "401" ] || { echo "!! API 反代异常"; exit 1; }
echo "✓ done"
