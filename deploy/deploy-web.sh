#!/usr/bin/env bash
# C 端 web（Next standalone）部署到 tshb-test：从 origin/main 导出干净源码到临时目录构建
# -> 本地 standalone 验活 -> 上传独立 release -> 备用实例验活并切流。
# 前置：ssh 别名 tshb-test 可用（root）；服务器 /usr/bin/node 与 .node-version 精确一致，
# 且存在可迁移的旧部署；发布事务安装 systemd 模板并保留旧版本。
# 用法：deploy/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh

prepare_deploy_source web
release_id="${DEPLOY_GIT_SHA}-$(node -e 'console.log(require("crypto").randomUUID())')"

deploy_tmp="$(mktemp -d /tmp/tsz-web-deploy.XXXXXX)"
deploy_interrupted=""
cleanup() {
  local status="${deploy_interrupted:-$?}"
  stop_standalone_boot
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
# NEXT_PUBLIC_* 会在构建时内联进产物。测试服默认使用 HTTPS 域名，让 canonical、sitemap 与
# Open Graph URL 既不回退到 localhost、也不指向裸 IP 入口；需要时可在执行脚本时显式覆盖。
TSZ_DEPLOY_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://test.tianshengzhi.com}"
echo "==> canonical site URL: ${TSZ_DEPLOY_SITE_URL}"
(
  cd "$DEPLOY_BUILD_ROOT"
  run_sanitized_build \
    TSZ_RELEASE_ID="$release_id" \
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

node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({release_id: process.argv[2]}))' "$artifact_stage/version.json" "$release_id"
echo "==> boot staged standalone artifact locally"
# 坏产物必须在 rsync --delete 覆盖掉服务器上那份能用的之前被挡下（原因见 deploy-source.sh）。
verify_standalone_boot "$artifact_stage" apps/web/server.js

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
  --artifact-path /opt/tsz-releases/web/current \
  --output "$candidate_manifest"
# provenance.mjs 静默跳过 CLI 时会退出 0（见 deploy-source.sh 里构建目录前缀的注释）：
# 在往服务器写任何东西之前先确认候选 manifest 真的生成了。
[ -s "$candidate_manifest" ] || { echo "!! 候选 manifest 未生成"; exit 1; }

echo "==> recheck exact main before server writes"
recheck_deploy_source web
# 独立暂存不触碰在线目录；事务在远端持有发布锁直到验证及回滚结束。
remote_stage="$(ssh tshb-test "mktemp -d /opt/tsz-release-stage.XXXXXX")"
[[ "$remote_stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]] || { echo "!! 无效的远端暂存路径" >&2; exit 1; }
rsync -az --no-o --no-g "$artifact_stage/" "tshb-test:$remote_stage/artifact/"
rsync -az --no-o --no-g "$candidate_manifest" "tshb-test:$remote_stage/candidate.json"
printf '%s\n' "$release_id" > "$deploy_tmp/release-id"
rsync -az --no-o --no-g "$deploy_tmp/release-id" "tshb-test:$remote_stage/release-id"
for file in releases.mjs provenance.mjs publish-release.sh install-nginx-local.sh; do
  rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/$file" "tshb-test:$remote_stage/$file"
done
rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/nginx/" "tshb-test:$remote_stage/nginx/"
rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/systemd/" "tshb-test:$remote_stage/systemd/"
# 断连时保留暂存与回滚证据；只在成功结束后清理。
ssh tshb-test "bash '$remote_stage/publish-release.sh' '$remote_stage' web"
ssh tshb-test "rm -rf -- '$remote_stage'"
echo "✓ done"
