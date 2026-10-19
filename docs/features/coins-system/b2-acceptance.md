# B2 双端钱包与人工入账验收

日期：2026-10-06。范围 COIN-06～09；实现与真实链路已完成，最终质量门结果见下文。

## 版本与授权

- 后端：`/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，`codex/coins-b1a`，`ee53bc184a441a72fca88f075affd94ef4b9b1e7` + 本批未提交改动。
- 前端：`/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，`codex/coins-b1a`，`0482ef54c88ac7f7200d572d8403529d1144ef65` + 本批未提交改动。
- 两仓 fetch 后 origin/main 仍分别为 `035d1dd4fa94c7278a0c9ea65f6799096bb6aa94`、`78efe657c3ee7d2610293d5b989ab249eda5adfe`。按同一 coins 工程任务复用 B1 工作区，没有从不含 B1 的 main 重建。
- 验收时授权范围为 B2 实现与隔离验收；验收后用户已授权两仓本地提交，精确提交以各仓 `codex/coins-b1a` 历史为准。未推送、创建 PR、合并或部署。旧 `9adc` 评估目录未修改。

## 实现与风险覆盖

| 任务 / 行为                              | 实现位置                                                                      | 证据                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| COIN-06 账户查询、指定主体流水、操作筛选 | 后端 `src/coins/admin_handler.rs`、`admin_dto.rs`、`admin_service.rs`         | 真库账户零余额、隐私投影、管理操作查询；浏览器按 UUID 查找并核对目标                                |
| coins.access / credit / reverse 与依赖   | 后端 permissions catalog、authorization；前端 shared/auth/adminPermissions    | 普通管理员仅向 user 操作；管理员目标限超管；超管亦不可给本人入账或冲正；本人钱包不依赖管理权限      |
| 锁与实时权限                             | 同一事务先排序锁 actor + target，再 permissions::lock，最后记账及审计         | 锁等待期间撤权拒绝且零副作用；两个超管相互入账不死锁                                                |
| 请求重放与业务去重                       | 复用核心请求指纹；人工购买/奖励来源；跨类别 `coin_manual_event_once` 唯一索引 | 同键并发只一笔；不同操作者、目标、类别竞争同事件只一笔；变更载荷冲突                                |
| 原人工入账全额冲正                       | 原单派生目标/金额；`reverses_operation_id` 外键、形状约束与唯一索引           | 原单最多一次、独立权限、非人工原单拒绝、余额不足拒绝、并发不同操作者只扣一次                        |
| 审计与账本原子提交                       | 复用 `audit.admin_actions`，账本请求锁内去重审计                              | 注入审计 INSERT 失败，余额/操作/流水整体回滚；成功重试审计不重复                                    |
| COIN-07 C 端钱包                         | `features/coins/CoinsWallet.tsx`、`/account/coins`、导航与 Next redirects     | 精确大整数、失败非零余额、主体隔离、迟到响应；旧 `/student/coins` 在布局门禁前跳转，不依赖学习引导  |
| 客服及获取说明                           | `NEXT_PUBLIC_COINS_SUPPORT_CONTACT` 构建时配置文本；未配置明确显示            | 不编造联系渠道；每日任务/邀请/词表投币标未开放，无虚假领取或在线支付入口                            |
| COIN-08 Admin 本人及运营页面             | `pages/MyCoins.tsx`、`pages/Coins.tsx`、EntriesTable；菜单/路由/账户菜单      | antd v6；确认身份域、UUID、姓名、精确数量；操作员/对象/类型/时间筛选；原单冲正原因与确认            |
| 失败重试和撤权清理                       | 身份与主体 query key；管理查询族清理；coins 授权范围变化重挂操作界面          | 504 显示结果未知并复用原键；无关授权变更不丢键；失权隐藏确认和私有数据；本人钱包不随管理权限消失    |
| 刷新及注销状态                           | 清分页快照并失效查询族；本人余额挂载强制重读且隐藏旧状态                      | 首页→分页→新入账→刷新显示最新流水；SPA 申请/撤销注销后返回钱包正确展示暂停/恢复                     |
| COIN-09 真实组合                         | 生产构建 + 隔离 Rust 服务 + PostgreSQL/Redis                                  | user/admin 两种钱包到账、重放、冲正；pending 拒绝写入；撤销恢复；到期鉴权与一次性余额作废、保留签署 |

