---
name: deploy
description: 把已合入 main 的前端(web+admin)部署到 tshb-test 测试服务器。先查 GitHub main 的 CI；全绿才继续，失败立即停止，仍在运行则后台守到全绿再自动续跑。用仓库原生脚本从 origin/main 导出干净源码到临时目录构建 web/admin、rsync 到服务器，最后验证页面、服务、API 反代与部署溯源 manifest。当用户说「部署」「deploy」「发测试环境」「上服务器」等时触发。
---

# deploy —— 前端部署到 tshb-test 测试服务器

把 `main` 上的最新前端代码（web + admin + nginx 配置）部署到测试服务器。
**只部署前端**：后端 `/opt/tsz-rust`、后端服务、数据库与运行数据一律不碰。

## 拓扑事实（先记住再动手）

- 服务器：`tshb-test`（47.121.142.19），SSH 别名已配在 `~/.ssh/config`。
- 服务器**没有前端 Git checkout**：不要寻找 `/opt/tshb-react`，不要拉 Gitee，也不要运行根
  `deploy.sh` 或 `docker-compose.prod.yml`——那套 Docker + 服务器 Git pull 的流程**已废弃**。
- 构建**不在你的工作区里做**：脚本用 `git archive` 把 `origin/main` 的目标 commit 导出到
  `/tmp/tsz-deploy-build.*`，在那里 `pnpm install --frozen-lockfile` 并构建，产物也从那里取。
  工作区脏不脏、在哪个分支、有没有 `.env.local`，都影响不到产物。
- web 是 Next standalone，构建后同步到 `/opt/tsz-web`，由 `tsz-web.service` 监听
  `127.0.0.1:3000`。
- admin 是 Vite 静态产物，构建后同步到 `/opt/tsz-admin/dist`，由宿主 nginx 的 `8081` 端口提供。
- nginx 是**宿主机原生服务**（不是容器），配置在 `/etc/nginx/conf.d/tsz.conf`；`80` 提供 web、
  `8081` 提供 admin；两边的 `/api/v1/` 都代理到 tsz-rust `127.0.0.1:8383`。
- 部署溯源 manifest 在 `/opt/tsz-deploy-manifests/`（`web.json` / `admin.json` / `api.json`），
  校验工具在 `/opt/tsz-deploy-tools/frontend-provenance.mjs`。
- 唯一规范部署入口是 [deploy-web.sh](../../../deploy/deploy-web.sh) 和
  [deploy-admin.sh](../../../deploy/deploy-admin.sh)。脚本负责本地构建、严格范围 rsync、同步 nginx、
  重启/重载服务和基础 smoke；**不得拆开后手工拼命令**。

## 流程

### 1. 确认要部署的内容已在 main

- `git fetch origin && git log -1 --oneline origin/main` 确认 GitHub main 的目标提交。
  **部署的就是这个提交**，脚本自己从 git 对象导出，不看工作区。
- 工作区脏、在别的分支上、`main` 被别的 worktree 占着——都**不影响部署**，脚本只会打印一行
  提醒（「工作区有未提交改动，不会进入产物」）。**不要**为了让脚本通过而 stash、提交或丢弃
  用户的改动。
- 若用户想部署的改动还没合入 main → 停下说明，先走 /ship 流程合并，不要部署半成品分支。

### 2. CI 门禁（GitHub main 的 CI 全绿才继续）

对 origin/main 的 HEAD 提交查 GitHub checks 状态：

```bash
gh api repos/{owner}/{repo}/commits/$(git rev-parse origin/main)/check-runs \
  --jq '.check_runs[] | "\(.name): \(.status) \(.conclusion // "-")"'
```

按结果三分支处理（**只有第一种才能直接进入第 3 步**）：

- **全部 `completed` 且 conclusion 均为 `success`/`skipped`/`neutral`** → 继续第 3 步
  （merge 提交上 commitlint 常为 `skipped`，属正常，不要误拦）。
- **有 check 还在 `queued`/`in_progress`（正在跑）** → 进入下方「CI 运行中守候」，**不要**要求
  用户稍后重新发 `/deploy`，也不要在前台无期限阻塞。
- **有 conclusion 为 `failure`/`cancelled`/`timed_out`（没过）** → **立即停下告知用户**：
  main 的 CI 没过，附上失败的 check 名与链接（`gh run list --commit <sha>`），等修复后重来。
