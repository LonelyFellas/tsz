#!/usr/bin/env bash
# admin 前端部署到 tshb-test：从 origin/main 导出干净源码到临时目录构建 -> rsync 静态产物
# -> 同步 nginx 配置并 reload。
# 前置：ssh 别名 tshb-test 可用（root）；服务器已装 nginx（首次搭建见 nginx/tshb-test.conf 头注）。
# 用法：deploy/deploy-admin.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh

prepare_deploy_source admin

deploy_tmp="$(mktemp -d /tmp/tsz-admin-deploy.XXXXXX)"
remote_candidate=""
deploy_interrupted=""
cleanup() {
  local status="${deploy_interrupted:-$?}"
  if [[ -n "$remote_candidate" ]]; then
    ssh tshb-test "rm -f -- '$remote_candidate'" >/dev/null 2>&1 || status=1
  fi
  remove_deploy_build_tree || status=1
  case "$deploy_tmp" in
    /tmp/tsz-admin-deploy.*) rm -rf -- "$deploy_tmp" ;;
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
prepare_deploy_build_tree admin

echo "==> build @tsz/admin"
# tshb-test 的智能词库与词性目录/配置均使用 tsz-rust 真实接口。
# 保留 test mode 供其他尚未接入的独立 mock 能力使用；words mock 显式关闭。
(
  cd "$DEPLOY_BUILD_ROOT"
  run_sanitized_build \
    VITE_VOICE_EDITOR=true \
    VITE_VOICE_PREVIEW=true \
    VITE_ADMIN_TTS_MOCK=false \
    VITE_ADMIN_WORDS_MOCK=false \
    VITE_ADMIN_PART_OF_SPEECH_MOCK=false \
    pnpm --filter @tsz/admin build --mode test
)

candidate_manifest="$deploy_tmp/admin.json"
# 送上服务器的东西一律取自构建树（= 目标 commit），不取自工作区。
node "$DEPLOY_BUILD_ROOT/deploy/provenance.mjs" create-candidate \
  --component admin \
  --repository "$DEPLOY_REPOSITORY" \
  --git-sha "$DEPLOY_GIT_SHA" \
  --git-tree "$DEPLOY_GIT_TREE" \
  --ci-run-id "$DEPLOY_CI_RUN_ID" \
  --ci-run-url "$DEPLOY_CI_RUN_URL" \
  --artifact-root "$DEPLOY_BUILD_ROOT/apps/admin/dist" \
  --artifact-path /opt/tsz-admin/dist \
  --output "$candidate_manifest"
# provenance.mjs 静默跳过 CLI 时会退出 0（见 deploy-source.sh 里构建目录前缀的注释）：
# 在往服务器写任何东西之前先确认候选 manifest 真的生成了。
[ -s "$candidate_manifest" ] || { echo "!! 候选 manifest 未生成"; exit 1; }

echo "==> recheck exact main before server writes"
recheck_deploy_source admin
ssh tshb-test 'install -d -m 0755 /opt/tsz-deploy-manifests /opt/tsz-deploy-tools'
remote_candidate="$(ssh tshb-test "mktemp '/opt/tsz-deploy-manifests/.admin.${DEPLOY_GIT_SHA}.XXXXXX.partial'")"
rsync -az "$DEPLOY_BUILD_ROOT/deploy/provenance.mjs" tshb-test:/opt/tsz-deploy-tools/frontend-provenance.mjs

echo "==> rsync dist -> tshb-test:/opt/tsz-admin/dist"
# --delete 仅限 dist 目录：产物文件名带内容 hash，清掉旧版本避免无限堆积。
rsync -az --delete "$DEPLOY_BUILD_ROOT/apps/admin/dist/" tshb-test:/opt/tsz-admin/dist/
rsync -az "$candidate_manifest" "tshb-test:$remote_candidate"
ssh tshb-test "/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify-candidate --manifest '$remote_candidate' --artifact-root /opt/tsz-admin/dist"

echo "==> sync nginx conf + reload"
rsync -az "$DEPLOY_BUILD_ROOT/deploy/nginx/tshb-test.conf" tshb-test:/etc/nginx/conf.d/tsz.conf
ssh tshb-test 'nginx -t && systemctl reload nginx'

echo "==> smoke"
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "GET  /        -> %{http_code}\n" http://127.0.0.1:8081/'
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "GET  /login   -> %{http_code}\n" http://127.0.0.1:8081/login'
code=$(ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile')
echo "GET  /api/v1/admin/profile -> ${code} (无 token，预期 401)"
[ "$code" = "401" ] || { echo "!! API 反代异常"; exit 1; }

echo "==> accept and verify admin provenance manifest"
ssh tshb-test "/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs accept --manifest '$remote_candidate' --artifact-root /opt/tsz-admin/dist --output /opt/tsz-deploy-manifests/admin.json"
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-admin/dist'
echo "✓ done"
