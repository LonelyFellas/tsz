# 关联词不存在时创建草稿并关联：技术设计文档

> ## ⚠️ 本文档方案已作废（2026-08-23）
>
> 下文的「就地创建草稿并关联」方案，以及它依赖的 `target_state`、
> `confirmed_unresolved_relations_token`、`unresolved_relations` 三个契约，
> **后端从未实现**（tsz-rust `docs/openapi.json` 里均为 0 处）。
>
> 实际落地的是**待物化**形态：`WordRelationV2.pending_target_headword` 承载词面，
> `target_word_id` / `target_sense_id` 转为可选且与之互斥（库层
> `lexicon_relations_target_shape_check`）；待物化只允许存在于草稿，发布时后端
> 建出 `status=Draft`、默认词性 `noun` 的占位词条并回填 target，与发布同事务。
> 见 tsz-rust `ce3d351` / PR #59 与 `src/lexicon/service/publishing.rs`。
>
> **保留价值**：下方「后端核验结论（2026-08-22）」里关于学习端读取路径、
> outbox 不投递、发布快照无需剔除未解析关联的四条核验，依然是有效的事实记录。
>
> 前端跟进见分支 `feat/relation-pending-target`。

## 后端核验结论（2026-08-22）

后端已按本文档「后端对接建议」逐条核验并答复，评估文档见 tsz-rust 仓库
`docs/features/draft-relation-targets/backend-assessment.md`（PR #48）。以下结论已固化，不必再问；
行号指 tsz-rust `main` @ `2028ffd`，本仓已逐条复核代码。

**Q1 「保留在草稿里」怎么落地、学习端读关联走快照还是引用表 → 不用剔快照，硬依赖成立。**

- 学习端读关联这条路径**今天不存在**：lexicon 路由整体只挂在 `/api/v1/admin/lexicon` 下
  （`src/admin/router.rs:31` + `src/lib.rs:57`），handler 一律 `AdminAuth` + `require_active_admin`；
  非 admin 前缀只有 `/healthz`、`/readyz`、`/api/v1/auth/*`、`/api/v1/otp/send`。
- `platform.outbox_events` 只写不投递：4 处 INSERT，没有任何投递型消费者
  （只有 `repository/query.rs:12` 拿它 `count(*)` 当检索数据集版本号、`surface_backfill.rs:665` 读它算投影滞后量，
  两者都不消费事件；`attempts` / `locked_until` / `processed_at` / `last_error` 四列没有代码读写）。
- 管理端 surface 弹窗的 `inbound_relations` 由 `entry_publication_sense_refs` 驱动
  （`repository/surfaces.rs:93-110`），未解析的关联不在那张表里，查不到、也不会不一致。

⇒ **发布快照保持草稿内容的逐字副本，无需剔除未解析的关联**；requirements.md 决策记录 1 的硬依赖成立，
交互设计 1 与 2 不作废。

**Q2 指向草稿时 `target_headword` / `target_gloss` 填什么 → 后端回填草稿当前值。**

词头取自 `lexicon.entries` + `lexicon.entry_headwords`（与 `entry_by_id` 同口径），释义取自
`lexicon.entry_editor_projection.meanings` 里该 sense 的首条中文释义。新建草稿的释义通常是空串。

⚠️ **前端不得用「`target_gloss` 为空」推断任何状态**：`published_sense_gloss`（`publishing.rs:1122`）
无中文释义时返回空串，写库又是 `unwrap_or("")`，「空串」与「没有快照」在库里长得一模一样。一律看 `target_state`。

**Q3 未解析关联的清单与确认凭证由谁出 → 服务端出，本文档提的契约形状后端接受。**

- 清单与 token 走 `validate`，token 复用 `ImpactStore` 那条轻量路径（`preview_forms_impact` 是现成先例，
  TTL 10 分钟），不上 `SurfaceSnapshotStore` 那套重型的——清单短、不需要翻页与策略开关。
- `publish` 的 `confirmed_unresolved_relations_token` 是纯增量，对老请求逐字节相同，幂等重放不受影响。
- ⚠️ **`PublishAdminWordV2Input` 带 `deny_unknown_fields`**（`dto/operations.rs:698-706`）：前端提前发送这个
  新字段而后端还没上线，publish **直接 400**。**上线顺序必须后端先行**，见风险表。

### 核验纠正的四处（本文档已按此改）

1. **零词义的判据不是 `builtin_dictionary`，是 `word.meanings.pos` 为空数组。** 见「数据流」与 requirements 决策 2。
2. **`create` 自带 surface 闸门，可能 409 而不是 201**；其中撞上 ExactHeadword 的那一类**今天默认建不出来**。
   见「数据流」与风险表。
3. **`target_state` 四态改五态**：原 `missing` 拆成 `archived`（可恢复，指引「去恢复」）与 `detached`（必须重选）。
   见「类型与数据」。
4. **「不重存直接提交生效」的失败模式是静默 201，不是 `relation_target_stale` 的 422。**
   见「后端对接建议 · 4」。由此 `resolvable` 一态从「可裁」升为**必需**。

### 仍需后端确认的一条（本仓核验时新发现）

`resolved` 的判据若只是「目标已发布 + 快照字符串一致」，会漏掉一种组合：**源词条在目标发布之前就已经发布过**，
且保存关联时抄下的草稿释义恰好与目标后来发布的释义相同（目标补录完但没发布时建关联，很常见）。此时字符串比对通过 →
后端算出 `resolved` → 界面无标记，但这条关联**从来没进过本词条当前发布**的 `entry_publication_sense_refs`；
管理员点「提交生效」又正好撞上第 4 条的静默 201，两头都看不出异常。

建议 `target_state` 的判据加一层**本词条当前发布是否已收录该关联**：未收录且目标已发布 → `resolvable`
（要重存 + 重发），已收录且快照一致 → `resolved`。联调时对齐。

