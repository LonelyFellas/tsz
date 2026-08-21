# 关联词不存在时创建草稿并关联：技术设计文档

## 方案概述

**前端做编排，后端放宽一条校验。**

创建草稿这半边**不需要任何新接口**——现有的 `detect` + `createV2` 两步就够，而且报告要求的「避免重复入库」正是这两步已经内建的能力（智能词库重复检测 + 同形确认 token）。前端要做的是把这套流程从「第 1 步的独立页面」复用到「第 3 步的关联词下拉里」。

真正的拦路虎只有一条：**后端目前在保存草稿时就要求关联目标必须是已发布词义**。这条不放宽，功能无法落地。

**备选方案（不选）**：把关联降级成自由文本、先存字符串、以后再解析。违反报告的硬约束「草稿关系必须保存明确的词条 ID 和词义 ID」，而且会制造一批无法追溯的脏数据，后面补 ID 的成本远大于现在做对。

## 关键前置：关联目标必须已发布（后端）

这是本次评估最重要的发现，**决定功能能不能做、以及要做多大**。

`src/lexicon/service/editing.rs:617-629` 的 `save_meanings_step` 里：

```rust
let reference_resolution = resolve_meaning_references(
    &mut transaction, entry_id, &mut content,
    ReferenceResolutionMode::Canonicalize, false,
).await?;
if !reference_resolution.issues.is_empty() {
    return Err(LexiconServiceError::ValidationFailed(reference_resolution.issues));
}
```

解析走 `resolve_current_published_senses`（`repository/publications.rs:425-468`），SQL 强制 JOIN：

```sql
JOIN lexicon.entry_publications publication
  ON publication.id = entry.current_publication_id
JOIN lexicon.entry_publication_nodes publication_node
  ON publication_node.node_id = requested.target_sense_id
 AND publication_node.node_type = 'sense'
```

解析不到就产出 `relation_target_unavailable` —「关联词目标必须是目标词条当前发布版本中的有效词义」（`publishing.rs:1009-1013`）。

**结论**：指向草稿词义的关联，**今天连保存都做不到**，不是只有发布时才拦。前端 Select 只列已发布词条，是忠实反映这条后端约束，不是前端偷懒。

## 代码影响范围

### 前端 `apps/admin`

| 文件                                        | 改动                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word-creation/MeaningsAndExamplesStep.tsx` | 关联词 Select 的 `notFoundContent`（`:1515` 附近）从纯文案改成带「创建草稿并关联」入口；新增创建后回填 `target_word_id` / `target_sense_id` 的逻辑；关联项增加「进入该草稿」的跳转 |
| 新增（建议独立模块）                        | 「就地创建关联草稿」的编排：detect → 查重 → （同形确认）→ createV2 → 取默认词义 → 回填。逻辑量不小且要单测，不要塞进已经 2700+ 行的 MeaningsAndExamplesStep                        |
| `features/dictionary/api.ts`                | 可能需要一个查「既有草稿」的搜索（现有 `relatedSearch` 只返已发布，见下）                                                                                                          |

**复用而非新写**：`word-creation/api.ts` 已有 `useDetectWordV2`（`:44`）与 `useCreateWordV2`（`:57`），`CreateEntryStep.tsx:590-591` 就是这么用的。就地创建应当复用同一对 hook 与同一套同形确认流程，**不要另起一套创建路径**，否则重复检测/幂等/同形确认三件事都要再实现一遍。

### 类型与数据

`WordRelationV2`（`packages/types/src/admin-word-v2.ts:155`）**无需变更**：

```ts
target_word_id: string;   // 必填
target_sense_id: string;  // 必填
target_headword?: string; // 服务端只读快照
target_gloss?: string;    // 服务端只读快照
```

天然满足「必须保存明确的词条 ID 和词义 ID」。但注意 `target_headword` / `target_gloss` 是**服务端从发布快照回填的只读字段**——关联到未发布草稿时这两个字段拿什么填，需要后端一并定（见下）。

### 搜索侧的缺口

现有关联词搜索只返已发布词条（报告实测「关联词搜索会排除草稿」）。而本功能要求「创建前检查**已发布词条和既有草稿**」。

**已核实：不需要新增检索接口。** `detect` 的重复检测（`smart_dictionary.duplicates`）本来就覆盖草稿——底层查询（`repository/dictionary.rs:141-145`）不按发布状态过滤，而是把 `is_archived` / `is_published` 作为**标志位**一并返回。所以就地创建流程里那次必调的 `detect`，顺带就把「已发布 + 既有草稿」两类重复都查了，前端按标志位区分展示即可。

## 后端对接建议

> 本仓不改后端。以下需转达后端评估。

### 必须放宽：允许关联指向未发布词义

`save_meanings_step` 里的引用解析（`editing.rs:617`）目前对草稿目标直接 422。要让本功能成立，**保存阶段必须允许**关联指向同库内存在但未发布的词义。

建议区分两个阶段：

- **保存草稿**：只校验目标**存在且未归档**（词条 ID + 词义 ID 真实存在），不要求已发布。`target_headword` / `target_gloss` 这两个只读快照，指向草稿时可取草稿当前值或留空——**需要后端定**，前端要据此决定关联项显示什么。
- **发布**：维持现有的 `relation_target_unavailable`，或按下面的产品决策调整。

### 待产品 + 后端共同拍板：发布时未解析关联怎么处理

见 requirements.md 开放问题 1。**特别提醒后端注意方案 A（阻止发布）的死锁**：A 与 B 互为近义词时两条都发不出去，且无自救路径。若选 A，必须同时提供破环手段（例如允许发布时临时忽略指向草稿的关联，或提供「先发布不带关联的版本」）。

### 不要动的

- 发布时的完整性校验（`publishing.rs:140-153`）与三层守门，不放宽。
- 现有的重复检测与同形确认流程，前端要复用它们，行为别改。

## 复用与约定

- 逻辑 → 编排函数放 admin 本地模块（与 `@tsz/shared` 无关，不跨端复用）；类型 → `@tsz/types`（本次无变更）；请求 → `@tsz/api-client`（复用现有 detect/createV2）。
- admin 端只用 antd v6：下拉的自定义 `notFoundContent`、确认框都走 antd，**禁止引入 tailwind / `@tsz/ui`**。
- `apps/admin/src` 90% 覆盖率门槛；编排逻辑是纯函数 + hook，应当单独成文件并覆盖到。
- 两字按钮文案之间插空格。

## 数据流 / 时序

```
管理员在近义词输入 reliability
  → 关联词搜索（已发布）无结果
  → 点「创建草稿并关联」
  → POST /lexicon/entries/detect { language, headword }
      ├─ smart_dictionary.duplicates 非空 → 不创建，列出已有项供选择
      ├─ 需要同形确认 → 走现有同形确认流程，拿 confirmed_surface_match_token
      └─ 无冲突 → 继续
  → POST /lexicon/entries { schema_version:2, detection_id, headwords, confirmed_surface_match_token? }
      → 返回新草稿（含默认词性与默认空词义）
  → 取新草稿的默认 sense_id
  → 回填当前关联项：target_word_id = 新词条 ID，target_sense_id = 默认词义 ID
  → 管理员继续录，稍后 PUT /steps/meanings（intent=save）
      → ⚠️ 这一步现在会 422，等后端放宽
