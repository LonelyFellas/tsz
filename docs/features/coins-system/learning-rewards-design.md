# COIN-12 学习奖励技术设计

日期：2026-10-07。重档：涉及奖励约束、迁移、账本事务、注销审计和跨仓契约。产品规则见 [需求](learning-rewards-requirements.md)，用户已授权按本会话明示口径开工。本轮实现“每日汇总固定一次、自动结算、不补发”，A/N 和实际启用日期尚未确定；默认无政策、不发币。实际检查记录在本文验收末尾。

## 1. 当前基线与剩余依赖

| 仓库 | fetch 后 origin/main / 本工作树 HEAD       | 独立工作树                                                          |
| ---- | ------------------------------------------ | ------------------------------------------------------------------- |
| 后端 | `2e9a11ead83563342d48a53de0db02b42b44a6aa` | `/Users/darwish/.codex/worktrees/coin12-reward-assessment/tsz-rust` |
| 前端 | `c7e27d950750f96dc02af87fd969509fd2304261` | `/Users/darwish/Dev/tsz-core/tsz-coin12-reward-assessment`          |

两仓分支均为 `codex/coin12-reward-assessment`。原主目录无未提交差异；后端主目录 main 落后，前端主目录属于其他任务分支，均未修改。方案仍只在前端本目录维护；两仓实现均位于上述工作树，未提交。旧 LT 工作树只作证据来源。

| 分类             | 当前能力/证据（路径相对各仓根）                                                                                                           | 本次处理                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 已在主线         | LT completion、首答、04:00、来源资格、生命周期；`learning_tasks/service.rs:461`、`repository.rs:79`、`question.rs:133,239`（均在 `src/`） | 直接复用                           |
| 已在主线         | `src/coins/service.rs:223` 的 `credit_in`、双唯一键、savepoint；`src/account_deletion/service.rs:214` 的签署/作废/删除                    | 不重写账本和注销                   |
| 可复用           | 学习恢复、钱包查询、按账号缓存、严格 runtime；`LearningTasks.tsx`、`CoinsWallet.tsx`                                                      | 小范围增加独立奖励读取             |
| 可参考但不可照搬 | `src/invitations/service.rs:53` 的业务不发奖/技术回滚；邀请 env 配置只有启动快照                                                          | 不把邀请金额或配置机制当日规则版本 |
| 新工作           | 日奖励政策、用户/日唯一结算审计、聚合去重、独立奖励 GET/展示、针对性验证                                                                  | 本批实际实现范围                   |
| 启用前待定       | 生产 A/N 与启用日期；实现采用本会话明示口径                                                                                               | 不阻塞默认关闭实现；开启前确认     |

依赖路径：D1～D3 → 窄规则/结算表与末题接入 → 独立契约及 Web → 并发/时界/生命周期/混合版本验收。原 LT 工作量已完成；推荐范围剩余约 2–3 个专注工程日，含隔离验证、不含决策/CI/发布等待；若选择长期按题或补发，须重估。

## 2. 最小结构与未采用方案

采用同库末题事务内结算：既有学习事务已经持有学习者账号锁，同用户跨任务串行；每次最多一笔 `credit_in`。无异步状态需要恢复时，不增加 worker/outbox。关闭/暂停持久记录业务终态，技术故障回滚外层事务。

不采用逐 completion 发奖（新建短任务绕过限额）、仅内存/Redis 计数（并发和重启不可靠）、客户端领币金额、将规则版本放入业务唯一键（换版多领）、在既有 learning DTO 添加奖励字段（旧严格客户端拒绝）。

如果选择“完成绝不受账本失败影响”或恢复后补发，才改为 completion 同事务保存持久 pending 意图，再独立事务结算并保存重试状态；届时须明确历史规则、额度占用、领取/重试期限及注销终结政策。当前设计不能冒充支持该替代方案。

## 3. 拟新增数据与规则生效

新增 additive migration `20261007020000_learning_rewards.up.sql/.down.sql`，不改已发布迁移校验和，不回填完成记录或发币。

### learning_reward_policies：全局按业务日生效的窄配置