## 方案概述

**前端做编排与告知，后端放宽保存并把「未解析」变成一等状态。**

创建草稿这半边**不需要任何新接口**——现有的 `detect` + `createV2` 两步就够，而且报告要求的「避免重复入库」正是这两步已经内建的能力（智能词库重复检测 + 同形确认 token）。前端要做的是把这套流程从「第 1 步的独立页面」复用到「第 3 步的关联词下拉里」。

真正的拦路虎是：**后端目前在保存草稿时就要求关联目标必须是已发布词义**。这条不放宽，功能无法落地。

产品规则已定（requirements.md 决策记录 1，**显式 B**）：关联保留在草稿里、未解析的关联不进发布引用表（`entry_publication_sense_refs`）因而对外不生效、发布前逐条告知并确认。**注意措辞**：不生效指的是不进引用表，`publication.snapshot` 仍逐字保留这些关联，后端已确认无需剔除（见「后端核验结论」Q1）。据此，后端要做的不只是「放宽一条校验」，而是四件事——放宽保存、把发布时的解析失败从 422 改成清单、给关联加一个只读的 `target_state`（五态，见「类型与数据」）、以及在指向草稿时回填 `target_headword` / `target_gloss`。前端对应两处交互（见「交互设计」）。

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

| 文件                                                    | 改动                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word-creation/MeaningsAndExamplesStep.tsx`             | 关联词 `AutoComplete` 的 `notFoundContent`（`:1357`）从纯文案改成带「创建草稿并关联」入口；创建后回填 `target_word_id` / `target_sense_id` 并灌入 `senseChoices`；关联行加常驻的目标状态标记与按状态分支的行内入口（交互设计 1） |
| `word-creation/word-creation.css`                       | `.word-relation-row`（`:1437`）由单行三列改成两行：第二行放状态标记，只在有标记时占高度，不动现有三列的宽度分配                                                                                                                  |
| 新增 `word-creation/relationDraftCreation.ts`（+ 单测） | 「就地创建关联草稿」的编排：detect → 查重 →（同形确认）→ createV2 → 取默认词义 → 回填。逻辑量不小且要单测，不要塞进已经 2584 行的 MeaningsAndExamplesStep                                                                        |
| `word-creation/PreviewAndPublishStep.tsx`               | 「提交生效」前的未解析关联确认 `Modal`（交互设计 2），照 `FormsAndPronunciationStep` 的 pending-confirm 流程写；确认后带 token 重发 publish                                                                                      |
| 新增 `word-creation/unresolvedRelations.ts`（+ 单测）   | 把服务端给的未解析关联清单汇总成可展示结构（分组、去重、异常兜底），对应词形步的 `formsImpactSummary.ts`                                                                                                                         |
| `features/dictionary/api.ts`                            | 查重不需要新接口（见下）；若后端把未解析清单挂在 `validate` 上，`useValidateWordV2` 的返回类型跟着扩                                                                                                                             |

**复用而非新写**：`word-creation/api.ts` 已有 `useDetectWordV2`（`:44`）与 `useCreateWordV2`（`:57`），`CreateEntryStep.tsx:590-591` 就是这么用的。就地创建应当复用同一对 hook 与同一套同形确认流程，**不要另起一套创建路径**，否则重复检测/幂等/同形确认三件事都要再实现一遍。

### 类型与数据

`WordRelationV2`（`packages/types/src/admin-word-v2.ts:155`）的现有字段**无需变更**：

```ts
target_word_id: string;   // 必填
target_sense_id: string;  // 必填
target_headword?: string; // 服务端只读快照
target_gloss?: string;    // 服务端只读快照
```

天然满足「必须保存明确的词条 ID 和词义 ID」。`target_headword` / `target_gloss` 是**服务端只读快照**——关联到未发布草稿时后端**回填草稿当前值**（词头取 `lexicon.entries` + `entry_headwords`，释义取 `entry_editor_projection.meanings` 的首条中文释义，新建草稿通常是空串，见「后端核验结论」Q2）。

⚠️ **不要用 `target_gloss` 为空推断任何状态**：`published_sense_gloss`（`publishing.rs:1122`）无中文释义时返回空串，写库又是 `unwrap_or("")`，「空串」与「没有快照」在库里无法区分。判状态一律看 `target_state`。

**需要新增一个只读字段 `target_state`**（与上面两个同前缀、同为服务端只读快照），交互设计 1 靠它决定标记形态。**五态**——原设计的四态把「目标不可用」合成了一个 `missing`，这是错的，归档与词义被移除的正确处置相反：

```ts
/** 服务端只读快照：本条关联当前的可解析状态。 */
target_state?: "resolved" | "draft" | "resolvable" | "archived" | "detached";
```

| 取值         | 含义                                           | 界面                       | 阻断发布                             |
| ------------ | ---------------------------------------------- | -------------------------- | ------------------------------------ |
| `resolved`   | 目标已发布，且本词条存的快照与之一致           | 无标记                     | 否                                   |
| `draft`      | 目标词条还是草稿                               | 中性「草稿」+ 去补录       | 否（进 `unresolved_relations` 清单） |
| `resolvable` | 目标已发布，但本词条的快照还没跟上             | 「已发布」+ 重新保存       | 否                                   |
| `archived`   | 目标词条已归档                                 | 「目标已归档」+ **去恢复** | **是**（进 `issues`）                |
| `detached`   | 该词义已被移出目标草稿**且不在目标当前发布里** | 「目标已失效」+ 要求重选   | **是**（进 `issues`）                |

**`archived` 为什么不能与 `detached` 合成一个 `missing`**：归档完全可逆、而且无损——`restore` 与 `archive` 同走 `transition_lifecycle`，只是把 `archived_at` / `archived_by_admin_id` 置回 NULL（`repository/lifecycle.rs:15-16`），而 `current_publication_id` 全仓没有任何一处会清空它。所以恢复的一瞬间目标的发布快照原样回来，关联直接回到 `resolved`，连快照比对都不会变。若照原设计给它「目标已失效 + 要求重选」，管理员会去重选，**亲手毁掉一份本来完好的快照**。正确指引是「去恢复目标词条」。词义被移除才是真的必须重选。

**`detached` 的判据必须带「且不在目标当前发布里」**：发布期解析查的是 `entry_publication_nodes`（`repository/publications.rs:456-460` 与 `:504-508`），**完全不看 `lexicon.nodes.removed_from_draft_at`**。目标把一条**已发布**的词义从自己草稿里移除时，这条关联仍然能正常发布——状态还是 `resolved`，不是 `detached`。

`resolved` 与 `resolvable` 的分界由后端算：拿本词条存的两个字段与目标当前发布快照现场算出的两个字符串比对（headword 按 source_dialect 排序后用 `" / "` 拼接、gloss 取首条中文释义纯文本，`publishing.rs:1105-1131`）。前端不用管，知道它是字符串比对即可——**但注意「后端核验结论」末尾那条待确认：纯字符串比对会漏掉「算出来是 `resolved`、却从未进过本词条当前发布」的组合。**

为什么不让前端自己推：前端只有 `target_word_id` / `target_sense_id` 两个 UUID，`related_search` 查不到草稿，`target_headword` 又不是前端写的，本地无从判断。加一个字段比让前端再多调一轮接口便宜得多。

### 搜索侧的缺口

现有关联词搜索只返已发布词条（报告实测「关联词搜索会排除草稿」）。而本功能要求「创建前检查**已发布词条和既有草稿**」。

**已核实：查重不需要新增检索接口。** `detect` 的重复检测（`smart_dictionary.duplicates`）本来就覆盖草稿——底层查询不按发布状态过滤，而是把 `entry.archived_at IS NOT NULL` / `entry.current_publication_id IS NOT NULL` 作为标志位取出（`repository/dictionary.rs` 的 `legacy_exact_duplicates`），到 wire 上收敛成 `DuplicateWordMatchV2.status`（`draft` / `published` / `archived`，`packages/types/src/admin-word-v2.ts:460`）。所以就地创建流程里那次必调的 `detect`，顺带就把「已发布 + 既有草稿」两类重复都查了，前端按 `status` 区分展示即可——**不是**按两个布尔标志位。

**但「显示已有关联的目标是什么」这个缺口补不上。** `related_search` 的 SQL 强制 `JOIN lexicon.entry_publications ... ON publication.id = entry.current_publication_id`（`repository/query.rs:21` 起），结果里的 headword 与词义全部取自**发布快照**——草稿目标永远不会出现在搜索结果里。就地创建那一刻前端还能从 `createV2` 的响应里拿到新草稿的 headword 与词义；**下次重新打开这条词条时就拿不到了**，`target_headword` / `target_gloss` 又是服务端只读快照（保存时前端根本不发送，见 `model.ts` 的 `toMeaningsWireContent`）。所以交互设计 1 的标记必须由后端回带目标信息，前端补不了这个洞。

## 交互设计

两处交互共同承载 requirements.md 决策记录 1 的规则：**关联保留在草稿里、发布时不生效、但绝不悄悄发生**。

> **共同前提（不成立则两处设计都作废）**：**关联必须保留在草稿里。** 若后端最终选择「发布时把未解析关联从草稿删掉」，交互设计 1 的标记会指向一条已经不存在的数据，交互设计 2 更是刚刚亲口承诺过「会保留」。后端评估任务里「存得下、发不出、也删不掉的中间态」那条待答问题就是这一条，必须先明确回答「留」。

### 交互设计 1：关联行的目标状态标记

#### 现状

关联行 `RelationsEditor`（`MeaningsAndExamplesStep.tsx:1134`）是一个三列网格（`word-creation.css:1437`）：

```
[ 分值 InputNumber ] [ 目标词条 AutoComplete ] [ 目标词义 Select ]     (删除按钮绝对定位在右上角)
grid-template-columns: minmax(54px, 0.58fr)  minmax(0, 1.55fr)  minmax(0, 1.15fr)
```

三列本来就挤（三张关系卡片并排），删除按钮是 `position:absolute` + `opacity:0`，靠 `:hover / :focus-within` 才现身。

#### 做法

**位置**：不加第四列，改为让 `.word-relation-row` 变成两行网格——标记与入口放在**第二行、第二列**（正对目标词条那一列，即「在目标词条旁边」），只在 `target_state !== "resolved"` 时渲染，因此对正常关联行零高度、零影响。不动现有三列的宽度分配，避免把本来就窄的词义列再挤掉一截。

```tsx
{
  relation.target_state && relation.target_state !== "resolved" && (
    <Space className="word-relation-state" size={4}>
      <Tag {...RELATION_STATE_TAG[relation.target_state]} />
      {RELATION_STATE_ACTION[relation.target_state] && (
        <Button type="link" size="small" onClick={() => openTarget(relation)}>
          {RELATION_STATE_ACTION[relation.target_state]}
        </Button>
      )}
    </Space>
  );
}
```

**五种形态**（原四态的 `missing` 已拆成 `archived` / `detached`，理由见「类型与数据」）：

| `target_state` | 标记                                    | 行内入口                               | 是否待修项 |
| -------------- | --------------------------------------- | -------------------------------------- | ---------- |
| `resolved`     | 无                                      | 无                                     | 否         |
| `draft`        | `<Tag>草稿</Tag>`（无 color，中性灰）   | 「去补录」→ 目标词条向导               | **否**     |
| `resolvable`   | `<Tag color="success">已发布</Tag>`     | 「重新保存」→ 本步保存按钮             | 否         |
| `archived`     | `<Tag color="warning">目标已归档</Tag>` | 「去恢复」→ 目标词条（列表的恢复入口） | **是**     |
| `detached`     | `<Tag color="warning">目标已失效</Tag>` | 无（就地重选目标词条）                 | **是**     |

**入口分支不能写成二分**：`archived` 的行内入口是「去恢复」而不是「去补录」，`detached` 干脆没有行内入口。四个非 `resolved` 分支各有各的文案与去处，实现时按表逐个映射，别写成 `state === "resolvable" ? "重新保存" : "去补录"`。

**文案**：`draft` 用「草稿」而不是「未发布」。理由：陈述目标**是什么**，而不是它**缺什么**；而且「草稿 / 已发布 / 已归档」是本仓已有的状态词表——同形确认卡片里就直接写着 `<Tag>草稿</Tag>`（`FormsAndPronunciationStep.tsx:1855`），列表页也是这套词。不引入第二套说法。

**颜色**：`draft` 用**无 color 的默认中性 `Tag`**，**绝不用 `warning` / `error`**。

- 管理员录这条关联没做错任何事，红黄要留给「你必须去修」的东西。这与「完成情况」面板里 `not_required` 用中性减号（`#dadee5`，`WordCreationLayout.tsx:127` + `word-creation.css:212`）而不是警告图标，是同一套分寸——代码里那行注释写得很清楚：「『无需填写』是中性态：不打勾也不催办」。
- 为什么不用 `processing`（评估时的备选）：一是同形确认卡片里的 `<Tag>草稿</Tag>` 就是无色的，同一个词该同一个样子；二是 `processing` 在本仓已被赋予「进行中」的含义（`WordCreationLayout.tsx:235` 的「已发布 · 编辑中」），用在这里会暗示系统正在处理什么。可操作性交给旁边的「去补录」链接，不靠颜色兜。
- `archived` / `detached` 用 `warning` 是**刻意的对照**：这两条不去动手就永远不会对。中性与警告的分界线是「这条数据将来会不会自己变对」——`draft` / `resolvable` 会（目标发布后就对了），另两类不会。但要注意 `archived` 要修的是**目标词条的生命周期**（去恢复），不是这条关联本身，别把它做成「重选目标」。

