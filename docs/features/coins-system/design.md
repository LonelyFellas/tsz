# 天生币系统技术方案

维护位置：`/Users/darwish/Dev/tsz-core/tsz-coins-b1a/docs/features/coins-system/` 是本次实施的唯一维护目录；`9adc` 工作区保留为只读评估来源。
状态：2026-10-06 B1a（COIN-01～03）已实现并验收；记录见 [b1a-acceptance.md](b1a-acceptance.md)。业务范围、批次和决定记录见 [requirements.md](requirements.md)。

实施任务、依赖和状态见 [tasks.md](tasks.md)。

注销规则已按用户后续要求替换：有余额须签署放弃，申请成功起等待连续 72 小时，期间允许撤销并暂停钱包收支；到期生效并记余额作废。本文不再采用“非零余额不能申请注销”。

## 1. 基线与事实来源

本次为重档评估：涉及数据库迁移、接口、身份/权限和两端消费者。文档集中在前端任务仓，实施时后端引用此处，不维护另一份重复方案。

| 仓库     | 评估输入                                                          | 工作区                                                                                                                              |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| tsz      | fetch 后 `origin/main = 78efe657c3ee7d2610293d5b989ab249eda5adfe` | `/Users/darwish/.codex/worktrees/9adc/tsz`；从该基线建立 `codex/coins-system-assessment`，仅写本目录文档                            |
| tsz-rust | fetch 后 `origin/main = 035d1dd4fa94c7278a0c9ea65f6799096bb6aa94` | `/Users/darwish/Dev/tsz-core/tsz-rust` 本地 HEAD 为 `4b7df46`、落后主线；以 `git show origin/main:<path>` 检查主线，未切换/修改该仓 |

以上是代码基线，不是线上部署版本。本次未读取生产数据库或部署 manifest。

| 分类               | 能力与证据                                                                                                              | 对方案的影响                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 已在主线、直接复用 | 后端 `src/auth/extract.rs`、`src/admin/extract.rs`：身份域分离与账户有效性检查                                          | 按账号域绑定钱包，不新增登录体系，不按角色/手机号开多个钱包 |
| 已在主线、直接复用 | 后端 `src/admin/permissions/mod.rs` 的 `lock`；`catalog.rs`；`authorization.rs` 路由权限检查                            | 入账事务重读权限；新端点登记权限目录和路由契约              |
| 已在主线、直接复用 | 后端 `src/admin/permissions/service.rs` 的 `audit`、`audit.admin_actions`                                               | 人工入账同事务审计，不新建平行审计系统                      |
| 已在主线、直接复用 | PostgreSQL / SQLx 事务、`#[sqlx::test]`、`src/state.rs` 的测试装配                                                      | 用真实数据库证明并发和原子性，不用内存假账本代替            |
| 小改动             | 前端 `ProfileHub.tsx`、`MainNav.tsx`、`adminPageRoutes.ts`、`ConsoleSidebar.tsx`                                        | 复用导航、守卫、请求、分页与 antd；菜单占位不等于已拥有 API |
| 新工作             | `CoinsPanel.tsx` 只有默认零余额；Admin 用户 `coin_balance` 是契约外占位；后端无 coins/wallet 模块、表或 OpenAPI         | 必须建设账本、真实查询和双端页面；不迁移 mock 余额          |
| 上游未就绪         | `useWordLists.ts` 使用 `MOCK_WORDLISTS`；详情为占位；`PracticeBoard.tsx` 为占位；api-client `PENDING` 包含词表/任务端点 | 投币和打卡不是给现成事件挂回调，需要业务模块先落地          |
| 部分可复用         | 后端 `src/auth/handler.rs` 注册已在一个事务中创建账号、角色和会话，但无邀请关系/归因                                    | B4 能复用注册事务，邀请业务本身仍需新建                     |
| 必须协调           | 后端 `src/user/repository.rs:238–265` 注销锁用户后物理删除；Admin 当前只有停用                                          | 不能用级联外键删账，也不能直接新增 RESTRICT 改坏既有注销    |

早期架构文档中关于“没有细粒度权限”的说法已过时，以上述主线源码为准。

## 2. 模块边界与依赖