- 若该提交没有任何 check（如纯文档提交未触发 workflow）→ 说明情况后可继续，由用户判断。

#### CI 运行中守候

用 **Bash 的 `run_in_background`** 起一个轮询，退出即完成，完成时你会收到 task 通知，
然后**在同一个部署请求里自动从第 3 步继续**：

```bash
SHA=$(git rev-parse origin/main)
until [ -z "$(gh api repos/{owner}/{repo}/commits/$SHA/check-runs \
  --jq '.check_runs[] | select(.status != "completed") | .name')" ]; do sleep 30; done
gh api repos/{owner}/{repo}/commits/$SHA/check-runs \
  --jq '.check_runs[] | "\(.name): \(.conclusion)"'
```

（`gh pr checks <n> --watch` 只适用于 PR，部署盯的是 main 上的提交，用上面这种按 SHA 轮询。）

守候期间与恢复后的规则：

1. 恢复执行时**先重新 `git fetch origin`**。若 `origin/main` 已前进，目标 SHA 作废，对新 HEAD
   重新执行第 2 步；**绝不部署已不是 main HEAD 的旧提交**。
2. 任一 check 为 `failure`/`cancelled`/`timed_out` → 停止，报告失败 check 与链接，**绝不部署**。
3. 全绿才从第 3 步继续，完成构建、同步、验证与第 7 步汇报，**无需再次向用户确认**。
4. 告知用户时要说明：目标 SHA、还没跑完的 check、以及「全绿后会自动接着部署」。

### 3. 不需要准备本地源码

脚本自己解析 `origin/main`、导出目标 commit、在临时目录装依赖构建。**不要** `git switch main`、
不要 `merge --ff-only`、不要 stash，也不用管 `main` 是否被别的 worktree 占用。

唯一的前置是本机能拿到那个 commit——脚本发现本地没有时会自己 `git fetch origin main`。

> **本地 `.env.local` 注意**：现在它们**不再会拦住部署**（构建目录是从 git 对象导出的，
> gitignored 文件根本不在里面）。**绝不删除或移走用户的 `.env*` 文件**——既没必要，也会破坏
> 用户的本地开发环境。

### 4. 部署 web

从仓库根执行：

```bash
./deploy/deploy-web.sh
```

脚本必须成功完成 Next standalone 构建、rsync、`tsz-web` 重启、nginx 校验/重载及 smoke。
它先把 `origin/main` 的目标 commit 导出到 `/tmp/tsz-deploy-build.*` 并在那里
`pnpm install --frozen-lockfile`（暖 store 下约 5–10 秒），断言导出树里没有 Next 会读的
ignored `.env*`，用 allowlist 环境构建，并在写服务器前重做一次 exact-main 校验
（**部署过程中 main 前进了就会中止**——这时重新从第 2 步对新 HEAD 走一遍）。
rsync 之前还会把 staged standalone 产物在本地随机高位端口起一次、curl 到 `200` 才放行
（CI 与 e2e 都碰不到裁剪产物，起不来的产物必须挡在覆盖服务器那份之前）。
送上服务器的 `provenance.mjs`、systemd unit 和 nginx 配置也一并取自那棵导出树，不取自工作区。
它对远端 web 的不可变 release 内容复算 SHA-256（严格 schema 只固定排除
正常流量会改写的 `apps/web/.next/cache`），并只在 smoke 成功后原子发布
`/opt/tsz-deploy-manifests/web.json`。**manifest 验证失败等同部署失败。**

构建耗时较长，用长超时执行，别中途打断。
若重启瞬间页面返回 `502`，只读检查 `systemctl status tsz-web` 与日志，并在 30 秒内重试页面；
只有恢复 `200` 且 API 为预期 `401` 才继续，**不能因为脚本退出码为 0 就忽略错误**。

### 5. 部署 admin

只有 web 验收通过后才执行：

```bash
./deploy/deploy-admin.sh
```

脚本同样从导出树构建：断言其中没有 Vite test mode 会读取的 ignored `.env*`，使用 allowlist
环境完成 Vite 构建、仅同步导出树里的 `apps/admin/dist/`、nginx 校验/重载及页面/API smoke。
脚本会独立生成并验证 `/opt/tsz-deploy-manifests/admin.json`；**web manifest 不能替代 admin manifest**。
失败时停止并明确说明是否已形成「web 成功、admin 失败」的部分部署。

