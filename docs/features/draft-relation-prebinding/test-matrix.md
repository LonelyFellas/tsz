# 关联词支持草稿词条预绑定：测试用例矩阵

> 状态：2026-08-30 已按本矩阵先写回归测试、再完成核心实现；自动化证据见文末，S15 历史
> backfill 与手工项仍保留为启用前门禁。
>
> 本矩阵按 `test` 技能先设计后实现。P0 在实现阶段必须全部有自动化覆盖；P1 是关键跨层/E2E；
> Manual 用于真实 PostgreSQL、浏览器可用性、观测与回滚演练。

## 1. 测试依据与分层

- 产品依据：同目录 `requirements.md`。
- 技术依据：同目录 `design.md`。
- 现有后端回归基座：
  - `tests/lexicon_handler.rs::related_search_reads_only_current_published_snapshots`
  - `tests/lexicon_handler.rs::saving_a_draft_binds_a_pending_relation_once_the_word_exists`
  - `tests/lexicon_handler.rs::v3_pending_relation_gloss_round_trips_and_materializes`
  - `tests/lexicon_v3_relation_consumers.rs::related_search_follows_mixed_v2_v3_current_publications_and_cursor`
- 现有前端回归基座：
  - `V3MeaningsAndExamplesStep.test.tsx` 的 relation 搜索/词义选择/pending gloss 场景
  - `meaningsModel.test.ts` 的 canonical → writable 映射
  - `packages/api-client/src/admin.test.ts` 与 runtime schema tests
  - `e2e/tests/admin-word-creation.spec.ts` 的关联目标选择/保存场景

## 2. Schema、迁移与存储

| ID      | 层                    | 场景                            | 输入/前置                                                   | 预期                                                                      | 优先级 |
| ------- | --------------------- | ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| DRP-S01 | PostgreSQL schema     | 旧 bound 形状兼容               | formal word+sense+snapshots，prebound/pending 全空          | INSERT 成功                                                               | P0     |
| DRP-S02 | PostgreSQL schema     | 旧 text pending 无 gloss        | 仅 pending headword                                         | INSERT 成功                                                               | P0     |
| DRP-S03 | PostgreSQL schema     | 旧 text pending 有 gloss        | pending headword + 合法 gloss                               | INSERT 成功                                                               | P0     |
| DRP-S04 | PostgreSQL schema     | waiting prebound 合法           | prebound entry + waiting reason + headword + optional gloss | INSERT 成功，formal 全空                                                  | P0     |
| DRP-S05 | PostgreSQL schema     | detached prebound 合法          | prebound entry + deleted reason + headword + optional gloss | INSERT 成功，formal 全空                                                  | P0     |
| DRP-S06 | PostgreSQL schema     | 半 formal 非法                  | 只有 target entry 或只有 target sense                       | CHECK 拒绝                                                                | P0     |
| DRP-S07 | PostgreSQL schema     | formal/prebound 混合非法        | formal target 与 prebound target 同时存在                   | CHECK 拒绝                                                                | P0     |
| DRP-S08 | PostgreSQL schema     | prebound 无词面非法             | prebound target/reason 存在，pending headword 为空/null     | CHECK 拒绝                                                                | P0     |
| DRP-S09 | PostgreSQL schema     | reason/target 不成对            | 只有 reason 或只有 prebound target                          | CHECK 拒绝                                                                | P0     |
| DRP-S10 | PostgreSQL schema     | 自关联预绑定                    | `entry_id = prebound_target_entry_id`                       | CHECK/服务层拒绝，不落库                                                  | P0     |
| DRP-S11 | PostgreSQL schema     | 目标 FK 与硬删除                | prebound 指向真实 target 后尝试 DELETE target               | RESTRICT；业务层先返回 409                                                | P0     |
| DRP-S12 | PostgreSQL schema     | 长度/trim 约束                  | 空白、201 code points headword、5001 code points gloss      | 对应 CHECK 拒绝；边界 200/5000 成功                                       | P0     |
| DRP-S13 | Migration integration | expand 不改旧行                 | 迁移前同时有 bound/text pending                             | up 后字段为 null、旧形状原样可读                                          | P0     |
| DRP-S14 | Migration integration | 不按词面猜预绑定                | text pending 与某现有草稿同名                               | migration 后仍是 text pending                                             | P0     |
| DRP-S15 | Migration/backfill    | 存量 detached 审计              | formal target node 已 removed                               | 审计准确计数；应用 backfill 转 detached 并同步 source revision/projection | P0     |
| DRP-S16 | Migration rollback    | 有 prebound 时 down fail closed | 表内至少一条 waiting/detached                               | down guard 明确失败，不静默清 ID                                          | P0     |

