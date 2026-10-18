# 词表删除后的在途学习宽限

日期：2026-10-18。状态：本地实施与定向验证完成，未提交、未部署。本目录是前后端唯一主记录。

## 目标

管理员或作者删除公开词表后，不再让其他用户已经开始的日常/长期任务立即失效：

- 删除立即停止公开阅读、新任务、新轮次和未开始轮次；
- 删除前已经开始的轮次可以继续到完成；
- 完成后对应任务自动归档，不再开下一轮；
- 已完成于删除前的历史轮次不获得宽限；
- 宽限有上限，长期任务不能永久挂起；
- 平台治理类下架（`withdrawn`）继续立即失效，不适用宽限。

## 规则

### 适用对象

只适用于删除前 `wordlists.state='published'` 的软删除：

- 管理员删除；
- 作者在个人目录移入回收站。

删除前已经是 `draft`、`pending`、`rejected` 或 `withdrawn` 的词表不产生宽限。管理员治理下架还会终止该词表已有的宽限。

不适用于：

- 作者撤回为私密（`state='draft'`）；
- 管理员设为私密；
- 管理员下架（`state='withdrawn'`）；
- 词条归档、发布版本不支持等原有失效条件。

### 宽限判定

一条学习轮次获得某词表宽限，必须同时满足：

1. 删除事件记录删除前状态为 `published`；
2. 轮次在删除前已开始：`run.started_at < deletion.deleted_at`；
3. 该删除发生在轮次完成前；active 轮次直接满足，已完成轮次要求 `completion.completed_at >= deletion.deleted_at`；
4. 删除事件仍在宽限期内：`deletion.grace_until > now()`；
5. 管理员 `withdraw` 治理下架会把该词表已有删除事件的宽限立即终止。

宽限期固定为删除后 7 天。日任务仍受当天窗口约束；长期任务最晚到宽限截止。

删除事件单独持久化，不依赖 `wordlists.deleted_at` 当前值。这样：

- 删除后恢复再删除，不会丢失第一次删除产生的宽限；
- 恢复操作不会让在途轮次突然失效；
- 排查时可以直接查询删除事件、宽限截止和轮次开始/完成时间。

### 可用性

宽限中的轮次：

- 继续使用 `learning_questions.prompt_snapshot` / `answer_snapshot`，不读取已删除词表的实时编排；
- 仍校验词条归档代次和发布内容 schema；词条归档等治理条件优先；
- 不校验词表公开代次、当前成员或作者账号状态；
- 不参与任何新题目生成。

### 完成与结束

宽限轮次完成时：

- 正常写入完成事实、学习奖励和邀请奖励；
- 同一事务内把任务置为 `archived`；
- 取消该任务其他 active 轮次（防御性处理）；
- 之后不能开始新轮次，也不能创建引用已删除词表的新任务。

已完成于删除前的轮次不获得宽限，历史题面继续按原有不可用规则处理。

### 管理员删除影响

后台删除前可读取影响预览：

- 可完成轮次数；
- 涉及任务数与用户数；
- 没有可继续轮次、删除后无法开始的任务数。

删除时给受影响的 active 任务所有者写入一条 `wordlist_deleted` 站内通知，说明：

- 词表已删除；
- 已开始轮次可在宽限截止前完成；
- 完成后任务结束；
- 未开始轮次无法开始。

通知在删除事务内写入，失败则删除回滚。

## 接口与数据

### 迁移

新增 `wordlist_deletion_events`：

- `id`、`wordlist_id`、`deleted_at`、`grace_until`；
- `deleted_by_user_id` / `deleted_by_admin_id` 至多一个；
- `wordlist_id` 不设外键，保留删除事实和排查能力；
- 索引 `(wordlist_id, deleted_at DESC)`。

`user_notifications.kind` 增加 `wordlist_deleted`。

### 后端

- `GET /api/v1/admin/wordlists/{id}/delete-impact`，权限 `wordlists.delete`；
- 管理员删除、作者回收站删除共用删除事件写入与通知 helper；
- 学习来源访问增加按轮次的删除宽限判定；
- 宽限轮次完成后自动归档任务。

### 前端