### 6. 独立验证

脚本自带检查仍不够，显式验证实际分流：

```bash
curl -fsS -o /dev/null -w "%{http_code}" http://47.121.142.19/                      # 200
curl -sS  -o /dev/null -w "%{http_code}" http://47.121.142.19/api/v1/auth/me        # 401
ssh tshb-test 'curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/'                  # 200
ssh tshb-test 'curl -sS  -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/admin/profile' # 401
ssh tshb-test 'systemctl is-active tsz-web && nginx -t'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/web.json --artifact-root /opt/tsz-web'
ssh tshb-test '/usr/bin/node /opt/tsz-deploy-tools/frontend-provenance.mjs verify --manifest /opt/tsz-deploy-manifests/admin.json --artifact-root /opt/tsz-admin/dist'
```

期望 web/admin 均为 `200`，未登录 API 均为 `401`，`tsz-web` 为 `active`，nginx 配置有效。
两条 manifest verify 还必须输出与目标 SHA 一致的 `git_sha`、精确 `ci_run_id`、实际
`artifact_sha256/file_count` 和非空 `accepted_at`。**不得只读取 JSON 而跳过制品复算。**

### 7. 汇报

- CI 仍在运行时：简短说明目标 SHA、未完成的 check，以及已起的后台守候；明确全绿后会自动继续。
- 最终结束时：给出目标 SHA/subject、CI 结论、web/admin 部署结果、`tsz-web` 与 nginx 状态、
  web/admin HTTP 状态码、两条 API 反代状态码，以及两份 manifest 的 Git SHA、CI run、artifact
  SHA-256/file_count 和 verify 结论。

## 故障排查

| 症状                        | 原因与处置                                                                     |
| --------------------------- | ------------------------------------------------------------------------------ |
| `/opt/tshb-react` 不存在    | 正常现状；该路径与服务器 Git/Docker 部署已废弃，必须使用 `deploy/deploy-*.sh`  |
| `main` 被其他 worktree 占用 | 无影响；构建源来自 git 对象，不需要本地切到 main                               |
| 脚本拒绝 ignored `.env*`    | 只可能出在**导出树**里（正常不会发生）。绝不去动用户工作区的 `.env*`，停下告知 |
| `origin/main advanced after source gate` | 部署途中 main 前进了；回到第 2 步对新 HEAD 查 CI 后重跑脚本      |
| web 重启瞬间返回 `502`      | 最多重试 30 秒并只读检查 `tsz-web` 状态/日志；恢复 `200` 才继续                |
| `tsz-web` 非 active         | 只读检查 `systemctl status`、`journalctl -u tsz-web`；不绕开部署脚本手工拼产物 |
| nginx 校验失败              | 不强制 reload；保留现有运行配置并回报 `nginx -t` 输出                          |
| web 成功但 admin 失败       | 明确报告部分部署，不声称整体成功                                               |
| manifest 与制品摘要不一致   | 停止；该组件未验收，检查 rsync/staging，**禁止手工改 JSON**                    |
| 只有旧 manifest             | 制品已变但来源记录未前进，按失败处理并回退或重新精确部署                       |
| API 返回 `404`/`502`/`5xx`  | 属 nginx/后端路由诊断；只读排查，不重启或修改 tsz-rust                         |
| 域名 Host 公网 403          | 阿里云对未备案域名的拦截，非部署故障；用裸 IP 与服务器本机验证                 |

## 红线

- **GitHub main 的 CI 没跑完或没通过，绝不部署**；在跑时起后台守候并在全绿后自动续跑，
  失败时立即停止并告知用户，**绝不要求用户重新触发 `/deploy`**。
- **绝不在服务器创建/修复前端 Git checkout，也不运行废弃的根 `deploy.sh`/Docker Compose 流程**。
- **绝不动 `/opt/tsz-rust`、后端服务、数据库或运行数据**。
- 部署的必须是 `origin/main` 的 HEAD；不部署 feature 独有代码，不绕过仓库部署脚本的构建与验证。
- **不得手工创建、补写或编辑正式 manifest**；只有部署脚本在远端摘要复核与 smoke 成功后才能原子发布。
- **不得为了让脚本通过而删除或移动用户的本地 `.env*` 文件。**
