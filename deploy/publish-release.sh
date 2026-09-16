#!/usr/bin/env bash
# 在服务器执行完整发布事务。上传目录在锁外准备；在线状态只在同一 flock 内更改。
set -euo pipefail
stage="$1"
component="$2"
[[ "$component" = admin || "$component" = web ]]
exec 9>/opt/tsz-frontend-deploy.lock
flock -n 9 || { echo '已有前端发布正在运行，请稍后重试' >&2; exit 1; }
cd "$stage"
node_bin=/usr/bin/node
root="/opt/tsz-releases/$component"
id="$(cat release-id)"
[[ "$id" =~ ^[a-zA-Z0-9-]+$ ]]
release="$root/releases/$id"
manifest="/opt/tsz-deploy-manifests/$component.json"
mkdir -p /opt/tsz-deploy-manifests
# 上次发布若被 SIGKILL/断电打断，保留现场，禁止下一次发布掩盖它。
[[ ! -e /opt/tsz-frontend-transaction ]] || { echo '存在未完成发布，请先按事务记录恢复' >&2; exit 1; }
"$node_bin" releases.mjs bootstrap /opt/tsz-releases/admin /opt/tsz-admin/dist admin
"$node_bin" releases.mjs bootstrap /opt/tsz-releases/web /opt/tsz-web web
"$node_bin" provenance.mjs verify-candidate --manifest candidate.json --artifact-root artifact
mkdir -p "$root/releases" backup
[[ ! -e "$release" ]]
old="$(readlink "$root/current")"
if [[ -f "$manifest" ]]; then
  "$node_bin" provenance.mjs verify --manifest "$manifest" --artifact-root "$old"
fi
cp -a /etc/nginx/conf.d/tsz.conf backup/tsz.conf
cp -a /etc/nginx/conf.d/tsz-test-domains.conf backup/tsz-test-domains.conf
# 现有裸 IP 的禅道入口也转发 web；只迁移其前端上游，保留禅道配置。
if [[ -f /etc/nginx/conf.d/zentao-ip.conf ]]; then
  cp -a /etc/nginx/conf.d/zentao-ip.conf backup/zentao-ip.conf
fi
[[ ! -f "$manifest" ]] || cp -a "$manifest" backup/manifest.json
had_upstream=false
if [[ -e /etc/nginx/tsz-web-upstream.inc ]]; then
  cp -a /etc/nginx/tsz-web-upstream.inc backup/upstream
  had_upstream=true
fi
[[ ! -f "$root/previous" ]] || cp "$root/previous" backup/previous
[[ ! -f /opt/tsz-releases/web/port ]] || cp /opt/tsz-releases/web/port backup/port
old_port="$(cat /opt/tsz-releases/web/port 2>/dev/null || echo 3000)"
new_port=3100
[[ "$old_port" != 3100 ]] || new_port=3101
started=false
accepted=false
rollback() {
  local code=$?
  trap - EXIT INT TERM
  if [[ "$accepted" = true ]]; then exit "$code"; fi
  local failed=0
  "$node_bin" releases.mjs point "$root" "$old" || failed=1
  cp -a backup/tsz.conf /etc/nginx/conf.d/tsz.conf || failed=1
  cp -a backup/tsz-test-domains.conf /etc/nginx/conf.d/tsz-test-domains.conf || failed=1
  if [[ -f backup/zentao-ip.conf ]]; then cp -a backup/zentao-ip.conf /etc/nginx/conf.d/zentao-ip.conf || failed=1; fi
  if [[ "$had_upstream" = true ]]; then cp -a backup/upstream /etc/nginx/tsz-web-upstream.inc || failed=1
  else rm -f /etc/nginx/tsz-web-upstream.inc || failed=1; fi
  if [[ -f backup/manifest.json ]]; then cp -a backup/manifest.json "$manifest" || failed=1
  else rm -f "$manifest" || failed=1; fi
  if [[ -f backup/previous ]]; then cp backup/previous "$root/previous" || failed=1
  else rm -f "$root/previous" || failed=1; fi
  if [[ -f backup/port ]]; then cp backup/port /opt/tsz-releases/web/port || failed=1
  else rm -f /opt/tsz-releases/web/port || failed=1; fi
  nginx -t && systemctl reload nginx || failed=1
  if [[ "$started" = true ]]; then systemctl disable --now "tsz-web@$new_port.service" || failed=1; fi
  if [[ "$failed" = 0 ]]; then rm -f /opt/tsz-frontend-transaction
  else echo "回滚失败，保留事务及备份：$stage" >&2; fi
  exit 1
}
printf '%s\n%s\n%s\n' "$stage" "$component" "$old" > /opt/tsz-frontend-transaction
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# 按退役时间保留，而不是构建文件的 mtime。
"$node_bin" releases.mjs archive "$root" "$old" "$component" "$(basename "$old")"
"$node_bin" releases.mjs archive "$root" artifact "$component" "$id"
mv artifact "$release"
if [[ "$component" = web ]]; then
  mkdir -p "$root/slots"
  cp systemd/tsz-web@.service /etc/systemd/system/tsz-web@.service
  systemctl daemon-reload
  ln -sfn "$release" "$root/slots/$new_port"
  started=true
  systemctl enable --now "tsz-web@$new_port.service"
  ready=false
  for attempt in {1..15}; do
    if curl -fsS -m 2 "http://127.0.0.1:$new_port/" -o /dev/null; then ready=true; break; fi
    sleep 1
  done
  [[ "$ready" = true ]]