```text
现有 users / admins 身份 + PostgreSQL + 权限 / 审计
                         ↓
             B1 coins：钱包 / 操作 / 流水
                         ↓
             B2 双端钱包 + 后台人工入账
                  ↙      ↓       ↘
       B3 词表投币   B4 邀请奖励   B5 任务奖励
           ↑             ↑            ↑
       真实词表业务    注册归因业务    真实完成记录
```

- 在现有 Rust 服务内增加 `src/coins/`，沿用具体 repository、service、handler、router 的组织方式。
- 核心调用输入为可信主体、正整数数量、操作类型、业务来源、唯一键及必要说明；不解释“完成多少题”“词表质量高不高”。
- 建议服务签名方向：`credit_in(connection, command)`、`debit_in(connection, command)`、`transfer_in(connection, command)`，传入已有 `PgConnection`，由调用方管理完整事务，不在内部偷偷提交。
- B1 内部能力经真库验证，但不给浏览器开放任意发放/扣除/转账接口；B2 管理 handler、B3 业务 handler 分别检查权限与业务资格。
- 后续同库业务把事实与记账放在同一事务：任务完成记录+奖励、邀请绑定+奖励、投币记录+双边流水。若未来有真实异步需求，再设计事务 outbox，不在提交后用无持久化保障的后台任务发币。
- 批量导入、通用规则引擎、独立微服务、多币种/复式财务账不是当前问题所需，不纳入首期。

## 3. 数据模型

coins 核心建议三张表；B1b 在账号模块另加持久化注销申请表。B1a 实际迁移为 `20261006000000_coins`；字段与查询契约以本批生成 OpenAPI 为准。所有既有账户从零开始，不伪造历史交易。

| 表                | 最小字段                                                                                                                         | 约束                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `coin_wallets`    | `id`、`owner_type`、`owner_id`、`balance`、`status`、`created_at`、`updated_at`                                                  | `(owner_type, owner_id)` 唯一；身份 user/admin；非负余额；状态 open/deletion_pending/closed |
| `coin_operations` | `id`、`kind`、`actor_type/id`、`idempotency_scope/key`、`request_hash`、`source_type/id`、`reason`、`evidence_ref`、`created_at` | 请求幂等唯一；非空业务来源唯一；一行代表一笔完整操作；不存可被外部篡改的任意执行参数        |
| `coin_entries`    | `id`、`operation_id`、`wallet_id`、`delta`、`balance_after`、`created_at`                                                        | 引用操作与钱包，均不级联删除；`delta != 0`；一笔操作在同一钱包最多一条流水                  |

- `owner_id` 是带身份类型的稳定 UUID，不是手机号。跨两个主体表不能伪造一条通用 FK；建议用开户事务锁定并校验真实主体，钱包独立保留 UUID。账内外键始终指向永久的钱包/操作。
- 该选择牺牲数据库对跨身份主体的直接 FK 校验，换取与现有物理注销兼容；必须在全部开户/写账入口做事务校验并有注销竞态测试。无需为此重写为全局软删除账号。
- 首次查询没有物理钱包时返回明确的逻辑零余额和空流水；首次写入用唯一约束保证只创建一个钱包。缺少账户或请求失败不能被当作零余额。
- 建议 PostgreSQL `BIGINT` 存整数币，wire 的 `amount`、`balance`、`delta` 为十进制字符串，避免 JS Number 丢精度。数量输入必须为正整数且在 i64 范围内，余额运算检查溢出；前端不使用浮点计算。
- `request_hash` 是规范化业务载荷指纹，不含时间戳/HTTP request_id 等易变字段。改金额、对象、原因或凭据后不可复用原幂等键。
- 人工入账类别为购买/奖励；核心操作类型区分发行、扣除和转账。调用方不能只换业务分类绕过同一核验单号或奖励事件的唯一性。
- 转账写一条负流水与一条等额正流水；发行写一条正流水，销毁/纠错扣除写负流水。对账按操作类型核实，不声称所有发行操作本身都正负平衡。
- 不存密码、联系方式快照或完整付款敏感数据。凭据引用只在管理端可见；图片需求若成立，复用私有存储模式但不借用教师认证等其他领域的授权路由。

## 4. 原子性、幂等与生命周期

### 4.1 事务路径