**不做**：

- **不做成悬停才显示。** 标记与入口都常驻。本轮刚在英式发音人那条上吃过亏——原报告的抱怨就是「提示只在悬停时显示」，修法是 `usePronunciationVoiceNotice`（`PronunciationPreview.tsx:127-131`），注释写着「原因过去只挂在悬停 Tooltip 上，用户不悬停就看不到；这里给页面一句可直接读到的说明」。同样的错不犯第二次。
- **不进「完成情况」面板、不计入待修项、不出红点。** 从管理员这一侧看，这条关联是**做完了**的——词条选了、词义选了、分值填了。而且这一条**不需要写代码**：现有 `wordSenseIssueTarget`（`meaningsAndExamples/validation.ts:179`）判的是 `!relation.target_word_id || !relation.target_sense_id`，指向草稿的关联两个 ID 都齐，天然不算问题。**要小心的是别顺手把 `target_state` 加进这个判断**。
- **不把「去补录」和标记分开放。** 「这条指向草稿」和「去补那条草稿」是同一件事的两半，分开放等于让管理员先在 A 处得知、再去 B 处找入口。

**关于 `resolvable` 这一态（原列为「可裁」，核验后升为必需）**：原方案只要求「草稿」一态。补上这一态最初是因为方案 B 有一处缺点不是「悄悄」造成的——目标发布之后，「回来重发一次」这件事**没有任何载体**，很容易永远没人做，学习端就长期看到残缺的近义词。**后端核验之后它不再可裁**：不重存直接点「提交生效」不会报错，而是**静默 201**（`publishing.rs:155` 的短路先于引用解析，见「后端对接建议 · 4」），响应里 `status=published`、`has_unpublished_changes=false`，管理员完全看不出异常。也就是说这件事**没有后端报错兜底**，只能靠这一态主动摆到眼前。砍掉它，等于把「关联永远不生效」做成一个无人可见的状态。