B1b 两项恢复签署回归及旧 DELETE 升级错误保持；没有回退到“非零余额不允许注销”，没有新增任意转账 API。

## 迁移、契约与兼容性

- 新迁移 `20261006020000_manual_coins` 为操作表增加原单冲正关联及唯一索引。独立 sqlx 测试验证空表 up/down 与人工记账后 down 拒绝；未在含签署的 `coins_prepare` 执行破坏性 down。
- `cargo sqlx prepare -- --all-targets --all-features` 在隔离准备库执行，`.sqlx` 无差异。新查询参数绑定；SQL 文本组合仅使用固定片段和 typed enum 选择。
- 新增五个 `/admin/coins` 端点；保留 B1 四个本人查询端点与原响应。管理请求/响应 wire 为 snake_case，数量使用十进制字符串，客户端严格验证响应形状和 i64 范围。
- OpenAPI 原生导出；前端显式 `OPENAPI_SOURCE` 指向后端任务 worktree，经原生生成器同步 endpoint 快照、request schemas、query 参数和 runtime 闭包。
- 最终 spec SHA-256：`ca6d57c4fe542f150fd72e5f9f53abe4c660bf4a820945414fffa2086cf7eb92`。快照 `_source` 和 runtime `_source_sha256` 已核对。
- 与 B1b HEAD 的 OpenAPI 比较：既有 paths 没有变化；既有 schemas 仅 ErrorCode 增加 coins 专用错误。新增错误只由新增管理端点使用。Admin profile 的 permissions 为字符串数组，形状不变，旧前端已对未知 key 拒绝授权。
- 新前端访问缺少管理端点的旧 B1 后端会显示失败，不伪造余额或记账成功；404 契约测试覆盖。新前端与新后端通过真实浏览器验证。
- 配套顺序：先满足 B1b 已记录的注销配套发布要求，再发布 B2 后端，随后发布 web/admin。旧 B1 前端可继续读取原契约；先发新管理页面会出现接口不可用。
- 有人工账目后保留 schema，不能 down 删除原单关系；有注销签署后不能回退到不支持 B1b 到期鉴权的代码。旧二进制在新数据上的完整回退演练未执行，不能声称自动回退已验证。
- 当前线上版本、PR、CI run 和部署 manifest 未查询；上述顺序是发布准备，不是实际发布状态。

## 真实验收环境与数据

