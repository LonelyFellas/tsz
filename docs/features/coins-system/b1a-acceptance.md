# B1a 实现与验收记录

日期：2026-10-06。范围仅 COIN-01～03；实现与必要验证已完成。

## 工作区与事实来源

- 后端：`/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，`codex/coins-b1a`，基线 `035d1dd4fa94c7278a0c9ea65f6799096bb6aa94` + 未提交工作区差异。
- 前端：`/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，`codex/coins-b1a`，基线 `78efe657c3ee7d2610293d5b989ab249eda5adfe` + 未提交工作区差异。
- 本目录为方案和状态的唯一维护位置；原 `9adc` 评估目录保持原样。
- B1a 验收后用户已授权两仓本地提交；提交对象以各仓 `codex/coins-b1a` 历史为准。未推送、创建 PR、合并或部署。没有连接共享业务库或生产库，没有启动业务服务。

## 实现与逐条覆盖

| 范围                                       | 实现                                                                                         | 验收证据                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| COIN-01 钱包唯一、身份隔离、非负及金额边界 | `20261006000000_coins` 成对迁移；`src/coins/model.rs`                                        | `coins_schema`；`coins_ledger::identity_precision_and_outer_transaction_rollback`                                                                    |
| 回退不丢账与生命周期证据                   | down 先锁三表，再拒绝存在操作、流水、非零余额或非 open 钱包                                  | `coins_schema` 两项真库测试；部署回退测试最新迁移号同步                                                                                              |
| 发放、扣除、转账及余额/流水原子性          | `src/coins/service.rs`；调用方事务内保存点，成功不自行提交外层事务                           | `coins_ledger` 外层 rollback、第二条流水注入 SQL 错误后仍可提交调用方事务                                                                            |
| 请求幂等与独立业务去重                     | 请求作用域/键及来源类型/事件 ID 双唯一约束；事务 advisory lock；SHA-256 载荷指纹             | 同键并发；换键同事件；改对象、金额、原因、凭据、来源或操作者冲突                                                                                     |
| 并发开户、余额不足、转账不透支             | 主体按类型/UUID 共享锁；钱包按稳定 UUID 排他锁；checked_add                                  | 并发开户、并发扣款、双向转账和失败原子性测试                                                                                                         |
| 暂停、恢复、关闭与主体有效性               | 账号域未来调用 `pause_in/resume_in/close_in`；普通收支拒绝停用、缺失、暂停、关闭主体/钱包    | `coins_ledger` 以 `pg_blocking_pids` 确认实际锁等待，覆盖记账先行及停用/删除/暂停先行；关闭允许已停用的 pending 账号执行已签署作废；零余额不伪造流水 |
| 对账与账本保留                             | `repository::reconcile` 单一只读快照：逐钱包、逐流水累计余额、逐操作形状、总量；包括关闭钱包 | 全部账本测试对账；删除主体后流水仍保留                                                                                                               |
| COIN-03 四个本人查询接口                   | user/admin 分域；Admin ActiveSession 不要求管理币权限；无 owner 参数、无公开写账路由         | `coins_handler` 真实 PG + Axum router；同 UUID 双域、学生教师同钱包、失效会话、未知参数                                                              |
| 真实零余额、失败语义、隐私、分页           | 查询不开户；数据库失败为 Problem Details；隐藏原因/凭据/操作者/事件 ID；快照边界稳定分页     | `coins_handler`；`coins.contract.test.ts`                                                                                                            |
| OpenAPI 与前端 wire                        | snake_case 类型；专用请求；严格 runtime schema + BigInt 范围检查；只支持本人读取             | `coins.contract.test.ts`、`endpoints.contract.test.ts`、`runtime-schema.test.ts`                                                                     |
| CI 测试发现                                | `coins_*` 纳入 platform 分区；固定 inventory 同步为 77 个集成 target                         | `ops/test_ci_test_modules.py`、`ops/test_ci_workflow.py`                                                                                             |

## 内部接入约定

- 只有内部服务函数，无人工发币/扣除/转账浏览器 API，也没有业务写账调用者。B1b 验收完成前不向真实账号记账。
- 每个外层业务事务执行至多一笔普通记账（一次 transfer 本身包含两边）。先按统一顺序锁操作者和全部参与主体，再做实时权限/业务检查，再调用记账函数。不要提前单锁操作者。
- `lock_accounts_in` 便于 B2 在 `permissions::lock` 前取得同一笔操作的主体锁；它不提供多操作批次的全局钱包锁计划。未来需要批次时另行设计，不直接交错调用。
- 业务来源必须是稳定事件命名空间/ID，不使用请求键、操作员、规则版本或单纯词表 ID 替代；同键异载荷返回内部 `IdempotencyConflict`，换键同事件为 `SourceConflict`。
- `reason/evidence_ref/source_id/actor` 仅内部记录；`source_type` 是可公开的事件类别，禁止放入联系方式或凭据。
- `close_in` 不验证签署和时间，B1b 账号域必须先按“用户 → 申请 → 钱包”锁定，锁后以数据库时间验证期限、签署与精确余额，再原子执行关闭、删号和申请完成。停用不阻止已签署的到期清理。
- 本批没有修改既有立即注销路径，也没有实现 72 小时申请、撤销、worker 或到期鉴权。

