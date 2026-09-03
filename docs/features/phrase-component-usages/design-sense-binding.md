# 短语成分用词 · 释义级绑定 技术设计（B 方案）

> 定稿 2026-09-02，2026-09-03 并入对抗证伪修正。
> 范围：把短语「成分用词」（`component_usages`）的归属从**词形变体级**
> （`forms.pos[].forms[].regional_variants.{common|uk|us}.component_usages`）改为
> **释义级**（`meanings.pos[].senses[].component_usages`）。
> 本文取代同目录 `design.md`（v1，变体级，2026-09-02 已上线测试服）。
> 所有 `file:line` 按 2026-09-02 的 `tsz-rust` 与 `tsz` 的 `dev` 分支；标注
> **（证伪修正）** 的条目是两轮独立证伪推翻初稿后的结论，实现时以这些为准。

## 1. 产品语义

### 1.1 v1（变体级）为什么不够

- 成分挂在词性 base 词形的主变体上（unified 取 common、分拼取 uk），同一短语的**所有释义共用一份**，
  无法表达「同一短语在不同释义下 `run` 指向不同词义」。
- 数据随**词形步**保存（后端只在 `save_forms_v3` / `preview_forms_impact_v3` 校验，
  `service/v3.rs:1534-1542, 1617-1640`），导致向导在词义步保存前必须借道保存脏词形
  （`V3WordCreationWizard.tsx:838-845`）；且成分错误是 400 `InvalidField`（`v3.rs:3254-3259`）
  而非 node 级 issue，词义步无法定位。
- 英美分拼时 uk/us 各存一份且不得互相复用（`operations.ts` 的 `component_merge_required` 守卫），
  产品上并无「按方言不同」的成分语义，纯属存储副作用。

### 1.2 释义级语义

- **每条释义各自一份**；新建释义从空开始，不在释义间复制；删除释义即删除其成分；
  词形步删词性 → `reconcile_v3_meanings_after_forms`（`v3.rs:3305-3322`）丢弃该词性的释义 → 成分随之消失。
- 成分用词是**可选内容**：不计入 `countV3PosMeaningIncomplete`（`posCompletion.ts:63`），不是发布门槛。
- 仅 `entryKind === "phrase"` 渲染与接受；同一 literal 允许多条关联；单条释义上限 100 条。

### 1.3 切词锚点

- 展示用拼写取该词性 base 词形：`mode === "common"` 取 `common.spelling`，`uk_us` 取 `uk.spelling`
  （前端 `baseSpellingForPos`，返回 `string | undefined`）。
- 成分**不再依附任何方言变体**；分拼时以 uk 切词，us 独有 token 不可点选，记为已知限制。
- 后端**不校验** `literal ∈ tokens(spelling)`（现状只校验 trim / 非空 / ≤200），保持不变；
  前端对拼写改动后的孤儿 literal 不计数、不可点、但保留。

## 2. 数据模型

### 2.1 新表 `lexicon.v3_phrase_sense_component_usages`

列、CHECK 与目标侧外键逐条照抄 `migrations/20260830060000_add_phrase_variant_component_usages.up.sql:3-110`，
只把 owner 从 `form_variant_id` 换成 `sense_id`：

```sql
CREATE TABLE lexicon.v3_phrase_sense_component_usages (
    id UUID PRIMARY KEY,
    entry_id UUID NOT NULL,
    sense_id UUID NOT NULL,
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 99),
    state TEXT NOT NULL CHECK (state IN ('unresolved','resolved')),
    literal TEXT NOT NULL CHECK (literal = btrim(literal) AND char_length(literal) BETWEEN 1 AND 200),
    target_entry_id UUID, target_publication_id UUID, target_pos_id UUID, target_base_form_id UUID,
    target_sense_id UUID, target_form_id UUID, target_variant_id UUID,
    target_dialect TEXT CHECK (target_dialect IN ('common','uk','us')),
    target_form_type TEXT CHECK (...同旧表 29-34...),
    target_headword_snapshot TEXT, target_gloss_snapshot TEXT,
    CONSTRAINT lexicon_v3_phrase_components_node_fkey
        FOREIGN KEY (id, entry_id)       REFERENCES lexicon.nodes(id, entry_id) ON DELETE RESTRICT,
    CONSTRAINT lexicon_v3_phrase_components_owner_fkey
        FOREIGN KEY (sense_id, entry_id) REFERENCES lexicon.nodes(id, entry_id) ON DELETE RESTRICT,
    -- 目标侧 publication / pos / base / sense / form / variant 外键与 shape CHECK 照抄 up.sql:37-110
    CONSTRAINT lexicon_v3_phrase_sense_components_sense_ordinal_key UNIQUE (sense_id, ordinal),
    CONSTRAINT lexicon_v3_phrase_sense_components_sense_id_key      UNIQUE (sense_id, id)
);
CREATE INDEX lexicon_v3_phrase_sense_components_entry_idx
    ON lexicon.v3_phrase_sense_component_usages (entry_id, sense_id, ordinal, id);
CREATE INDEX lexicon_v3_phrase_sense_components_target_idx
    ON lexicon.v3_phrase_sense_component_usages (target_entry_id, target_publication_id, target_sense_id)
    WHERE state = 'resolved';
```

