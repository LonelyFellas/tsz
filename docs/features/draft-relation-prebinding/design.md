# 关联词支持草稿词条预绑定：技术设计

> 状态：2026-08-30 已按评审结论实现并完成本地自动化验收；未提交、推送、发布或部署。
>
> 本文是方案，不是实现记录。评审前不创建 migration、不修改 OpenAPI/接口、不写业务或测试代码。
>
> 产品域**没有 V3/V2 版本概念**，统一称“当前最新词条功能/最新词条模型”。本文后续出现的
> `V3`、`v3`、`schema_version = 3` 只是在当前仓库中真实存在的代码标识、wire 判别值和文件名，不是
> 产品能力分层，也不得出现在面向管理员的文案中。

## 1. 结论摘要

推荐新增独立稳定字段：

- wire：`prebound_target_word_id`
- DB：`lexicon.relations.prebound_target_entry_id`
- DB 服务端状态：`prebinding_reason = waiting_first_sense | target_sense_deleted`

Admin 关联词表格第三列不新增 ID 控件，只保留现有 `pending_target_gloss` 输入。管理员选择搜索候选时，
组件在表单模型中写入 `prebound_target_word_id`；该字段只在 wire/DB 中承担稳定身份语义，不作为产品
字段展示。`pending_target_gloss` 仍是可选释义文本，不能替代稳定 ID。

不复用 `pending_target_word_id`：`pending` 目前同时覆盖“库里还没有目标”的文本 pending，名字会把
“无身份的待建词”和“已锁定某个草稿”混为一谈。不复用半套 `target_word_id`：现有前后端大量逻辑
把 `target_word_id + target_sense_id` 当完整正式绑定，单独出现 `target_word_id` 容易被旧代码误判、
保存时丢失或在发布物化路径中被错误消费。

自动转正/退回放在**目标最新词条 meanings 保存事务**中同步完成；当前代码落点是
`save_meanings_v3`。不使用异步事件作为主路径。目标内容、
所有受影响来源 relation、来源 editor projection、来源 revision/step progress/audit 要么一起提交，要么
一起回滚。并发占用返回可重试 409，不接受跨词条半成功。

`related-search` 不全局混入草稿，而是新增显式查询参数 `include_drafts=true`。只有普通 relation 选择器
使用它；例句 context 搜索继续默认只看已发布目标，避免把不合法的草稿候选带进其他消费者。

## 2. 当前实现审计（事实）

以下结论均基于指定隔离 worktree 当前快照，不代表 main 或线上：

