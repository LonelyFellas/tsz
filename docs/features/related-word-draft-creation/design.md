# 关联词不存在时创建草稿并关联：技术设计文档

## 方案概述

**前端做编排与告知，后端放宽保存并把「未解析」变成一等状态。**

创建草稿这半边**不需要任何新接口**——现有的 `detect` + `createV2` 两步就够，而且报告要求的「避免重复入库」正是这两步已经内建的能力（智能词库重复检测 + 同形确认 token）。前端要做的是把这套流程从「第 1 步的独立页面」复用到「第 3 步的关联词下拉里」。

真正的拦路虎是：**后端目前在保存草稿时就要求关联目标必须是已发布词义**。这条不放宽，功能无法落地。

产品规则已定（requirements.md 决策记录 1，**显式 B**）：关联保留在草稿里、发布快照不含未解析的关联、发布前逐条告知并确认。据此，后端要做的不只是「放宽一条校验」，而是四件事——放宽保存、把发布时的解析失败从 422 改成清单、给关联加一个只读的 `target_state`、以及在指向草稿时回填 `target_headword` / `target_gloss`。前端对应两处交互（见「交互设计」）。

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

| 文件                                                    | 改动                                                                                                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `word-creation/MeaningsAndExamplesStep.tsx`             | 关联词 `AutoComplete` 的 `notFoundContent`（`:1357`）从纯文案改成带「创建草稿并关联」入口；创建后回填 `target_word_id` / `target_sense_id` 并灌入 `senseChoices`；关联行加常驻的目标状态标记与「去补录」入口（交互设计 1） |
| `word-creation/word-creation.css`                       | `.word-relation-row`（`:1437`）由单行三列改成两行：第二行放状态标记，只在有标记时占高度，不动现有三列的宽度分配                                                                                                            |
| 新增 `word-creation/relationDraftCreation.ts`（+ 单测） | 「就地创建关联草稿」的编排：detect → 查重 →（同形确认）→ createV2 → 取默认词义 → 回填。逻辑量不小且要单测，不要塞进已经 2584 行的 MeaningsAndExamplesStep                                                                  |
| `word-creation/PreviewAndPublishStep.tsx`               | 「提交生效」前的未解析关联确认 `Modal`（交互设计 2），照 `FormsAndPronunciationStep` 的 pending-confirm 流程写；确认后带 token 重发 publish                                                                                |
| 新增 `word-creation/unresolvedRelations.ts`（+ 单测）   | 把服务端给的未解析关联清单汇总成可展示结构（分组、去重、异常兜底），对应词形步的 `formsImpactSummary.ts`                                                                                                                   |
| `features/dictionary/api.ts`                            | 查重不需要新接口（见下）；若后端把未解析清单挂在 `validate` 上，`useValidateWordV2` 的返回类型跟着扩                                                                                                                       |

**复用而非新写**：`word-creation/api.ts` 已有 `useDetectWordV2`（`:44`）与 `useCreateWordV2`（`:57`），`CreateEntryStep.tsx:590-591` 就是这么用的。就地创建应当复用同一对 hook 与同一套同形确认流程，**不要另起一套创建路径**，否则重复检测/幂等/同形确认三件事都要再实现一遍。

### 类型与数据

`WordRelationV2`（`packages/types/src/admin-word-v2.ts:155`）的现有字段**无需变更**：

```ts
target_word_id: string;   // 必填
target_sense_id: string;  // 必填
target_headword?: string; // 服务端只读快照
target_gloss?: string;    // 服务端只读快照
```

天然满足「必须保存明确的词条 ID 和词义 ID」。但注意 `target_headword` / `target_gloss` 是**服务端从发布快照回填的只读字段**——关联到未发布草稿时这两个字段拿什么填，需要后端一并定（见下）。

**需要新增一个只读字段 `target_state`**（与上面两个同前缀、同为服务端只读快照），交互设计 1 靠它决定标记形态：

