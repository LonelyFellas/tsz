---
name: deploy
description: 把已合入 main 的前端(web+admin+nginx)部署到 tshb-test 测试服务器。先查 GitHub main 的 CI；全绿才继续，失败立即停止，仍在运行则创建当前任务监控并在全绿后自动续跑。使用仓库原生脚本本地构建 web/admin、rsync 到服务器，最后验证页面、服务与 API 反代。当用户说「部署」「deploy」「发测试环境」「上服务器」等时触发。
---

# deploy —— 前端部署到 tshb-test 测试服务器

把 `main` 上的最新前端代码（web + admin + nginx）部署到测试服务器。
**只部署前端**：后端 `/opt/tsz-rust`、后端服务、数据库与运行数据一律不碰。

## 拓扑事实（先记住再动手）

- 服务器：`tshb-test`（47.121.142.19），SSH 别名已配在 `~/.ssh/config`。
- 服务器**没有前端 Git checkout**：不要寻找 `/opt/tshb-react`，不要拉 Gitee，也不要运行根
  `deploy.sh` 或 `docker-compose.prod.yml`。
- web 是 Next standalone，本地构建后同步到 `/opt/tsz-web`，由 `tsz-web.service` 监听
  `127.0.0.1:3000`。
- admin 是 Vite 静态产物，本地构建后同步到 `/opt/tsz-admin/dist`，由宿主 nginx 的 `8081` 端口提供。
- nginx 的 `80` 端口提供 web、`8081` 提供 admin；两边的 `/api/v1/` 都代理到 tsz-rust
  `127.0.0.1:8383`。
- 唯一规范部署入口是 [deploy-web.sh](../../../deploy/deploy-web.sh) 和
  [deploy-admin.sh](../../../deploy/deploy-admin.sh)。脚本负责本地构建、严格范围 rsync、同步 nginx、
  重启/重载服务和基础 smoke；不得拆开后手工拼命令。

## 流程

### 1. 确认要部署的内容已在 main

- 先看 `git status --short`。若 `apps/`、`packages/`、`deploy/` 或根构建配置存在未提交改动，停下，
  不要把工作区代码混入部署；不参与构建的 skill 文档改动可以保留。
- `git fetch origin && git log -1 --oneline origin/main` 确认 GitHub main 的目标提交。
- 若用户想部署的改动还没合入 main → 停下说明，先走 /ship 流程合并，不要部署半成品分支。

### 2. CI 门禁（GitHub main 的 CI 全绿才继续）

对 origin/main 的 HEAD 提交查 GitHub checks 状态：

```bash
gh api repos/{owner}/{repo}/commits/$(git rev-parse origin/main)/check-runs \
  --jq '.check_runs[] | "\(.name): \(.status) \(.conclusion // "-")"'
```

按结果三分支处理（**只有第一种才能在当前执行中直接进入第 3 步**）：

- **全部 `completed` 且 conclusion 均为 `success`/`skipped`/`neutral`** → 继续第 3 步
  （merge 提交上 commitlint 常为 `skipped`，属正常，不要误拦）。
- **有 check 还在 `queued`/`in_progress`（正在跑）** → 进入下方“CI 运行中监控”，创建或更新
  当前任务的 heartbeat 监控；告诉用户会在全绿后自动继续，然后结束本次执行。**不得要求用户自行确认、
  重新发送 `/deploy`，也不得在当前执行里无期限阻塞。**
- **有 conclusion 为 `failure`/`cancelled`/`timed_out`（没过）** → **立即停下告知用户**：
  main 的 CI 没过，附上失败的 check 名与链接（`gh run list --commit <sha>`），等修复后重来。
- 若该提交没有任何 check（如纯文档提交未触发 workflow）→ 说明情况后可继续，由用户判断。

#### CI 运行中监控

使用 Codex 应用的 `automation_update` 创建**绑定当前任务的 heartbeat 监控**，默认每分钟检查一次。
这是原部署请求的自动续跑，不要创建脱离当前任务的独立 cron。创建前先查找当前任务、当前仓库已有的
部署监控并复用/更新，禁止重复创建多个轮询任务。

创建监控前记录：

- 仓库绝对路径；
- 当时 `origin/main` 的完整 SHA（目标 SHA）；
- 原部署目标 `tshb-test`；
- 当前部署已完成到“CI 门禁”，后续全绿时应从第 3 步继续本地构建与 rsync。

监控提示词必须是可独立重复执行的完整指令，并明确以下状态机：

1. 每次运行先 `git fetch origin`，读取最新 `origin/main`。若 HEAD 已前进，更新目标 SHA，重新对新 HEAD
   执行第 2 步；绝不部署已不是 main HEAD 的旧提交。
2. 若目标 SHA 仍有 `queued`/`in_progress`，保持监控，除非状态变化否则不要反复打扰用户。
3. 若任何 check 为 `failure`/`cancelled`/`timed_out`，停止并删除该监控，向当前任务回报失败 check
   与链接；绝不部署。
4. 只有全部 check `completed` 且 conclusion 均为 `success`/`skipped`/`neutral` 时，才在同一次监控执行中
   自动从第 3 步继续，完成构建、同步、部署、验证和第 7 步汇报，无需再次向用户确认。
5. 部署成功后立即停止并删除该监控，避免下一轮重复部署；部署途中若出现需要用户决策的安全阻塞，
   也先停止监控，再一次性说明阻塞与现场状态。

若 `automation_update` 暂不可用，使用产品提供的当前任务 recurring monitor/wait 机制实现同样状态机；
只有两者都不可用时才如实报告工具限制。无论哪种情况，都不要把“稍后重新发 `/deploy`”当作处理方案。

