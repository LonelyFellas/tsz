# 前端部署验收

按请求的组件执行。期望 web/admin 页面为 200、未登录 API 为 401、tsz-web active、nginx 配置有效：

```bash
curl -fsS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/
curl -sS -m 8 -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me
ssh tshb-test 'curl -fsS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/'
ssh tshb-test 'curl -sS -m 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile'
ssh tshb-test 'systemctl is-active tsz-web && nginx -t'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-web'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-admin/dist'
```

两份 verify 必须实际复算制品，输出与相应目标一致的 git_sha、CI run、artifact_sha256/file_count 与 accepted_at；只读 JSON 不足以验收。
web 目录为 /opt/tsz-web，admin 为 /opt/tsz-admin/dist；nginx 80/8081 的 /api/v1/ 均代理 127.0.0.1:8383。

web 启动期 502 仅在脚本定义的 30 秒窗口内复查；超时、manifest 不符或 API 404/5xx 均算失败。
远端曾被写入但验收失败时，说明制品、服务和来源记录各处于什么状态；禁止手工伪造 manifest，不声称自动回退已发生。