要点：

- FK / CHECK 名可保留 `lexicon_v3_phrase_components_*` 前缀（PG 里按表唯一，与旧表并存无冲突），
  `repository/entries.rs:18-21` 的外键→错误映射因此不必动；**UNIQUE / INDEX 名按 schema 唯一，必须换新名**。
- owner 指向 **sense 的 `lexicon.nodes` 行**而非 `lexicon.senses` 行：后者每次词义保存整表删重建
  （`entries.rs:1104`），指向 nodes 更稳。
- **（证伪修正）新表与 `lexicon.senses` 之间没有任何外键**，所以「senses 被删时级联删成分」这条路径不存在。
  `replace_meanings_content` 也**不硬删 `lexicon.nodes` 行**（只写 `removed_from_draft_at`，
  `entries.rs:1073-1092`），它 DELETE 的八张表里没有成分表。因此成分行的清理必须由写入侧
  自己负责（见 §4.3 的 delete-then-insert），不能指望 CASCADE。
- `lexicon.nodes` / `entry_publication_nodes` 的 `node_type` CHECK 与
  `entry_publication_sense_refs.reference_kind` CHECK 已含 `phrase_component_usage` / `phrase_component`
  （旧迁移 124-149），**不需要新 ALTER**。
- B1 迁移不搬数据；down.sql 仿旧表加「有数据即 RAISE」。

### 2.2 节点模型

| 项               | 值                                          |
| ---------------- | ------------------------------------------- |
| `node_type`      | `phrase_component_usage`（沿用）            |
| `node_role`      | **`meanings.phrase_component_usage`**（新） |
| `parent_node_id` | `sense.id`                                  |
| `step`           | `PersistedWordStep::Meanings`               |
| `stable_slot`    | `false`                                     |
| `ordinal`        | 数组下标                                    |

写入走 `upsert_v3_node`（`v3.rs:4162-4223`），其 `ON CONFLICT (id)` 要求
**entry / type / parent / role / stable_slot 全等**，否则 409 `StableNodeIdChanged`。因此：

- **释义级条目一律 mint 新 id**，绝不复用变体级旧 id。
- **（证伪修正）**前端并非「每次都生成新 uuid」：`rebuildUsages` 对目标不变的条目复用**同一 sense 列表内**的
  旧 id（父不变，安全），只有新勾选才调 `idFactory`。不撞 id 的保证来自「sense 级列表从不采纳
  变体级或候选返回的 id」，而不是「id 每次新生成」。后端若将来把变体级存量按原 id 回填到 sense 级，
  这条复用路径就会撞上 parent/role 不等。
- **（证伪修正）**`insert_node`（`entries.rs:920-958`）与 `upsert_v3_node` **不等价**：前者额外要求
  `node_role <> 'legacy'`、`stable_slot` 由调用方传入、失败映射为 Invariant → 500；后者按角色推导槽位、
  失败映射为 409。成分节点用 `upsert_v3_node`。

### 2.3 退役路径

- **meanings 侧按 `node_type` 列表退役**（`entries.rs:1076-1092`，现列表为
  sense_group / grammar_structure / sense / definition / sentence / text_variant / relation）。
  **（证伪修正）绝不能把 `phrase_component_usage` 直接加进这个 type 列表**：B1 期间 forms 侧仍在产出
  同 type 的变体级节点，一旦被误退役，`insert_v3_publication_nodes`（按 `removed_from_draft_at IS NULL`
  拷贝）会漏行，随后 `insert_publication_sense_refs` 触发 `source_fkey` 违约，**发布直接失败**。
  正确做法：把条件改成 `node_type = ANY($2) OR node_role = 'meanings.phrase_component_usage'`。
- **forms 侧按 `node_role`**（`v3.rs:3763-3776` 含 `forms.phrase_component_usage`；3779 整表 DELETE 成分行）：
  B1 不动，B2 删。