| 现状                                                                                                                | 证据位置                                                                                                                                  | 结论                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| related-search 的 SQL 从 `entry.current_publication_id` JOIN 当前 publication，surface 也限定 `current_publication` | 后端 `src/lexicon/repository/query.rs::related_search`                                                                                    | 普通候选只含当前已发布且未归档词条                            |
| handler 描述为“搜索当前发布版本中的关联词目标”                                                                      | 后端 `src/lexicon/handler/query.rs::related_search`                                                                                       | 当前契约没有草稿语义                                          |
| 集成测试 seed 了未发布 `colour draft`，结果只断言发布项                                                             | 后端 `tests/lexicon_handler.rs::related_search_reads_only_current_published_snapshots`                                                    | 草稿当前不能被搜索                                            |
| V3 related result 只有 `entry_id/kind/presentation/matches/senses`                                                  | 后端 `src/lexicon/dto/v3.rs::RelatedWordResultV3`；前端 `packages/types/src/admin-word-v3.ts`                                             | 没有 `draft/published` 状态                                   |
| 前端候选只映射 `word_id/headword/senses`，option label 只有词面                                                     | 前端 `V3MeaningsAndExamplesStep.tsx::relatedWordChoices/RelationsGrid`                                                                    | UI 无法标草稿                                                 |
| 选择候选先写 `target_word_id`、清空 pending，再要求选 sense                                                         | 前端 `RelationsGrid.onSelect`                                                                                                             | 0 sense 候选会形成无法安全保存的半状态                        |
| writable mapping 只有两个 target ID 同时存在才按 bound 输出                                                         | 前端 `meaningsModel.ts::toWritableMeanings`                                                                                               | 单独目标 word ID 不会成为稳定 wire 形态                       |
| DB CHECK 只有 bound 与 text pending 两种形状                                                                        | 后端 migrations `20260823120000_allow_pending_lexicon_relation_targets.up.sql`、`20260829100000_add_pending_relation_target_gloss.up.sql` | 当前没有预绑定状态                                            |
| 保存走 `BindExisting`，发布走 `Materialize`                                                                         | 后端 `service/v3.rs::save_meanings_v3`、`service/v3_publication.rs::publish_v3`                                                           | 当前收敛触发点在来源保存/发布，不在目标保存                   |
| 同名 entry 已有 active sense 时取 `first_draft_sense`；无 sense 时保存继续留 text pending，发布报错                 | 后端 `service/publishing.rs::resolve_pending_relation_targets`                                                                            | 同名零词义草稿当前不保存身份                                  |
| `first_draft_sense` 按 `sense.entry_pos_id, sense.sort_order, sense.id`                                             | 后端 `repository/dictionary.rs::first_draft_sense`                                                                                        | POS UUID 不是产品顺序，不能作为新规则的“第一条”权威           |
| V3 meanings 保存先标记全部 meanings 节点 removed，再删除关系表内容并按提交内容重建                                  | 后端 `repository/entries.rs::replace_meanings_content`                                                                                    | sense 删除是 active 集合差分，不是专用 DELETE endpoint        |
| relation 解析在旧 sense 仍属于目标当前 publication 时优先取发布快照                                                 | 后端 `repository/publications.rs::resolve_relation_targets`、`service/publishing.rs::relation_target_snapshot`                            | 当前行为可能在目标草稿删 sense 后仍视为可用，与新产品规则不同 |
| UI 每个 sense 的删除菜单均可用，没有 length=1 禁用                                                                  | 前端 `V3MeaningsAndExamplesStep.tsx::SenseEditorShell`                                                                                    | 第一条确实可删除                                              |
| 目标发布前已有 current publication 入站引用门禁                                                                     | 后端 `service/v3_publication.rs::ensure_no_removed_inbound_senses`                                                                        | 新方案不能篡改历史引用来绕门                                  |
| 永久删除检查 formal relation/sentence/publication 入站引用                                                          | 后端 `repository/entries.rs::delete_never_published_entry`                                                                                | 新 prebound FK 必须纳入删除门禁                               |

当前“已有同名草稿”的精确行为：

- related-search 看不见该草稿；
- 管理员只能保留 text pending；
- 来源再次保存时，若同名草稿已有 active sense，`BindExisting` 会按当前 `first_draft_sense` 绑定；
- 若同名草稿仍无 sense，来源草稿继续只有词面，没有目标 ID；
- pending 携带 gloss 且同名目标已经存在时，当前返回
  `relation_pending_gloss_target_exists`，避免静默丢 gloss 或覆盖已有内容。

## 3. 字段方案比较

### 方案 A：复用 `target_word_id`，允许它单独存在

优点是少一列。缺点是正式 target 与预绑定 target 语义重叠；当前 UI、`bound_target()`、writable
mapping、CHECK、发布物化和测试大量依赖“两 ID 同生共死”。旧客户端很可能把单独 word ID 清掉，
或显示成“已选择关联词但没有词义”。不推荐。

### 方案 B：`pending_target_word_id`

能保存身份，但名字不能区分 text pending 与 identity prebinding；未来排查时看到 pending ID 仍不知道
它是否可以自动转正。也容易与 `pending_target_headword` 的“尚未入库”历史语义混用。不推荐。

### 方案 C：`prebound_target_word_id`（推荐）