1. 解析并验证参数、身份域和金额；根据用途选择后台授权或业务校验。
2. 在同一事务内先构造操作者、付款方、收款方的去重主体集合，按类型+ID 固定顺序取得 `FOR SHARE` 锁，再调用现有 `permissions::lock` 重读管理员权限。不能提前锁操作者后才排序其他主体；普通写账不升级主体锁，注销/停用等待主体锁释放。
3. 串行化相同幂等作用域/键，并核对已存在操作；同请求返回已提交操作，不重复执行。权限已撤销时仍拒绝访问，不借幂等回放绕过授权。
4. 开户或取得钱包；多钱包按稳定 ID 顺序锁定，再检查可写状态、余额及业务条件。
5. 写操作、变动余额、写流水；人工操作同事务写管理审计。由最外层提交，一处失败全部回滚。

幂等可沿用现有词库“事务锁 + 已存操作 + 请求指纹”的模式，但 coins 使用自己的记录，不把账本塞进词库表。数据库唯一约束是最终防线；不依赖 Redis TTL 去重。

同一奖励的 `source_id` 由服务端业务事实生成（如用户/业务日/任务完成记录），不含会导致重发的规则版本。规则版本可记录在说明中；变更规则不自动补发旧事件。

`source_type/source_id` 标识唯一记账事件，不能直接用 `wordlist_id` 标识投币事件。每次真实投币应有独立的业务投币 ID，重试沿用该 ID；词表关联放在业务投币记录中。这样同一词表可收到多次真实投币，同时不会因请求重试重复转账。

人工购买使用稳定核验单号才能拦截“换幂等键、换操作员”后的重复入账。备注或相同截图无法充当可靠唯一业务编号。UI 成功前保持原键，超时重试复用该键，修改表单视为新请求。

### 4.2 注销与停用

生命周期由账号模块管理，coins 只提供暂停、恢复、到期作废和关闭钱包的事务能力。本次改 C 端注销，Admin 当前仅停用，不顺带新增自助注销入口。

**持久状态与签署记录**

- 新增账号域 `account_deletion_requests`：`id`、`user_id`、`status`（pending/cancelled/completed）、`requested_at`、`effective_at`、`cancelled_at`、`completed_at`、`confirmed_balance`、`waive_balance`、`consent_version`、签署正文/摘要、`signed_at`、身份核验渠道，以及请求幂等键和载荷指纹。
- 同一用户最多一个 pending 申请；表不对 users 设置级联删除。保存必要的签署与执行证据，不记录 OTP 明文，不从当前协议文案反推历史签署内容。
- 用户看到当前余额和完整声明；余额大于零时需主动确认“账号注销生效时放弃所示余额”，默认不勾选，再通过现有本人在档渠道验证码核验。未签署或明确不放弃时不接受注销申请，不能强制替用户勾选。零余额仍需确认注销和 72 小时规则。
- 金额、声明版本和主动同意由后端校验，签署时间/生效时间取服务端。前端提交 `expected_coin_balance`；事务锁内实值不符返回冲突并要求重新展示签署，不能接受宽泛的“放弃一切未来余额”。

**申请与撤销**

1. 申请时先锁用户并检查当前申请及幂等记录，再锁钱包，校验验证码和签署载荷，将钱包置为 `deletion_pending`，余额保持不变；同事务保存申请，`effective_at = requested_at + 72 hours`。未开户的零余额账号在本事务创建零余额钱包并暂停，不伪造流水、不留“没有钱包就能新入账”的旁路。
2. 已有申请的同意图重试返回原申请，不重置时间、不要求已消费 OTP 再验证；同键异载荷冲突。响应不确定时通过状态查询恢复，不能默认为注销成功。新的不同意图也不能覆盖已有申请及签署金额。
3. 等待期钱包拒绝所有入账、支出及人工冲正，不以超级管理员或系统奖励绕过；不新增自动补发队列。业务接入时必须识别此状态，不能把失败入账标为已完成。
4. 等待期内用户可继续登录查看状态并显式撤销；登录本身不自动撤销。注销不会在申请时吊销全部会话或删除数据；既有停用/安全门禁仍有效。
5. 撤销在事务中按“用户→申请→钱包”顺序锁定并检查数据库当前时间严格小于生效时间，将申请标 cancelled，钱包恢复 open，余额与流水原样保留。撤销不覆盖其他停用限制。重复撤销幂等；到期拒绝撤销，即使后台执行还未完成。
6. 撤销后再次申请是新申请，需要重新核验与签署，重新计算 72 小时。旧幂等键只能返回旧申请结果，不能复活已取消申请。

