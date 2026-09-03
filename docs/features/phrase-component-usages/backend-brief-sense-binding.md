# 后端开工简报：短语成分用词改为释义级绑定（B1 / B2）

**一句话**：把 `component_usages` 从词形变体（`forms.…regional_variants.{common|uk|us}`）挪到释义
（`meanings.pos[].senses[]`），随词义步保存 / 校验 / 发布。分 B1（新增 + 放宽，不删键、不迁数据）与
B2（停输出旧字段、删旧表）两版。

仓库 `/Users/darwish/Dev/tsz-core/tsz-rust`，行号按 2026-09-02 的 `dev`。
完整设计见前端仓库 `docs/features/phrase-component-usages/design-sense-binding.md`。

**前端现状**：F1 已合入前端 `main`，能力位关闭时区块只读、请求整键剥除，
所以**前端可以先上、也可以后上**，只差一次 `sync:openapi`（等你的 `docs/openapi.json`）。
契约同步（`sync:openapi`、契约测试里钉的 `_source_sha256`、`phrase_component_*` 的 issue
文案）是唯一挂账项，B1 导出 spec 后前端补一个 PR 即可，不阻塞你开工。

---

## 0. 部署顺序：推荐 flag 缺席，能解掉跨仓硬耦合

前端 runtime schema 对 `AdminWordV3Capabilities` 是 `additionalProperties:false`，
`V3ValidationIssueCode` 是闭合枚举。所以只要 B1 无条件输出新 capability 键，未同步的前端每个 GET 都会挂，
于是「B1 部署不得早于前端」。

现有写法（`handler.rs:138-139 / 171-172 / 184-185`）是无条件 `Some(bool)`。**建议新能力改成
`flag.then_some(true)`——flag 关闭时该键缺席。** 这样：

- B1 可以随时部署（flag 关着，对旧前端零变化：sense 与候选的新字段空即省略，capability 键缺席，
  新 issue code 只在有人真写成分时才可能出现，而旧前端不会写）。
- 前端上线后再开 flag，立刻可编辑；回滚只需关 flag。

若坚持 `Some(bool)` 写法，则底线顺序是：B1 合入并导出 spec（先不部署）→ 前端 sync 并部署 →
B1 部署 → B2 → 前端 F2。

窗口期提示：前端新版上线后，**没刷新的旧标签页**在详情 / 保存 / 发布 / 发布历史会报
「响应格式异常，已安全停止」，而 PUT 其实已落库（假失败），刷新即恢复。部署时广播一次刷新。

---

## 1. B1 必做清单

### 1.1 migration

- [ ] 新建 `lexicon.v3_phrase_sense_component_usages`：列 / CHECK / 目标侧外键逐条照抄
      `20260830060000_add_phrase_variant_component_usages.up.sql:3-110`，owner 换成
      `sense_id UUID NOT NULL` + `FOREIGN KEY (sense_id, entry_id) REFERENCES lexicon.nodes(id, entry_id) ON DELETE RESTRICT`。
- [ ] `UNIQUE (sense_id, ordinal)` / `UNIQUE (sense_id, id)` 与两个索引**必须换新名**（索引名按 schema 唯一）；
      FK / CHECK 名可保留 `lexicon_v3_phrase_components_*` 前缀（按表唯一），`repository/entries.rs:18-21`
      的错误映射因此不必动。
- [ ] `nodes` / `entry_publication_nodes` / `entry_publication_sense_refs` 的 CHECK **不需要新 ALTER**（已含）。
- [ ] down.sql 仿旧 down 加「有数据即 RAISE」。不迁数据。

⚠️ **新表与 `lexicon.senses` 之间没有外键**，owner 指向 `lexicon.nodes`。`replace_meanings_content`
只对 nodes 写 `removed_from_draft_at`、不硬删，其 DELETE 的八张表也不含成分表——**成分行的清理必须由写入侧
自己 delete-then-insert**，不要指望 CASCADE。

### 1.2 dto

- [ ] `PresenceAwareVec` 补一个 inherent `is_empty`（现在只有 `was_present` / `preserve_missing_from`，
      `skip_serializing_if` 引不到）。
- [ ] `WordSenseV3`（807-824）与 `WordSenseWritableV3`（900-917）新增
      `#[serde(default, skip_serializing_if = …)] #[schema(value_type = Vec<PhraseComponentUsageV3>, max_items = 100)]
pub component_usages: PresenceAwareVec<PhraseComponentUsageV3>`（**不要写 `required = true`**，
      utoipa 里去掉它就是可选）。
- [ ] `SentenceTargetSenseV3`（`dto/operations.rs:795-805`）新增
      `#[serde(default, skip_serializing_if = "Vec::is_empty")] pub component_usages: Vec<PhraseComponentUsageV3>`。