## 3. related-search 与契约

| ID      | 层               | 场景                                  | 输入/前置                                                      | 预期                                               | 优先级 |
| ------- | ---------------- | ------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | ------ |
| DRP-Q01 | Rust HTTP        | 默认搜索回归                          | 不传 `include_drafts`，同词面有 published/draft                | 只返回 published，旧结果形状兼容                   | P0     |
| DRP-Q02 | Rust HTTP        | 精确搜索草稿                          | `include_drafts=true`，未归档 V3 draft active surface 精确命中 | 返回该 entry，`status=draft`                       | P0     |
| DRP-Q03 | Rust HTTP        | 包含搜索草稿                          | contains + `exclude_exact=true`                                | draft 遵守 contains/exclude_exact                  | P0     |
| DRP-Q04 | Rust HTTP        | 零词义草稿                            | draft 没有 active sense                                        | 候选仍返回，`senses=[]`                            | P0     |
| DRP-Q05 | Rust HTTP        | 多词义草稿顺序                        | 多 POS、多 senses 且 UUID 顺序与产品顺序相反                   | senses 按 POS/sense sort_order 稳定返回            | P0     |
| DRP-Q06 | Rust HTTP        | 归档草稿                              | 匹配 draft `archived_at != null`                               | 不返回                                             | P0     |
| DRP-Q07 | Rust HTTP        | 已发布且有未发布改动                  | current publication + draft revision                           | 仅一条 published snapshot，不暴露未发布 form/sense | P0     |
| DRP-Q08 | Rust HTTP        | mixed V2/V3 回归                      | published V2 + published V3 + V3 draft                         | 默认仍 V2/V3 published；opt-in 只额外加 V3 draft   | P0     |
| DRP-Q09 | Rust HTTP        | feature capability 关闭               | `include_drafts=true` 但 capability false                      | 稳定 503/约定错误；不悄悄返回不完整集合            | P0     |
| DRP-Q10 | Rust HTTP        | cursor 参数绑定                       | 首页面 include_drafts=true，第二页改 false/actor/q/kind        | 400 `invalid_query`, field=`cursor`                | P0     |
| DRP-Q11 | Rust HTTP        | draft forms 变化使 cursor 失效        | 取第一页后修改目标 surface                                     | 旧 cursor 被拒，重搜看到新结果                     | P0     |
| DRP-Q12 | Rust HTTP        | draft meanings 变化使 cursor 失效     | 取第一页后从 0 sense 保存为 1 sense                            | 旧 cursor 被拒，新搜索含新 sense                   | P0     |
| DRP-Q13 | Rust HTTP        | archive/delete/publish 使 cursor 失效 | 首页后执行任一 lifecycle                                       | 旧 cursor 被拒                                     | P0     |
| DRP-Q14 | Rust concurrency | 首页读取期间数据集变化                | version-before 与 version-after 之间保存 draft                 | 最多重试现有次数；不返回混合快照                   | P0     |
| DRP-Q15 | OpenAPI/runtime  | V3 result status                      | include_drafts response 带合法/非法 status                     | 合法 decode；非法枚举拒绝                          | P0     |
| DRP-Q16 | OpenAPI/runtime  | relation 四态 decode                  | bound/text pending/waiting/detached                            | 四态均通过；混合/缺字段拒绝                        | P0     |
| DRP-Q17 | OpenAPI/runtime  | read-only 字段写入                    | writable 请求带 `prebinding_state`/`target_status`             | 400 strict request body                            | P0     |
| DRP-Q18 | API client       | query 编码                            | `include_drafts=true` + exact/contains/cursor                  | URL 正确编码，query key 不与 false 共享            | P0     |