- Admin 删除确认前读取并展示任务影响；
- Web 通知中心识别 `wordlist_deleted`，提供前往学习任务的入口；
- 不新增学习轮次响应字段，避免旧客户端严格 schema 兼容风险。

## 可观察验收

1. 借用公开词表开始长期任务 → 管理员删除 → 已开始轮次仍 `active`，题面和作答可用；完成后任务 `archived`，新轮次返回 409。
2. 同一场景下新建任务、预览、未开始任务开始均返回 409。
3. 轮次在删除前已完成 → 删除后不获得宽限，题面不可用。
4. 删除后恢复词表 → 在途轮次宽限不丢失。
5. 宽限截止后 → 轮次 `invalidated`，继续作答返回 409。
6. 词条在宽限期间归档 → 轮次仍按原有规则失效。
7. 作者回收站删除与管理员删除行为一致。
8. 管理员影响预览计数与实际任务一致；删除后受影响用户收到通知。
9. 迁移 up/down 在隔离库通过；OpenAPI、`.sqlx`、前端 runtime schema 同步。

## 回退限制

- 新迁移 `20261018070000` 的 down 在已投递 `wordlist_deleted` 通知时拒绝执行，需先归档通知；成功回退会删除删除事件表，宽限立即失去依据，在途轮次按旧逻辑失效。
- 后端迁移与代码必须配套发布。旧后端配新 schema 不会写删除事件；新后端配旧 schema 会在删除时失败，不能作为可用组合。
- 前端可先行：旧后端没有 `delete-impact` 时后台显示读取失败但仍可删除；新通知 kind 对旧前端只是未知字符串，不会破坏严格 schema。

## 剩余依赖

- 7 天宽限为本次产品取舍；后续如调整只影响新删除事件。
- 不实现任务原地更换来源；宽限结束后的恢复方式是新建任务。
- 不恢复“已购永久查看”能力。

## 验证记录（2026-10-18）

后端（隔离 PostgreSQL `127.0.0.1:55441`、Redis `127.0.0.1:6399`）：

- `cargo test --test learning_tasks_handler`：15 项通过。新增覆盖：
  - 管理员删除后，在途轮次继续、完成时自动归档、新轮次/新任务被拒；
  - 删除前已完成的轮次不获得宽限；
  - 删除后恢复词表，宽限仍在；宽限到期后失效；
  - 词条归档仍优先让宽限轮次失效；
  - 作者回收站删除、永久清除条目后，在途轮次仍可用快照完成；
  - 删除与答题并发时，未提交删除不会让等待中的轮次误判失效；
  - 先撤回再删除不会复活已失效轮次；
  - 宽限期间恢复并治理下架会立即终止宽限；
  - 非公开词表的删除影响不承诺宽限；
  - 撤回后重新发布再删除，不会复活旧公开世代的轮次。
- `cargo test --test learning_runs_handler --test wordlists_handler --test wordlists_review --test wordlists_schema`：全部通过。
- `cargo test --lib`：371 项通过；部署迁移 undo 覆盖新迁移版本。
- `cargo fmt --all -- --check`、`cargo clippy --locked --all-features --all-targets -- -D warnings` 通过。
- `wordlists_schema`：3 项通过；迁移 up/down 在隔离库验证，已投递通知时 down 拒绝执行。

前端：

- `pnpm --filter @tsz/api-client test`：559 项通过。
- `pnpm --filter @tsz/web test`：675 项通过；`pnpm --filter @tsz/admin test`：1973 项通过、2 项既有跳过。
- `pnpm typecheck`、`pnpm lint` 通过（lint 仅 3 项既有警告）。
- `pnpm --filter @tsz/web build`、`pnpm --filter @tsz/admin build` 通过。
- OpenAPI 从后端任务 checkout 导出，`@tsz/api-client sync:openapi` 已同步 snapshot 与 runtime schema，contract hash 已更新。

未执行：真实浏览器 + 真实后端联调。当前环境没有准备可登录的完整业务 fixture；handler 集成测试使用真实路由、鉴权令牌和隔离数据库，但不能替代浏览器链路。提交/PR/部署未授权也未执行。
