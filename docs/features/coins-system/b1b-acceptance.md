# B1b 实现与验收记录

日期：2026-10-06。范围为 COIN-04～05；已实现并完成必要验收。B2 人工入账/冲正及钱包页面未开始。

## 版本、范围与实现

- 后端：`/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，基线 `5b1461d8b6422764a47bedb31e3d1bd446613fcc` + B1b 差异（验收时未提交，随后用户已授权本地提交）。
- 前端：`/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，基线 `310b10eccfeba35d8502754be18bd35752462a87` + B1b 差异（验收时未提交，随后用户已授权本地提交）。两仓复用本任务 `codex/coins-b1a` 工作区。
- 用户授权继续实现 B1b，验收后另行授权两仓本地提交；精确提交见各仓 `codex/coins-b1a` 历史。本批没有推送、PR、合并或部署。方案仍只在本目录维护。
- 新迁移 `20261006010000_account_deletion` 保存申请、签署金额/正文/版本、身份核验渠道、幂等指纹及请求状态。不保存 OTP 或其低熵摘要，不对 users 建级联 FK。
- 所有申请等待连续 72 小时；有余额必须主动签署放弃。申请时锁内核对精确余额并暂停全部钱包收支；零余额也创建并暂停钱包。
- 申请/撤销/执行均遵循用户 → 申请 → 钱包锁序。登录、refresh、旧 token、账户安全与资料/头像/认证材料写入增加数据库实际时间检查，等待用户或业务锁后跨过截止时间不能绕过。
- worker 每 30 秒读取持久到期记录；作废余额、文件清理安排、删号与完成标记同事务。失败/忙碌申请持久退避 60 秒，并按下次重试时间排序，让后续申请继续执行。已停用账号仍可完成到期清理。
- 对已完成存储写入的认证材料，到期拒绝发布并进入清理；仍在上传的材料保持既有晚到写入保护，等待上传结束或 TTL 后回收。

## API 与前端

- `GET /me/account-deletion`：当前余额、声明版本/正文、服务器时间及最新申请（可为 null）。
- `POST /me/account-deletion`：本人渠道验证码、精确金额、主动确认、放弃标记、声明版本和 UUID 幂等键；202 返回申请，保留会话。
- `POST /me/account-deletion/{id}/cancel`：本人在截止前撤销，重复撤销幂等，原余额保留；重新申请重新签署并计算 72 小时。
- 旧 `DELETE /auth/account` 拒绝为 409 `account_deletion_upgrade_required`，没有 204 成功分支，不消费 OTP。
- 注销页加载失败不伪造零余额；刷新恢复 pending；成功申请不退出登录；无验证渠道的 pending 用户仍可撤销。
- 金额保留十进制字符串。确认项默认不选，显示精确签署金额。提交失败后的恢复 GET 只要改变金额、声明版本或正文，就清除旧签署并要求重新确认，而非仅依赖特定错误码。
- 网络结果未知时保留同一意图键并读取持久状态；验证码 401 不自动 refresh/重放。新前端访问旧 API 的 404 显示不可用，不回退旧 DELETE。

## 验收覆盖

| 风险                                                                         | 证据                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 未签署/余额变化拒绝；旧 DELETE 无删除旁路且不消费码                          | `account_deletion_handler` 真库测试                               |
| 同键并发返回原申请；不同意图冲突；旧取消键不复活；新申请重算期限             | `account_deletion_handler`                                        |
| 既有本人渠道与 OTP purpose 隔离                                              | `deletion_code_remains_bound_to_current_contact_and_purpose`      |
| 零余额也等待；停用不阻断清理；多 worker 最多作废一次；重启重读持久队列       | `account_deletion_worker`                                         |
| 删除失败整体回滚余额/流水/状态；已取消零余额证据也阻止 down                  | `account_deletion_worker`                                         |
| 前 100 个用户锁繁忙仍不阻塞第 101 个到期账号                                 | `busy_first_batch_yields_to_later_due_accounts`                   |
| pending 可登录/refresh；到期后密码登录、OTP 登录、refresh、旧 token 全部拒绝 | `account_deletion_gate`                                           |
| 登录、refresh、改密、资料修改、撤销等待锁跨截止时拒绝且零副作用              | `account_deletion_gate`，真实数据库锁与实际时间，无需等待三天     |
| 头像清理/认证材料既有安全流程回归                                            | `avatar_handler`、`teacher_certification_handler` 及完整回归      |
| 必须主动签署、保留会话、错误恢复、切号隔离、旧服务不可用                     | `DeleteAccountForm.test.tsx`、`account-deletion.contract.test.ts` |
| 网络失败后金额/声明变化不能沿用旧勾选                                        | 两项回归先复现失败，修复后通过；独立增量审查通过                  |
| 桌面/手机页面与导航                                                          | `e2e/tests/delete-account.spec.ts` 4 项通过（mock E2E，独立标记） |

后端独立只读审查发现的队列饥饿、完成时间 NULL 约束、已上传材料清理缺口均已修复并复查。前端独立审查发现的恢复查询签署失效问题已修复并复查。

## 真实浏览器与测试环境