**到期生效与后台执行**

- 以 `effective_at` 判定逻辑注销，零余额同样等待满 72 小时。到期后登录、refresh 和每请求鉴权均拒绝业务访问，旧 access token 不能因为未过期或 worker 延迟继续使用；仅禁止登录不足以满足要求。
- 到期判断使用数据库 `clock_timestamp()`，在取得相关锁后重新读取实际时间，不能用事务开始时固定的 `now()` 放过等待锁期间已到期的请求。现有 refresh 在 handler 外层做有效性检查还不够，必须在 `src/session/repository.rs` 的锁后轮换事务内复查；敏感写入的 `src/auth/security.rs` 锁后校验同样复用到期判断。
- 在现有 Rust 后端中增加可重启的轮询 worker，从数据库读取到期申请，多实例通过数据库锁和状态条件争抢；不使用内存延时任务或客户端计时器。先锁用户，再锁申请并重新检查，再锁钱包，和撤销/写账保持统一锁序。
- worker 先无锁读取候选 ID，再逐条按上述顺序锁定和执行；不能先用 `FOR UPDATE SKIP LOCKED` 锁申请再去锁用户，否则与撤销形成反向锁序。已有文件清理 worker 可复用装配方式，不能机械照搬它的资源锁序。
- 最终事务检查签署证据与暂停余额一致；余额大于零时，用申请 ID 作唯一业务来源写 `account_closure_forfeit` 负流水，将余额归零，再关闭钱包、安排既有头像/材料清理、吊销会话、物理删除用户并标记申请 completed。余额为零不伪造零金额流水。
- 删除、余额作废和申请完成在同一事务提交，失败整体回滚并保留可重试申请；不同 worker、重启和重复任务最多产生一次作废。异常金额不一致不得擅自多扣或删号，保留现场并报错处理。
- 逻辑到期与存储清理分开：72 小时一到即失去账户使用资格，物理清理可能因 worker 调度或故障稍晚完成，恢复后补做。界面不在物理清理尚未完成时宣称所有数据已删除。若服务停机，到期记录仍保留，恢复时先按到期门禁拒绝使用。
- 历史账本及签署记录不级联删除，仅留必要的稳定主体 UUID；重新注册的新 user ID 不继承旧钱包。已确认放弃并执行后不恢复余额。

**停用与人工纠错**

- 非注销的账号停用保留余额并拒绝写账，恢复资格不应顺便取消 pending 注销；这些状态独立校验。
- B2 原人工入账的全额冲正继续使用 `reverses_operation_id` 唯一约束、独立权限、原因和同事务审计；不能用于提前清理注销余额，待注销钱包不得冲正。不扩展为退款/债务模块。

### 4.3 对账

- 每个钱包：`balance = sum(entries.delta)`，初始为零；写后余额按钱包实际序列核对。
- 每笔转账：两条流水、不同钱包、变动和为零。
- 全局：所有钱包（含关闭钱包）余额合计 = 累计发行 − 累计销毁；转账不改变总量。
- B1 提供测试及只读查询用于核对，不先做监控平台。发现不一致停止有关写入并追因，不运行自动“修正余额”脚本掩盖问题。

## 5. API 与前端接入草案

下列均为拟新增端点，不代表当前后端已有。最终契约由后端 OpenAPI 生成，前端不能先将臆造路径当成可用。