字段只表达“管理员已明确选择某个目标 entry”。与 `pending_target_headword/gloss` 并存，用后两者保存
转正前的可读内容/意图；与正式 `target_word_id/target_sense_id` 互斥。状态边界清楚，删除 sense 后也能
原地回退，不会误走 text pending 的同名解析/物化逻辑。

仅有该 ID 还不足以满足“删除后不得跳新第一条”，因此 DB 还要有服务端维护的
`prebinding_reason`：

- `waiting_first_sense`：管理员选择时目标无 active sense，允许一次自动转正；
- `target_sense_deleted`：由正式绑定降级而来，禁止自动转正，只能显式重选。

## 4. 数据库模型

### 4.1 新列与索引

```sql
ALTER TABLE lexicon.relations
  ADD COLUMN prebound_target_entry_id UUID,
  ADD COLUMN prebinding_reason TEXT;

ALTER TABLE lexicon.relations
  ADD CONSTRAINT lexicon_relations_prebound_target_fkey
  FOREIGN KEY (prebound_target_entry_id)
  REFERENCES lexicon.entries(id) ON DELETE RESTRICT;

CREATE INDEX lexicon_relations_prebound_target_idx
  ON lexicon.relations (prebound_target_entry_id, prebinding_reason, entry_id, id)
  WHERE prebound_target_entry_id IS NOT NULL;
```

`prebinding_reason` 用 CHECK 限定为 `waiting_first_sense | target_sense_deleted`。同时拒绝
`prebound_target_entry_id = entry_id`。

### 4.2 target shape CHECK

替换现有 `lexicon_relations_target_shape_check`，只允许以下四态：

| 形态              | formal target/snapshot        | prebound target/reason         | pending headword/gloss    |
| ----------------- | ----------------------------- | ------------------------------ | ------------------------- |
| bound             | word+sense+两个 snapshot 全有 | 全空                           | 全空                      |
| text pending      | 全空                          | 全空                           | headword 必有，gloss 可选 |
| waiting prebound  | 全空                          | entry + `waiting_first_sense`  | headword 必有，gloss 可选 |
| detached prebound | 全空                          | entry + `target_sense_deleted` | headword 必有，gloss 可选 |

沿用现有 headword 1..200、gloss 1..5000（trim 后）约束。正式绑定的复合 target-node FK 不改；prebound
只有 entry FK，因为该阶段本来没有 sense。

### 4.3 不从词面回填历史 pending

迁移不得把既有 `pending_target_headword` 按同名 entry 猜成 prebound。即使 headword key 当前唯一，
管理员当时没有明确选择身份；回填会把文本意图伪造成已确认身份。

已有 formal relation 若目标 sense 已 `removed_from_draft_at IS NOT NULL`，则按新规则需要数据审计与
应用层 backfill 为 detached。该 backfill 会联动来源 revision/投影，不能塞进纯 DDL migration；应复用
本文同步 reconciliation 事务，在启用功能前单独执行并报告数量。

## 5. Wire 与 OpenAPI

### 5.1 related-search

请求新增可选参数：

```ts
interface RelatedSearchQuery {
  // 既有字段省略
  include_drafts?: boolean; // 默认 false
}
```

`RelatedWordResultV3` 新增可选 `status: "draft" | "published"`。当
`include_drafts=true` 时后端对每个 V3 item 必须返回；默认 published-only 请求可暂不返回，保证旧客户端
不会因 `additionalProperties: false` 的 runtime schema 被突然击穿。新前端对字段缺失按 `published`
兼容。

草稿 `senses` 可以是空数组。`matches`、`presentation`、`entry_id` 仍必填，候选必须来自目标当前 draft
projection，而不是合成旧表单或词典推断。

### 5.2 relation response

`WordRelationV3` 增加：

```ts
prebound_target_word_id?: string;
prebinding_state?: "waiting_first_sense" | "target_sense_deleted"; // read-only
target_status?: "draft" | "published" | "archived"; // read-only, bound/prebound 当前状态
```