**跳转**：`draft` 的「去补录」走 ``navigate(`/words/${relation.target_word_id}/wizard/forms`)``（草稿的续做落点），与列表页「继续创建」同口径。**`archived` 的「去恢复」是另一个去处**——恢复归档只在智能词库列表有入口（`SmartDictionary.tsx:136` 起的 `restore` 命令），跳到向导没有用，实现时要落到列表并定位到该词条。当前词条**有未保存改动**时不能直接跳——`useUnsavedWordChanges`（`useUnsavedWordChanges.ts`）已经在管这件事，沿用即可，不另写一套拦截。

### 交互设计 2：发布前的一次性确认

#### 复用哪个模式

词形步已有成熟的「列出会被影响的内容 → 明确确认 → 才继续」流程，本设计照它写：

| 词形步（现有）                                                                                                   | 本设计                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `previewImpact` 返回 `{ affected, requires_confirmation, confirmation_token }`                                   | `validate` 返回 `{ unresolved_relations, requires_confirmation, confirmation_token }` |
| `summarizeFormsImpact`（`formsImpactSummary.ts:33`）汇总成可展示结构                                             | `summarizeUnresolvedRelations`（新增，同构）                                          |
| `ImpactConfirmationDetails`（`FormsAndPronunciationStep.tsx:1743`）渲染 `Card size="small" title="下游内容影响"` | `UnresolvedRelationsDetails`，`Card size="small" title="这些关联暂不会生效"`          |
| `<Modal>`（`:2702`）`okText="确认并保存"`，`okButtonProps.disabled = !confirmationReady`                         | `<Modal>` `okText="确认并提交生效"`，同样的 ready 判据                                |
| 确认后带 `confirmed_impact_token` 重发 `saveForms`                                                               | 确认后带 `confirmed_unresolved_relations_token` 重发 `publishV2`                      |
| 409 `downstream_confirmation_required` / 410 过期 → 重跑 impact check                                            | 409 `unresolved_relations_changed` → 重跑 `validate` 并重开确认                       |