- [ ] 三个变体的 `component_usages`（`dto/v3.rs:273 / 288 / 303`）与
      `PublishedSentenceTargetCandidateV3.component_usages`（`operations.rs:850-851`）：
      **只去掉 `required = true`，值与序列化都不变**。理由：前端 runtime schema 由 B1 spec 生成，
      B1 若仍标 required，B2 停输出时前端会 `missing_required_property`。
- [ ] `AdminWordV3Capabilities`（999-1017）新增 `sense_component_usages: Option<bool>`，
      写法同 `draft_relation_prebinding`，输出见 §0。
- [ ] `V3ValidationIssueCode`（1369+）+ `as_str`(1437) + `From`(1571) 新增 7 个 code，见 §1.6。

### 1.3 写路径 `save_meanings_v3`（v3.rs:1903 起）

- [ ] 1920 之后：`preserve_missing_sense_component_usages(&mut content, &compatibility_source.meanings)`
      （仿 `preserve_missing_sentence_translations`，按 sense id）。缺键 = 保持不变，显式 `[]` = 清空。
- [ ] 1929 之后：`validate_sense_phrase_components(...) -> Vec<DraftValidationIssue>`，非空即
      `v3_validation_failed`（save / complete 都拒）。
- [ ] **V3→V2→V3 serde 往返会静默吞掉新字段**（`WordSenseV2` 无该字段且不 deny），三处持久化点都要回填：1. `v3.rs:1937-1939` 丢 → `2070-2073` 重建 canonical（仿 2074 `copy_sentence_translations`）→ `2217-2226` 落投影；2. `v3_publication.rs:116` 丢 → `171-183`（仅 newly_bound 非空）经 `sync_canonical_meanings` 覆盖投影与 `word.meanings`；3. `v3_publication.rs:272` 无条件重建 → `280-281` 进快照、`302` 进响应体。
      建议做成同一个 `restore_v3_only_sense_fields`，**同时搬 `zh_translations` 与 `component_usages`**。
      不带 `serde(default)` 的话表现是 500 而非静默丢。> 顺带确认一下疑似既有缺陷：发布快照路径的 `v2_meanings_to_v3` 好像只保留 1 条 `zh_translation`。我没实测。
- [ ] 2157 之后：`replace_v3_sense_component_usages(&mut tx, entry_id, &canonical_content)`。

### 1.4 新增 `replace_v3_sense_component_usages`

- [ ] 语义 = 先按 `entry_id` 整表 DELETE，再遍历 pos/sense/component
      `upsert_v3_node(id, entry_id, "phrase_component_usage", Some(sense.id), "meanings.phrase_component_usage")` + INSERT（对齐 `replace_v3_forms:3779` 的写法）。节点：`stable_slot = false`，step = Meanings，
      ordinal = 数组下标。
- [ ] ⚠️ **调用点是 4 处，不是 3 处。** `replace_meanings_content` 的 V3 可达调用点：
      `v3.rs:1755`（save_forms_v3）、`v3.rs:2149`（save_meanings_v3）、`v3.rs:2799`（关联对账）、
      `repository/entries.rs:1124`（`sync_canonical_meanings` 内部，由 `v3_publication.rs:174` 在 newly_bound 非空时触发）。
      `publishing.rs:255` 是 V2 路径，对 V3 不可达。
      现有的 `replace_v3_sentence_translations` 只覆盖前 3 处（1763 / 2157 / 2802），**第 4 处是发布路径上的
      既有缺口**——漏了它，带 newly_bound 的发布会先退役成分节点、再在 `insert_v3_publication_nodes` 漏行，
      最后 `sense_refs.source_node_id` 外键失败，发布直接挂。
- [ ] 备选（你自选）：把 `component_usages` 并进 `DraftMeaningsStepContent` 并在 `insert_meanings` 内随 sense 重建
      （与 relations 同款），天然覆盖所有调用点，但要改 V2 形状的内部结构。

### 1.5 退役

- [ ] `repository/entries.rs:1076-1092` 的退役条件改成
      `node_type = ANY($2) OR node_role = 'meanings.phrase_component_usage'`。
- [ ] ⚠️ **绝不能把 `phrase_component_usage` 直接加进那个 node_type 列表**：B1 期间 forms 侧仍在产出同 type 的
      变体级节点，一旦被误退役，发布时 `insert_v3_publication_nodes`（按 `removed_from_draft_at IS NULL` 拷贝）
      漏行 → `insert_publication_sense_refs` 外键违约 → 发布失败。B2 之后才能简化为按 type。

### 1.6 校验搬迁与 issue

改动面比「换个遍历源」大，至少包括：签名从 `DraftFormsStepContentV3` 改 `DraftMeaningsStepContentV3`(3004)；
`ensure_phrase_component_ownership`(2972-2998) 需要 sense 版；≤100 从每变体改每 sense(3011-3021)；
成分收集遍历源(3023-3036)；调用点从 1542/1640 迁到 `save_meanings_v3`；单测夹具 4823-4914 重写。
`phrase_component_matches_target`(3174-3252) 不引用 owner，**可原样复用**。