- `id uuid PK`、`rule_version text UNIQUE`、`effective_business_day date UNIQUE`、`enabled bool`、`daily_amount bigint nullable`、`minimum_units integer nullable`、`created_at timestamptz`。
- 算法固定 `daily_distinct_units_v1`，时区/04:00 复用既有函数；不提供表达式、任务权重或动态解释器。enabled 必须具有正 i64 金额和合法 N（建议工程范围 1–200），关闭规则可保留空参数；约束与金额 API 校验一致。
- 选择 `effective_business_day <= completion.business_day` 的最新行，规则全日固定。所有进程从同一数据库读取，不依赖各自 env 数值，不为每个用户首次完成时随机选版本。
- 仅通过受审查的配置变更写入未来业务日，首期不做 Admin 编辑端点；发布取固定事务 advisory 独占锁，结算/政策读取取同名共享锁，均持有到 commit。获取后用 `clock_timestamp()` 判断生效日/选择政策，发布 effective day 必须严格晚于当前业务日。这样不会发生发布事务03:59校验通过、04:00后才提交，而结算先读不到政策的竞态。锁序为账号/学习业务锁→政策共享锁→账本；政策发布绝不反向取得账号锁。政策不可 UPDATE/DELETE，不能修改当前/过去规则。
- 空表等于关闭。实现迁移只建结构、不植入金额或启用规则；用户确认数值并另行授权配置后才追加未来规则。首次启用不得选历史/当天日期，开放前完成不补发。常规关闭同样下一业务日生效，不能称为即时紧急熔断。
- 采用窄表而非 env 的理由是全局版本一致、未来日界线生效、不可追改的事实要求；不建设在线规则系统。若产品要求立即关闭或日内调整，须补充一致性语义后修订设计。

### learning_reward_settlements：仅保存用户/日终态

- `id uuid PK`、`user_id uuid`、`business_day date`、`policy_id uuid nullable`、`rule_version/参数快照`、`trigger_completion_id uuid`、`qualifying_units integer`、`status`、`awarded_amount bigint`、`operation_id uuid nullable UNIQUE`、`completed_at/settled_at timestamptz`。
- `(user_id,business_day) UNIQUE`，**不包含 task、completion 或 rule_version**。status 仅 `awarded/reward_disabled/wallet_unavailable`；已发必须正金额、operation 非空且 qualifying_units=N；未发金额 0、operation 空。无政策关闭可 policy=null；其余引用政策并冻结参数。终态记录拒绝 UPDATE/DELETE。
- user/completion UUID 不外键到可删学习/账号表，也不阻止物理删号；operation 引用 `coin_operations` 用 RESTRICT。规则行不可删除。不要保存题面、答案、手机号、备注或来源标题。
- 不保存进行中日行或重复的题目贡献表。未到 N 时实时聚合；达标/关闭终态后停止聚合。业务关闭第一次 daily completion 即保存 disabled；开启时首次达到 N 才决定钱包资格。
- 增加 `learning_completions(user_id,business_day,run_id)` 的 daily 部分索引。聚合本人当日已完成 daily 的 questions.unit_key，`SELECT DISTINCT ... LIMIT N` 后计数；已有 `(run_id,unit_key)` 索引可复用。不得只加 completion.target_count。权限/归属来自受锁的服务端事实。
- 仅存达到门槛的截断数量，不声称它是全量学习统计。数量 N 和触发 completion 可解释该日奖励；删号后不再保留或重建逐题审计。大规模低去重任务仍可能扫描较多行，验收必须检查查询计划/上限；只有实际成本证据要求时再引入随用户删除的去重贡献表。

## 4. 事务、锁、时间和幂等

拟新增内部 `learning_tasks::rewards::settle_completion_in(tx, completion) -> Result<(), AppError>` 与只读日查询函数。不公开任意发币/POST complete，不让前端提交奖励日、规则或数量作为权威输入。