**这个模式的本质是三件事，都要照搬**：①清单由服务端出，前端不自己编；②清单列**具体条目**，不只给数字；③确认要有服务端凭证，不是前端弹个框就算数。

第 ① 条尤其重要：现有实现里，服务端没返回受影响节点时 `can_confirm=false`，前端直接 `message.error("影响预览响应异常，未返回受影响节点，已阻止保存")`（`FormsAndPronunciationStep.tsx:2276-2282`）——**宁可拦下也不猜**。这里同理：前端确实能凭 `target_state` 本地推断，但那份推断会在竞态下过期（别人刚发布了目标词条，界面却仍然告诉管理员「这条不会生效」，结果它生效了），只有服务端在同一事务里解析才是权威。`target_state` 只用于**编辑期的提示**（弱一致可接受），**不用于发布把关**——两处需求用途不同，不是重复。

#### 触发点与容器

**在「预览并生效」步骤，点「提交生效」之后、真正 `publishV2` 之前**，弹 `Modal`。

为什么用 `Modal` 而不是跟随本页已有的同形确认写法（常驻 `Card` + 按钮文案变成「确认同名公开范围并提交生效」，`PreviewAndPublishStep.tsx:590` 起 / `:874`）：

- 同形确认之所以能用常驻 Card，是因为它**阻断发布**——按钮 `disabled` 直到确认快照加载完（`:865-869`），管理员非看不可。
- 未解析关联**不阻断发布**，没有 `disabled` 兜底。纯常驻 Card 可以被直接滚过去、按钮照点，「明确确认」就落空了。要让「不阻断但必须知情」成立，就需要一次**不可跳过的动作**。
- 词形步的 `ImpactConfirmationDetails` 正是「不阻断但必须确认」，用的就是 `Modal`。性质相同 → 容器相同。

**不加常驻横幅。** 曾经想在完整性检查那条 Alert 下面再加一条 info 说明，评估后放弃：录入时第 3 步的常驻标记已经把「这个目标是草稿」讲过一遍，第 4 步再挂一条常驻提示是重复催办，还要和同形确认 Card 争位置。分工是**第 3 步常驻标记负责录入期知情，第 4 步 Modal 负责发布前确认**，各说一次，不重复。

#### 内容

清单必须列**具体是哪几条**，否则管理员还得自己回去一条条找：

```
这些关联暂不会生效                                    共 3 条

近义词 · reliability            动词 · 第 1 个词义「可依赖的程度」    [定 位]
反义词 · unreliability          动词 · 第 1 个词义「可依赖的程度」    [定 位]
派生词 · reliably               形容词 · 第 2 个词义「可靠地」        [定 位]

这些关联会保留在草稿里。等目标词条发布后，回到「词义与例句」重新保存一次，
再提交生效即可带上。
```

- **关联类型**用 `RELATION_META[type].title`（`MeaningsAndExamplesStep.tsx:162`）——「近义词 / 反义词 / 派生词」，与编辑器里的卡片标题同词。
- **目标词**由服务端在清单里回带（前端拿不到，理由见「搜索侧的缺口」）。
- **所在词义**由前端自己从 `word.meanings` 按 `relation.id` 反查 `pos → sense` 拼出，与词义卡片标题同口径（`{index + 1}. {definitionText}`，`:1613`），不需要后端给。
- **`[定 位]` 零新机制**：关联行已经带着 `data-word-node-id={relation.id}` / `data-word-field="target_word_id"`（`:1323-1324`），跳转沿用现有的 `navigate(..., { state: { nodeId, field } })` + `useWordValidationIssueFocus` 那套，与词形步 `SurfaceConfirmationDetails` 的 `onLocate` 同构。
- **异常兜底照抄 `summarizeFormsImpact`**：重复节点去重、未知类型归入「其他」、服务端没给条目时 `can_confirm=false` 并阻止提交。这些分支不是防御性冗余，是覆盖率门槛下要写测试的真实分支。

#### 分寸

- **不阻断发布**：有管理员录入的内容不会生效，这不是错误，不该拦着不让发。
- **要求显式确认**：但它也不该默默发生。
- **`archived` / `detached` 走另一条路**：目标词条已归档、或目标词义已被移出目标草稿且不在目标当前发布里，这两类**不进这个清单**，而是进 `issues`、阻断发布。分界线仍是「这条数据将来会不会自己变对」——指向草稿的会（目标发布后就对了），这两类不会。但**处置相反，不能合并**：`archived` 要去恢复目标词条（关联本身没错，重选反而会毁掉一份完好的快照），`detached` 才要求重选。两者都有明确的自救动作、都不造成环，阻断是安全的。

## 后端对接建议

> 本仓不改后端。以下需转达后端评估。

### 必须放宽：允许关联指向未发布词义

`save_meanings_step` 里的引用解析（`editing.rs:617`）目前对草稿目标直接 422。要让本功能成立，**保存阶段必须允许**关联指向同库内存在但未发布的词义。

建议区分两个阶段：

- **保存草稿**：只校验**目标词条存在且未归档**，不要求已发布，**也不要校验 target_sense_id 是否仍然存在**。后者故意放过：目标草稿的补录者删掉一条词义，不应该让源词条从此存不下——那是把别人的编辑变成我的阻塞。目标不可用（归档 / 词义被移出）由发布阶段兜（见下）。
- **`target_headword` / `target_gloss` 指向草稿时必须回填草稿当前值，不能留空。** 前端拿不到替代来源：`related_search` 只返已发布词条，而这两个字段是只读的、前端保存时根本不发送（`toMeaningsWireContent` 只发 `id` / `relation` / `target_word_id` / `target_sense_id` / `score`）。后端不填，关联行重新打开就是一片空白，「草稿」标记挂在一个没有名字的目标上。
- **新增只读字段 `target_state`**（`resolved` / `draft` / `resolvable` / `archived` / `detached`，五态），语义与拆分理由见「类型与数据」一节。**不要合成一个 `missing`**：归档可逆、指引是「去恢复」，与「必须重选」正好相反。
- **发布**：按下面已定的产品规则调整，不再维持无条件的 `relation_target_unavailable`。