`target_status` 是读时批量计算的当前状态，不进入 immutable publication 的历史语义；历史详情允许缺失。
`prebinding_state` 来自 DB，不允许客户端把 detached 改回 waiting。

### 5.3 relation writable

`WordRelationWritableV3` 允许客户端发送 `prebound_target_word_id`，但不接受
`prebinding_state/target_status`。合法写入形状：

```json
{
  "id": "<relation-uuid>",
  "relation": "synonym",
  "prebound_target_word_id": "<target-entry-uuid>",
  "pending_target_headword": "reliability",
  "pending_target_gloss": "可靠性",
  "score": "80"
}
```

服务端按 relation ID 合并 server-owned state：

- 新 relation 或换了 prebound target ID：建立 `waiting_first_sense`；
- 同一 relation、同一 prebound target 且库内是 `target_sense_deleted`：保持 detached；
- 客户端明确发送完整 `target_word_id + target_sense_id`：视为显式重选，转 bound；
- 客户端改回纯词面：清除 prebound，转 text pending。

`pending_target_gloss` 在 waiting/detached prebound 中是合法的：它保留管理员转正前的意图或删除前快照。
现有 `relation_pending_gloss_target_exists` 只继续约束**没有稳定 ID 的 text pending**，不得错误套到管理员
已经明确选择的零词义草稿。转正时 formal snapshot 以目标真实 first sense 为准，随后清空 pending 字段。

V3 当前会经 `DraftMeaningsStepContent/WordRelationV2` 做内部 serde 适配。不能为了省事就把 V2 公共 wire
也默默放宽。推荐新增窄的内部 persisted relation adapter；若最终选择扩展 `WordRelationV2`，必须在 V2
写入校验中明确拒绝 prebound 形状，并保证 OpenAPI 不宣称 V2 已支持。

### 5.4 OpenAPI/前端同步

后端 `docs/openapi.json` 是权威源；随后同步前端
`packages/api-client/src/openapi.snapshot.json` 与 `admin-word-v3.runtime-schema.json`。契约测试需覆盖
`include_drafts`、新 result 字段、四种 relation shape、read-only 字段拒绝写入及 Problem Details。

## 6. related-search 查询设计

### 6.1 保持默认消费者不变

- `include_drafts` 缺失/false：完全沿用当前 current-publication 查询。
- `include_drafts=true` 且 V3 read/projection/prebinding capability 开启：额外 UNION V3 draft。
- 例句 context、sentence target 等既有消费者不传该参数，因此仍只看到 published。

### 6.2 V3 draft 分支

候选条件：

- `entries.content_schema_version = 3`
- `current_publication_id IS NULL`
- `archived_at IS NULL`
- `entry_presentation_projection.source_revision = entries.revision`
- `surface_sources.content_scope = 'draft'`
- `surface_sources.source_revision = entries.revision`
- active surface（`is_deleted = FALSE`）满足 exact/contains 规则

active senses 从 `lexicon.senses` JOIN `lexicon.nodes.removed_from_draft_at IS NULL` 读取，按
`entry_pos.sort_order, sense.sort_order, sense.id` 返回；零行即 `senses: []`。

有 current publication 且又有未发布改动的 entry 仍只返回 published snapshot，不同时返回一个 draft
副本，避免同一 entry 两个候选和未发布 form 被其他词条提前引用。

排序/游标键建议扩展为
`(kind, sort_headword COLLATE "C", status_rank, entry_id)`，其中 published 在 draft 前；cursor 必须绑定
`include_drafts` 与 status rank。

### 6.3 cursor dataset version

当前 version 只统计 `lexicon.entry`/`lexicon.entry.lifecycle` outbox，注释明确排除了草稿保存。草稿进入
数据集后必须修正：