- `retired_v3_nodes`（`v3.rs:986-1013`）的角色白名单从未含成分角色（`retired_role` 2947 的映射是死代码）。

### 2.4 提案节点与节点预算

- `save_meanings_v3` 的 `proposed_nodes` 来自 V2 结构（`validation/structure.rs:273-345`），拿不到成分。
  B1 新增 `v3_component_proposed_nodes(&DraftMeaningsStepContentV3)`（仿 `v3_translation_proposed_nodes`
  3366-3386），在 2081-2088 与 translation 节点同样 retain + extend；
  `v3_meaning_node_ids_with_translations`（3388-3399）与 `v3_meaning_node_types`（3324）同步。
- `v3_contract.rs:713-746 meanings_node_count` 加 `+ sense.component_usages.len()`；
  `forms_node_count`（682-711）的成分项 B1 保留、B2 删。前端只有 `countFormsNodes` 计成分，F2 删。

## 3. 契约变更

### 3.1 B1（放宽 + 新增，不删任何键）

| Schema                                                        | 变更                                                                                                     | required | 序列化                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| 三个变体的 `component_usages`（`dto/v3.rs:273/288/303`）      | `#[schema(required = true …)]` → 去掉 `required = true`                                                  | 否       | **继续总输出**、继续反序列化 |
| `WordSenseV3` / `WordSenseWritableV3` 新增 `component_usages` | `PresenceAwareVec<PhraseComponentUsageV3>`，`serde(default, skip_serializing_if = …)`，`max_items = 100` | 否       | 空则省略                     |
| `SentenceTargetSenseV3` 新增 `component_usages`               | `Vec<PhraseComponentUsageV3>`，`serde(default, skip_serializing_if = "Vec::is_empty")`                   | 否       | 空则省略                     |
| `PublishedSentenceTargetCandidateV3.component_usages`         | 只去 `required`，**值与语义不变**（仍取命中变体）                                                        | 否       | 继续输出                     |
| `AdminWordV3Capabilities.sense_component_usages`              | `Option<bool>`，同 `draft_relation_prebinding` 写法                                                      | 否       | 见 §6.1                      |
| `V3ValidationIssueCode`                                       | 新增 §4.4 的 7 个 code                                                                                   | —        | —                            |

- **（证伪修正）`PresenceAwareVec` 没有 `is_empty`**（只有 `was_present` / `preserve_missing_from`），
  `skip_serializing_if` 需要先加一个 inherent helper。
- **（证伪修正）utoipa 里去掉 `required = true` 就自动是可选**（现有 `zh_translations` 等字段正因如此才显式写
  `required = true`）；`openapi.rs:2377-2390` 的断言 B1 翻转或 B2 连同字段一起删都可以，后端自选。
- **为什么变体级与候选级在 B1 就标 optional**：F1 的 runtime schema 由 B1 spec 生成；若 B1 仍标 required，
  后续停输出时 F1 会 `missing_required_property`。

### 3.2 B2（停输出，不删键）

**（证伪修正）B2 的定义被收窄**：

| 对象                                                                                                                | B2 行为                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 三个变体的 `component_usages`                                                                                       | **停止输出**，但**继续接受并忽略**：struct 保留 `#[serde(default, skip_serializing, rename = "component_usages")]` 的兼容字段。理由：F1 的 `model.ts:834 variantWire` 每次词形保存都会发这个键（含 `[]`），变体 struct 是 `deny_unknown_fields`，硬删则 **F1 所有词形保存 400** |
| `PublishedSentenceTargetCandidateV3.component_usages` 与 `WordSentenceAssociationV3.Linked.target_component_usages` | **不能停输出**，B2 改为**恒输出 `[]`**。`sentence_associations` 的 CHECK（`migrations/20260830070000`）要求 `target_publication_id` 与 `target_component_usages_snapshot` 同生同灭，落库侧也继续写 `[]`                                                                         |
| 旧表 `v3_phrase_variant_component_usages`                                                                           | 存量为 0 时 DROP                                                                                                                                                                                                                                                                |

真正从 struct / schema 删除这些字段是 **F2 之后的 B3**，不在本轮范围。
**（证伪修正）**utoipa 5 把 `skip_serializing` 等同 `skip`（直接从 schema 移除字段），所以
「加 `skip_serializing` 保留 schema」是做不到的；schema 移除与 `openapi.rs` 断言删除必须同批。

### 3.3 前端 schema 的双向闭合

