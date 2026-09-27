# 前端部署验收

先复用部署脚本已输出的同状态结果，以下命令只用于缺项、状态变化或结果不明时补查。按请求的组件执行。期望 HTTPS 页面为 200、HTTPS 未登录 API 为 401、当前 tsz-web 实例 active、nginx 配置有效：

```bash
ssh tshb-test 'curl --noproxy "*" -fsS -m 8 -o /dev/null -w "%{http_code}" --resolve test.tianshengzhi.com:443:127.0.0.1 https://test.tianshengzhi.com/'
ssh tshb-test 'curl --noproxy "*" -sS -m 8 -o /dev/null -w "%{http_code}" --resolve test.tianshengzhi.com:443:127.0.0.1 https://test.tianshengzhi.com/api/v1/auth/me'
ssh tshb-test 'curl --noproxy "*" -fsS -m 8 -o /dev/null -w "%{http_code}" --resolve admin-test.tianshengzhi.com:443:127.0.0.1 https://admin-test.tianshengzhi.com/login'
ssh tshb-test 'curl --noproxy "*" -sS -m 8 -o /dev/null -w "%{http_code}" --resolve admin-test.tianshengzhi.com:443:127.0.0.1 https://admin-test.tianshengzhi.com/api/v1/admin/profile'
ssh tshb-test 'if test -f /opt/tsz-releases/web/port; then deploy_port=$(cat /opt/tsz-releases/web/port); systemctl is-active "tsz-web@${deploy_port}.service"; else systemctl is-active tsz-web; fi && nginx -t'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-releases/web/current'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-releases/admin/current'
```

本次部署组件对应的 verify 必须实际复算制品，输出与相应目标一致的 git_sha、CI run、artifact_sha256/file_count 与 accepted_at；只读 JSON 不足以验收。
HTTPS 域名在服务器本机用 `--resolve` 指到 127.0.0.1 验证（保留 SNI 与证书校验）；本机经代理 fake-ip 直连的结果不作数。
web 目录为 /opt/tsz-releases/web/current，admin 为 /opt/tsz-releases/admin/current；仅两个 HTTPS 域名的 /api/v1/ 代理 127.0.0.1:8383。域名 HTTP 返回固定域名的 HTTPS 跳转；默认 HTTP 和旧 8081 端口统一 404，不再提供页面或 API（保留 8081 拒绝响应不等于端口已经从安全组关闭）。

## HTTPS-only / Secure Cookie 首次切换门禁

仓库配置不代表服务器已经收口。首次部署前单独确认维护窗口和服务器配置变更授权，保留 nginx、独立 IP 配置和后端环境文件的受控备份，不输出其中的凭据：

1. 核验两个 HTTPS 域名、证书有效期、certbot nginx 续期方式和定时器；保留域名 80 端口供跳转及 HTTP-01 挑战，不盲目关闭所有 80 入口。
2. `/etc/nginx/conf.d/zentao-ip.conf` 不由本次前端发布接管。切换时保留 `/etc/nginx/snippets/zentao.conf` 的 `/zentao` 路由，将其余业务路径改为 `location / { return 404; }`，去除 web/API 明文代理；不要在 server 层直接 return，以免屏蔽禅道。验证禅道原有访问和安装/升级路径限制不变。该前置变更未完成时，新发布冒烟会失败并回滚，不会自动修改禅道配置。
3. 核验 8383、web 实例端口的云安全组与主机入站规则。单次公网连接超时只说明当前探测不可达，不能证明所有来源已封禁；没有规则证据不得宣称端口收口完成。
4. 使用原生发布入口落地 nginx 改动。发布脚本验证 80/8081 的默认 Host 与真实 IP Host 下 `/`、`/login` 和两端未登录 API 均为 404；域名 HTTP `/login` 必须跳转至对应 HTTPS。公网重复验证时禁用本机代理；8081 可由安全组拒绝公网连接，但服务器本机探针仍应为 404。
5. 经单独授权移除 `/opt/tsz-rust/.env` 中的 `COOKIE_SECURE=false`（默认 true），或显式设 true，并按后端运维约定重启服务；普通前端/后端制品发布都不会自动修改该文件。本地纯 HTTP 开发配置不变。
6. 使用指定测试账号在两个 HTTPS 域名分别完成登录 → 页面刷新/会话刷新 → 退出 → 退出后刷新失败；检查下发及清除 refresh cookie 的 Secure、HttpOnly、SameSite、Path，不记录 cookie/token 值。HTTP IP 旧登录态不会迁移至域名，需要重新登录。

切换后补验 health/ready、上述 HTTPS/HTTP 行为和实际 Cookie 属性。只完成前端部署、看到 HTTPS 200 或环境变量 true 均不能宣布整体收口完成；认证验收失败时停止后续发布，按已批准方案恢复配置并复验，不能擅自恢复不安全例外。

新 web 实例在备用端口通过检查后才切流；版本探测等待 Nginx 新 worker 接管。超时、manifest 不符或 API 404/5xx 均算失败并执行回滚。
nginx -t 未通过时脚本已恢复原配置、未 reload 并非零退出：报告写明 nginx 配置未更新，不手工覆盖或强制 reload；若输出「恢复原配置失败」，报告写明 conf.d 配置状态未知，先只读核对 nginx -t 与剩余备份，不 restart nginx。
远端曾被写入但验收失败时，说明制品、服务和来源记录各处于什么状态；禁止手工伪造 manifest；只在回滚成功且实际入口、上游、manifest 均恢复后报告自动回退。