- version 统计再纳入 `lexicon.surface_projection`（覆盖 V3 draft create/forms/retire）；
- V3 meanings 成功保存新增 `lexicon.entry_draft_meanings_saved` outbox（aggregate type 仍为
  `lexicon.entry`，revision 使用目标新 revision），使 senses/gloss 变化失效旧 cursor；
- publish/archive/restore 继续由既有 entry/lifecycle event 覆盖；
- 首次查询保持 version-before/query/version-after 的现有重试，后续页不一致返回 400 field=`cursor`。

## 7. 前端交互与数据流

### 7.1 搜索与选择

- relation 搜索 hook/query key 加 `include_drafts=true`；context 搜索保持 false。
- `relatedWordChoices` 保留 `status`，option 显示词面 +「已发布/草稿」Tag；0 sense 额外显示「暂无词义」。
- 草稿有 senses：选择词条后仍要求管理员在现有 Select 里明确选择 sense。
- 草稿无 senses：选择后写 `prebound_target_word_id + pending_target_headword`，保留/允许编辑
  `pending_target_gloss`，不写 formal target ID。
- 关联行常驻显示「草稿 · 等待第一词义」；detached 显示「原词义已删除 · 重新选择」。
- 修改已选词面时清除 prebound 身份，回到 text pending；不得保留旧 ID 配新词面。

### 7.2 保存与重新加载

`toWritableMeanings` 增加 prebound 分支并继续剥离 read-only 状态。runtime decode/model guard 接受新字段。
GET 后不依赖 React 本地 `knownWords` 才能显示身份；服务端返回的 pending headword、prebinding state、
target status 是刷新后的权威。

自动转正会 bump 来源 revision。若来源页面已打开，下一次保存收到现有
`409 revision_conflict`，刷新后取回正式绑定；前端不得用旧表单覆盖。

## 8. 自动转正/退回的事务设计

### 8.1 推荐触发点：目标 `save_meanings_v3`

触发条件以成功保存的 active sense 集合差分为准：

```text
old_active_sense_ids = 保存前目标 canonical meanings
new_active_sense_ids = 本次已校验、即将落库的 canonical meanings
removed = old - new
created_first = old 为空 && new 非空
```

不是 `intent=complete` 才触发；draft/complete 任一成功 meanings 保存都算。失败的校验、revision 冲突或
事务回滚均不触发。

### 8.2 同步事务步骤

1. 目标保存取得目标 `surface-context` 锁与目标 entry `FOR UPDATE`，复核 base revision。
2. 查询两类受影响 relation/source：
   - `prebound_target_entry_id = target` 且 reason=`waiting_first_sense`（仅 `created_first` 时）；
   - formal `(target_entry_id=target AND target_sense_id = ANY(removed))`。
3. 在持有目标锁时先按确定性顺序读取至多 501 条 eligible relations；若读到第 501 条，立即返回
   `409 relation_prebinding_fanout_exceeded`，目标与任何来源均不写入。
4. 按 source entry UUID 排序，以 `FOR UPDATE NOWAIT` 锁来源 entry。任一忙碌映射为
   `409 reference_conflict`，整个目标保存回滚；不等待形成跨词条 ABBA。
5. 正常执行目标 meanings replacement。
6. 若 `created_first`，从**已落库的新内容**按
   `entry_pos.sort_order, senses.sort_order, senses.id` 取唯一 first sense；将 eligible waiting 行改为
   formal target，snapshot 使用目标当前 presentation 与该 sense 当前 gloss，清空 prebound/pending。
7. 对 `removed` 命中的 formal relation：把原 `target_headword_snapshot` 复制到
   `pending_target_headword`；`target_gloss_snapshot` trim 后非空才复制到 `pending_target_gloss`，空串归一
   为 NULL。随后清空 formal target/snapshot，写
   `prebound_target_entry_id=target`、reason=`target_sense_deleted`。