`AdminWordV3Capabilities` 在前端 runtime schema 是 `additionalProperties:false`，
`V3ValidationIssueCode` 是闭合枚举。**新 capability 键与新 issue code 一旦出现在响应里，
未同步的前端每个 GET 都会 `unexpected_property`。** 这是部署顺序的唯一硬约束来源，见 §6。

## 4. 后端改动清单

### 4.1 migration

- 【B1】`add_phrase_sense_component_usages.{up,down}.sql`：§2.1 DDL，down 带数据硬保护。
- 【B2】`retire_phrase_variant_component_usages`：`DELETE FROM lexicon.v3_phrase_variant_component_usages`
  （预期 0 行）→ 退役 `node_role = 'forms.phrase_component_usage'` 的活节点 → `DROP TABLE`；
  down 按旧迁移 3-122 重建空表。

### 4.2 dto

- 【B1】§3.1 全部字段属性；`PresenceAwareVec::is_empty`；issue code 枚举 + `as_str` + `From`。
- 【B2】§3.2 的兼容字段改造。

### 4.3 `service/v3.rs`（核心）

**写路径（`save_meanings_v3`，1903 起）**

1. 1920 之后：`preserve_missing_sense_component_usages(&mut content, &compatibility_source.meanings)`
   （仿 `preserve_missing_sentence_translations`，按 sense id）——缺键 = 保持不变。
2. 1929 之后：`validate_sense_phrase_components(...) -> Vec<DraftValidationIssue>`，非空即
   `v3_validation_failed`（save / complete 两种 intent 都拒，与 v1「每次保存都校验」一致）。
3. **（证伪修正）V3→V2→V3 serde 往返会静默吞掉新字段**（`WordSenseV2` 无该字段且不 deny），
   必须逐处回填，共 **三处**持久化点：
   - `v3.rs:1937-1939` 丢 → `2070-2073` 重建 canonical_content（仿 `copy_sentence_translations` 2074）
     → `2217-2226` 落草稿投影；
   - `v3_publication.rs:116` 丢 → `171-183`（仅 newly_bound 非空）经 `sync_canonical_meanings` 覆盖投影与
     `word.meanings`；
   - `v3_publication.rs:272` 无条件重建 → `280-281` 进发布快照、`302` 进响应体。
     建议做成同一个 `restore_v3_only_sense_fields`，**同时搬 `zh_translations` 与 `component_usages`**。
     若新字段不带 `serde(default)`，表现会是 500 而非静默丢。
   > 待后端确认的疑似既有缺陷：发布快照路径的 `v2_meanings_to_v3` 似乎只保留 1 条 `zh_translation`。未实测。
4. 2157 之后：`replace_v3_sense_component_usages(&mut tx, entry_id, &canonical_content)`。

**新增 `replace_v3_sense_component_usages`**

- 语义 = **先按 `entry_id` 整表 DELETE，再遍历 pos/sense/component 逐条 `upsert_v3_node` + INSERT**
  （对齐 `replace_v3_forms:3779` 的 delete-then-insert 写法）。
  **（证伪修正）不要依赖 `replace_meanings_content` 里的 CASCADE 或额外 DELETE** —— 见 §2.1，
  成分表与 senses 无外键关系。
- **（证伪修正）调用点是 4 处，不是 3 处**。`replace_meanings_content` 的 V3 可达调用点：
  `v3.rs:1755`（save_forms_v3）、`v3.rs:2149`（save_meanings_v3）、`v3.rs:2799`（关联对账）、
  `repository/entries.rs:1124`（`sync_canonical_meanings` 内部，由 `v3_publication.rs:174` 在
  newly_bound 非空时触发）。`publishing.rs:255` 是 V2 路径，对 V3 不可达。
  现有的 `replace_v3_sentence_translations` 只覆盖了前 3 处（1763 / 2157 / 2802）——
  **第 4 处是发布路径上的既有缺口，新 sidecar 必须补上**，否则带 newly_bound 的发布会先退役成分节点、
  再在 `insert_v3_publication_nodes` 漏行，导致 `sense_refs.source_node_id` 外键失败。
- 可选替代方案（后端自选）：把 `component_usages` 并进 `DraftMeaningsStepContent` 并在 `insert_meanings`
  内随 sense 一起重建（与 relations 同款），天然覆盖全部调用点，但要改 V2 形状的内部结构，侵入更大。

**校验搬迁**