```ts
/** 服务端只读快照：本条关联当前的可解析状态。 */
target_state?: "resolved" | "draft" | "resolvable" | "missing";
```

| 取值         | 含义                                                       | 界面                         |
| ------------ | ---------------------------------------------------------- | ---------------------------- |
| `resolved`   | 目标已发布，且本词条存的快照与之一致（今天唯一合法的状态） | 无标记                       |
| `draft`      | 目标词条还是草稿                                           | 中性「草稿」标记 + 去补录    |
| `resolvable` | 目标已发布，但本词条的快照还没跟上（重存词义步即可生效）   | 「已发布」标记 + 重新保存    |
| `missing`    | 目标词义已不存在，或目标词条已归档                         | 警告「目标已失效」+ 要求重选 |

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
      <Button type="link" size="small" onClick={() => openTarget(relation)}>
        {relation.target_state === "resolvable" ? "重新保存" : "去补录"}
      </Button>
    </Space>
  );
}
```

**四种形态**：

| `target_state` | 标记                                    | 行内入口                   | 是否待修项 |
| -------------- | --------------------------------------- | -------------------------- | ---------- |
| `resolved`     | 无                                      | 无                         | 否         |
| `draft`        | `<Tag>草稿</Tag>`（无 color，中性灰）   | 「去补录」→ 目标词条向导   | **否**     |
| `resolvable`   | `<Tag color="success">已发布</Tag>`     | 「重新保存」→ 本步保存按钮 | 否         |
| `missing`      | `<Tag color="warning">目标已失效</Tag>` | 无（就地重选目标词条）     | **是**     |

**文案**：`draft` 用「草稿」而不是「未发布」。理由：陈述目标**是什么**，而不是它**缺什么**；而且「草稿 / 已发布 / 已归档」是本仓已有的状态词表——同形确认卡片里就直接写着 `<Tag>草稿</Tag>`（`FormsAndPronunciationStep.tsx:1855`），列表页也是这套词。不引入第二套说法。

**颜色**：`draft` 用**无 color 的默认中性 `Tag`**，**绝不用 `warning` / `error`**。

- 管理员录这条关联没做错任何事，红黄要留给「你必须去修」的东西。这与「完成情况」面板里 `not_required` 用中性减号（`#dadee5`，`WordCreationLayout.tsx:127` + `word-creation.css:212`）而不是警告图标，是同一套分寸——代码里那行注释写得很清楚：「『无需填写』是中性态：不打勾也不催办」。
- 为什么不用 `processing`（评估时的备选）：一是同形确认卡片里的 `<Tag>草稿</Tag>` 就是无色的，同一个词该同一个样子；二是 `processing` 在本仓已被赋予「进行中」的含义（`WordCreationLayout.tsx:235` 的「已发布 · 编辑中」），用在这里会暗示系统正在处理什么。可操作性交给旁边的「去补录」链接，不靠颜色兜。
- `missing` 用 `warning` 是**刻意的对照**：那一条确实是错的、确实必须修。中性与警告的分界线是「这条数据将来会不会自己变对」。

**不做**：

- **不做成悬停才显示。** 标记与入口都常驻。本轮刚在英式发音人那条上吃过亏——原报告的抱怨就是「提示只在悬停时显示」，修法是 `usePronunciationVoiceNotice`（`PronunciationPreview.tsx:127-131`），注释写着「原因过去只挂在悬停 Tooltip 上，用户不悬停就看不到；这里给页面一句可直接读到的说明」。同样的错不犯第二次。
- **不进「完成情况」面板、不计入待修项、不出红点。** 从管理员这一侧看，这条关联是**做完了**的——词条选了、词义选了、分值填了。而且这一条**不需要写代码**：现有 `wordSenseIssueTarget`（`meaningsAndExamples/validation.ts:179`）判的是 `!relation.target_word_id || !relation.target_sense_id`，指向草稿的关联两个 ID 都齐，天然不算问题。**要小心的是别顺手把 `target_state` 加进这个判断**。
- **不把「去补录」和标记分开放。** 「这条指向草稿」和「去补那条草稿」是同一件事的两半，分开放等于让管理员先在 A 处得知、再去 B 处找入口。