8. 每个受影响来源只 bump revision 一次；同步更新：
   - `lexicon.relations`
   - `entry_editor_projection.meanings` 与 `rebuilt_revision`
   - `entries.revision/updated_by_admin_id/updated_at`
   - V3 `entry_presentation_projection.source_revision`
   - active draft `surface_sources.source_revision`（内容不变但 revision 一致性必须保持）
   - meanings step progress/hash：promotion 重算 hash 并保留完成态；detach 清除 meanings 完成态
   - 一条系统审计与必要 outbox metadata（列出 promoted/detached relation IDs 和触发 target/request）
9. 提交后只返回目标保存响应；来源页面靠 revision 冲突/主动刷新收敛。

若同一来源同时有多条 relation，或同时发生 promotion/detach，仍只 bump 一次。任一步失败全部回滚。

### 8.3 并发与幂等

- 两个“第一词义”保存请求使用同一 target base revision：目标行锁后只有一个成功，另一个 409。
- relation 写入路径必须把 `prebound_target_word_id` 纳入 target context locks；目标锁住后，新增/删除该
  target 的 prebinding 不能越过受影响集合查询。
- 目标事务锁来源使用 NOWAIT；互相预绑定的 A/B 同时保存时允许一方或双方得到可重试 409，但不死锁到
  500、不部分提交。
- promotion UPDATE 只匹配 reason=`waiting_first_sense`；detach UPDATE 只匹配当前 formal target/sense。
  重复执行第二次匹配 0 行，因此不 bump revision、不重复审计。
- 本方案主路径没有后台事件消费者；“重复事件”测试通过直接重复调用 reconciliation helper 证明 no-op。

### 8.4 为什么不选其他触发点

| 方案                      | 不选原因                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| outbox/后台任务           | 只能最终一致；目标保存后到 worker 完成前来源发布存在竞态，还要新增 worker、重试、死信与观测 |
| 来源下次保存/发布时懒转正 | 就是当前 `BindExisting` 思路，不能满足“目标第一词义保存后自动”                              |
| 数据库 trigger            | 无法安全维护 editor JSON、source revision、step progress、审计与领域错误                    |
| 发布后改历史 snapshot     | 破坏 immutable publication 与审计，不允许                                                   |

## 9. 保存、发布与生命周期

### 9.1 来源保存

- 新建 prebound 时校验目标存在、V3、非自身；候选若在选择后被归档，返回可定位 issue。
- 已持久化 prebound 后目标再归档，来源 draft 保存仍允许保留身份，publish/validate 给可操作问题。
- source save 发现 waiting target 已经有第一 sense（目标刚提交、来源请求稍后到达）时可在来源事务中直接
  formalize；detached 永远不能走该快捷路径。
- 纯 text pending 的现有 `BindExisting` 保持：它可在来源再次保存时按唯一 headword 收敛，但不会因
  目标保存而自动转正，因为它从未锁定目标身份。

### 9.2 来源发布

`resolve_pending_relation_targets` 只处理 text pending；遇到 prebound 必须跳过同名查找和 V2 stub
物化。V3 validate/publish 返回：

- waiting：`relation_prebound_target_has_no_sense`
- detached：`relation_target_sense_deleted`
- target archived：`relation_prebound_target_archived`

均为 422 validation issue，带 relation `node_id`；不得创建同名目标或自动选新 sense。formal bound
继续沿用 draft/publication stable anchor 逻辑。

### 9.3 目标发布

目标发布本身不触发重绑。若删除的 sense 仍被其他来源 current publication 引用，继续使用现有
`sense_has_inbound_publication_refs` 门禁；自动降级只修改来源草稿，不修改 current/historic publication
引用。管理员先修复并发布来源，再发布目标。

### 9.4 归档、恢复、永久删除

- 新搜索始终排除 archived。
- archive 不清 prebound/formal ID，只让读时 `target_status=archived`；只有 active current publication
  入站引用时继续按现有规则阻止归档。
- restore 保持同一 entry ID，relation 回到归档前核心状态。
- `delete_never_published_entry` 的入站检查新增
  `relations.prebound_target_entry_id = target`；存在时返回 409，禁止永久删除。