fi
# 初次迁移时保留旧 web 上游，admin 部署不改变 web 运行版本。
if [[ "$component" = web ]]; then target_port="$new_port"; else target_port="$old_port"; fi
printf 'proxy_pass http://127.0.0.1:%s;\n' "$target_port" > /etc/nginx/tsz-web-upstream.inc.partial
mv /etc/nginx/tsz-web-upstream.inc.partial /etc/nginx/tsz-web-upstream.inc
if [[ -f backup/zentao-ip.conf ]]; then
  sed 's@proxy_pass http://127.0.0.1:3000;@include /etc/nginx/tsz-web-upstream.inc;@g' backup/zentao-ip.conf > /etc/nginx/conf.d/zentao-ip.conf.partial
  mv /etc/nginx/conf.d/zentao-ip.conf.partial /etc/nginx/conf.d/zentao-ip.conf
fi
"$node_bin" releases.mjs point "$root" "$release"
nginx_stage="$(mktemp -d /etc/nginx/.tsz-deploy-nginx.XXXXXX)"
cp nginx/tshb-test.conf "$nginx_stage/tsz.conf"
cp nginx/tshb-test-domains.conf "$nginx_stage/tsz-test-domains.conf"
bash install-nginx-local.sh "$nginx_stage" /etc/nginx/conf.d tsz.conf tsz-test-domains.conf
if [[ "$component" = admin ]]; then host=admin-test.tianshengzhi.com; api_path=admin/profile
else host=test.tianshengzhi.com; api_path=auth/me; fi
# reload 返回时旧 worker 可能仍在处理连接；以新版本探测成功为准。
ready=false
for attempt in {1..10}; do
  if curl -fsS -m 3 --resolve "$host:443:127.0.0.1" "https://$host/version.json" > served-version.json &&
    "$node_bin" --input-type=module -e 'import fs from "node:fs"; if (JSON.parse(fs.readFileSync("served-version.json")).release_id !== process.argv[1]) process.exit(1)' "$id"; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" = true ]]
curl -fsS -m 8 --resolve "$host:443:127.0.0.1" "https://$host/" -o /dev/null
code="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' --resolve "$host:443:127.0.0.1" "https://$host/api/v1/$api_path")"
[[ "$code" = 401 ]]
if [[ "$component" = admin ]]; then
  curl -fsS -m 8 http://127.0.0.1:8081/login -o /dev/null
  code="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/v1/admin/profile)"
  [[ "$code" = 401 ]]
else
  curl -fsS -m 8 http://127.0.0.1/ -o /dev/null
fi
"$node_bin" provenance.mjs accept --manifest candidate.json --artifact-root "$release" --output "$manifest"
"$node_bin" provenance.mjs verify --manifest "$manifest" --artifact-root "$release"
printf '%s\n' "$(basename "$old")" > "$root/previous"
if [[ "$component" = web ]]; then printf '%s\n' "$new_port" > "$root/port"; fi
mkdir -p /opt/tsz-deploy-tools
cp provenance.mjs /opt/tsz-deploy-tools/frontend-provenance.mjs.partial
mv /opt/tsz-deploy-tools/frontend-provenance.mjs.partial /opt/tsz-deploy-tools/frontend-provenance.mjs
mkdir -p "$root/manifests"
cp "$manifest" "$root/manifests/$id.json"
accepted=true
rm /opt/tsz-frontend-transaction
trap - EXIT INT TERM
# 清理不影响已成功接受的发布；失败返回明确维护告警。
"$node_bin" releases.mjs prune "$root" || echo '历史资源清理失败，当前版本已发布' >&2
if [[ "$component" = web ]]; then
  # 给旧 nginx worker 的在途请求留出排空时间。
  sleep 30
  if [[ "$old_port" = 3000 ]]; then systemctl disable --now tsz-web.service
  else systemctl disable --now "tsz-web@$old_port.service"; fi
fi
echo "发布完成：$component $id"