### 已定：发布时未解析关联怎么处理（requirements.md 决策记录 1）

规则是**显式 B**：关联保留在草稿里，未解析的关联不进发布引用表（`entry_publication_sense_refs`）因而对外不生效、但仍逐字留在 `publication.snapshot` 里，发布前逐条告知并要求确认，目标发布后重存词义步再提交生效即可带上。契约建议：

**1. `validate` 扩展（清单来源）**

```jsonc
{
  "validated_revision": 12,
  "valid": true, // ← 未解析关联不影响它
  "issues": [], // ← 未解析关联绝不进这里
  "unresolved_relations": [
    {
      "relation_node_id": "…",
      "relation": "synonym",
      "target_word_id": "…",
      "target_headword": "reliability", // 前端拿不到，必须回带
      "target_sense_id": "…",
      "reason": "target_draft"
    }
  ],
  "requires_confirmation": true,
  "confirmation_token": "…"
}
```

- **`unresolved_relations` 绝对不能塞进 `issues`。** 前端的发布按钮判据是 `disabled={!validation?.valid || …}`（`PreviewAndPublishStep.tsx:865-869`），进了 `issues` 就是 `valid=false`、按钮灰掉——那等于悄悄把方案 B 做成了方案 A，连带把死锁一起装回来。这是本节最容易出错的一条。
- `reason` 目前只有 `target_draft` 一种，留成枚举是为了以后加。**目标已归档 / 词义已被移出**不走这里——它们属于 `archived` / `detached`，走 `issues` 阻断发布，用现有的 `relation_target_unavailable` 即可。

**2. `publish` 扩展（确认凭证）**

- 入参新增 `confirmed_unresolved_relations_token?: string`。
- 存在未解析关联而未带 token → `409 unresolved_relations_confirmation_required`，`meta` 里带上最新清单（与词形步 `downstream_confirmation_required` 同构）。
- 带的 token 与当前实际清单对不上（期间有人发布/归档了目标）→ `409 unresolved_relations_changed` + 最新清单，前端重开确认框。这个 code 要能被 `requiresNewIdempotencyKey`（`surfaceSnapshot.ts:239`）识别为需要换幂等键。

**3. 发布路径的解析行为**

`resolve_meaning_references` 在 `Verify` 模式下（`publishing.rs:196-207`）目前对解析不到的目标产出 `relation_target_unavailable` 并 422。改为：

- 解析不到 → **不报错**，只是不产出 `entry_publication_sense_refs` 行（这一步本来就是 `let Some(snapshot) = resolved.get(…) else { continue };`，天然如此）；同时把这条关联汇入 `unresolved_relations`。
- **`publication.snapshot` 无需剔除未解析的关联。** 原设计要求剔除，后端核验后确认不必：学习端读关联这条路径今天不存在，管理端的 `inbound_relations` 由 `entry_publication_sense_refs` 驱动，未解析的关联不在那张表里；outbox 也没有投递型消费者（见「后端核验结论」Q1）。**发布快照因此保持草稿内容的逐字副本**——原文档担心的「快照不再是逐字副本」这个设计后果不会发生。
- 目标已归档（`archived`）、目标词义已被移出且不在目标当前发布里（`detached`）仍然报 `relation_target_unavailable` 并阻断，不并入上面的宽松处理。

**4. 「目标发布后重新发布即可」这句话不准确——而且真实后果比 422 更糟**

本文档上一版写的是「不重存直接发布会撞 `relation_target_stale` 的 422」，**这同样不对：实际是静默 201。**
`publishing.rs:155` 有一条短路——`current_publication_source_revision == Some(word.revision)` 时（即词条发布后没再保存过）直接把 `status` 置成 `Published`、写幂等响应、`return`，**位置在 `resolve_meaning_references`（`:196`）之前**；而 publish 全程不改 `entries.revision`（只写 `published_revision = revision`，`:243`）。所以目标发布后，源词条若没重存过，再点「提交生效」**既不产生新发布、也不写 outbox、也不报任何错**，响应里 `status=published`、`has_unpublished_changes=false`。

更麻烦的是 `validate` **没有**这条短路（`publishing.rs:33-40` 直接走 `Verify`）。于是当前是「点校验能看到问题、点提交生效却 201 一切正常」。

对前端的影响：

- 结论不变——正确操作仍是**先回词义步重新保存一次（触发 `Canonicalize` 回填快照），再提交生效**，界面文案照此写。
- 但**不能依赖后端报错兜底**：UI 必须靠 `target_state = "resolvable"` 主动把这件事摆出来。这正是交互设计 1 的第三态，它因此从「可裁」升为**必需**。

后端会调整这条短路（让它对「有已变得可解析的关联」不再静默通过），具体行为联调时对齐。若后端同时在 `Verify` 模式里对「原本未解析、现在能解析」的关联直接 canonicalize 而不是报 stale，就等于顺手实现了 requirements.md 决策记录 1 里说的 **C1**，前端文案可随之简化。**这是可选增强，不是本次前置。**

### 不要动的

- 发布时的完整性校验（`publishing.rs:140-153`）与三层守门，不放宽。
- 现有的重复检测与同形确认流程，前端要复用它们，行为别改。

## 复用与约定