- 不采用 `ON DELETE SET NULL`，否则稳定预绑定会退化为可被同名词误接管的 text pending。

## 10. 错误契约

| HTTP/code                                   | field                     | 条件                             | 客户端动作                   |
| ------------------------------------------- | ------------------------- | -------------------------------- | ---------------------------- |
| 422 `relation_prebound_target_not_found`    | `prebound_target_word_id` | 新建预绑定时 ID 不存在/已删除    | 重新搜索                     |
| 422 `relation_prebound_target_archived`     | `prebound_target_word_id` | 新建或发布时目标归档             | 恢复目标或换目标             |
| 422 `relation_prebound_target_has_no_sense` | `prebound_target_word_id` | 来源发布仍在 waiting             | 去目标补第一词义             |
| 422 `relation_target_sense_deleted`         | `prebound_target_word_id` | detached 来源发布                | 显式重选 sense 或删 relation |
| 409 `reference_conflict`                    | 无                        | 目标自动协调时来源正在写         | 刷新/重试目标保存            |
| 409 `relation_prebinding_fanout_exceeded`   | 无                        | 受影响 relation 超过评审确认上限 | 运维治理后重试               |
| 409 `entry_has_inbound_prebound_relations`  | 无                        | 永久删除仍被预绑定               | 先解除来源预绑定             |
| 409 `revision_conflict`                     | 无                        | 打开的来源页面覆盖自动 bump      | 刷新来源                     |
| 400 `invalid_query`                         | `cursor`                  | 草稿数据集或 include_drafts 变化 | 从第一页重搜                 |

V3 closed issue enum、Problem Details、前端 `v3IssueMessage`/定位规则与 OpenAPI 必须一起更新，避免后端
发出前端未知 code。

## 11. Migration、发布顺序与回滚

### 11.1 Expand/enable 顺序

1. schema expand：加 nullable 列、FK、索引、新 CHECK；不猜测回填 text pending。
2. backend compatible：支持读写新形状、`include_drafts` opt-in、同步 reconciliation；能力默认关闭。
3. 运行现有 detached 数据审计；如有，使用应用事务 backfill，并核对 source revisions/projections。
4. 生成并提交 OpenAPI，前端同步 runtime schema/types。
5. frontend：relation 搜索 opt-in，支持 badge/prebound/detached 保存与展示。
6. 打开 `draft_relation_prebinding` capability；观察 409、扇出、转正/退回计数。

建议在 V3 word capabilities 增加 `draft_relation_prebinding`，前端仅在 true 时发送新字段与
`include_drafts=true`。后端先行、前端后行。

### 11.2 回滚

- 首选逻辑回滚：先关闭 capability，停止创建新 prebound；保留 schema 与已有数据，后端继续可读，避免
  身份丢失。
- 已有 prebound 时不能直接回滚到不认识字段的旧后端/旧前端；应 fail closed，禁止旧客户端保存相关
  entry。
- 物理 down migration 前必须断言 prebound 行数为 0。若业务决定降级为 text pending，需要单独、经
  明确批准的数据迁移清掉稳定 ID；这会丢失身份与 detached 原因，不能伪装成无损回滚。
- immutable publications、publication refs 与历史 snapshots 全程不动，所以无需历史数据回滚。

## 12. 代码影响范围

### 前端 `tsz`

- `packages/types/src/admin-word-v3.ts`：search status、prebound relation wire/read-only 状态。
- `packages/api-client/src/admin.ts`：`include_drafts` query。
- `packages/api-client/src/admin-word-v3.runtime-schema.json`、`openapi.snapshot.json`：契约同步。
- `apps/admin/src/features/dictionary/api.ts`：query key 纳入 include_drafts；relation/context 分开 opt-in。
- `apps/admin/src/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.tsx`：候选 badge、0 sense
  选择、waiting/detached UI、显式重选。