- 复用本任务独立 `tsz-coins-b1a-pg`（PostgreSQL 17）与 `tsz-coins-b1a-redis`（Redis 7）；本次端口分别为 `52595`、`52596`，仅回环绑定。重启后用 `docker port` 重新取得实际端口。
- 真实服务：后端 `http://127.0.0.1:57661`，从本任务构建二进制复制至 `/tmp/coins-b1b-runtime/tsz-rust` 运行；工作目录为独立临时目录，显式注入隔离数据库/Redis和临时随机签名密钥，不读取共享 `.env`。
- 前端 `http://127.0.0.1:57662`，`pnpm --filter @tsz/web build` + `next start`；构建和启动的 `BACKEND_API_URL` 均为 `http://127.0.0.1:57661/api/v1`。
- 一次性真实 Playwright 脚本不注册任何 route/mock：注册隔离测试账号 → 真实代理读取注销状态 → 主动签署零余额申请 → 刷新恢复 → 撤销 → 再申请 → 在隔离库设置已保存申请的受控到期时间 → 页面刷新被拒绝并跳登录 → 持久 worker 完成删除。
- 验证数据库最终用户数为 0，保留 1 份 cancelled + 1 份 completed 签署记录，钱包为 closed。有余额放弃/余额不变/作废原子性由调用真实 coins 服务的 PostgreSQL 测试覆盖，没有手改余额制造证明。
- 真实测试采用 OTP 冷却 1 秒，遵守该冷却后再发码；页面仍保留原 60 秒倒计时。中途一次过快重发实际被 429 拒绝，等待后重试通过。
- 浏览器证据：`/tmp/coins-b1b-runtime/real-browser-result.json`、`pending-mobile.png`；已目视检查移动端页面，无横向溢出。临时后端、前端服务与测试容器均已停止，保留隔离库内的验收证据。

## 质量门与复验

- 定向后端：handler 5、worker 5、gate 2 项通过。完整回归覆盖 79 个集成 target，847 项通过、1 项既有 OSS 忽略；单元/二进制 330 项通过，doc-tests 通过。末段 3 个昵称并发测试原先匹配旧 UPDATE 锁语句，已改为观察新的用户锁语句，保留全部原断言后通过，剩余目标也已补齐。
- 前端 api-client 459 项通过；最终 UI/账号安全 36 项通过；全仓 typecheck/lint 通过（仅既有 warning）。
- 全仓前端首轮 219 文件通过，2 个未改动 Admin 文件共 4 项在并行构建期间超时；将定向复验并发限制为 2 后，两文件 60 项通过、2 项既有跳过。未放宽断言或单测时限。
- 最终生产构建、mock E2E 与无 mock 浏览器链均通过；独立审查无未解决的实质问题。
- fmt、`git diff --check`、clippy `--all-targets --all-features -- -D warnings`、CI 分区/工作流 18 项 Python 测试通过。新增 worker/gate 均登记 CI，集成 target 总数为 79。
- `cargo sqlx prepare -- --all-targets --all-features` 已在隔离准备库执行，`.sqlx` 无差异。OpenAPI/runtime 来源哈希为 `fdeca5bd8536ec0155e307aec3c6a3612971303dd5aecb40d79f6ace106f4e11`，实际文件与快照一致。

复验命令：

```bash
# 后端任务 worktree；先启动本任务容器并用 docker port 取得端口
export DATABASE_URL=postgres://postgres@127.0.0.1:<pg-port>/coins_prepare
export TEST_REDIS_URL=redis://127.0.0.1:<redis-port>/0
export REDIS_URL="$TEST_REDIS_URL"
SQLX_OFFLINE=true cargo test --locked --all-features --test account_deletion_handler --test account_deletion_worker --test account_deletion_gate
SQLX_OFFLINE=true cargo test --locked --all-features
# 前端任务 worktree
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/auth/components/DeleteAccountForm.test.tsx src/features/auth/components/AccountSecurity.test.tsx
pnpm typecheck
pnpm lint
pnpm test
WEB_E2E_PORT=<verified-web-port> pnpm --filter @tsz/e2e exec playwright test --config=playwright.config.ts delete-account.spec.ts
```

## 发布、回退与后续

先发布不会回退旧 DELETE 的新前端，再发布 B1b 后端；过渡期新接口可能暂不可用。后端上线后旧客户端同样无法立即删号。此顺序只是已验证的配套要求，不代表已获发布授权。

一旦存在任何注销申请或签署证据，不能回退到无到期鉴权的旧后端，也不能执行 schema down 删除记录。到期后应由持久 worker 重试完成，不能用暂停 worker 延长账户使用或撤销期限。

B1b 完成后，下一批为 B2（COIN-06～09）：人工发币/原单冲正、权限和审计、双端钱包及运营验收。词表和任务业务仍缺少真实上游，不在本批补建。

提交审查增量：修复多标签页撤销后的旧键重放；POST 返回历史 cancelled 时不显示新申请成功，并清理旧意图键、验证码和勾选，要求重新核验签署。恢复 GET 不带幂等键，可能返回更早的 cancelled 记录，因此保留未知请求键进行一次精确重放来确认归属。新增回归先失败后通过。