- **（证伪修正）改动面比「三处」大**，至少包括：
  (a) `validate_phrase_components`（3000-3172）签名从 `DraftFormsStepContentV3` 改 `DraftMeaningsStepContentV3`；
  (b) `ensure_phrase_component_ownership`（2972-2998）需要 sense 级版本（「仅 phrase 可带成分」）；
  (c) ≤100 上限（3011-3021）从每变体改每 sense；
  (d) 成分收集遍历源（3023-3036）；
  (e) `phrase_component_resolved_target_ids`（3151-3172）**必须同时扫目标的 `forms` 与 `meanings`**——
  发布快照不可变，存量短语的成分仍在 forms 上，只看 meanings 会漏掉套娃检测；
  (f) 调用点从 `preview_forms_impact_v3` / `save_forms_v3`（1542 / 1640）迁到（或增加于）`save_meanings_v3`；
  (g) 单测夹具 4823-4914 重写。
- `phrase_component_matches_target`（3174-3252）不引用 owner，**可原样复用**。

【B2】删变体侧：`preserve_missing_component_usages`（644-705）与 1534 / 1617 调用；变体壳校验与
1535-1542 / 1639-1640；`push_v3_form_variant_nodes` 的成分参数；`replace_v3_forms` 3776 角色与 3779 DELETE；
`insert_v3_variant` 的成分参数；`retired_role` 2947。

### 4.4 校验错误 → node 级 issue

`step = meanings`；`node_location.node_role` 取 `meanings.phrase_component_usage`（成分）或
`meanings.sense`（sense 级）；`ancestor_node_ids = [pos_id, sense_id]` / `[pos_id]`；不扩
`V3DraftNodeLocation`，走 `ancestor_node_ids`。

| code                                  | node_id  | field              | 触发                                                                       |
| ------------------------------------- | -------- | ------------------ | -------------------------------------------------------------------------- |
| `phrase_component_not_allowed`        | sense.id | `component_usages` | 非短语词条携带成分                                                         |
| `phrase_component_limit_exceeded`     | sense.id | `component_usages` | 单 sense > 100                                                             |
| `phrase_component_literal_invalid`    | 成分 id  | `literal`          | trim / 空 / > 200                                                          |
| `phrase_component_self_target`        | 成分 id  | `target`           | 目标 = 本词条                                                              |
| `phrase_component_target_unavailable` | 成分 id  | `target`           | 目标不存在 / 已归档 / 非 V3 / publication 不匹配；发布时 revision 锁定失败 |
| `phrase_component_target_nested`      | 成分 id  | `target`           | 目标短语自身含成分（套娃一层）                                             |
| `phrase_component_target_stale`       | 成分 id  | `target`           | `phrase_component_matches_target` 八项任一不符                             |

后端可合并或改名，但**最终列表必须回传前端**（`V3_VALIDATION_ISSUE_CODES` 与 `presentationErrors.ts`
之间有 `satisfies` 强制同步）。

### 4.5 发布与关联下游

- 【B1】`phrase_component_publication_references`（`v3_publication.rs:843-929`）入参改 `(forms, meanings)`，
  B1 两侧都收（B2 只收 meanings）；`source_node_id` = 成分节点 id。
- 【B1】`validate_aggregate_node_limit` 的 `meanings_node_count` 计入成分（§2.4）。
- 【B1】`repository/publications.rs:836-942` 的 `unavailable_outbound_sense_refs_for_restore` / `_for_publication`
  补 `reference_kind = 'phrase_component'` 分支（条件同 `relation` 分支）——这是既有缺口。
- 【B1】`repository/entries.rs:789-792`（批删互引）、`848-853`（入引守卫）、`query.rs:578-582`（依赖图）
  各加新表分支，旧表分支 B1 保留、B2 删。
- 【B1】`sentence_association.rs`：`PublishedAssociationSense` 加 `component_usages`；
  **（证伪修正）`SentenceTargetSenseV3.component_usages` 目前由 `association_senses(&meanings)` 构造，
  而那份 meanings 是快照 V3→V2 往返的产物**（`sentence_association.rs:561-565, 618`），
  必须改从 V3 meanings 取，且前提是发布快照里真有该字段（依赖 §4.3 第 3 条）。
- 【B1】`Linked.target_component_usages` 改取**被选中 sense** 的成分。
  **（证伪修正）现有夹具把成分挂在 `regional_variants.common` 上**，改完后
  `sentence_association_tests.rs:215/254` 与 `lexicon_handler.rs:19255/19277` 的断言会挂，必须同批把夹具搬到 sense 级。
- 【B1】**（证伪修正）候选级 `PublishedSentenceTargetCandidateV3.component_usages` 语义不变**（仍是命中词形）。
  初稿提出的「改成词性级并集」被否：字段类型虽不变，但 `maxItems` 契约与
  `V3SentenceTargetDiscovery` 的「当前词形的成分用词」文案、抽屉的 componentWords 派生与候选级回退
  都依赖旧语义，改并集等于额外破坏面。