- `meaningsModel.ts`、`model.ts`、相关 presentation/problem 文件：writable mapping、runtime guard、错误文案。
- 对应 component/api/model/contract/e2e mock 测试。

### 后端 `tsz-rust`

- 新 migration up/down：relation 三/四态 schema、FK、索引、CHECK。
- `dto/v3.rs`、必要的内部 persisted adapter、`openapi.rs/docs/openapi.json`。
- `model.rs`：search/prebinding records。
- `repository/query.rs`：draft UNION、status/order/cursor dataset。
- `repository/projections.rs`、`entries.rs`、`dictionary.rs`：新列 round-trip、first sense 正确排序、删除门禁、
  source projection/revision 协调。
- `service/queries.rs`：include_drafts/cursor/result 映射。
- `service/v3.rs`：目标 save 同步 reconciliation、server-owned state merge。
- `service/v3_publication.rs`、`publishing.rs`：prebound 发布校验且不物化。
- `service/lifecycle.rs`：archive/restore/delete 语义。
- `service.rs`、`handler.rs`、`error.rs`、V3 closed issue enum：错误映射。
- `tests/lexicon_handler.rs`、`lexicon_v3_relation_consumers.rs`、schema/lifecycle/OpenAPI 测试。

## 13. 测试策略概览

- Rust schema：四态 CHECK、FK/RESTRICT、索引、down guard。
- Rust service/integration：draft search、first ordering、同步 promotion/detach、source revision/projection、
  publish/lifecycle、并发/NOWAIT、重复 reconciliation。
- 前端 unit/component：候选 badge、0 sense prebind、writable mapping、detached 不自动、context 搜索不混草稿。
- api-client contract/runtime：query 参数、response/status、四态 strict decode、read-only 写入拒绝。
- E2E：搜索草稿 → 预绑定 → 目标保存第一词义 → 来源刷新正式绑定；删除 sense → detached → 显式重选。
- 真 API/PostgreSQL：跨词条原子性、current publication 门禁、cursor 失效与迁移 backfill。

完整用例见同目录 `test-matrix.md`。

## 14. 风险与评审结论

| 风险                               | 影响                                  | 控制                                                          |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| 跨词条扇出过大                     | 目标保存锁多来源、延迟升高            | 评审确认硬上限；按 source 聚合一次 bump；监控数量/耗时        |
| 自动改来源导致编辑冲突             | 打开的来源表单保存 409                | revision bump + 明确刷新提示，绝不 last-write-wins            |
| editor JSON 与 relation 表漂移     | GET/发布看到不同状态                  | 同事务双写 + contract/integration witness；禁止只改表         |
| detached 被当 waiting              | 静默跳新 sense                        | DB reason + server-owned merge + 条件 UPDATE                  |
| 全局 search 混草稿                 | sentence context 等消费者拿到非法目标 | `include_drafts` opt-in 并进入 query key/cursor               |
| first sense 用 UUID 排序           | 并发/重排结果不可解释                 | 改为 POS/sense sort_order + ID tie-break                      |
| 旧客户端覆盖 prebound              | 身份丢失                              | capability rollout；旧客户端 fail closed；runtime schema 同批 |
| published source/target 历史被误改 | 审计破坏                              | 只改 source draft，publication snapshot/ref 永不 UPDATE       |

评审已确认：

1. 首期限定代码标识上的 V3 source → V3 draft target；产品文案不使用 V3/V2 分层。
2. 同步 reconciliation 硬上限为 500 条 eligible relations；查询第 501 条用于判超限，超限时返回 409，
   整个目标保存与所有来源更新全部回滚。
3. detached 首期只做单行显式重选/删除，不做批量修复。
4. 采用 `prebound_target_word_id` 与 server-owned `prebinding_reason` 两态，不复用
   `target_word_id` 或 `pending_target_word_id`。
5. UI 第三列只显示 `pending_target_gloss`；稳定 ID 仅由候选选择写入 wire/DB，不显示为可编辑字段。