## 可重复验证环境

本任务创建的独立 Docker 容器（未使用已有实例），验收后已停止并保留；复验先执行 `docker start tsz-coins-b1a-pg tsz-coins-b1a-redis`，再用 `docker port` 读取重启后的实际端口；下列地址是首次验收记录，不保证重启后不变：

- `tsz-coins-b1a-pg`：PostgreSQL 17，`127.0.0.1:52538`，准备库 `coins_prepare`；`#[sqlx::test]` 每项另建独立测试库。
- `tsz-coins-b1a-redis`：Redis 7，`127.0.0.1:52541`；完整回归同时设置 `TEST_REDIS_URL` 和 `REDIS_URL`，避免现有 avatar 测试缺失配置。
- PG 仅回环端口、临时测试实例采用 trust；不含真实数据或生产凭据。没有手工修改余额制造验收数据。

```bash
# 后端任务 worktree
coins_pg_port=$(docker port tsz-coins-b1a-pg 5432/tcp | sed 's/.*://')
coins_redis_port=$(docker port tsz-coins-b1a-redis 6379/tcp | sed 's/.*://')
export DATABASE_URL="postgres://postgres@127.0.0.1:${coins_pg_port}/coins_prepare"
export TEST_REDIS_URL="redis://127.0.0.1:${coins_redis_port}/0"
export REDIS_URL="$TEST_REDIS_URL"
cargo sqlx migrate run
cargo sqlx prepare -- --all-targets --all-features
SQLX_OFFLINE=true cargo test --locked --all-features --test coins_ledger --test coins_schema --test coins_handler
python3 -m unittest ops/test_ci_test_modules.py ops/test_ci_workflow.py
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
SQLX_OFFLINE=true cargo test --locked --all-features
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
```

```bash
# 前端任务 worktree
env -u SYNC_OPENAPI_RUNTIME_ONLY \
  OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust/docs/openapi.json \
  pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
pnpm typecheck
pnpm lint
pnpm test
```

新增 SQL 使用参数化动态查询；已运行 `cargo sqlx prepare`，现有 `.sqlx` 无差异。OpenAPI 来源为上述后端工作区，SHA-256 为 `ce1e483e5b77f7e90cfe3b0210dd98f0b096196a64dcb71f318a6628a168cd33`；runtime bundle 的 `_source_sha256` 与实际 spec 一致。

## 兼容性与后续依赖

- 旧前端 + 新后端：逐项比较基线与新 OpenAPI，既有 paths 和 schemas 差异均为空。既有登录、profile、用户列表和立即注销响应未修改；新表/四个只读端点为增量。未向旧严格响应追加余额字段。
- 新请求层 + 旧后端：coins 调用收到 404 时正常抛错；契约测试证明不会伪造零余额。本批未挂钱包页面或菜单，无新入口提前触发调用。
- 新请求层 + 新后端：真实 PG handler 和生成契约均验证 user/admin 路径；没有浏览器页面验收或人工入账闭环，本批不声称 B2 完成。
- B1a schema/只读后端可先于请求层发布；实际发布仍需另行授权。允许无账且无生命周期证据时 down；有账后保持 schema，不做破坏性回退。
- 下一步为 B1b（COIN-04～05）：持久注销申请、签署、连续 72 小时、撤销、暂停钱包、到期鉴权和 worker。其后 B2 才开放真实人工入账和页面。
- B3 词表与 B5 任务的真实上游后端仍未就绪；不将前端占位视作可接入业务。

## 最终验证结果

- B1a 真库测试：`coins_ledger` 9 项、`coins_handler` 4 项、`coins_schema` 2 项全部通过。
- 后端 fmt、最终 all-targets/all-features clippy（`-D warnings`）、CI 分区/工作流 18 项 Python 测试通过。完整回归覆盖全部 77 个集成 target（840 项通过、1 项既有忽略）、330 项单元/二进制测试及 doc-tests；真实 OSS 冒烟为既有显式忽略，未配置外部凭据。
- 完整 Rust 回归曾因新迁移使测试固定的旧版本号失效而失败，已更新测试的当前迁移号。之后在 avatar target 因缺少其专用 `REDIS_URL` 停下；补齐为本任务隔离 Redis 后，从该 target 继续全部剩余目标，已通过目标未重复运行。最终 77 个 target 覆盖集合核验无缺项。
- 前端 api-client：13 个文件、453 项通过；全仓 typecheck/lint 通过；全仓测试 220 个文件、3337 项通过、2 项既有跳过。lint 保留已有 `useLogout.ts` 的 Next 跳转警告（0 errors），未修改无关代码。
- 修改文件 Prettier、`git diff --check` 通过；SQLx 缓存无差异；OpenAPI 来源路径和哈希一致。独立只读审查发现的停用后关闭兼容问题已修复，并通过真库回归；多操作锁计划限制已写明。
- 没有新增页面，所以未运行 coins 浏览器 E2E；COIN-07/08/09 属于 B2。本批可作为 B1b 的实现前置，不构成开放真实账号记账的许可。