## 4. 预绑定保存与自动转正

| ID      | 层                   | 场景                            | 输入/前置                                                        | 预期                                                                               | 优先级 |
| ------- | -------------------- | ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| DRP-P01 | Rust integration     | 保存 waiting prebound           | source V3 relation 指定 0-sense target ID/headword/gloss         | 200；GET/DB/projection round-trip 全保留                                           | P0     |
| DRP-P02 | Rust integration     | 新预绑定目标不存在              | 随机 UUID                                                        | 422 `relation_prebound_target_not_found`，锚 relation                              | P0     |
| DRP-P03 | Rust integration     | 新预绑定目标归档竞态            | 搜索后 target 被归档再保存 source                                | 422 archived issue；不退化 text pending                                            | P0     |
| DRP-P04 | Rust integration     | 新预绑定目标是自身              | source ID = target ID                                            | 422 self-target；事务无写入                                                        | P0     |
| DRP-P05 | Rust integration     | 0→1 draft intent 自动转正       | target 保存第一 sense，intent=draft                              | target/source 同事务成功；source formal IDs/snapshots 正确                         | P0     |
| DRP-P06 | Rust integration     | 0→1 complete intent 自动转正    | 同上，intent=complete                                            | 行为同 P05，完成保存不是额外前提                                                   | P0     |
| DRP-P07 | Rust integration     | 0→N 的第一条权威                | 多 POS、多 sense，UUID 与 array/sort order 反向                  | 绑定 `entry_pos.sort_order, sense.sort_order, id` 第一条                           | P0     |
| DRP-P08 | Rust integration     | 多来源原子转正                  | N 个 source 指向同一 target                                      | 全部转为同一 sense；任一失败则 target/source 全回滚                                | P0     |
| DRP-P09 | Rust integration     | 同来源多 relation               | 一个 source 有多条 waiting 指向 target                           | 全部转正，source revision 只 +1                                                    | P0     |
| DRP-P10 | Rust integration     | 来源已有 current publication    | source 已发布后新增 prebound，target 创建 first sense            | source current publication 不变；draft revision +1，`has_unpublished_changes=true` | P0     |
| DRP-P11 | Rust storage witness | 来源投影一致性                  | 自动转正后查 entry/editor/relation/presentation/surface revision | 所有 revision 一致；GET 与 SQL formal target 一致                                  | P0     |
| DRP-P12 | Rust integration     | source meanings 完成态          | waiting source meanings 已 complete                              | promotion 后重算 hash/completed_revision，仍 complete                              | P0     |
| DRP-P13 | Rust integration     | pending gloss 与实际 gloss 不同 | prebound gloss=A，target first sense gloss=B                     | formal snapshot 使用 B；pending 字段清空，不覆盖 target                            | P0     |
| DRP-P14 | Rust integration     | 目标先一步已有 first sense      | UI 看到 0，target 先提交，source 后保存 waiting 请求             | source save 原子 formalize 到权威 first sense                                      | P0     |
| DRP-P15 | Rust integration     | text pending 不被目标事件认领   | 只有同名 headword，无 prebound ID                                | target 保存 first sense不改 source；来源以后按既有 BindExisting 收敛               | P0     |
| DRP-P16 | Rust integration     | 修改释义文本                    | 已 bound，目标保留 sense ID 只改文本                             | target ID/sense ID 不变；不退回/重绑                                               | P0     |
| DRP-P17 | Rust integration     | 重排已绑定 sense                | sense ID 不变但变成非第一/跨 POS 调序                            | relation 仍指原 sense ID                                                           | P0     |
| DRP-P18 | Audit/outbox         | 自动转正审计                    | 多 relation/单 source                                            | 一条 source reconcile 审计含 target/request/IDs；无重复 event                      | P0     |

## 5. sense 删除、退回与显式修复

