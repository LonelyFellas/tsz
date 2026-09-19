#!/usr/bin/env bash
# admin 前端部署到 tshb-test：从 origin/main 导出干净源码到临时目录构建 -> rsync 静态产物
# -> 同步 nginx 配置并 reload。
# 前置：ssh 别名 tshb-test 可用（root）；服务器已装 nginx（首次搭建见 nginx/tshb-test.conf 头注）。
# 用法：[DEPLOY_EXPECTED_SHA=<当前main完整SHA>] deploy/deploy-admin.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy-source.sh

# 配套后端尚未发布时，允许先发布关闭编辑器入口的兼容前端。
deploy_voice_editor="${DEPLOY_VOICE_EDITOR:-true}"
case "$deploy_voice_editor" in
  true|false) ;;
  *) echo "!! DEPLOY_VOICE_EDITOR 必须为 true 或 false" >&2; exit 1 ;;
esac

# 配套后端已上线，默认启用独立合成输入；兼容发布仍可显式关闭。
deploy_azure_pronunciation_inputs="${DEPLOY_AZURE_PRONUNCIATION_INPUTS:-true}"
case "$deploy_azure_pronunciation_inputs" in
  true|false) ;;
  *) echo "!! DEPLOY_AZURE_PRONUNCIATION_INPUTS 必须为 true 或 false" >&2; exit 1 ;;
esac

# 首次配套发布先显式关闭写入口；新后端验收后再开启。
deploy_form_spelling_regularity="${DEPLOY_FORM_SPELLING_REGULARITY:-true}"
case "$deploy_form_spelling_regularity" in
  true|false) ;;
  *) echo "!! DEPLOY_FORM_SPELLING_REGULARITY 必须为 true 或 false" >&2; exit 1 ;;
esac

prepare_deploy_source admin
release_id="${DEPLOY_GIT_SHA}-$(node -e 'console.log(require("crypto").randomUUID())')"

deploy_tmp="$(mktemp -d /tmp/tsz-admin-deploy.XXXXXX)"
deploy_interrupted=""
cleanup() {
  local status="${deploy_interrupted:-$?}"
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
    TSZ_RELEASE_ID="$release_id" \
    VITE_FORM_SPELLING_REGULARITY="$deploy_form_spelling_regularity" \
    VITE_VOICE_EDITOR="$deploy_voice_editor" \
    VITE_AZURE_PRONUNCIATION_INPUTS="$deploy_azure_pronunciation_inputs" \
    VITE_VOICE_PREVIEW=true \
    VITE_VOICE_AUDIO_UPLOAD=true \
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
  --artifact-path /opt/tsz-releases/admin/current \
  --output "$candidate_manifest"
# provenance.mjs 静默跳过 CLI 时会退出 0（见 deploy-source.sh 里构建目录前缀的注释）：
# 在往服务器写任何东西之前先确认候选 manifest 真的生成了。
[ -s "$candidate_manifest" ] || { echo "!! 候选 manifest 未生成"; exit 1; }

verify_deploy_candidate admin "$candidate_manifest" "$DEPLOY_BUILD_ROOT/apps/admin/dist"
echo "==> recheck exact main and CI before server writes"
recheck_deploy_source admin
# 独立暂存不触碰在线目录；事务在远端持有发布锁直到验证及回滚结束。
remote_stage="$(ssh tshb-test "mktemp -d /opt/tsz-release-stage.XXXXXX")"
[[ "$remote_stage" =~ ^/opt/tsz-release-stage\.[a-zA-Z0-9]{6}$ ]] || { echo "!! 无效的远端暂存路径" >&2; exit 1; }
rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/apps/admin/dist/" "tshb-test:$remote_stage/artifact/"
rsync -az --no-o --no-g "$candidate_manifest" "tshb-test:$remote_stage/candidate.json"
printf '%s\n' "$release_id" > "$deploy_tmp/release-id"
rsync -az --no-o --no-g "$deploy_tmp/release-id" "tshb-test:$remote_stage/release-id"
for file in releases.mjs provenance.mjs publish-release.sh install-nginx-local.sh; do
  rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/$file" "tshb-test:$remote_stage/$file"
done
rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/nginx/" "tshb-test:$remote_stage/nginx/"
rsync -az --no-o --no-g "$DEPLOY_BUILD_ROOT/deploy/systemd/" "tshb-test:$remote_stage/systemd/"
# 上传期间 main/CI 可能变化；失败保留独立暂存，不启动发布事务。
# GitHub 复核与远端锁/切换不具备跨系统原子性。
recheck_deploy_source admin
# 断连时保留暂存与回滚证据；只在成功结束后清理。
ssh tshb-test "bash '$remote_stage/publish-release.sh' '$remote_stage' admin"
ssh tshb-test "rm -rf -- '$remote_stage'"
echo "✓ done"