## 5. 前端改动清单（F1 已实现，F2 待办）

F1 已落地：

- `V3PhraseComponentUsagesCard.tsx`：props 为
  `{ spelling?, usages, onUsagesChange?, discoveryEnabled?, senseComponentUsagesEnabled?, wordId?, idFactory? }`；
  导出 `baseSpellingForPos(forms, posId): string | undefined`（unified→common、distinguish→uk）、
  `reachableUsageCount(spelling, usages)` 与
  `rebuildUsages(usages, tokens, literal, selections, idFactory)`；
  `editable = onUsagesChange !== undefined && discoveryEnabled && senseComponentUsagesEnabled`。
  **候选检索沿用 PR #200 的关键字检索**（`POST /lexicon/entries/component-targets/search`，
  不再走 `resolveSentenceTargets`）：因此锚点只需拼写，初稿里的 `sourceDialect` 随
  `source_dialect` 入参一起消失。词形层的方言偏好过滤（含非偏好侧存量的打开时 keep-set
  快照）、自指排除（`wordId`）、截断提示与「命中只换色不加标签」全部保留在释义级卡片上。
- `reachableUsageCount` 只数 `state === "resolved"` 且 literal 仍在当前拼写里的条目：
  孤儿与 unresolved 存量都点不开也删不掉，计进角标会让数字与界面对不上。
- `V3MeaningsAndExamplesStep.tsx`：新增 prop `componentUsagesEnabled`（默认 false）；
  section 在**每条释义卡内、多维释义之后、多维例句之前**，
  `data-v3-field="component_usages" data-v3-node-id={sense.id}`，标题「成分用词」计数单位「条」
  （计数由 `reachableUsageCount` 给出，卡片本身不再有 antd `Card` 外壳与角标）；
  仅 `entryKind === "phrase"` 渲染；**能力关闭时仍渲染但只读并提示**（不是隐藏）；
  写入走 `change(draft => draft.pos[i].senses[j].component_usages = next)`。
- `WordWizardV3.tsx`：传 `context.word.capabilities.sense_component_usages === true`（**不做 DEV 放宽**）。
- `meaningsModel.ts`：`toWritableMeanings` 仅当 `sense.component_usages` 存在时带出（深拷贝）；
  新增 `stripSenseComponentUsages(content)`；`V3WordCreationWizard.saveMeanings` 在能力不为 true 时发 strip 后的 content。
- `publicationIssueSummary.meaningPosOwnsIssue` 已加 sense 级成分归属。
- 抽屉与发现面板：`SentenceTargetSenseV3.component_usages?` 与 `V3SentenceTargetDiscoverySense.componentUsages?`；
  自动/手动关联优先取被选 sense 的成分，缺失回退候选级；发现面板 sense 行渲染「该词义的成分用词」。
- 类型：`WordSenseV3` / `WordSenseWritableV3` / `SentenceTargetSenseV3` 加可选 `component_usages`；
  `AdminWordV3Capabilities` 加 `sense_component_usages?`。

**（证伪修正）发送策略**：初稿写的「capability 为 true 时每条 sense 总是带 `[]`」不成立——
B0 的 `WordSenseV3` / `WordSenseWritableV3` 是 `deny_unknown_fields`，发 `component_usages: []` 同样 400。
正确策略（已实现）：**capability 为 true 时字段存在即发（清空时为显式 `[]`，让后端区分「未发送」与「清空」）；
capability 不为 true 时整键剥除**，`newSense()` 也不加默认键。

F1 待办（依赖后端 B1 的 spec）：`sync:openapi`、契约 `_source_sha256`、
`V3_VALIDATION_ISSUE_CODES` 与 `presentationErrors.ts` 文案（等后端回传最终 code 列表）。

F2（B2 部署后）：再 sync 一次并删变体级残留——`types` 的变体字段与两个枚举成员、
`model.ts` 的 `countFormsNodes` 成分项 / `isVariantShape` 键 / `variantWire` 键、
`operations.ts` 的 `formNodeIds` 成分 id / `clonedComponentUsages` / 两个转换函数的键与
`component_merge_required` 守卫、`V3PosTab.tsx` 的分支与 Alert、
fixtures 与 e2e mock、抽屉与发现面板的候选级回退。
（`operations.ts` 的 `updateVariantComponentUsages` 是变体级写入口，随 F1 一起删了——
释义级卡片不再经它写回，留着就是无人调用的死导出。）

## 6. 部署顺序