| ID      | 层                   | 场景                                        | 输入/前置                                      | 预期                                                   | 优先级 |
| ------- | -------------------- | ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ------ |
| DRP-D01 | Rust integration     | 删除唯一/第一条 bound sense                 | source formal 指向该 sense                     | target save 成功；source 变 detached prebound          | P0     |
| DRP-D02 | Rust integration     | 删除非第一条 bound sense                    | target 有多 sense，删被指向的后项              | 仍 detached，不看它是否第一                            | P0     |
| DRP-D03 | Rust integration     | 删除被指向 sense、其他 sense 保留           | 新第一条已存在                                 | 不静默跳到保留 sense                                   | P0     |
| DRP-D04 | Rust integration     | 同次删除旧 sense 并新建新 sense             | new sense 排第一                               | detached；promotion predicate 不消费它                 | P0     |
| DRP-D05 | Rust integration     | 删除后下一次再建 sense                      | source 已 detached                             | 仍 detached                                            | P0     |
| DRP-D06 | Rust integration     | 删除后只重排其他 sense                      | source 已 detached                             | 仍 detached                                            | P0     |
| DRP-D07 | Rust integration     | 旧 sense 仍在 target current publication    | draft 删除但 publication snapshot 仍含旧 sense | 仍按新产品规则退 detached；历史 publication 不变       | P0     |
| DRP-D08 | Rust storage witness | 退回字段来源                                | formal snapshot headword/gloss 非空            | pending 字段等于原 snapshot，formal snapshot/IDs 清空  | P0     |
| DRP-D09 | Rust storage witness | 空 gloss 退回                               | formal target gloss snapshot 是空串            | `pending_target_gloss` 归一为 null，CHECK 不失败       | P0     |
| DRP-D10 | Rust integration     | 退回使 source 未完成                        | source meanings 原 complete                    | source revision +1；meanings complete progress 清除    | P0     |
| DRP-D11 | Rust integration     | 同来源多 relation 部分命中                  | 两条指不同 senses，只删除其一                  | 只命中行 detached；另一行 bound；source revision 仅 +1 | P0     |
| DRP-D12 | Rust integration     | 管理员显式重选新 sense                      | detached 行提交完整 target word+sense          | 转 bound，reason/prebound/pending 清空                 | P0     |
| DRP-D13 | Rust integration     | detached relation 改指另一个 0-sense target | same relation ID，新的 prebound target         | 视为显式换目标，reason 重置 waiting                    | P0     |
| DRP-D14 | Rust idempotency     | 重复 detach reconciliation                  | 同一 removed 集合重复调用 helper               | 第二次 0 行；revision/audit/outbox 不增加              | P0     |

## 6. 发布与 lifecycle

| ID      | 层              | 场景                                   | 输入/前置                                       | 预期                                                        | 优先级 |
| ------- | --------------- | -------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------ |
| DRP-L01 | Rust HTTP       | 来源发布 waiting                       | target 仍 0 sense                               | 422 `relation_prebound_target_has_no_sense`；不创建 stub    | P0     |
| DRP-L02 | Rust HTTP       | 来源发布 detached                      | 旧 sense 已删除                                 | 422 `relation_target_sense_deleted`；不选新第一条           | P0     |
| DRP-L03 | Rust HTTP       | 来源发布 archived prebound             | target archived                                 | 422 archived issue，指引恢复                                | P0     |
| DRP-L04 | Rust regression | text pending 发布物化                  | 没有 prebound ID、库里无同名 entry              | 沿用现有 V2 noun stub 物化与 gloss 行为                     | P0     |
| DRP-L05 | Rust regression | formal draft target 发布               | source bound 到未发布 target active sense       | 沿用稳定 draft anchor，发布成功                             | P0     |
| DRP-L06 | Rust HTTP       | target 正常发布                        | bound sense ID 保留                             | relation 不变，不触发二次 reconciliation                    | P0     |
| DRP-L07 | Rust HTTP       | target 删除 sense 后发布               | source current publication 仍引用旧 sense       | 409/422 现有 `sense_has_inbound_publication_refs` 门禁      | P0     |
| DRP-L08 | Rust HTTP       | 先修 source 再发 target                | source 显式重选/删 relation并发布新版本         | 旧 current ref 不再 active，target 发布成功                 | P0     |
| DRP-L09 | Rust lifecycle  | 只有 draft prebound 时归档 target      | 无 active publication 入站 refs                 | archive 成功；prebound ID/reason 不变，读时 status=archived | P0     |
| DRP-L10 | Rust lifecycle  | 有 active publication 入站 refs 时归档 | bound relation 已进 source current publication  | 沿用现有 entry_has_inbound_publication_refs 阻止            | P0     |
| DRP-L11 | Rust lifecycle  | 恢复 target                            | waiting/bound/detached 各一条来源               | 核心状态原样恢复，仅 status 变 active draft/published       | P0     |
| DRP-L12 | Rust lifecycle  | 永久删除有 prebound 的 target          | never-published target 被 waiting/detached 指向 | 409 `entry_has_inbound_prebound_relations`                  | P0     |
| DRP-L13 | Rust lifecycle  | 解除 prebound 后删除                   | 来源删除 relation 并成功保存                    | target 若无其他历史/入站引用可 204 删除                     | P0     |
| DRP-L14 | Rust lifecycle  | 删除/归档竞态                          | delete/archive 与 source 新建 prebound 并发     | FK/锁保证只有合法序列；不留下悬空 ID                        | P0     |
| DRP-L15 | Rust history    | 历史 publication/activation            | 新功能前后历史 snapshot                         | 不回写 prebound/status；历史引用与 hash 不变                | P0     |

