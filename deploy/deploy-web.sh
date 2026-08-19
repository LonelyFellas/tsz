#!/usr/bin/env bash
# C 端 web（Next standalone）部署到 tshb-test：从 origin/main 导出干净源码到临时目录构建
# -> rsync 三件套 -> 重启服务。
# 前置：ssh 别名 tshb-test 可用（root）；服务器 /usr/bin/node 与 .node-version 精确一致，
# 且已安装 systemd unit tsz-web
# （首次搭建：deploy/systemd/tsz-web.service -> /etc/systemd/system/ 后 daemon-reload enable）。
# 用法：deploy/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh

prepare_deploy_source web

deploy_tmp="$(mktemp -d /tmp/tsz-web-deploy.XXXXXX)"
remote_candidate=""
deploy_interrupted=""
cleanup() {
  local status="${deploy_interrupted:-$?}"
  if [[ -n "$remote_candidate" ]]; then
    ssh tshb-test "rm -f -- '$remote_candidate'" >/dev/null 2>&1 || status=1
  fi
  remove_deploy_build_tree || status=1
  case "$deploy_tmp" in
    /tmp/tsz-web-deploy.*) rm -rf -- "$deploy_tmp" ;;
    *) printf '!! refusing to clean unexpected deploy temp path: %s\n' "$deploy_tmp" >&2; status=1 ;;
  esac
  exit "$status"
}
trap cleanup EXIT
# bash 被 SIGINT/SIGTERM 打断时不会执行 EXIT trap（实测临时目录会直接留下）：
# 转成一次正常 exit，让 cleanup 照常跑，同时保住非零退出码。
trap 'deploy_interrupted=130; exit 130' INT
trap 'deploy_interrupted=143; exit 143' TERM

# 版本要求也读目标 commit 的：工作区可能停在别的分支上，那里的 .node-version 不作数。
required_node_version="v$(git show "$DEPLOY_GIT_SHA:.node-version" | tr -d '[:space:]')"
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

echo "==> prepare clean build tree from the target commit"
prepare_deploy_build_tree web

echo "==> build @tsz/web (standalone)"
# NEXT_PUBLIC_* 会在构建时内联进产物。测试服默认使用公网 IP，避免 canonical、
# sitemap 与 Open Graph URL 回退到 localhost；域名启用后可在执行脚本时显式覆盖。
TSZ_DEPLOY_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://47.121.142.19}"
echo "==> canonical site URL: ${TSZ_DEPLOY_SITE_URL}"
(
  cd "$DEPLOY_BUILD_ROOT"
  run_sanitized_build \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL="$TSZ_DEPLOY_SITE_URL" \
    pnpm --filter @tsz/web build
)

echo "==> stage standalone + static and create provenance candidate"
# standalone 不含 .next/static（Next 约定交给 CDN/自行拷贝），先合并成与远端完全一致的目录形状。
artifact_stage="$deploy_tmp/artifact"
mkdir -p "$artifact_stage/apps/web/.next/static"
rsync -a "$DEPLOY_BUILD_ROOT/apps/web/.next/standalone/" "$artifact_stage/"
rsync -a "$DEPLOY_BUILD_ROOT/apps/web/.next/static/" "$artifact_stage/apps/web/.next/static/"
candidate_manifest="$deploy_tmp/web.json"
# 送上服务器的东西一律取自构建树（= 目标 commit），不取自工作区。
node "$DEPLOY_BUILD_ROOT/deploy/provenance.mjs" create-candidate \
  --component web \
  --repository "$DEPLOY_REPOSITORY" \
  --git-sha "$DEPLOY_GIT_SHA" \
  --git-tree "$DEPLOY_GIT_TREE" \
  --ci-run-id "$DEPLOY_CI_RUN_ID" \
  --ci-run-url "$DEPLOY_CI_RUN_URL" \
  --artifact-root "$artifact_stage" \
  --artifact-path /opt/tsz-web \
  --output "$candidate_manifest"
# provenance.mjs 静默跳过 CLI 时会退出 0（见 deploy-source.sh 里构建目录前缀的注释）：
# 在往服务器写任何东西之前先确认候选 manifest 真的生成了。
[ -s "$candidate_manifest" ] || { echo "!! 候选 manifest 未生成"; exit 1; }

echo "==> recheck exact main before server writes"
recheck_deploy_source web
ssh tshb-test 'install -d -m 0755 /opt/tsz-deploy-manifests /opt/tsz-deploy-tools'
remote_candidate="$(ssh tshb-test "mktemp '/opt/tsz-deploy-manifests/.web.${DEPLOY_GIT_SHA}.XXXXXX.partial'")"
rsync -az "$DEPLOY_BUILD_ROOT/deploy/provenance.mjs" tshb-test:/opt/tsz-deploy-tools/frontend-provenance.mjs

echo "==> rsync staged artifact -> tshb-test:/opt/tsz-web"
rsync -az --delete "$artifact_stage/" tshb-test:/opt/tsz-web/
rsync -az "$candidate_manifest" "tshb-test:$remote_candidate"
ssh tshb-test "/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify-candidate --manifest '$remote_candidate' --artifact-root /opt/tsz-web"

echo "==> restart tsz-web + sync nginx"
rsync -az "$DEPLOY_BUILD_ROOT/deploy/systemd/tsz-web.service" tshb-test:/etc/systemd/system/tsz-web.service
rsync -az "$DEPLOY_BUILD_ROOT/deploy/nginx/tshb-test.conf" tshb-test:/etc/nginx/conf.d/tsz.conf
ssh tshb-test 'systemctl daemon-reload && systemctl restart tsz-web && nginx -t && systemctl reload nginx'

echo "==> smoke"
wait_for_http_status "GET /" "http://47.121.142.19/" 200 7 5 || {
  echo "!! web 页面在 30 秒启动窗口内未恢复"
  exit 1
}
code=$(curl -sS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me)
echo "GET /api/v1/auth/me -> ${code} (无 token，预期 401)"
[ "$code" = "401" ] || { echo "!! API 反代异常"; exit 1; }
ssh tshb-test 'systemctl is-active tsz-web' >/dev/null || { echo "!! tsz-web 未运行"; exit 1; }

echo "==> accept and verify web provenance manifest"
ssh tshb-test "/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs accept --manifest '$remote_candidate' --artifact-root /opt/tsz-web --output /opt/tsz-deploy-manifests/web.json"
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-web'
echo "✓ done"