### 3. 准备与 main 完全一致的本地源码

优先安全切到并快进本地 main：

```bash
git switch main
git merge --ff-only origin/main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
```

若 `main` 被另一个 worktree 占用，不要修改或抢占那个 worktree。只有同时满足以下条件，才可从当前
worktree 构建：

- `apps/`、`packages/`、`deploy/` 与根构建配置相对 `origin/main` 没有任何差异；
- 这些部署相关路径没有未提交改动；
- 用户要求的提交已确认可从 `origin/main` 到达。

不满足则停下说明；绝不 reset、stash、丢弃用户改动或部署 feature 独有代码。

### 4. 部署 web

从仓库根执行：

```bash
./deploy/deploy-web.sh
```

脚本必须成功完成本地 Next standalone 构建、rsync、`tsz-web` 重启、nginx 校验/重载及 smoke。
脚本还会再次执行 clean/exact-main/精确 CI 门禁，拒绝 Next 会读取的 ignored `.env*`，并用
allowlist 环境构建。它对远端 web 的不可变 release 内容复算 SHA-256（严格 schema 只固定排除
正常流量会改写的 `apps/web/.next/cache`），并只在 smoke
成功后原子发布 `/opt/tsz-deploy-manifests/web.json`。manifest 验证失败等同部署失败。
若重启瞬间页面返回 `502`，只读检查 `systemctl status tsz-web` 与日志，并在 30 秒内重试页面；
只有恢复 `200` 且 API 为预期 `401` 才继续，不能因为脚本退出码为 0 就忽略错误。

### 5. 部署 admin

只有 web 验收通过后才执行：

```bash
./deploy/deploy-admin.sh
```

脚本必须拒绝 Vite test mode 会读取的 ignored `.env*`，使用 allowlist 环境完成 Vite 构建、仅同步 `apps/admin/dist/`、nginx 校验/重载及页面/API smoke。
脚本会独立生成并验证 `/opt/tsz-deploy-manifests/admin.json`；web manifest不能替代 admin manifest。
失败时停止并明确说明是否已形成“web 成功、admin 失败”的部分部署。

### 6. 独立验证

脚本自带检查仍不够，显式验证实际分流：

```bash
curl -fsS -o /dev/null -w "%{http_code}" http://47.121.142.19/ # 200
curl -sS -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me # 401
ssh tshb-test 'curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/' # 200
ssh tshb-test 'curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile' # 401
ssh tshb-test 'systemctl is-active tsz-web && nginx -t'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-web'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-admin/dist'
```

期望 web/admin 均为 `200`，未登录 API 均为 `401`，`tsz-web` 为 `active`，nginx 配置有效。
两条 manifest verify 还必须输出与目标 SHA一致的 `git_sha`、精确 `ci_run_id`、实际
`artifact_sha256/file_count` 和非空 `accepted_at`。不得只读取 JSON而跳过制品复算。

### 7. 汇报

- CI 仍在运行时：简短说明目标 SHA、未完成的 check，以及已创建/复用监控；明确全绿后会自动继续部署。
- 最终结束时：给出目标 SHA/subject、CI 结论、web/admin 部署结果、`tsz-web` 与 nginx 状态、
  web/admin HTTP 状态码、两条 API 反代状态码，以及两份 manifest 的 Git SHA、CI run、artifact
  SHA-256/file_count 和 verify 结论。

## 故障排查

| 症状                        | 原因与处置                                                                     |
| --------------------------- | ------------------------------------------------------------------------------ |
| `main` 被其他 worktree 占用 | 不抢占；按第 3 步验证部署路径与 `origin/main` 完全一致，否则停止               |
| web 重启瞬间返回 `502`      | 最多重试 30 秒并只读检查 `tsz-web` 状态/日志；恢复 `200` 才继续                |
| `tsz-web` 非 active         | 只读检查 `systemctl status`、`journalctl -u tsz-web`；不绕开部署脚本手工拼产物 |
| nginx 校验失败              | 不强制 reload；保留现有运行配置并回报 `nginx -t` 输出                          |
| web 成功但 admin 失败       | 明确报告部分部署，不声称整体成功                                               |
| manifest 与制品摘要不一致   | 停止；该组件未验收，检查 rsync/staging，禁止手工改 JSON                        |
| 只有旧 manifest             | 说明制品已变但来源记录未前进，按失败处理并回退或重新精确部署                   |
| API 返回 `404`/`502`/`5xx`  | 属于 nginx/后端路由诊断；只读排查，不重启或修改 tsz-rust                       |
| `/opt/tshb-react` 不存在    | 正常现状；该路径和服务器 Git/Docker 部署已废弃，必须使用 `deploy/deploy-*.sh`  |

## 红线

- **GitHub main 的 CI 没跑完或没通过,绝不部署**；在跑时必须创建/复用当前任务监控并在全绿后自动续跑，
  失败时立即停止监控并告知用户，绝不要求用户重新触发 `/deploy`。
- **绝不在服务器创建/修复前端 Git checkout，也不运行废弃的根 `deploy.sh`/Docker Compose 流程**。
- **绝不动 `/opt/tsz-rust`、后端服务、数据库或运行数据**。
- 部署的必须是 main 的内容；不部署 feature 独有代码，不绕过仓库部署脚本的构建与验证。
- **不得手工创建、补写或编辑正式 manifest**；只有部署脚本在远端摘要复核与 smoke成功后才能原子发布。