- 逻辑 → 编排函数放 admin 本地模块（与 `@tsz/shared` 无关，不跨端复用）；类型 → `@tsz/types`（本次要加 `WordRelationV2.target_state` 与 `validate` 响应的 `unresolved_relations`，仍是 snake_case 1:1 镜像后端 wire）；请求 → `@tsz/api-client`（复用现有 detect/createV2，publish 入参加一个 token）。
- admin 端只用 antd v6：下拉的自定义 `notFoundContent`、状态 `Tag`、确认 `Modal` 都走 antd，**禁止引入 tailwind / `@tsz/ui`**。视觉以 antd 默认为准，颜色只用 antd 的语义色（无色 / `success` / `warning`），不自造色值。
- `apps/admin/src` 90% 覆盖率门槛；编排逻辑是纯函数 + hook，应当单独成文件并覆盖到。
- 两字按钮文案之间插空格。

## 数据流 / 时序

### 就地创建（第 3 步）

```
管理员在近义词输入 reliability
  → 关联词搜索（只查已发布）无结果
  → 点「创建「reliability」草稿并关联」
  → POST /lexicon/entries/detect { language, headword }
      ├─ smart_dictionary.duplicates 非空 → 不创建，按 status 分组列出已有项供选择
      ├─ 需要同形确认 → 走现有同形确认流程，拿 confirmed_surface_match_token
      └─ 无冲突 → 继续
  → POST /lexicon/entries { schema_version:2, detection_id, headwords, confirmed_surface_match_token? }
      │   ⚠️ create 内部还有一道 surface 闸门：新词头撞上任一现有词条的草稿或当前发布 surface
      │      （含撞上别的词条的变形，如复数/过去式）就不是 201
      ├─ 409 surface_match_acknowledgement_required → 走同形确认拿 token 重发
      ├─ 409 exact_headword_creation_temporarily_disabled（撞的是 ExactHeadword，而策略
      │     allow_new_exact_headword_entries 默认关闭）→ 带 token 也建不出来，只能引导选已有词条
      └─ 201 → 返回新草稿
  → 分支（决策记录 2）：判据是 word.meanings.pos 是不是空数组
      │   （create 的响应里没有 builtin_dictionary 这个对象；等价信息摊平在
      │    word.detection_snapshot.builtin_dictionary_status，且只有 matched / not_found）
      ├─ meanings.pos 非空 → 每个词性各带一条空词义
      │     → 全部灌进该关联行的 senseChoices，默认选中第一条
      │     → 回填 target_word_id / target_sense_id
      └─ meanings.pos 为空 → 一条词义都没有
            （词典未收录；或命中了但词性全落在 map_dictionary_pos 白名单外被静默丢弃）
            → 不回填关联，明确说明「已建草稿，但它还没有词性与词义，补录后再回来关联」+ 跳转入口
  → 管理员继续录，稍后 PUT /steps/meanings（intent=save）
      → ⚠️ 这一步现在会 422，等后端放宽
```

### 发布（第 4 步）

```
进入第 4 步 → POST …/validate
      → { valid: true, issues: [], unresolved_relations: [3 条], requires_confirmation: true, confirmation_token }
  → 管理员点「提交生效」
  → 有未解析关联 → 弹 Modal，逐条列出「关联类型 · 目标词 · 所在词义」+ [定位]
      ├─ 取消 → 不发布，草稿原样
      └─ 「确认并提交生效」
            → POST …/publish { base_revision, idempotency_key, confirmed_unresolved_relations_token }
                  ├─ 400 → 后端还没上线这个字段（deny_unknown_fields 直接拒）⇒ 上线顺序必须后端先行
                  ├─ 409 unresolved_relations_changed → 换幂等键、重跑 validate、重开 Modal
                  └─ 成功 → 这 3 条不进 entry_publication_sense_refs、对外不生效；
                            草稿与 publication.snapshot 里都原样保留
  → 目标词条日后发布 → 本词条关联行的 target_state 变成 resolvable
      → 回第 3 步重新保存（Canonicalize 回填快照）→ 再提交生效 → 关联生效
        ⚠️ 不重存直接提交生效 = 静默 201：不报错、也什么都没发生（见「后端对接建议 · 4」）
```

## 测试策略（概览）

具体用例设计在动工阶段交给 **test skill**，此处只列方向：

- **单测（编排逻辑）**：无结果 → 出创建入口；detect 命中重复 → 不创建且按 `status` 分组列出已有；需同形确认 → 带 token 创建；`create` 返回 409（含 `exact_headword_creation_temporarily_disabled` 这类带 token 也过不去的）→ 不进回填分支且给出可读说明与出路；创建成功且 `word.meanings.pos` 非空 → 正确回填两个 ID 并灌入全部候选；**创建成功但 `word.meanings.pos` 是空数组 → 不回填、给明确说明**（判据是这个数组，**不是** `detection_snapshot.builtin_dictionary_status`——词典命中同样可能零词义）；创建失败 → 当前已录内容不丢。
- **单测（关联行标记）**：`target_state` 五态各自的标记与入口（`archived` 的入口必须是「去恢复」而不是「去补录」；`detached` 没有行内入口）；`resolved` 不渲染任何标记；**标记不影响 `wordSenseIssueTarget` 的判定**（防回归：别把 `target_state` 加进待修项判断）；标记与入口在**不悬停**时可见（用 `toBeVisible` 而不是只查存在）。
- **单测（未解析关联汇总）**：`summarizeUnresolvedRelations` 的去重、分组、服务端没给条目时 `can_confirm=false`——照 `formsImpactSummary.test.ts` 的覆盖口径写。
- **单测（发布确认）**：有未解析关联 → 点「提交生效」先弹 Modal 而不是直接发；取消 → 不调 publish；确认 → 带 token 调 publish；`409 unresolved_relations_changed` → 换幂等键、重跑 validate、重开 Modal；`unresolved_relations` 非空但 `valid=true` 时**发布按钮不得禁用**（防回归：别把它做成方案 A）。
  - jsdom 注意：antd `Button` 的 loading 退场动画不结束会让可及名残留「loading」，测提交后的禁/用态用 `container.querySelector("button.ant-btn-primary")` 锚定，别用 `getByRole` 的 name。