| 批次 | 方法与路径（统一前缀 `/api/v1`）                            | 边界                                                                                 |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| B1   | `GET /me/coins/wallet`、`GET /me/coins/entries`             | C 端本人，身份取认证上下文                                                           |
| B1   | `GET /admin/me/coins/wallet`、`GET /admin/me/coins/entries` | 管理员本人，不要求拥有发币或查询他人权限                                             |
| B1b  | `GET /me/account-deletion`                                  | 本人申请状态、生效时间与签署余额；用于恢复响应不确定状态                             |
| B1b  | `POST /me/account-deletion`                                 | 验证码、余额快照、声明版本、放弃确认及幂等键；202 返回申请对象，不能宣称立即注销     |
| B1b  | `POST /me/account-deletion/{id}/cancel`                     | 仅本人、截止前显式撤销；重复撤销幂等，截止后拒绝                                     |
| B2   | `GET /admin/coins/accounts`                                 | 有权限的账户查找，区分 user/admin，包含未开户的零余额投影                            |
| B2   | `GET /admin/coins/accounts/{owner_type}/{owner_id}/entries` | 查询指定主体流水，不复用个人 API 越权读他人                                          |
| B2   | `POST /admin/coins/manual-credits`                          | 显式幂等键；目标、数量、购买/奖励、原因、核验引用；操作人由认证得到                  |
| B2   | `POST /admin/coins/manual-credits/{operation_id}/reversal`  | 仅原人工入账全额冲正；服务端从原单确定对象与数量；幂等键与原因必填；独立权限         |
| B2   | `GET /admin/coins/operations`                               | 管理操作记录，按对象、类型、时间、操作者查询，内部备注仅管理投影                     |
| B3   | `POST /wordlists/{id}/tips`                                 | 词表业务鉴权并服务端确定作者，不能相信客户端传入收款钱包；Admin 入口另按业务身份评估 |

- B1/B2 不改变现有登录、profile 或用户列表响应的形状；余额先由专用端点读取，避免给严格消费者随意加字段。
- 错误沿用 Problem Details。拟新增稳定错误码：余额不足、钱包关闭、幂等载荷冲突、业务事件已入账、金额非法；具体状态码/命名在 OpenAPI 收口，前端不匹配自然语言。
- 查询复用现有分页信封，并使用稳定排序。流水响应可携带快照边界/游标避免新增入账导致翻页重复；不要求每次实时新增都冻结整页。
- 后台复用 `coins.access` 作为管理查询权限，新增 `coins.credit`（人工入账）和 `coins.reverse`（冲正），两者分别依赖 access。普通获授权管理员操作 C 端钱包；目标是管理员钱包时额外要求超管。包括超管在内均禁止对本人钱包人工入账或冲正；个人钱包查询不需要这些管理权限。
- C 端建议真实钱包放 `/account/coins`，教师/学生均可访问；旧 `/student/coins` 链接保留兼容跳转。页面只需账号登录，不应依赖学习难度引导。
- Admin 个人钱包从账号菜单进入；“天生币管理”侧栏放账户/流水/人工入账。继续使用 antd，不引入 `@tsz/ui`。
- 公共 wire 类型放 `packages/types/src/coins.ts`；请求放 `packages/api-client/src/coins.ts` 并接入现有端点工厂；UI 按端分开。共享整数格式化仅在确实两端使用时更新 `@tsz/shared`，兼容现有数字调用。
- 所有钱包 query key 包含身份域和主体 ID，退出登录清理缓存。只读失败显示错误，不能回落到伪造零余额。

## 6. 主要文件影响与分批接入约束