## 7. 并发、事务与扇出

| ID      | 层               | 场景                                  | 输入/前置                                         | 预期                                                                                      | 优先级 |
| ------- | ---------------- | ------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| DRP-X01 | Rust concurrency | 并发创建第一词义                      | 同 target/base revision 两个不同 first sense 请求 | 仅一个 200；另一个 revision conflict；所有来源只绑胜者                                    | P0     |
| DRP-X02 | Rust concurrency | source 正在编辑时 target 转正         | source 持 row lock，target 0→1                    | target 快速 409 reference_conflict，全事务回滚；重试后成功                                | P0     |
| DRP-X03 | Rust concurrency | target 锁后 source 新增 prebound      | 两请求交错                                        | source 等待/409；不能漏过集合后提交未转正 waiting                                         | P0     |
| DRP-X04 | Rust concurrency | target 锁后 source 删除 prebound      | 两请求交错                                        | 合法串行；不复活管理员已删 relation                                                       | P0     |
| DRP-X05 | Rust concurrency | A/B 互相预绑定同时建 first sense      | A source=B、B source=A                            | 无 500/永久死锁；至少可重试 409；最终一致且原子                                           | P0     |
| DRP-X06 | Rust concurrency | 多来源中一个失败                      | 注入第 N 个 projection/update 失败                | target 与前 N 个来源全部回滚                                                              | P0     |
| DRP-X07 | Rust integration | 达到扇出上限                          | eligible 数=500                                   | 成功且每 source 一次 bump                                                                 | P0     |
| DRP-X08 | Rust integration | 超过扇出上限                          | eligible 数=501                                   | 409 fanout，目标保存与任何 source 更新全部回滚                                            | P0     |
| DRP-X09 | Rust idempotency | 重复内部 promotion                    | helper 连调两次                                   | 第二次 no-op，无额外 revision/audit                                                       | P0     |
| DRP-X10 | Rust HTTP        | 成功响应丢失后客户端重试 target save  | 相同旧 base revision                              | 409；已提交 binding 不重复                                                                | P0     |
| DRP-X11 | Rust concurrency | source publish 与 target first save   | 两事务交错                                        | 要么 publish 先得到 no-sense issue，要么转正后 publish formal；无半正式 publication       | P0     |
| DRP-X12 | Rust concurrency | target delete-sense 与 source publish | 两事务交错                                        | publication 要么引用删除前有效 sense，要么看到 detached 并拒绝；target publish 门禁仍成立 | P0     |

## 8. 前端 unit/component 与 api-client