- 本任务原有 `tsz-coins-b1a-pg` / `tsz-coins-b1a-redis` 容器重启，实际回环端口 `52445` / `52446`；准备库 `coins_prepare`。所有 sqlx 测试单独建库。同时设置 TEST_REDIS_URL 和 REDIS_URL，无共享/生产库访问。
- Rust：`http://127.0.0.1:58350`，从本任务构建结果复制到 `/tmp/coins-b2-runtime/tsz-rust`；独立 cwd、显式隔离连接与临时随机 JWT 密钥。记录二进制哈希、PID、cwd，ready 通过。
- Web：`http://127.0.0.1:58351`，`pnpm --filter @tsz/web build` + `next start`；构建及运行 `BACKEND_API_URL=http://127.0.0.1:58350/api/v1`。没有运行 next dev。
- Admin：`http://127.0.0.1:58352`，Vite 生产 dist，由临时静态服务器提供，`/api/v1` 明确代理到同一后端；相关 mock 开关为 false。没有把 Vite dev 的代理配置当成生产构建的证据。
- 真实 Playwright 脚本 `/tmp/coins-b2-runtime/real-browser.cjs` 不注册 route/mock；记录 29 个 coins/注销响应，7 组真实流程通过。OTP 使用项目现有本地 Mock sender，不声称真实短信送达。
- 用户通过真实注册 API 建立；隔离 fixture 增加 teacher 角色后从旧链接进入同一账号钱包。管理员由 seed 工具及隔离账号 fixture 建立；钱包金额全部经授权 coins API 写入，未手改余额。
- 受控 SQL 仅用于本任务 fixture 的角色/权限和已签署申请的时间边界。最终成功用户被 worker 删除，保留 cancelled + completed 两份签署，closed 钱包和唯一 `-100` 作废流水；管理员钱包全额冲正后为零。
- 中途脚本定位失败留下的用户及历史账本保留在隔离库。管理员中断的测试入账使用正式冲正接口纠正，未删账或清库。数据均为 `coins-b2-*` 邮箱或 B2 验收管理员，不影响其他任务。
- 证据目录 `/tmp/coins-b2-runtime/`：`real-browser-result.json`、`user-wallet-mobile.png`、`pending-wallet.png`、`admin-wallet.png`；已目视检查手机正常与暂停页面，无横向溢出。

## 质量门

- 后端新增 `admin_coins_handler` 7 项通过；进入 admin CI 分区，固定 inventory 为 80 targets；CI 分区/工作流 18 项 Python 测试通过。
- 前端 api-client 465 项通过；全仓普通测试 224 文件，首轮 3345 通过、1 项既有词库向导测试超时、2 项既有跳过。该未改动文件单并发复验 106 项全部通过，未放宽断言或时限。
- 全仓 typecheck/lint 通过，保留既有 2 个 warning；CI 模块/工作流 28 项通过。web/admin 生产构建通过。
- 新 coins mock E2E：web 375/1280 两项、admin 原键重试一项通过；B1b 注销 E2E 四项复验通过。mock 结果与上述真实浏览器证据分别记录。
- 只读独立审查未发现未解决的实质问题。发现的分页缓存、注销状态缓存、5xx 结果未知及无关权限刷新丢键问题均已修复并有回归证明。
- 后端完整回归覆盖全部 80 个集成 target，854 项通过、1 项既有真实 OSS 测试忽略；330 项单元/二进制测试及 doc-tests 通过。全量在管理员 profile 固定旧权限集合处停下，加入新权限后从失败 target 继续，其余有效结果复用；最终覆盖集合核实无缺项。
- 最终 fmt、clippy（all-targets/all-features，`-D warnings`）、`git diff --check` 通过。隔离真链库全局对账的三个差异数及人工操作审计差异均为 0。
- 本任务 web/admin/backend 进程与 PG/Redis 容器已停止；隔离数据及证据保留。

复验命令（容器重启后必须重新读取端口，不照抄历史地址）：

```bash
# 后端任务 worktree；先显式设置隔离 DATABASE_URL / TEST_REDIS_URL / REDIS_URL
SQLX_OFFLINE=true cargo test --locked --all-features --test admin_coins_handler
SQLX_OFFLINE=true cargo test --locked --all-features
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
python3 -m unittest ops/test_ci_test_modules.py ops/test_ci_workflow.py
# 前端任务 worktree
pnpm --filter @tsz/api-client test
pnpm typecheck
pnpm lint
pnpm test --maxWorkers=4
WEB_E2E_PORT=<verified-port> pnpm --filter @tsz/e2e exec playwright test --config=playwright.config.ts coins.spec.ts delete-account.spec.ts
ADMIN_E2E_PORT=<verified-port> pnpm --filter @tsz/e2e exec playwright test --config=playwright.admin.config.ts admin-coins.spec.ts
```

客服真实联系方式仍未提供；使用构建配置或明确未配置状态，不阻塞核心。词表/任务消费未开放，对外售币仍建议等首个真实消费场景具备后开启。