⚠️ `phrase_component_resolved_target_ids`(3151-3172) **必须同时扫目标的 `forms` 与 `meanings`**——
发布快照不可变，存量短语的成分还在 forms 上，只看 meanings 会漏掉套娃检测。

issue 形状：`step = meanings`；`node_role` 取 `meanings.phrase_component_usage`（成分）或 `meanings.sense`；
`ancestor_node_ids = [pos_id, sense_id]` / `[pos_id]`；**不扩 `V3DraftNodeLocation`**。

| code                                  | node_id  | field              | 触发                                                                     |
| ------------------------------------- | -------- | ------------------ | ------------------------------------------------------------------------ |
| `phrase_component_not_allowed`        | sense.id | `component_usages` | 非短语携带成分                                                           |
| `phrase_component_limit_exceeded`     | sense.id | `component_usages` | 单 sense > 100                                                           |
| `phrase_component_literal_invalid`    | 成分 id  | `literal`          | trim / 空 / > 200                                                        |
| `phrase_component_self_target`        | 成分 id  | `target`           | 目标 = 本词条                                                            |
| `phrase_component_target_unavailable` | 成分 id  | `target`           | 目标不存在 / 归档 / 非 V3 / publication 不匹配；发布时 revision 锁定失败 |
| `phrase_component_target_nested`      | 成分 id  | `target`           | 目标短语自身含成分                                                       |
| `phrase_component_target_stale`       | 成分 id  | `target`           | `phrase_component_matches_target` 八项任一不符                           |

可以合并或改名，但**最终列表请回传**——前端 `V3_VALIDATION_ISSUE_CODES` 与文案表之间有 `satisfies` 强制同步。

### 1.7 发布与下游

- [ ] `phrase_component_publication_references`(v3_publication.rs:843-929) 入参改 `(forms, meanings)`，B1 两侧都收。
- [ ] `v3_contract.rs:713-746 meanings_node_count` 计入 `sense.component_usages.len()`（`forms_node_count` B1 不动）。
- [ ] `repository/publications.rs:836-942` 的 `unavailable_outbound_sense_refs_for_restore` / `_for_publication`
      补 `reference_kind = 'phrase_component'` 分支（条件同 `relation`）——这是既有缺口。
- [ ] `repository/entries.rs:789-792` / `848-853`、`query.rs:578-582` 各加新表分支（旧表分支 B1 保留）。
- [ ] `sentence_association.rs`：`PublishedAssociationSense` 加 `component_usages`；候选 `senses[]` 映射带上。
      ⚠️ `SentenceTargetSenseV3.component_usages` 现在由 `association_senses(&meanings)` 构造，
      而那份 meanings 是快照 V3→V2 往返的产物(561-565, 618)，**必须改从 V3 meanings 取**，
      前提是发布快照里真有该字段（依赖 §1.3）。
- [ ] `Linked.target_component_usages` 改取**被选中 sense** 的成分。
      ⚠️ 现有夹具把成分挂在 `regional_variants.common` 上，改完 `sentence_association_tests.rs:215/254` 与
      `lexicon_handler.rs:19255/19277` 会挂，需同批把夹具搬到 sense 级。
- [ ] **候选级 `PublishedSentenceTargetCandidateV3.component_usages` 语义保持不变**（仍是命中词形）。
      不要改成词性级并集——前端的文案、componentWords 派生与候选级回退都依赖旧语义。

### 1.8 openapi.rs

- [ ] `2377-2390` 断言：B1 翻转（三个变体 required 不再含 `component_usages`），或推迟到 B2 连字段一起删——
      你自选，`serde(default)` 已经能接受缺失。加新断言：`WordSenseV3` / `WordSenseWritableV3` /
      `SentenceTargetSenseV3` 的 `component_usages.maxItems == 100` 且不在 required；
      `AdminWordV3Capabilities.properties.sense_component_usages` 存在。

### 1.9 集成测试（tests/lexicon_handler.rs）

释义级保存 → 新表行 + nodes(type/role/parent)；GET 往返（空省略、非空回显、缺键不清空）；
**词形步重保存后释义级成分仍在**；发布 → `sense_refs(kind='phrase_component', source_node_id=成分 id)`；
**带 newly_bound 的发布后快照仍含成分且发布节点齐全**（§1.4 第 4 个调用点）；
候选 `senses[].component_usages` 与候选级并存；关联 `target_component_usages` 取自 sense；
7 个 issue code 各一例；删被引用词义 → `sense_has_inbound_publication_refs`；`unavailable_outbound_*` 新分支。
既有变体级用例 18825-19984 在 B1 **保留**，只改 spec 断言。