| ID      | 层                    | 场景                       | 输入/前置                                       | 预期                                                                              | 优先级 |
| ------- | --------------------- | -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| DRP-F01 | Component             | published/draft 候选标识   | mixed search results                            | 每项状态 Tag 明确，词面不被拆改                                                   | P0     |
| DRP-F02 | Component             | 0-sense draft 可选         | `status=draft,senses=[]`                        | 写 prebound ID + headword；显示等待状态；不显示空 sense Select                    | P0     |
| DRP-F03 | Component             | 0-sense prebound gloss     | 第三列输入/清空 gloss                           | 第三列只显示 gloss；wire 保留非空、空白归一缺失，relation UUID 与隐藏稳定 ID 不变 | P0     |
| DRP-F04 | Component             | draft 有 senses            | `senses` 非空                                   | 选择词条后必须显式选 sense 才成 bound                                             | P0     |
| DRP-F05 | Component             | bound draft 刷新展示       | GET 带 target_status=draft/snapshots            | 不依赖 knownWords 也显示词面、gloss、草稿 Tag                                     | P0     |
| DRP-F06 | Component             | detached 刷新展示          | prebinding_state=target_sense_deleted           | 显示“原词义已删除”，提供重选/删除，不自动选 option                                | P0     |
| DRP-F07 | Component             | archived 展示              | target_status=archived                          | 常驻归档提示/恢复指引，稳定 ID 不清                                               | P0     |
| DRP-F08 | Component             | 修改已选词面               | waiting/bound 后键入新词                        | 清 formal/prebound，转 text pending；不保留旧 ID 配新词面                         | P0     |
| DRP-F09 | Unit mapping          | 四态 toWritable            | canonical bound/text/waiting/detached           | 只输出各态允许字段；read-only 状态剥离                                            | P0     |
| DRP-F10 | Unit mapping          | detached 不伪装 waiting    | canonical detached round-trip                   | prebound ID/head/gloss 保留；客户端不发送 server reason                           | P0     |
| DRP-F11 | Hook/API              | relation 搜索 opt-in       | 打开 relation AutoComplete                      | 请求/缓存键含 include_drafts=true                                                 | P0     |
| DRP-F12 | Hook/API              | context 搜索隔离           | 打开句子 context target 搜索                    | 不传 include_drafts，不显示 draft                                                 | P0     |
| DRP-F13 | Component             | cursor 失效/搜索错误       | 400 cursor 或网络失败                           | 明确重搜/重试，不伪装“未找到”                                                     | P0     |
| DRP-F14 | Component             | 自动 bump 后来源保存冲突   | save 返回 revision_conflict                     | 草稿不被本地清空；提示刷新取回自动绑定                                            | P0     |
| DRP-F15 | Unit presentation     | 新错误码                   | 三个 prebound issue + fanout/reference conflict | 文案可操作且 issue 定位 relation 行                                               | P0     |
| DRP-F16 | Runtime compatibility | published status 缺失      | 旧 published-only V3 item 无 status             | 新前端按 published 渲染                                                           | P0     |
| DRP-F17 | History component     | 历史 relation 无新读时字段 | publication detail 缺 target_status             | 正常展示历史快照，不报 runtime/UI 错误                                            | P0     |

## 9. E2E 与真实验收