1. `answer` 保持原成功收据探测和事务内重查；原键命中直接回原事实，不再次调用结算。旧 completion 没有奖励审计也不在读取/重放时补发。
2. 依照当前 `begin` 先将 learner+来源所有者按 UUID 锁定，再 task→run→wordlists→entries；插入最后首答、唯一 completion、run completed。保存本次插入的 completion ID 供结算。
3. 仅 daily completion 参与。其 business_day 和 completed_at 均来自服务端；查询本日终态，存在即返回。按业务日选不可变政策，未配置/关闭以 qualifying_units=0 写 disabled（不虚造 N，不发币）；开启则聚合包含本次 completion 的不同 unit_key，低于 N 不写账/终态。
4. 首次达到 N 时核对已有 pending 注销与钱包状态。`deletion_pending/closed` 是明确不发原因，记 wallet_unavailable；未开户视逻辑 open，由 coins 原语安全开户。钱包读取/写入顺序保持账号→奖励业务数据→coins 请求 advisory→source advisory→钱包，不能先锁钱包再调用 coins。
5. 可发奖时创建 `Context { actor:System, source_type:"learning_reward", source_id:"<user_uuid>:<YYYY-MM-DD>", idempotency_scope:"learning_reward", idempotency_key:同source_id, ... }`，从政策快照生成 Amount(A)，至多一次调用 `credit_in`。保持 `kind=credit`，不新增 coins 操作类型枚举。成功后同事务插入 awarded 审计。
6. `credit_in` 会重复获取已有学习者账号锁，这是同一事务已有锁，不是倒序取得新账号；不得带入未预锁的新收款人或系统钱包。既有 user/day 和账本 source 唯一约束分别兜底，冲突不应当作另一个发奖机会。
7. **在新增的所有 SQL/钱包锁等待之后**保留来源、学习者到期与真实数据库时间重查。每日 run 的 expires_at 若 <= 最后检查时刻，整体回滚首答/completion/奖励/余额。不能拿 HTTP 到达时间、事务 now() 或等待前日期越过 04:00/ends_at。
8. 用户锁等待跨日时旧日轮拒绝；钱包锁等待跨日也整笔拒绝。04:00 前成功的原键次日重放仍读原结果，GET 指定原日只读原结算；不重算当日规则，不将历史金额用于新操作。
9. 技术错误（含余额溢出、账本唯一性异常、审计插入失败）必须传播并回滚外层事务，不能凭 coins savepoint 成功回滚就提交 completion。业务不发奖励不制造 0 金额流水。

临界点定义沿用 LT 的“提交前最终数据库时钟校验”，不宣称可预测未来 WAL commit 的物理时刻。若改为长期参与，business_day 为 NULL，须另决定完成日/首答日归属，不能直接复用本候选算法。

## 5. API 与前端具体影响

建议仅新增 `GET /api/v1/me/coins/learning-rewards?business_day=YYYY-MM-DD`，省略日期查当前日，日期上限为当前业务日。历史每日轮次结果传入该 run.business_day，当前任务总览省略日期；不能用浏览器当前日覆盖历史结算日。只读、本人，复用 AuthUser、学生资格与手机门禁；非本人无可传 user_id，权限错误沿用现有 Problem Details。

新增 DTO `LearningRewardDay`：`business_day`、`server_time`、`rule_version` nullable、`minimum_units` nullable、`daily_amount` nullable 十进制正整数字符串、`qualifying_units` 整数、`status`、`awarded_amount` 十进制非负整数字符串、`operation_id` nullable UUID、`settled_at` nullable。status 固定 `in_progress/threshold_not_met/awarded/reward_disabled/wallet_unavailable`；过去未达标日投影 threshold_not_met，当前未达标投影 in_progress。非 awarded 状态 awarded_amount="0" 是服务端明确事实，读取失败则不构造 DTO。

历史日优先终态快照，未结算则按该日政策及仍存在的本人 completion 算进度。当前未到门槛且钱包 pending 时仍可返回 in_progress，由现有钱包暂停状态提示风险；不能提前宣称最终不发。关闭/无政策无 completion 时可只读投影 reward_disabled，GET 不落表。响应中的所有 nullable 字段仍为 required；不添加任意可选杂项。不在本轮新增奖励历史列表，钱包流水已有金额历史。

| 文件/模块                                                                                                    | 预计变更                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 后端 `src/learning_tasks/{mod,service,handler,dto}.rs`、新 `rewards.rs`                                      | 末题接入、日聚合和独立 DTO/GET；不改学习 DTO 字段                        |
| 后端 `src/learning_tasks/handler.rs`、`src/openapi.rs`                                                       | 注册新增 GET 与 schema/query                                             |
| 后端 `migrations/`、`tests/learning_rewards_{schema,handler}.rs`、`ops/ci_test_modules.py`                   | 两表、索引、不可变/形状约束和 CI inventory                               |
| 前端 `packages/types/src/learning-rewards.ts`、`packages/api-client/src/learning-rewards.ts` 及导出/端点工厂 | snake_case 新 DTO、严格解码、金额范围、日期和请求                        |
| `packages/api-client/scripts/sync-openapi.mjs`、`src/runtime-schema.ts` 及相关测试                           | 新 runtime roots/query 操作、生成快照与来源哈希；更新 coins 路径清单断言 |
| `apps/web/src/features/task/components/LearningTasks.tsx`、`features/coins/CoinsWallet.tsx`                  | 独立奖励区域、获取入口、已到账后刷新钱包和流水 snapshot；切号保护        |
| `apps/admin/src/features/coins/EntriesTable.tsx` 的来源标签所在模块                                          | 可选补中文来源标签；不扩人工操作筛选/权限                                |