**关于 `resolvable` 这一态（对原方案的补充，可裁）**：原方案只要求「草稿」一态。补上这一态是因为方案 B 有一处缺点不是「悄悄」造成的——目标发布之后，「回来重发一次」这件事**没有任何载体**，很容易永远没人做，学习端就长期看到残缺的近义词。让同一个标记在目标发布后自己变成「已发布 · 重新保存」，把待办摆回管理员眼前，成本只是同一处渲染的另一个分支。若认为噪音大于收益，砍掉它不影响其余任何设计。

**跳转**：`openTarget` 走 ``navigate(`/words/${relation.target_word_id}/wizard/forms`)``（草稿的续做落点），与列表页「继续创建」同口径。当前词条**有未保存改动**时不能直接跳——`useUnsavedWordChanges`（`useUnsavedWordChanges.ts`）已经在管这件事，沿用即可，不另写一套拦截。

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
- **`missing` 那一类走另一条路**：目标词义已不存在的关联**不进这个清单**，而是进 `issues`、阻断发布、要求重选。分界线是「这条数据将来会不会自己变对」——指向草稿的会（目标发布后就对了），指向已删词义的不会，留着一定是错的，且管理员删掉或重选就能自救，阻断它不会造成环。

## 后端对接建议

> 本仓不改后端。以下需转达后端评估。

### 必须放宽：允许关联指向未发布词义

`save_meanings_step` 里的引用解析（`editing.rs:617`）目前对草稿目标直接 422。要让本功能成立，**保存阶段必须允许**关联指向同库内存在但未发布的词义。

建议区分两个阶段：

- **保存草稿**：只校验**目标词条存在且未归档**，不要求已发布，**也不要校验 target_sense_id 是否仍然存在**。后者故意放过：目标草稿的补录者删掉一条词义，不应该让源词条从此存不下——那是把别人的编辑变成我的阻塞。悬空由发布阶段兜（见下）。
- **`target_headword` / `target_gloss` 指向草稿时必须回填草稿当前值，不能留空。** 前端拿不到替代来源：`related_search` 只返已发布词条，而这两个字段是只读的、前端保存时根本不发送（`toMeaningsWireContent` 只发 `id` / `relation` / `target_word_id` / `target_sense_id` / `score`）。后端不填，关联行重新打开就是一片空白，「草稿」标记挂在一个没有名字的目标上。
- **新增只读字段 `target_state`**（`resolved` / `draft` / `resolvable` / `missing`），语义见「类型与数据」一节。
- **发布**：按下面已定的产品规则调整，不再维持无条件的 `relation_target_unavailable`。

### 已定：发布时未解析关联怎么处理（requirements.md 决策记录 1）

规则是**显式 B**：关联保留在草稿里，发布快照不含未解析的关联，发布前逐条告知并要求确认，目标发布后重存词义步再提交生效即可带上。契约建议：

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
- `reason` 目前只有 `target_draft` 一种，留成枚举是为了以后加（例如目标词条正在归档流程中）。**目标词义已不存在**不走这里——它属于 `missing`，走 `issues` 阻断发布，用现有的 `relation_target_unavailable` 即可。

**2. `publish` 扩展（确认凭证）**

- 入参新增 `confirmed_unresolved_relations_token?: string`。
- 存在未解析关联而未带 token → `409 unresolved_relations_confirmation_required`，`meta` 里带上最新清单（与词形步 `downstream_confirmation_required` 同构）。
- 带的 token 与当前实际清单对不上（期间有人发布/归档了目标）→ `409 unresolved_relations_changed` + 最新清单，前端重开确认框。这个 code 要能被 `requiresNewIdempotencyKey`（`surfaceSnapshot.ts:239`）识别为需要换幂等键。

