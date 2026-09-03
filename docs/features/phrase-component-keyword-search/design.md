# 成分用词候选支持关键字搜索 技术设计文档

> 与既有 feature skill 模板的一处偏差：本仓的后端已从 tsz-go 迁到同级的 tsz-rust，且本次功能
> 前端单独做不了。所以本文除前端方案外，把后端改动也写成**具体方案**（不是「对接建议」），
> 由用户在评审时一并确认是否由本次一起落地。

## 方案概述

后端新增一个**按关键字检索成分目标**的端点，复用现有句中目标发现的候选组装逻辑，返回与
`PublishedSentenceTargetCandidateV3` 完全同构的候选；前端在成分用词弹层里加一个搜索输入，
输入关键字时改调这个新端点，不输入时维持现有的按词面精确匹配。级联面板、勾选写回、
命中标识等下游逻辑全部不变。

**为什么不复用智能词库列表的关键字端点**：它返回的是列表行（`AdminWordListItemV3`），
只有 `id / presentation / gloss / pos_list / levels`，拿不到成分关联必需的
`pos_id / base_form_id / form_id / variant_id / sense_id`，也拿不到 #88 才下沉到后端的
`base_form_ids`。前端二次推导等于把 #88 修掉的坑重新挖开。

**为什么不给 `sentence-targets/resolve` 加一个 mode**：该端点整体是「句子文本 → 若干区间 →
每个区间的候选」的形状，响应里的 `range_results[].source_segments`、`normalized_surface`、
`segments_fingerprint` 以及基于 fingerprint 的游标都依赖区间。关键字搜索没有区间，塞进去
只能造一个假区间，契约会变得难解释。新端点更干净，且两者共用同一套候选组装函数。

## 代码影响范围

### 后端 tsz-rust

| 文件                                                  | 改动                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lexicon/repository/sentence_target_discovery.rs` | 新增 `published_component_target_surfaces`：与现有 `published_sentence_discovery_surfaces` 同样的 SELECT 与过滤（仅已发布、未归档、`content_scope = 'current_publication'`），把 `normalized_surface = ANY($3)` 换成 `surface ILIKE $3`（`escape_like_literal` 转义后加 `%` 包裹），加 `LIMIT` |
| `src/lexicon/dto/v3.rs`                               | 新增请求 `SearchComponentTargetsV3Input { schema_version, q, kind?, page_size? }` 与响应 `SearchComponentTargetsV3Response { schema_version, matches: Vec<PublishedSentenceTargetCandidateV3>, total, truncated }`                                                                             |
| `src/lexicon/service/sentence_target_discovery.rs`    | 新增 `search_component_targets_v3`：走与 resolve 相同的只读 REPEATABLE READ 事务 → 新 repository 查询 → `current_publication_snapshots` → 复用 `published_candidates` 组装                                                                                                                     |
| `src/lexicon/handler.rs` / `src/lexicon/router.rs`    | 注册 `POST /entries/component-targets/search`，能力门复用 `SMART_LEXICON_V3_SENTENCE_TARGET_DISCOVERY`                                                                                                                                                                                         |
| `docs/openapi.json`                                   | `cargo run --bin export_openapi` 重新导出                                                                                                                                                                                                                                                      |
| `docs/frontend-integration.md`                        | 新增一节说明端点、字段与部署顺序                                                                                                                                                                                                                                                               |
| `tests/lexicon_handler.rs`                            | 集成测试（见测试策略）                                                                                                                                                                                                                                                                         |

`published_candidates` 需要一个 `SentenceTargetMatchEvidenceV3`。关键字搜索没有句子区间，
方案是构造一条以关键字本身为 `surface` 的 evidence，`match_kind` 按命中词面的分词数取
`word` 或 `contiguous_phrase`。**这是本设计里最需要评审确认的一处契约取舍**——见开放问题。

### 前端 tsz

| 文件                                                         | 改动                                                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/admin-word-v3.ts`                        | 新增 `SearchComponentTargetsV3Input` / `SearchComponentTargetsV3Response`，wire 保持 snake_case                                                                       |
| `packages/api-client/src/*`                                  | 新增 `searchComponentTargets` 请求；`sync:openapi` 重新生成 `openapi.snapshot.json` 与 `admin-word-v3.runtime-schema.json`，契约测试的 `_source_sha256` 跟进          |
| `apps/admin/src/features/dictionary/word-creation-v3/api.ts` | 暴露新请求                                                                                                                                                            |
| `.../components/V3PhraseComponentUsagesCard.tsx`             | `CascaderLinkContent` 内新增搜索输入与防抖；关键字非空时改调新端点，为空时维持现有 resolve 调用；候选 → 级联选项的转换函数 `cascaderOptionsFromGroups` 与写回逻辑不变 |
| `.../components/V3SentenceTargetDiscovery.css`               | 搜索框与截断提示的样式                                                                                                                                                |
| `.../components/V3PhraseComponentUsagesCard.test.tsx`        | 新增用例（见测试策略）                                                                                                                                                |
| `e2e/tests/support/mockAdminV3Api.ts`                        | 新端点的桩                                                                                                                                                            |

## 后端对接

端点：`POST /api/v1/admin/lexicon/entries/component-targets/search`

请求：

```jsonc
{
  "schema_version": 3,
  "q": "give", // 1..=100 码点，两端不留空白
  "kind": "word", // 可选，不传则单词与短语都返回
  "page_size": 50 // 可选，默认 50，上限 200
}
```

