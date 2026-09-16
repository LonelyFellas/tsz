# 前端部署验收

先复用部署脚本已输出的同状态结果，以下命令只用于缺项、状态变化或结果不明时补查。按请求的组件执行。期望 web/admin 页面（含两个 HTTPS 域名）为 200、未登录 API 为 401、当前 tsz-web 实例 active、nginx 配置有效：

```bash
curl -fsS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/
curl -sS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me
ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" --resolve test.tianshengzhi.com:443:127.0.0.1 https://test.tianshengzhi.com/'
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/'
ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile'
ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" --resolve admin-test.tianshengzhi.com:443:127.0.0.1 https://admin-test.tianshengzhi.com/login'
ssh tshb-test 'if test -f /opt/tsz-releases/web/port; then deploy_port=$(cat /opt/tsz-releases/web/port); systemctl is-active "tsz-web@${deploy_port}.service"; else systemctl is-active tsz-web; fi && nginx -t'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-releases/web/current'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-releases/admin/current'
```

本次部署组件对应的 verify 必须实际复算制品，输出与相应目标一致的 git_sha、CI run、artifact_sha256/file_count 与 accepted_at；只读 JSON 不足以验收。
HTTPS 域名在服务器本机用 `--resolve` 指到 127.0.0.1 验证（保留 SNI 与证书校验）；本机经代理 fake-ip 直连的结果不作数。
web 目录为 /opt/tsz-releases/web/current，admin 为 /opt/tsz-releases/admin/current；nginx 80/8081 与两个 HTTPS 域名的 /api/v1/ 均代理 127.0.0.1:8383。

新 web 实例在备用端口通过检查后才切流；版本探测等待 Nginx 新 worker 接管。超时、manifest 不符或 API 404/5xx 均算失败并执行回滚。
nginx -t 未通过时脚本已恢复原配置、未 reload 并非零退出：报告写明 nginx 配置未更新，不手工覆盖或强制 reload；若输出「恢复原配置失败」，报告写明 conf.d 配置状态未知，先只读核对 nginx -t 与剩余备份，不 restart nginx。
远端曾被写入但验收失败时，说明制品、服务和来源记录各处于什么状态；禁止手工伪造 manifest；只在回滚成功且实际入口、上游、manifest 均恢复后报告自动回退。