**3. 发布路径的解析行为**

`resolve_meaning_references` 在 `Verify` 模式下（`publishing.rs:196-207`）目前对解析不到的目标产出 `relation_target_unavailable` 并 422。改为：

- 解析不到 → **不报错**，只是不产出 `entry_publication_sense_refs` 行（这一步本来就是 `let Some(snapshot) = resolved.get(…) else { continue };`，天然如此）；同时把这条关联汇入 `unresolved_relations`。
- **`publication.snapshot` 里也要剔除未解析的关联**，否则学习端若直接读快照 JSON 的 `relations` 数组，会拿到一个悬空目标。这意味着**发布快照不再是草稿内容的逐字副本**——这是个值得先讲明的设计后果，别在实现时才发现。若学习端读的是 `entry_publication_sense_refs` 而非快照 JSON，这一条可以省掉；**请后端先确认读路径**。
- 目标词义已不存在（`missing`）仍然报 `relation_target_unavailable` 并阻断，不并入上面的宽松处理。

**4. 「目标发布后重新发布即可」这句话不准确**

`Verify` 模式会拿草稿里存的 `target_headword` / `target_gloss` 与目标当前发布内容逐字比对，对不上就报 `relation_target_stale`（「关联词目标的当前发布内容已变化，请重新保存词义步骤」，`publishing.rs:1041` 附近）。所以正确流程是**先回词义步重新保存一次（触发 `Canonicalize` 回填快照），再提交生效**——界面文案与后端提示都得这么写。

若后端愿意在 `Verify` 模式里对「原本未解析、现在能解析」的关联直接 canonicalize 而不是报 stale，就等于顺手实现了 requirements.md 决策记录 1 里说的 **C1**，前端文案可随之简化。**这是可选增强，不是本次前置。**

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
      → 返回新草稿
  → 分支（决策记录 2）：
      ├─ builtin_dictionary = matched → 新草稿有词性、每个词性各带一条空词义
      │     → 全部灌进该关联行的 senseChoices，默认选中第一条
      │     → 回填 target_word_id / target_sense_id
      └─ builtin_dictionary = not_found → forms.pos 为空 ⇒ meanings.pos 为空 ⇒ 一条词义都没有
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
                  ├─ 409 unresolved_relations_changed → 换幂等键、重跑 validate、重开 Modal
                  └─ 成功 → 发布快照不含这 3 条；草稿里这 3 条原样保留
  → 目标词条日后发布 → 本词条关联行的 target_state 变成 resolvable
      → 回第 3 步重新保存（Canonicalize 回填快照）→ 再提交生效 → 关联生效