| 范围          | 预计位置                                                                                                                                                          | 变更原则                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| B1 后端       | `src/coins/*`、`migrations/*_coins.up.sql` / `.down.sql`、`src/lib.rs`、`src/openapi.rs`、现有路由与错误码装配                                                    | 新模块集中处理账，不往 auth/user 模型里塞余额                                                       |
| B1b 生命周期  | 新 `src/account_deletion/*`、`src/auth/handler.rs`、`src/auth/extract.rs`、`src/auth/security.rs`、`src/session/repository.rs`、user 删除及文件清理调用；独立迁移 | 账号模块调度注销；申请/撤销/worker 锁序一致；登录、refresh、旧 token 和敏感写入均按实际截止时间校验 |
| B1/B2 权限    | `src/admin/permissions/catalog.rs`、`src/admin/authorization.rs`、admin router                                                                                    | 利用现有授权事务与审计函数，不复制一套 RBAC                                                         |
| B1 验证       | 新 `tests/coins_*.rs`、`ops/ci_test_modules.py`                                                                                                                   | 新测试必须纳入 CI 分桶；不能只在本地执行                                                            |
| B1b/B2 契约   | `packages/types/src/auth.ts` / `coins.ts`、`packages/api-client/src/endpoints.ts` / `coins.ts`、生成快照与契约测试                                                | 新注销申请返回状态对象，旧 void DELETE 不复用；coins 使用 snake_case 严格校验                       |
| B1b/B2 Web    | `DeleteAccountForm.tsx` 及测试、账号注销状态/撤销页；`features/coins/*`、账号钱包路由、ProfileHub、MainNav                                                        | 申请成功显示等待与撤销，不清会话宣称已删除；钱包按状态只读/暂停；实际终止会话整页跳转               |
| B2 Admin      | `features/coins/*`、`pages/*`、`router.tsx`、`lib/adminPageRoutes.ts`、`ConsoleSidebar`、`AdminHeader`                                                            | 个人钱包与管理权限分开；用户管理的占位操作可跳转筛选后的账户页                                      |
| B1b/B2 浏览器 | 注销签署/等待/撤销 E2E、新 coins specs、两个 Playwright 配置                                                                                                      | Admin spec 登记 testMatch 与 Web testIgnore；时间边界由受控时钟/测试数据验证，不真实等待三天        |
| B3/B4/B5      | 各自业务 service/DTO/handler 和对应页面                                                                                                                           | 业务事件只负责可信事实、资格和金额，调用同一 coins service，不重复维护余额                          |

现有 Admin 首页币流通图是 mock；B2 核心页面不得使用这些数值宣称真实统计。是否同期替换首页图表另行限定，不把数据看板扩成首期前置。

## 7. 迁移、发布与回退

- B1a 新建三张账表并提供钱包暂停状态；B1b 增加账号域注销申请表并接入该状态。up/down 成对；down 在存在账目或注销申请/签署记录时拒绝，不能删除账本或证据。
- 按原生迁移顺序建钱包、操作、流水，再建注销申请及约束索引。迁移不自动替现有用户申请注销，不触发历史奖励补发。
- B1a 核心可先交付；B1b 涉及前后端注销契约变更，必须配套验证完成后，B2 才开放真实入账。
- 现有 `DELETE /auth/account` 是立即删除且返回 204，旧 Web 收到成功后立即清会话并展示已注销，不能直接将其改为 202 并认为兼容。新流程使用明确的注销申请/状态/撤销端点；新后端将旧立即删除端点收口为明确的升级错误且不删除、不消费 OTP，不能留下绕过签署或 72 小时的旁路。
- 可先发布兼容旧环境但不回退到立即删除的新注销前端（新接口缺失时明确不可用），再发布新后端并验收。若采用后端先发，旧页面将短暂无法申请注销，必须明确维护影响；不能把 204/202 语义混用当作无缝升级。无论顺序，切换后旧客户端也不能立即删号。
- 新前端+旧后端：缺失 coins API 不能显示假余额或已成功入账。发布前避免开放新入口；回退时先关闭/回退相应入口。
- 新前端+新后端：必须完成 user/admin 两种真实钱包闭环和失败路径；mock E2E 不能代替它。
- 一旦存在注销申请（即使余额为零），就不能退回不认识等待期的旧代码：旧版本会允许到期用户继续使用或立即删除，绕过签署、撤销及余额处置。回退版本必须保留申请状态、到期鉴权与幂等执行能力；不能静默取消申请或重新计算期限。
- 权限目录回退也需核对已有新权限授予数据和旧代码兼容性。应用回退、schema 回退分别评估；不把恢复旧数据库快照当作日常回退方案。
- 未涉及本次实现的共享接口保持原样；各业务批次各自同步 OpenAPI，使用原生 hooks/CI 与部署门禁，不额外建平行发布机制。

## 8. 验收

以下是实施后的验收方案，不是本轮已执行的测试报告。拟新增测试目标在对应批次创建后才能运行。

### 8.1 风险断言