重要实证：`runtime-schema.ts:335–361` 拒绝额外字段，`learning-tasks.contract.test.ts:18–43` 已拒绝 coins_earned；现有 wallet/entries 也严格。`CoinEntry.source_type` 是 string，旧 Web/Admin 对未知来源用“天生币收支”兜底。因此通过独立 GET 和 string 来源扩展，不修改旧响应形状。

## 6. 生命周期、迁移与回退

- 待注销可完成学习但不能入账；已停用/逻辑到期继续由学习门禁拒绝。最终时间检查在 credit 后仍执行，来源作者跨注销截止同样回滚。
- 物理删号让学习六表级联删除，奖励终态保留随机 user/completion UUID、日期、政策参数、截断数量、金额/原因/operation/时间，不建立阻止删号的学习外键。已发余额随后由既有 closure 流水作废；不修改已发奖励审计，也不因新账号使用同手机号继承日额度或钱包。
- up 仅新增结构和索引，不改 97 条已发布迁移、不扫历史发币。空库 up/down/up；任何政策或结算存在时 down 拒绝。应用事务还须保证 audit.operation 的主体、金额与 source 一致，测试不得仅检查非空 FK。
- 旧二进制因缺少嵌入迁移不能直接启动到新 schema（LT 已实测）；不拿 destructive down、恢复旧即时注销版本或恢复快照丢新账来验证。首选关停后续奖励配置、保留新 schema/兼容后端，前滚修复；后端需回退时专门构建携带新迁移和现有注销门禁的兼容版并先验收。
- 本候选常规关闭需下一日生效；严重故障应按既有运维事故流程控制服务，不能假称已有即时业务开关。本评估不执行配置或任何服务器动作。

## 7. 兼容矩阵和发布依赖

| 组合                         | 设计结论                                                                       | 实施后的必需证据                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 旧 Web/Admin + 新 API/schema | 原 learning/wallet/entries 形状与枚举不变，source_type 为 string，具备兼容条件 | 用旧 runtime bundle 解码新 API 的真实学习和奖励流水响应；跑旧消费者测试 |
| 新 Web + 旧 API/schema       | 奖励 GET 404，明确未就绪，学习/钱包仍可用                                      | 真旧 API 的只读响应 + 新页面降级测试，不用 mock 成功冒充联调            |
| 新 Web/Admin + 新 API/schema | 展示和账本应一致                                                               | 新严格 DTO、生产构建浏览器、实际余额和审计对账                          |
| 新 API + 旧 schema           | 启动自动迁移后才服务；不支持跳过迁移直连旧库                                   | 空库/前版本隔离库启动后新增结构存在，缺迁移时不对外 ready               |
| 旧 API binary + 新 schema    | 不作为可回退组合                                                               | 在一次性隔离库证明拒绝启动；保留数据，验证兼容回退构建                  |

混合版本设计及实际验证范围见本文末尾验收记录；保留 LT 历史证据，不将历史二进制冒充当前 main 精确制品。方案顺序：后端/schema（无启用政策）→ Web → 需要标签时 Admin → 经授权追加未来日政策 → 04:00 生效。金额与日期确认、混合版本证据、各仓 main CI/原生部署门禁都是后续启用前提。本轮不含部署授权。

## 验收

以下是实施验收规格；`learning_rewards_schema/handler` 已创建并登记 CI，实际执行结果见本节末尾。新数据库和 Redis 使用本任务专用容器及已核实空闲端口，DATABASE_URL/REDIS_URL/TEST_REDIS_URL 由隔离环境提供，禁止复用已清理 LT 容器或从历史 private 文件打印凭据。Cargo target 也独立设置。时间通过受控 fixture/锁/测试函数推进，不给生产 API 增加客户端时钟。