---

## 2. B2 清单（前端 F1 稳定一版后）

⚠️ **B2 的定义被收窄了**，不是「删字段」：

- [ ] 三个变体的 `component_usages`：**停止输出，但继续接受并忽略**——保留
      `#[serde(default, skip_serializing, rename = "component_usages")]` 的兼容字段。
      理由：前端 F1 的 `variantWire` 每次词形保存都发这个键（含 `[]`），变体 struct 是 `deny_unknown_fields`，
      硬删则**所有词形保存 400**。注意 utoipa 5 把 `skip_serializing` 等同 `skip`（直接从 schema 移除），
      所以 schema 移除与 `openapi.rs` 断言删除必须同批。
- [ ] `PublishedSentenceTargetCandidateV3.component_usages` 与 `Linked.target_component_usages`：
      **不能停输出**，改为**恒输出 `[]`**。`sentence_associations` 的 CHECK（`20260830070000`）要求
      `target_publication_id` 与 `target_component_usages_snapshot` 同生同灭，落库侧也继续写 `[]`。
      真正删除推迟到前端 F2 之后的 B3。
- [ ] migration：`DELETE FROM lexicon.v3_phrase_variant_component_usages`（预期 0 行）→ 退役
      `node_role = 'forms.phrase_component_usage'` 的活节点 → `DROP TABLE`；down 重建空的旧表。
- [ ] service 删变体侧：`preserve_missing_component_usages`(644-705) 与 1534/1617 调用；变体壳校验与
      1535-1542/1639-1640；`push_v3_form_variant_nodes` 成分参数；`replace_v3_forms` 3776 角色 + 3779 DELETE；
      `insert_v3_variant` 成分参数；`retired_role` 2947；`forms_node_count` 成分项。
- [ ] 旧表分支：`entries.rs:789-792 / 848-853`、`query.rs:578-582`；此时可把 `phrase_component_usage`
      直接加进 `entries.rs:1076-1092` 的 type 列表。
- [ ] `phrase_component_publication_references` 只收 meanings。

---

## 3. 部署前请跑一遍存量 SQL 并回传

```sql
WITH variants AS (
  SELECT p.entry_id, rv.key AS dialect, rv.value AS variant
  FROM lexicon.entry_editor_projection p
  CROSS JOIN LATERAL jsonb_array_elements(p.forms->'pos') pos
  CROSS JOIN LATERAL jsonb_array_elements(pos->'forms') form
  CROSS JOIN LATERAL jsonb_each(form->'regional_variants') rv
  WHERE rv.key IN ('common','uk','us'))
SELECT count(*) AS draft_variant_components, count(DISTINCT entry_id) AS entries
FROM variants CROSS JOIN LATERAL jsonb_array_elements(COALESCE(variant->'component_usages','[]'::jsonb)) cu;

SELECT count(*) AS variant_table_rows FROM lexicon.v3_phrase_variant_component_usages;
SELECT node_role, (removed_from_draft_at IS NULL) AS active, count(*)
FROM lexicon.nodes WHERE node_type = 'phrase_component_usage' GROUP BY 1,2;
SELECT count(*) FROM lexicon.entry_publication_sense_refs WHERE reference_kind = 'phrase_component';
SELECT count(*) FROM lexicon.entry_publication_nodes WHERE node_type = 'phrase_component_usage';
```

本地实测 2026-09-02：草稿变体级成分 1、关系表 1 行、活节点 1、发布引用 0、发布节点 0。测试服 / 生产预期全 0。

---

## 4. 回滚注意

B1 部署后若要回退到旧后端，凡 sense 带非空 `component_usages` 的 JSON 都会让旧后端
`deny_unknown_fields` 报 500。**需要去键的地方有三处**：`entry_editor_projection.meanings`、
`entry_publications.snapshot`、**以及 `platform.idempotency_records.response_body`**
（TTL 24 小时，V3 创建 / 发布 / 生命周期路径都会 typed 回放，含 capabilities 键，回放会 500）。
`snapshot_hash` 目前无读路径校验，剥键不会立刻炸，但会留下哈希与内容不一致的历史行。
采用 §0 的 flag 缺席方案则回滚 = 关 flag，代价小得多。

---

## 5. 完成后请回传给前端

1. B1 合入后的 `docs/openapi.json` 路径与 commit（前端 `OPENAPI_SOURCE` 指过去跑 `sync:openapi`）。
2. capability 键名确认为 `sense_component_usages`，以及**它是恒发 `Some(bool)` 还是 flag 关闭时缺席**
   （这决定两边的部署先后）。
3. 最终 issue code 列表（上面 7 个如有合并 / 改名请点名），以及各自的 `node_id` / `field` 约定。
4. 测试服与生产的存量 SQL 结果。
5. B2 合入后的第二份 `openapi.json`。