```

## 测试策略（概览）

具体用例设计在动工阶段交给 **test skill**，此处只列方向：

- **单测（编排逻辑）**：无结果 → 出创建入口；detect 命中重复 → 不创建且列出已有；需同形确认 → 带 token 创建；创建成功 → 正确回填两个 ID；创建失败 → 当前已录内容不丢。
- **单测（组件）**：`notFoundContent` 的两种形态；关联项的跳转入口。
- **mock 同口径**：`adminWordsMock` 的 `saveMeaningsStep` 要跟上后端最终口径。**本仓已被「mock 绿、真机红」坑过两次**（节点 ID、发音人），这次务必让 mock 与后端放宽后的校验一致，否则本地全绿、真机 422。
- **e2e**：输入库外词 → 创建草稿并关联 → 保存 → 新草稿出现在列表。
- **真机**：后端放宽上线后在测试服验，重点是保存不再 422、以及发布时未解析关联的行为符合最终定的规则。

## 风险与回滚

| 风险                       | 评估                                                 | 处置                                                    |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **后端不放宽则功能不成立** | 前端单独做完只能得到「点了创建、一保存就 422」       | 后端放宽是前置，前端 PR 不得先于后端上生产              |
| 互相关联导致发布死锁       | 方案 A 下**真实存在**，近义词互指极自然              | 产品决策前必须先解决；见 requirements 开放问题 1        |
| 误建空草稿污染词库         | 管理员点错就多一条空词条                             | 前置重复检测已挡一道；是否需要撤销/连带删除见开放问题 3 |
| 悬空关联                   | 补录时删掉默认词义，原关联指向不存在的 sense         | 见开放问题 2，需定行为                                  |
| 关联项显示不出内容         | 指向草稿时 `target_headword`/`target_gloss` 可能为空 | 取决于后端怎么填这两个只读快照，前端要有降级文案        |

**回滚**：前端改动是新增入口，回滚即隐藏该入口，不影响已有关联；但**已经建出来的草稿和已存下的草稿关联会留在库里**——回滚前要确认这些数据在旧逻辑下不会导致保存/发布报错（旧逻辑会对草稿目标报 `relation_target_unavailable`），必要时需要数据清理方案。这一条比一般前端功能的回滚代价高，值得在上线前想清楚。