| 验收入口                              | 必须实现的断言                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learning_rewards_schema`             | 空库 up/down/up；有政策/奖励拒绝 down；用户/日唯一、不变终态、金额/状态约束；删 user 后学习清除、审计/账/签署保留，无孤立或错主体 operation                                                                                                                                                                                                                                 |
| `learning_rewards_handler` 并发与去重 | 两个不同任务同时跨过 N 只一笔 A；原键响应丢失重试、换键、换任务、换词表/发布不多计同单元；N-1不发、N发、超N仍A；全错有效完成照奖；未完成/失效不计                                                                                                                                                                                                                           |
| 同目标：时间/配置                     | 03:59:59/04:00、锁用户/钱包跨04或ends_at整笔回滚；原成功跨日重放原金额；未来政策切换、并发插入、锁等待越界拒绝、双进程一致；版本不进唯一键；关闭和上线前历史不补                                                                                                                                                                                                            |
| 同目标：生命周期/故障                 | pending 达标不发且完成保存；撤销同日不补、次日重新判；停用/到期拒绝；奖励前故障、credit后审计故障、最终来源资格失效均无半账；余额溢出错误传播；注销和完成并发只出现合法串行结果                                                                                                                                                                                             |
| 同目标：查询成本                      | 受控 fixture 建立同用户同日 10,000 个已完成的一题任务且均为同一 unit_key，N=10；EXPLAIN(ANALYZE,BUFFERS) 验证只查本人当日，并在 statement_timeout=1000ms 内完成聚合（工程验收预算，不是线上 SLA）。再用包含 N 个不同单元的同规模数据证明正确截断。记录机器/数据/计划，若资源正常仍超时则在实施收尾前改用随用户删除的贡献表并补迁移/原子性验收，不通过新增产品任务数限制规避 |
| api-client/Web                        | 缺必填/额外字段/未知状态拒绝；金额超过 JS 安全整数仍精确；奖励读取失败不改学习完成；切号/重放不串缓存或重复庆祝；404降级；到账后刷新流水 snapshot                                                                                                                                                                                                                           |

```bash
# cwd：本次后端工作树，环境仅指向新隔离资源
export CARGO_TARGET_DIR=/tmp/coin12-reward-assessment/cargo-target
SQLX_OFFLINE=true cargo test --locked --all-features --test learning_rewards_schema --test learning_rewards_handler
SQLX_OFFLINE=true cargo test --locked --all-features --test learning_runs_handler --test learning_tasks_handler --test coins_ledger --test account_deletion_worker
python3 -m unittest ops/test_ci_test_modules.py
cargo fmt --all -- --check
cargo sqlx prepare -- --all-targets --all-features
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi

# cwd：本次前端工作树；显式锁定契约来源
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/coin12-reward-assessment/tsz-rust/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/task src/features/coins
```

预期：上述风险断言全部通过，目标加入 CI inventory；生成的 OpenAPI/query roots 无悬空引用、runtime 哈希匹配，旧 DTO 无形状变化。完成阶段一次运行仓库全量门，紧接已授权 ship 时复用原生 hooks，不绕过或重复：

```bash
# 后端
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
SQLX_OFFLINE=true cargo test --locked --all-features
# 前端
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

真实浏览器人工验收：启动隔离 API 与生产 Web 构建 `next start`，记录实际进程 SHA、schema 和规则 fixture（测试金额不代表批准）。学生 A 完成含重复单元的多个任务，跨 N 时截图学习结果、奖励日摘要和钱包；确认一笔 operation、一笔入账、余额只增 A。刷新/丢响应/原键重试、学生 B 切号、旧 API 404、钱包待注销和撤销、移动端 375px 各走可观察路径。使用受控时间测试证明04边界，不改主机时钟。记录对账差异为0后清理本任务服务/容器和缓存，保留脱敏证据。mock测试与真实链证据分别报告。

评估阶段完成两仓 fetch/HEAD/工作树、调用链/严格 schema、历史部署结果、文档链接及 diff 检查；随后用户授权实现。整个过程中未连接生产数据库。

### 本轮实现与验收记录（2026-10-07）

输入为第 1 节两仓 HEAD 加本任务工作区差异，均未提交。用户授权开始实现后，已接入两张窄表、末题同事务结算、独立日奖励 GET、严格 wire 与学习/钱包展示；Admin 仅增加流水来源标签。原 learning/wallet/entries 的 paths 和 schemas 逐项比较保持不变。迁移默认空政策，未把测试金额写成种子或环境默认值。