| ID      | 层                          | 场景                         | 输入/前置                                              | 预期                                                      | 优先级      |
| ------- | --------------------------- | ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ----------- |
| DRP-E01 | Playwright mock E2E         | 搜索草稿并预绑定             | source Step 3，mock 0-sense draft                      | 选中、填 gloss、保存、刷新仍 waiting                      | P1          |
| DRP-E02 | Playwright/mock multi-state | 自动转正后的来源刷新         | mock target save 后 source GET formal                  | UI 显示稳定 sense，无需来源重存                           | P1          |
| DRP-E03 | Playwright mock E2E         | sense 删除后修复             | source GET detached，search same target current senses | 不自动选；管理员显式选后保存 bound                        | P1          |
| DRP-E04 | Playwright regression       | published 候选正常选择       | 现有 F8 同名 published 候选                            | 仍按明确 word ID + sense ID 保存                          | P1          |
| DRP-E05 | 真 API/PostgreSQL           | 完整 0→1 流程                | 两个真实 V3 草稿、真实 Admin                           | DB/GET/UI 三方一致；source revision 证据完整              | Manual 必验 |
| DRP-E06 | 真 API/PostgreSQL           | 完整 delete→detached 流程    | source 可选为已发布/未发布两类                         | draft 降级、publication 不变、target publish 门禁符合设计 | Manual 必验 |
| DRP-E07 | 真 API concurrency          | first sense/source edit 并发 | 并发 HTTP + SQL witness                                | 只有允许结果；无 500、无部分写、重试收敛                  | Manual 必验 |
| DRP-E08 | 真浏览器                    | 搜索/状态/错误可用性         | Codex in-app browser，草稿/归档/detached               | Badge、定位、刷新与中文文案清楚；console error 0          | Manual 必验 |
| DRP-E09 | Rollout rehearsal           | capability 开关              | backend on/front old、front new/flag off/on            | 旧消费者不混草稿；新前端仅能力开启时写新字段              | Manual 必验 |
| DRP-E10 | Rollback rehearsal          | 已有 prebound 后逻辑回滚     | 关闭 capability                                        | 数据仍可读、不丢 ID；旧客户端写入 fail closed             | Manual 必验 |
| DRP-E11 | Observability               | 扇出与冲突指标               | promotion/detach/reference conflict/fanout             | 日志无原始敏感内容；计数、耗时、target/source 数可追踪    | Manual 必验 |

## 10. 实现阶段建议执行顺序

1. 先落 DRP-S/Q 的 schema + contract tests，证明旧两态兼容与 draft search 隔离。
2. 再落 DRP-P/D 的 service integration tests，先红后实现同步 reconciliation。
3. 落 DRP-X 并发测试，重点用 SQL witness 证明全回滚和 source revision 只增一次。
4. 落 DRP-L lifecycle/publication 回归，确认 text pending 物化和 immutable publication 不变。
5. 最后落前端 component/api-client 与 P1 E2E。

建议质量门（实现获批后才执行）：

```bash
# 后端：先相关集成，再全量
cargo test --test lexicon_v3_relation_consumers --locked
cargo test --test lexicon_handler --locked
cargo test --locked

# 前端：先目标文件/包，再全量覆盖率
pnpm --filter @tsz/admin exec vitest run \
  src/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.test.tsx \
  src/features/dictionary/word-creation-v3/meaningsModel.test.ts
pnpm --filter @tsz/api-client test
pnpm test:cov
pnpm typecheck
pnpm lint
pnpm test:e2e
```

上述命令仅在评审确认后执行；评审前阶段未写测试或业务代码。

## 11. 2026-08-30 本地实现证据

- 后端 `cargo test --locked` 全量通过；其中真实 Axum HTTP + PostgreSQL 回归覆盖草稿搜索、0→N 转正、
  sense 删除退回、显式重选、来源发布阻断、归档/恢复/永久删除、500/501、NOWAIT 和重复 reconciliation。
- `tests/lexicon_v3_storage_schema.rs` 11/11、`tests/lexicon_v3_relation_consumers.rs` 3/3、
  `tests/lexicon_v3_lifecycle.rs` 11/11 通过。
- 前端全量 Vitest 173 个文件、2638 个用例通过；`@tsz/api-client` 390 个用例通过，独立覆盖率为
  statements/branches/functions/lines 100%。全仓 typecheck 与 lint 通过。
- Playwright web 23/23、Admin 16/16 通过。Admin E2E 是 mock API 浏览器回归，不替代 E05–E08 的真实
  浏览器连真实后端手工验收。
- schema expand/down guard 已实现；尚未实现或执行 S15 的存量 removed-sense relation 应用层审计/backfill。
  `draft_relation_prebinding` capability 在完成该审计前应保持关闭。
- 用户已取消 web/admin 应用层固定覆盖率比例门；全仓 `pnpm test:cov` 通过，当前 Admin branches 为
  88.07%，`packages/**` 四项仍为 100%。未添加 coverage exclude。