响应：

```jsonc
{
  "schema_version": 3,
  "matches": [
    /* PublishedSentenceTargetCandidateV3[]，与 resolve 的 published_matches 同构 */
  ],
  "total": 12,
  "truncated": false
}
```

复用的既有约束（无需新增）：

- 只查 `content_scope = 'current_publication'` 且 `entry.current_publication_id = source.publication_id`，
  归档词条被 `entry.archived_at IS NULL` 排除。
- 候选里每个词形自带 `base_form_ids`（#88 已落地），前端照旧按它挑 `target_base_form_id`。
- 成分保存的其余限制（不得自指、短语套短语只一层、每变体 100 条）由
  `validate_phrase_components` 在保存时兜底，本端点不重复校验。

## 复用与约定

- 类型进 `@tsz/types`，snake_case 1:1 镜像 wire；组件内部状态用 camelCase。
- 请求进 `@tsz/api-client`，admin 侧经 `word-creation-v3/api.ts` 暴露。
- UI 用 antd v6（`Input.Search` 或 `Input` + 防抖），不引 tailwind / `@tsz/ui`。
- 后端复用现有只读事务隔离级别、能力门与 `published_candidates` 组装函数，不新造一套。
- 响应进 admin 的 fail-closed runtime contract，新增 schema 要进 `RUNTIME_SCHEMA_ROOTS`。

## 数据流 / 时序

```
点击成分词
  └─ 关键字为空（默认）
       POST entries/sentence-targets/resolve   ← 现状，按词面等值
  └─ 关键字非空（防抖 300ms）
       POST entries/component-targets/search   ← 新端点，ILIKE 包含匹配
            └─ surface_sources 模糊命中 → 去重取 entry_id
            └─ current_publication_snapshots 取发布快照
            └─ published_candidates 组装（含 forms[].base_form_ids、senses）
  └─ 两条路都产出 PublishedSentenceTargetCandidateV3[]
       └─ cascaderOptionsFromGroups → 词条/词形/词义三层级联（不变）
       └─ 勾选 → rebuildUsages → updateVariantComponentUsages（不变）
       └─ 保存走词义步，脏词形先经影响确认（本次不动）
```

## 测试策略（概览）

后端：

- 单测：关键字转义（`%`、`_` 字面量不被当通配符）、`page_size` 边界、`q` 长度边界。
- 集成（`#[sqlx::test]`）：关键字命中已发布词条并返回完整候选字段；草稿不进结果；
  归档不进结果；屈折词形命中原形词条；`kind` 过滤；超上限时 `truncated = true`；
  能力门关闭时的行为。

前端：

- 单测：关键字为空走 resolve、非空走新端点；防抖只发一次；空结果空状态；
  搜到的目标勾选后写回的 `component_usages` 字段正确（尤其 `target_base_form_id`
  取自该词形的 `base_form_ids`）；关键字过短不发请求。
- e2e：mock 新端点，走一遍「点词 → 搜索 → 选词形词义 → 保存」。
- 手测：真机跑一遍「在 `give me` 里把 `give` 关联到 `give up`」，确认保存不报 400。

具体用例矩阵在动工阶段用 test skill 落地。

## 风险与回滚

- **`ILIKE '%q%'` 走不了索引**。`lexicon.surface_sources` 现有 4 个索引全是 btree，
  前置通配符用不上，会退化为顺序扫描（本地表 1242 行，生产量级未知）。缓解：关键字下限
  2 字符、`LIMIT` 上限、只扫 `content_scope = 'current_publication'` 分片。若生产量级
  确实大，再评估装 `pg_trgm` 加 GIN 索引（当前库只装了 `plpgsql`，属独立的迁移改动）。
- **契约新增必须前后端同批部署**。admin 的 runtime schema 对响应是
  `additionalProperties: false` 且校验 `required`，哪一侧先上都会打挂（与 2026-09-02
  `dialects` 那次同理）。
- **搜索结果里同形异义词难区分**。第一列只有词面，两条 `give` 肉眼一样。见需求开放问题 6。
- **回滚**：后端纯新增端点，revert 即可，无迁移、无数据变更；前端关键字为空时的行为与
  现状完全一致，前端 revert 后功能回到今天的样子。若前端已同步了带新 schema 的快照，
  回滚后端时需同步回滚快照。

## 开放问题（需评审拍板）

1. **`match_kind` / `evidence` 在关键字模式下的语义**。现有候选带 `matches[]` 证据，描述
   「命中的是句子里的哪一段」。关键字搜索没有句子。方案是以关键字自身构造 evidence，
   但这会让「命中」标识的含义从「与成分词一致」变成「与关键字一致」。
   备选：关键字模式下不给 evidence，前端不显示命中色。**建议后者**，语义更干净。
2. 是否随本次一起改后端。若只做前端，本功能无法实现（见方案概述）。
3. 需求文档里的 6 个开放问题（搜索框形态、关键字下限、上限与分页、是否允许短语目标、
   是否覆盖屈折词形、是否显示释义区分同形词）。

## 动工前的准备

当前改动在 worktree `tsz/.claude/worktrees/dev-page-test`（分支 `claude/dev-page-test`），
已有 18 个未提交文件，内容是列表方言列、成分用词卡片交互与 409 确认窗三件事。本功能建议
另起分支，评审通过后再定是先把现有改动 ship 掉还是并行开。