```

## 测试策略（概览）

具体用例设计在动工阶段交给 **test skill**，此处只列方向：

- **单测（编排逻辑）**：无结果 → 出创建入口；detect 命中重复 → 不创建且按 `status` 分组列出已有；需同形确认 → 带 token 创建；创建成功且目标有词义 → 正确回填两个 ID 并灌入全部候选；**创建成功但目标没有任何词义（`builtin_dictionary = not_found`）→ 不回填、给明确说明**；创建失败 → 当前已录内容不丢。
- **单测（关联行标记）**：`target_state` 四态各自的标记与入口；`resolved` 不渲染任何标记；**标记不影响 `wordSenseIssueTarget` 的判定**（防回归：别把 `target_state` 加进待修项判断）；标记与入口在**不悬停**时可见（用 `toBeVisible` 而不是只查存在）。
- **单测（未解析关联汇总）**：`summarizeUnresolvedRelations` 的去重、分组、服务端没给条目时 `can_confirm=false`——照 `formsImpactSummary.test.ts` 的覆盖口径写。
- **单测（发布确认）**：有未解析关联 → 点「提交生效」先弹 Modal 而不是直接发；取消 → 不调 publish；确认 → 带 token 调 publish；`409 unresolved_relations_changed` → 换幂等键、重跑 validate、重开 Modal；`unresolved_relations` 非空但 `valid=true` 时**发布按钮不得禁用**（防回归：别把它做成方案 A）。
  - jsdom 注意：antd `Button` 的 loading 退场动画不结束会让可及名残留「loading」，测提交后的禁/用态用 `container.querySelector("button.ant-btn-primary")` 锚定，别用 `getByRole` 的 name。
- **mock 同口径**：`adminWordsMock` 的 `saveMeaningsStep` 要跟上后端最终口径。**本仓已被「mock 绿、真机红」坑过两次**（节点 ID、发音人），这次务必让 mock 与后端放宽后的校验一致，否则本地全绿、真机 422。
- **e2e**：输入库外词 → 创建草稿并关联 → 保存 → 新草稿出现在列表 → 回第 4 步发布 → 确认框列出该条 → 发布成功 → 回第 3 步这条关联**还在**。
- **真机**：后端放宽上线后在测试服验，重点四条——①保存不再 422；②重新打开词条时关联行能显示目标词名与「草稿」标记（验后端有没有回填 `target_headword` / `target_state`）；③发布后草稿里关联仍在、学习端看不到它；④目标发布后重存词义步再发布，关联真的生效。

## 风险与回滚

| 风险                                  | 评估                                                                                                                              | 处置                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **后端不放宽则功能不成立**            | 前端单独做完只能得到「点了创建、一保存就 422」                                                                                    | 后端放宽是前置，前端 PR 不得先于后端上生产                                                |
| **后端若在发布时删掉未解析关联**      | 交互设计 1 与 2 全部作废，且第 4 步刚刚承诺过「会保留」                                                                           | 决策记录 1 的硬依赖，联调前必须拿到后端明确答复「留」                                     |
| **未解析关联被塞进 `issues`**         | `valid=false` → 发布按钮禁用 → 悄悄变成方案 A，死锁一并装回来                                                                     | 写进契约、写成单测（`valid=true` 时按钮不得禁用）                                         |
| 内置词典未收录 ⇒ 新草稿一条词义都没有 | `build_initial_meanings` 按 `forms.pos` 建词义，`not_found` 时 `forms.pos` 为空。**这类词恰恰最需要本功能**（品牌名、缩写、术语） | 决策记录 2：仍建草稿但不回填关联，给明确说明 + 补录入口                                   |
| 半成品关联行被静默丢弃                | `toMeaningsWireContent`（`model.ts:735` 附近）会过滤掉两个 ID 没填齐的关联行，保存后就没了                                        | 决策记录 2 明确不留半成品；实现时若仍会产生这种行，须在保存前一次性告知，不能沿用静默丢弃 |
| 关联项显示不出目标词名                | 指向草稿时 `target_headword` / `target_gloss` 由服务端填；不填就是空白，前端无替代来源                                            | 已列为后端硬要求；前端仍需一条降级文案（显示词条 ID 后 8 位）兜住                         |
| 悬空关联                              | 补录者删掉被指向的词义，关联指向不存在的 sense                                                                                    | `target_state = missing`：保存放过、发布阻断、要求重选（决策记录 2）                      |
| 误建空草稿污染词库                    | 管理员点错就多一条空词条                                                                                                          | 前置重复检测已挡一道；不做连带删（决策记录 3），必要时走列表侧批量清理                    |
| 「重新发布即可」的文案说错            | 实际会撞上 `relation_target_stale` 的 422                                                                                         | 文案统一写「回词义步重新保存一次，再提交生效」                                            |

**回滚**：前端改动是新增入口，回滚即隐藏该入口，不影响已有关联；但**已经建出来的草稿和已存下的草稿关联会留在库里**——回滚前要确认这些数据在旧逻辑下不会导致保存/发布报错（旧逻辑会对草稿目标报 `relation_target_unavailable`），必要时需要数据清理方案。这一条比一般前端功能的回滚代价高，值得在上线前想清楚。
