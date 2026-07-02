---
name: deploy
description: 把已合入 main 的前端(web+admin+nginx)部署到 tshb-test 测试服务器。先查 GitHub main 的 CI(在跑/未过立即停下告知,全绿才继续)，再同步 Gitee main(服务器只拉 Gitee)，SSH 执行服务器上的 deploy.sh，最后验证站点存活。当用户说「部署」「deploy」「发测试环境」「上服务器」等时触发。
---

# deploy —— 前端部署到 tshb-test 测试服务器

把 `main` 上的最新前端代码（web + admin + nginx）滚动部署到测试服务器。
**只部署前端**：后端（`/opt/tshb-go`，tshb-go 仓库）独立部署，本 skill 绝不触碰。

## 拓扑事实（先记住再动手）

- 服务器：`tshb-test`（47.121.142.19），SSH 别名已配在 `~/.ssh/config`，直接 `ssh tshb-test`。
- 前端仓库在服务器上的位置：`/opt/tshb-react`，**origin 指向 Gitee**
  （`git@gitee.com:tshb_1/tshb-react.git`），不是 GitHub——服务器在国内，拉 Gitee 快。
- 本地仓库的 `origin` 是**双 push URL**（GitHub + Gitee 镜像）：`git push origin main`
  会同时推两边；但 **GitHub 上合并 PR 只更新 GitHub，Gitee 不会自动同步**。
- 部署脚本：仓库根的 [deploy.sh](../../../deploy.sh)（服务器上执行）。它做四件事：
  `git pull --ff-only` → `docker compose -f docker-compose.prod.yml up -d --build`
  → **restart nginx**（重建的 web/admin 容器换了 IP，nginx 静态 `proxy_pass` 缓存旧 IP
  会 502，重启让它重新解析）→ 健康检查 `http://localhost/`（120s 超时，超时自动打印日志）。
- 外层 nginx 按 **Host 头分流两个虚拟主机**（见 deploy/nginx/conf.d/tsz.conf）：
  `www.tianshengzhi.com`（默认 server，裸 IP 也落这）→ web:3000；
  `admin.tianshengzhi.com` → admin:3001；`/api/v1/` 与 `/docs` 两个 vhost 都代理到后端 :8080。
  **没有 `/admin` 路径**，admin 只认子域名 Host。
- **域名未 ICP 备案期间**，公网带域名 Host 的请求会被阿里云拦成 403（不进 nginx 日志）——
  这不是部署故障；验证 admin 要在服务器本机打（见第 5 步）。

## 流程

### 1. 确认要部署的内容已在 main
- `git fetch origin && git log -1 --oneline origin/main` 看 GitHub main 的目标提交。
- 若用户想部署的改动还没合入 main → 停下说明，先走 /ship 流程合并，不要部署半成品分支。

### 2. CI 门禁（GitHub main 的 CI 全绿才继续）
对 origin/main 的 HEAD 提交查 GitHub checks 状态：
```bash
gh api repos/{owner}/{repo}/commits/$(git rev-parse origin/main)/check-runs \
  --jq '.check_runs[] | "\(.name): \(.status) \(.conclusion // "-")"'
```
按结果三分支处理（**只有第一种才继续往下走**）：
- **全部 `completed` 且 conclusion 均为 `success`/`skipped`/`neutral`** → 继续第 3 步
  （merge 提交上 commitlint 常为 `skipped`，属正常，不要误拦）。
- **有 check 还在 `queued`/`in_progress`（正在跑）** → **立即停下告知用户**：CI 还没跑完，
  等跑完再来部署。不要自作主张挂起等待后偷偷继续。
- **有 conclusion 为 `failure`/`cancelled`/`timed_out`（没过）** → **立即停下告知用户**：
  main 的 CI 没过，附上失败的 check 名与链接（`gh run list --commit <sha>`），等修复后重来。
- 若该提交没有任何 check（如纯文档提交未触发 workflow）→ 说明情况后可继续，由用户判断。

### 3. 同步 Gitee main（关键前置，跳过必 502 于「拉不到新代码」）
服务器只认 Gitee。GitHub 刚合并的 PR 必须手动 ff 到 Gitee：
```bash
git fetch origin
git switch main && git merge --ff-only origin/main
git push origin main   # 双 push URL,GitHub no-op + Gitee ff
```
- 若 `--ff-only` 失败（本地 main 有私货）→ 停下告知用户，绝不 force。
- 推完可反向核对：`ssh tshb-test 'cd /opt/tshb-react && git fetch && git log -1 --oneline origin/main'`
  应与 GitHub main 一致。

### 4. 执行部署
```bash
ssh tshb-test 'cd /opt/tshb-react && ./deploy.sh'
```
- Docker 构建较久（BuildKit 缓存命中时几分钟内），**后台执行 + 长超时**，别干等。
- 脚本自带 nginx restart 与健康检查，**不要在脚本外重复 up/restart**。

### 5. 验证
- 脚本末尾会打印 `docker compose ps`——确认 web/admin/nginx 三个容器 Up。
- 公网探活 web（裸 IP 落默认 server）：
  ```bash
  curl -fsS -o /dev/null -w "%{http_code}" http://47.121.142.19/   # 期望 200
  ```
- admin 与 web vhost 在**服务器本机**验证（公网带域名 Host 会被阿里云备案拦截 403）：
  ```bash
  ssh tshb-test 'curl -sS -o /dev/null -w "%{http_code}" -H "Host: admin.tianshengzhi.com" http://localhost/'  # 期望 200
  ```
- 需要登录 admin 真机验收时，测试账号在 memory `reference_admin_test_account`（勿问用户）。

### 6. 汇报
一句话给出：部署到的提交（`git log -1 --oneline`）、CI 结论、容器状态、公网探活结果。

## 故障排查

| 症状 | 原因与处置 |
|---|---|
| `git pull --ff-only` 失败 | 服务器仓库被人改过/分叉。**停下告知用户**，不要在服务器上 reset --hard |
| 部署后 502 | nginx 缓存旧上游 IP。`ssh tshb-test 'cd /opt/tshb-react && docker compose -f docker-compose.prod.yml restart nginx'` |
| 健康检查超时 | 脚本已自动打印 nginx/web/admin 最后 40 行日志，从日志定位；Next 冷启动本身可能要一会儿 |
| 服务器上没新代码 | 十有八九是忘了第 2 步（Gitee 没同步），回去补 |
| 公网带域名 Host 返回 403 | 阿里云对未备案域名的拦截(请求不进 nginx 日志),非部署故障;服务器本机验证即可 |
| `/docs` 打不开 | 那是后端 Swagger 的代理，后端(tshb-go)的事,不归本 skill 管,提醒用户即可 |

## 红线

- **GitHub main 的 CI 没跑完或没通过,绝不部署**;在跑/失败都立即告知用户,不挂起偷等。
- **绝不在服务器上直接改代码或 force 操作 git**;服务器仓库只做 ff pull。
- **绝不动 `/opt/tshb-go`**(后端)与数据库容器。
- 部署的必须是 main 的提交,不部署 feature 分支。