### 6.1 推荐路径：capability 键在 flag 关闭时缺席

**（证伪修正）**现有写法（`handler.rs:138-139 / 171-172 / 184-185`）是无条件 `Some(bool)`。
如果新能力也照抄，B1 一上线就会给未同步的前端塞一个未知键，逼出「B1 部署不得早于 F1」的跨仓硬耦合。
推荐改成 `flag.then_some(true)`：**flag 关闭时该键缺席**。收益：

1. B1 可以先于 F1 部署（flag 关着，响应对旧前端零变化：sense 与候选的新字段都是空即省略，
   capability 键缺席，issue code 只在有人真写成分时才出现）。
2. F1 部署后再开 flag，前端立刻可编辑。
3. 回滚只需关 flag，不必回退二进制。

代价：偏离既有 `Some(bool)` 写法，需要在 `config.rs` 登记新 flag。

### 6.2 底线路径：不采用 flag 缺席时的四阶段

1. **B1** 合入 main 并导出 `docs/openapi.json`，**先不部署**
2. **F1** 前端 sync B1 spec → 部署
3. **B1 部署**（可与 F1 同批，**不得早于 F1**）
4. **B2**（确认目标环境存量为 0 后）→ **F2**（不得早于 B2）

### 6.3 兼容矩阵

|        | B0                                      | B1                                                                     | B2                                                                     |
| ------ | --------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **F0** | ✓                                       | flag 缺席时 ✓；恒发 `Some` 时 ✗（capability 键 `unexpected_property`） | ✗ 变体级 `missing_required_property`                                   |
| **F1** | ✓ 能力非 true → 整键剥除，不发 sense 键 | ✓                                                                      | ✓ 变体级已标 optional；F1 仍发的 `component_usages: []` 被兼容字段接住 |
| **F2** | ✗                                       | ✗                                                                      | ✓                                                                      |

**（证伪修正）窗口期提示**：F1 上线后，浏览器里**没刷新的 F0 标签页**会在详情 / 保存 / 发布 / 发布历史
遇到「响应格式异常，已安全停止」（列表页不受影响），且 PUT 其实已落库、前端却报错，是**假失败**。
刷新即恢复。部署时广播一次刷新。

### 6.4 每阶段验收

- **B1**：`cargo test` 全绿；spec diff 只含 §3.1；本地 F1×B1 全链路（建短语 → 词形 → 词义步关联 → 保存 →
  刷新回显 → 发布 → 目标词删被引用词义得 `sense_has_inbound_publication_refs` → 例句抽屉候选 sense 显示成分）。
- **F1**：sync 后 typecheck / test / e2e 全绿；F1×B0（能力关闭）不发键、区块只读。
- **B2**：存量 0；旧表已删；F1×B2 全链路仍通（前端不动）。
- **F2**：grep 前端无变体级成分残留；F2×B2 全链路。

## 7. 存量数据

### 7.1 测量 SQL（草稿真源是 `lexicon.entry_editor_projection`，不是 `entries`）

```sql
-- A 草稿变体级成分条数
WITH variants AS (
  SELECT p.entry_id, rv.key AS dialect, rv.value AS variant
  FROM lexicon.entry_editor_projection p
  CROSS JOIN LATERAL jsonb_array_elements(p.forms->'pos') pos
  CROSS JOIN LATERAL jsonb_array_elements(pos->'forms') form
  CROSS JOIN LATERAL jsonb_each(form->'regional_variants') rv
  WHERE rv.key IN ('common','uk','us'))
SELECT count(*) AS draft_variant_components, count(DISTINCT entry_id) AS entries
FROM variants CROSS JOIN LATERAL jsonb_array_elements(COALESCE(variant->'component_usages','[]'::jsonb)) cu;
-- B 关系表
SELECT count(*) FROM lexicon.v3_phrase_variant_component_usages;
-- C 节点
SELECT node_role, (removed_from_draft_at IS NULL) AS active, count(*)
FROM lexicon.nodes WHERE node_type = 'phrase_component_usage' GROUP BY 1,2;
-- D 发布引用 / 发布节点
SELECT count(*) FROM lexicon.entry_publication_sense_refs WHERE reference_kind = 'phrase_component';
SELECT count(*) FROM lexicon.entry_publication_nodes WHERE node_type = 'phrase_component_usage';
-- E 发布快照里非空的变体级成分
SELECT count(*) FROM lexicon.entry_publications ep
CROSS JOIN LATERAL jsonb_array_elements(ep.snapshot->'forms'->'pos') pos
CROSS JOIN LATERAL jsonb_array_elements(pos->'forms') form
CROSS JOIN LATERAL jsonb_each(form->'regional_variants') rv
WHERE ep.content_schema_version = 3 AND rv.key IN ('common','uk','us')
  AND jsonb_array_length(COALESCE(rv.value->'component_usages','[]'::jsonb)) > 0;
-- F 例句关联的成分快照
SELECT count(*) FROM lexicon.sentence_associations
WHERE target_component_usages_snapshot IS NOT NULL
  AND jsonb_array_length(target_component_usages_snapshot) > 0;
```