| 批次 | 必须证明的可观察行为                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | 同键并发只发行一次；不同键同业务来源仍只一次；冲突请求零副作用；不同身份同 UUID 不串账；并发开户唯一；多笔扣款不透支；转账失败两边均不变；注销/停用与写账串行；金额边界不丢精度；对账为零差异                                                                           |
| B1b  | 未签署/余额变动拒绝申请；零余额也等 72 小时；重复申请不重置期限；暂停期所有收支失败；撤销保留原币且再次申请重新签署；恰好到期不能撤销；等待锁跨越截止时仍拒绝；旧 token/登录/refresh 均不能越过到期；服务重启和多 worker 只作废一次；故障回滚；旧 DELETE 无立即删除旁路 |
| B2   | 两类账户人工入账成功；账户选错前可核对；重复购买单号被拒绝；未知结果复用键重试；撤权后在途操作不能绕过事务检查；内部备注不出现在本人流水；切换账号不泄露上一个钱包；断网不是零余额                                                                                      |
| B3   | 收款人由真实词表决定；不可投状态/作者失效拒绝；自己投自己按确认规则处理；投币只转移总量；同意图重试一次、两次真实投币可分别记账                                                                                                                                         |
| B4   | 邀请归因不可二次更改；注册与奖励事务失败完整回滚；同一新用户不能让多个邀请人获奖；修改奖励配置不能让旧事件重新发放                                                                                                                                                      |
| B5   | 服务器认定完成；业务日与上限口径正确；同日多任务/延迟提交/重复事件结算符合规则；前端传入任意奖励数量不能生效                                                                                                                                                            |

### 8.2 可执行命令

后端实施 worktree：先准备具备创建测试库权限的隔离 PostgreSQL；`#[sqlx::test]` 使用隔离库。仅真正经过 OTP/会话 Redis 路径的测试需要隔离 Redis。不得指向生产或共享业务库。

```bash
# B1 新增目标落地后；SQLX_OFFLINE 不代替运行期数据库。
SQLX_OFFLINE=true cargo test --locked --all-features --test coins_ledger
SQLX_OFFLINE=true cargo test --locked --all-features --test coins_handler
# B1b 现有及新增目标；新增 worker 测试必须登记 CI 分桶。
SQLX_OFFLINE=true cargo test --locked --all-features --test account_deletion_handler
SQLX_OFFLINE=true cargo test --locked --all-features --test account_deletion_worker
SQLX_OFFLINE=true cargo test --locked --all-features --test auth_extract
SQLX_OFFLINE=true cargo test --locked --all-features --test auth_refresh_handler
# B2 新增目标落地后。
SQLX_OFFLINE=true cargo test --locked --all-features --test admin_coins_handler
python3 -m unittest ops/test_ci_test_modules.py ops/test_ci_workflow.py
# 每个可交付批次收尾运行原生完整门禁；与紧接的 ship 门禁复用。
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
SQLX_OFFLINE=true cargo test --locked --all-features
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
```

前端实施 worktree：`tsz_backend_root` 指向已经核验的本批后端绝对路径，不默认使用本轮落后主线的后端 checkout。

```bash
tsz_backend_root=/absolute/path/to/verified/backend-worktree
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE="$tsz_backend_root/docs/openapi.json" pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
pnpm typecheck
pnpm lint
pnpm test
# 两个新 spec 落地并登记配置后，运行对应生产构建浏览器路径。
pnpm --filter @tsz/e2e exec playwright test --config=playwright.config.ts coins.spec.ts
pnpm --filter @tsz/e2e exec playwright test --config=playwright.admin.config.ts admin-coins.spec.ts
```

预期：所有本批断言通过，金额与流水逐笔可核对，OpenAPI 与客户端一致，既有账户安全行为不退化；原立即注销测试需按已批准的新语义更新，不能为保留旧断言而继续立即删号。时间测试使用受控数据/时钟验证截止前、恰好到期、截止后与等待锁跨期，不实际等待三天。实施期间先跑定向检查，完成每个交付批次统一全量检查，不重复为单个页面跑完整门禁。

真实联调必须额外核实服务进程与版本。Web 使用 `pnpm build` + `next start`，Admin 使用构建产物；在隔离环境创建明确的测试 user/admin，完成 100 币人工入账、同请求重试仍为 100、其他账号不可读取，B3 再验证转出 30 后双方为 70/30。此步骤当前为人工验收方案，逐步记录请求、账目和余额；浏览器 mock 通过不算真实联调完成。