- 新奖励数据库测试 8 项通过，覆盖跨任务并发/重复单元、全错完成、暂停撤销不补发、读取权限、未来政策和终态约束、技术故障原子回滚、注销作废与独立审计。
- 受控时钟仅存在于独立测试库 `reward_clock` schema 和该测试连接的 search_path，生产没有时钟参数或旁路。先观测事务确实阻塞，再推进至04:00，验证政策发布、政策读取、用户锁与钱包锁等待；旧成功回执返回原日金额，新日不同连接读取同一新版本。
- 性能 fixture：10,000 个已完成的一题任务引用同一单元，N=10；与实现一致的聚合 SQL 在 `statement_timeout=1000ms` 内完成，EXPLAIN 实测约 5.2ms。另一同规模 fixture 含20个不同单元，结果正确截断为10。该耗时只对应本机隔离环境，不是线上 SLA。
- 迁移空库 up/down/up、存在政策/结算拒绝 down 通过。新增父子依赖已同步现有学习/coins 空库 roundtrip 的逆序撤回；既有部署回退测试最新版本常量同步为 `20261007020000`，没有修改 down 防护或使用 CASCADE 删除账目。`cargo sqlx prepare -- --all-targets --all-features` 成功，`.sqlx` 无净差异。
- OpenAPI 已沿原生链导出/同步；SHA-256 `dbc5a948d13ee47707561eb1ef37cd43f33702e74e19c20080c77dda8bc4334f`。api-client 493 项通过，当前学习/奖励 Web 定向17项通过，全仓 typecheck、lint、生产 build 通过；lint 仅两个既有警告。
- 前端全仓普通测试首跑 3430通过、2个既有 WordWizardV3 用例5秒超时、2跳过；保持原超时及断言单独复跑该文件后50通过、2跳过。新增钱包刷新测试另行定向复验通过。未降低门禁、排除有业务逻辑的代码或绕过hooks。
- 真实 Chromium 使用本任务生产 build＋next start→同源代理→隔离 API，无 API mock：真实登录、全错完成、自动奖励、刷新恢复、钱包唯一流水、手动刷新通过；375px无横向溢出，桌面和手机截图人工查看通过。fixture 数值为13币/2题，**只用于测试**；prepare库最终只有1笔学习奖励、1笔入账、1条奖励终态、余额13。
- 旧主线 runtime 对新 API 的真实 LearningRun/CoinWallet/CoinEntryPage 全部解码通过。新生产 Web 连接保留的旧 LT 验收二进制和独立旧schema时，奖励404显示未就绪，原学习列表和钱包可用。该历史二进制并非当前 main 的精确部署制品；其连接新schema实测因缺少 `20261007020000` 拒绝启动，未执行破坏性down。实际发布仍须使用届时两仓main成功CI制品并核对来源。
- 本轮两项只读复核已收口；修复了钱包刷新遗漏奖励查询、解码器未拒绝矛盾成功状态的问题，相关测试已通过。

证据集中 `/tmp/coin12-reward-assessment/`：`provenance.json` 记录两仓来源与文件哈希，`browser-result.json`/`compatibility.json` 为真实链和混合版本结果，`targeted.log`/`time-locks.log`/`frontend-contract.log`/`frontend-ui.log`/`admin-recheck.log` 为定向记录；失败及修复原因见 `initial-failures.json`，不把重跑前失败隐去。临时fixture脚本在该目录保存，未留在仓库测试目标中。

后端最终 `cargo test --locked --all-features --no-fail-fast`：1245项通过、0失败，包含91个集成目标；最终 Clippy `-D warnings`、fmt 和18项 CI inventory/workflow检查通过。前两次全量失败为新增迁移引起的既有测试基线/撤回顺序遗漏，修复后完整重跑通过，未放宽业务断言。API/Web/旧API均已停止，`tsz-coin12-pg`、`tsz-coin12-redis` 及匿名卷和本任务独立 Cargo 缓存已删除；保留脱敏证据、截图、脚本及与浏览器验收哈希一致的 `tsz-rust` 二进制。后续重验需新建隔离资源。生产 A/N、启用日期和发布授权未提供，本次不启用任何真实发币政策，不提交、推送、合并或部署。

### 本地提交授权（2026-10-07）

用户在本轮验收完成后要求“那就提交吧”。本次按本地提交处理，两仓任务分支分别提交，沿用既有验收证据并正常执行原生 hooks；随后对精确提交进行独立复核。本次未授权推送、PR、合并、部署或启用奖励。前述“未提交”属于实现收尾时点，不代表后续提交未获授权。