本地实测（2026-09-02）：A = 1、B = 1、C = 1 活节点、D = 0、E = 0、F = 0；
62 份 V3 发布快照与 68 份编辑投影的**每个**词形变体都带 `component_usages` 键（多为 `[]`）。
测试服与生产由后端窗口执行并回传，预期全 0。

### 7.2 存量为 0（默认路径）

B2 直接 DELETE + 退役节点 + DROP TABLE，不回填。

### 7.3 存量非 0（B2 前一次性脚本，事务内）

1. 归属：变体级成分按 `entry_id` 找所属词性，落到该词性**首个 sense**；无 sense 则丢弃并记日志。
2. 节点：`UPDATE lexicon.nodes SET parent_node_id = <sense_id>, node_role = 'meanings.phrase_component_usage'`
   （`node_type` 不变），行迁入新表并重编 ordinal。
   注意：**已退役的成分节点没有对应关系表行**（forms 侧每次整表 DELETE），无 sense_id 可推，不要 JOIN 它们。
3. JSON 真源：`entry_editor_projection.meanings` 对应 sense 追加，`forms` 里的数组置 `[]`。
4. 已发布：`entry_publication_sense_refs` 无需迁移（`source_node_id` 不变）；旧快照保持原样，
   由 B2 的兼容字段吸收。

## 8. 回滚

- **B1 → B0**：凡 sense 带非空 `component_usages` 的 JSON，旧后端 `deny_unknown_fields` 读到即 500。
  **（证伪修正）需要去键的地方有三处，不止两处**：`entry_editor_projection.meanings`、
  `entry_publications.snapshot`、**以及 `platform.idempotency_records.response_body`**
  （TTL 24 小时，V3 创建 / 发布 / 生命周期路径都会 typed 回放，含 capabilities 键，回放会 500）。
  `snapshot_hash` 目前没有任何读路径校验，剥键不会立刻炸，但会留下哈希与内容不一致的历史行。
  **默认策略：B1 后不回滚**；采用 §6.1 的 flag 缺席方案时，回滚 = 关 flag，只有已写入成分的词条会受影响。
- **B2 → B1**：down.sql 重建空的旧表，释义级数据不受影响。
- **F1 → F0**：只在 B0 或 flag 关闭时可行。**F2 → F1**：任何时候可行。

## 9. 风险与已知限制

1. 分拼短语以 uk 切词，us 独有 token 不可关联；后端不校验 `literal ∈ tokens`。
2. `phrase_component_matches_target` 读目标的**草稿** `AdminWordV3` 而非发布快照，与「只接受已发布目标」
   的口径有偏差。本次不改，列为后续议题。
3. §4.3 的三处 V2 往返回填 + §4.3 的第 4 个 sidecar 调用点是最容易漏的两处，
   必须各有一条集成测试（尤其「带 newly_bound 关联的发布后，快照仍含成分且发布节点齐全」）。
4. B1 期间变体级与释义级双源并存，都会产生 `phrase_component` 发布引用；存量为 0 时实际只有释义级。
5. 契约 `_source_sha256` 每次 sync 必变，F1 / F2 各改一次。
6. B2 的兼容字段是长期技术债，B3 才能真正删除。
7. `target_component_usages` 口径变更后旧关联不回填，抽屉展示以新关联为准。

## 10. 工作量估算（人日）

| 阶段   | 内容                                                                                                                                                                     | 估算      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| **B1** | migration 0.5；DTO / openapi / issue code 0.5；写路径（preserve / 回填 / 提案节点 / sidecar×4）1；校验搬迁与 issue 化 1；发布引用 + 反查守卫 0.5；关联与候选 0.5；测试 1 | **4.5–5** |
| **B2** | 删变体侧路径与旧表 0.5；下游停输出 0.5；测试改写 0.5–1                                                                                                                   | **1.5–2** |
| **F1** | 已完成主体；剩 sync + 契约 sha + issue 文案                                                                                                                              | **0.5**   |
| **F2** | sync + 删残留 + 测试                                                                                                                                                     | **1**     |