- **mock 同口径**：`adminWordsMock` 的 `saveMeaningsStep` 要跟上后端最终口径。**本仓已被「mock 绿、真机红」坑过两次**（节点 ID、发音人），这次务必让 mock 与后端放宽后的校验一致，否则本地全绿、真机 422。
- **e2e**：输入库外词 → 创建草稿并关联 → 保存 → 新草稿出现在列表 → 回第 4 步发布 → 确认框列出该条 → 发布成功 → 回第 3 步这条关联**还在**。
- **真机**：后端放宽上线后在测试服验，重点五条——①保存不再 422；②重新打开词条时关联行能显示目标词名与「草稿」标记（验后端有没有回填 `target_headword` / `target_state`）；③发布后草稿里关联仍在、学习端看不到它；④目标发布后重存词义步再发布，关联真的生效；⑤**目标发布后不重存就直接提交生效，确认后端已经不再静默 201**（后端调整这条短路之前，这一步会「成功但什么都没发生」）。

## 风险与回滚

| 风险                               | 评估                                                                                                                                                                                                                                                                      | 处置                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **后端不放宽则功能不成立**         | 前端单独做完只能得到「点了创建、一保存就 422」                                                                                                                                                                                                                            | 后端放宽是前置，前端 PR 不得先于后端上生产                                                                                                                      |
| **上线顺序反了就是发布全挂**       | `PublishAdminWordV2Input` 带 `deny_unknown_fields`（`dto/operations.rs:698`），前端提前发送 `confirmed_unresolved_relations_token` 而后端未上线 → publish 直接 **400**                                                                                                    | **后端先行**；后端未确认上线前前端不得发送该字段（按后端版本开关，或与后端同批上线）                                                                            |
| **同词头的新词条今天默认建不出来** | 撞 ExactHeadword 时走策略 `allow_new_exact_headword_entries`，它**默认关闭**（`surface_policy.rs:20-26`），`create` 返回 409 `exact_headword_creation_temporarily_disabled`，**带同形确认 token 也过不去**（`surface_snapshot.rs:870` 对 `!policy.enabled` 一律判不通过） | 不是本功能引入的，但直接压缩它的可用面：requirements「待产品确认」已列为需产品拍板的一项；前端必须把这个 409 当一等分支，给「去选已有词条」的出路而不是通用报错 |
| ~~后端若在发布时删掉未解析关联~~   | **已排除**：后端确认关联既留在草稿、也逐字留在 `publication.snapshot` 里，无需剔除（「后端核验结论」Q1）                                                                                                                                                                  | 硬依赖成立，交互设计 1 与 2 不作废                                                                                                                              |
| **未解析关联被塞进 `issues`**      | `valid=false` → 发布按钮禁用 → 悄悄变成方案 A，死锁一并装回来                                                                                                                                                                                                             | 写进契约、写成单测（`valid=true` 时按钮不得禁用）                                                                                                               |
| 新草稿一条词义都没有               | `build_initial_meanings` 按 `forms.pos` 建词义：词典未收录时 `forms.pos` 为空；**词典命中但词性全落在 `map_dictionary_pos`（`helpers.rs:77-102`）白名单外时同样为空**，且不会被 `CatalogMismatch` 拦下。**这类词恰恰最需要本功能**（品牌名、缩写、术语）                  | 决策记录 2：判据看 `word.meanings.pos` 是否为空数组，仍建草稿但不回填关联，给明确说明 + 补录入口                                                                |
| 半成品关联行被静默丢弃             | `toMeaningsWireContent`（`model.ts:735` 附近）会过滤掉两个 ID 没填齐的关联行，保存后就没了                                                                                                                                                                                | 决策记录 2 明确不留半成品；实现时若仍会产生这种行，须在保存前一次性告知，不能沿用静默丢弃                                                                       |
| 关联项显示不出目标词名             | 指向草稿时由服务端回填草稿当前值（Q2 已确认）；**但 `target_gloss` 可能是空串，且空串与「没有快照」无法区分**                                                                                                                                                             | 前端不得用空释义推状态（一律看 `target_state`）；词名为空时仍需降级文案（显示词条 ID 后 8 位）兜住                                                              |
| 目标归档 / 词义被移出              | 两种情况的正确处置**相反**：归档可逆（恢复即回到 `resolved`），词义被移出才必须重选                                                                                                                                                                                       | 拆成两态：`archived` → 阻断发布 + 指引「去恢复目标词条」（**别让管理员重选，那会毁掉一份完好的快照**）；`detached` → 阻断发布 + 要求重选                        |
| 误建空草稿污染词库                 | 管理员点错就多一条空词条                                                                                                                                                                                                                                                  | 前置重复检测已挡一道；不做连带删（决策记录 3），必要时走列表侧批量清理                                                                                          |
| 「重新发布即可」的文案说错         | 实际不是 422，而是**静默 201**（`publishing.rs:155` 的短路先于引用解析），管理员看不出任何异常                                                                                                                                                                            | 文案统一写「回词义步重新保存一次，再提交生效」；并靠 `target_state = resolvable` 主动提示，**不依赖后端报错兜底**                                               |

**回滚**：前端改动是新增入口，回滚即隐藏该入口，不影响已有关联；但**已经建出来的草稿和已存下的草稿关联会留在库里**——回滚前要确认这些数据在旧逻辑下不会导致保存/发布报错（旧逻辑会对草稿目标报 `relation_target_unavailable`），必要时需要数据清理方案。这一条比一般前端功能的回滚代价高，值得在上线前想清楚。
