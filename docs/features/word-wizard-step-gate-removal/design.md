# 创建单词向导取消步骤顺序门禁：技术设计文档

## 方案概述

**把「导航权限」和「内容完成度」彻底分开。**

今天这两件事被 `max_reachable_step` 绑在一起：它由后端从 `completed_steps` 推导，既表示「哪些步骤做完了」，又被前端当成「哪些步骤允许进入」。本次只砍掉后一层语义——前端导航不再看它，四步随时可进；完成度继续由「完成情况」面板和各步骤自身的校验如实呈现。

**为什么这样是安全的**：顺序门禁并不承担「防止不完整词条上线」的职责。发布时后端会独立重跑 `validate_forms` + `validate_meanings`（`src/lexicon/service/publishing.rs:140-153`），与 `completed_steps` 无关。也就是说真正的守门人是发布校验，顺序门禁只是在强制一种**工作流偏好**。拿掉它不降低数据安全，只是不再替管理员决定录入顺序。

**关键区分**：词义内容按 `pos_id` 组织，所以它结构上依赖的是**「词形步至少有一个基本词性」**，而不是**「词形步已完成」**。现有门禁卡的是后者，比实际需要严格得多——这正是可以放宽的空间。

**备选方案（不选）**：只让第 3 步「只读可进入」。改动量并不比现在小（要多做一套只读态），却解决不了「先录词义」这个核心诉求，等于把问题推迟。

## 代码影响范围

### 前端 `apps/admin`

导航门禁一共**四处**，都要拆：

| 文件                                   | 位置                               | 现状                                             | 改法                                                                 |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `word-creation/WordCreationLayout.tsx` | `:169`                             | `disabled: !word \|\| index > maxReachableIndex` | 只保留 `!word`，去掉越界判断                                         |
| `word-creation/WordCreationWizard.tsx` | `changeStep`                       | 越界时静默 `return`，点了没反应                  | 去掉越界判断，直接 navigate                                          |
| `word-creation/WordCreationWizard.tsx` | `legalStep` / `<Navigate replace>` | 直接输 URL 会被弹回 `max_reachable_step`         | 越界不再重定向；只保留「非法 step 名」与「published 锁 preview」两条 |
| `word-creation/WordCreationWizard.tsx` | `navigateToReadinessTarget`        | `targetIndex > maxIndex` 时 `return`             | 去掉该判断                                                           |

`maxReachableIndex` 与相关计算随之删除。

**不改**：`dictionary/wordRouting.ts:28` 也读 `max_reachable_step`，但它是决定列表「继续创建」落到哪一步的**默认落点**，不是门禁——保留，语义仍然成立（决策 3）。

**新增一处**（决策 1）：`word-creation/MeaningsAndExamplesStep.tsx` 补零词性空态。

第 3 步目前**完全没有** `content.pos.length === 0` 的处理——`tabs = content.pos.map(...)` 直接得到空数组，渲染出一个没有任何内容的 Tabs。门禁拿掉之前这条路径进不去所以不暴露，拿掉之后就是个真空白页。

照搬第 2 步已有的写法（`FormsAndPronunciationStep.tsx:2777`）：在 Tabs 之上加 `Alert type="info" showIcon`，只读/可写两套文案，并额外给一个跳回第 2 步的按钮（门禁拿掉后跳转可行，让用户就地闭环）。

**动工时补记（2026-08-21）：第 4 步同样是新可达路径，但无需改代码。**

上表只点了第 3 步的零词性空态，漏掉了「第 4 步预览并生效在草稿刚创建时也点得进来了」这条同类路径。
实测确认它已经安全，不需要新增空态：

- 结构渲染对空值安全降级（`PreviewAndPublishStep` 既有用例「只读预览对空值、未知词性、空词形组与关系词安全降级」已钉住）；
- 进入即自动 `validate`，把缺什么逐条列出来并给「去处理」定位入口，「提交生效」保持置灰。

也就是说第 4 步天然就是设计里说的「真正的守门人」形态，越步进入反而比第 3 步更早暴露缺项。
已补一条回归用例（「尚未录入的新草稿越步进入预览时安全降级，并由完整性检查拦住发布」）钉死这条新可达路径，不额外写空态代码。

**动工时补记（2026-08-21）：步骤条的完成态判定要一起改，否则越步会画出假绿勾。**

`WordCreationLayout.tsx` 的步骤 `status` 原本是
`completed.has(step) || index < currentIndex ? "finish" : "wait"`——
「排在当前步之前就算完成」这条兜底**只在顺序门禁存在时才成立**：门禁保证了你不可能站在进度之前。
门禁一拿掉就不成立了：实测新建草稿（`completed_steps: ["basics"]`）直接点第 4 步，
第 2、3 步都被渲染成 `ant-steps-item-finish` 绿勾，而这两步一个字都没录。

这正好撞上需求验收项「完成情况如实呈现，不因为进入了后面的步骤而变绿」——
左栏面板是诚实的（`buildWordReadiness` 按内容算），但顶部步骤条会撒谎。

**改法**：去掉 `|| index < currentIndex`，只认后端记的 `completed_steps`。
正常顺序录入下显示完全不变（排在前面的步骤本来就在 `completed_steps` 里），
只有「越步进入」这条新路径的显示被纠正。已补回归用例
「越步进入靠后步骤时，跳过的步骤不画成已完成」。

### 受影响的现有测试

这些用例断言的正是要拿掉的行为，必须改写成新口径（不是删掉，是反过来断言「可进入」）：

- `WordCreationLayout.test.tsx:143`「草稿汇总有效完成数，并只允许点击 max_reachable_step 内步骤」
- `WordCreationWizard.test.tsx:422`「stepper 只允许进入 max_reachable_step 以内步骤」
- `WordCreationWizard.test.tsx` 的「不可达路径 `/wizard/not-a-step` 归一到 meanings」「不可达路径 `/wizard/preview` 归一到 forms」——原本是一条 `it.each`，动工时拆成两条：前者（非法 step 名）保留原口径，后者（越界）反过来断言「停在 preview 不重定向」。
- `WordCreationWizard.test.tsx:253`「完成情况定位目标导航到可达步骤」——扩成也能导航到越界步骤。
- `WordCreationWizard.test.tsx:367`「published 无论请求何步都锁定 preview」——**保持不变**，本次不动已发布规则。

### 类型与数据

`@tsz/types` **无变更**。`max_reachable_step` 字段保留（后端仍返回），前端只是不再用它做导航判断。

### e2e

`e2e/tests/support/mockAdminApi.ts` 仍按 `intent === "complete"` 推进 `max_reachable_step`，与后端一致，**不用改**。若后端最终放宽了保存词义的前置条件，mock 侧要跟上同一口径（见下）。

## 后端对接建议

> 本仓不改后端。以下需转达后端团队评估。

前端拆掉四处门禁之后，**仍会被后端挡住**：

`src/lexicon/service/editing.rs:603` 在保存词义步时有硬前置：

```rust
if !current.completed_steps.contains(&PersistedWordStep::Forms) {
    return Err(LexiconServiceError::StepNotReachable);  // 409 step_not_reachable
}
```

只要词形步没被标记完成，任何词义步保存都是 409。前端单独改完的效果是「能进去、能填、一保存就失败」，**比现在更糟**。所以这条必须后端一起动，否则本功能不成立。

**建议**：把前置从「词形步已完成」放宽到**结构性前提**。两个方向供后端选：

1. **改为要求「至少有一个基本词性」**——词义按 `pos_id` 组织，这是它真正需要的前提。语义清晰，且仍能挡住「词条还没有任何词性就往里塞词义」。
2. **完全去掉该前置**——依赖 `validate_meanings(entry_id, &word.forms, ...)` 已有的引用校验去挡非法 `pos_id`。改动更小，但需要后端确认这条校验确实覆盖了「引用了 forms 里不存在的 pos_id」。

无论选哪个：

- `intent: "complete"` 的完成校验**不放宽**，只放宽 `intent: "save"`（若后端认为两者应一致，请说明）。
- 发布校验（`publishing.rs:140-153`）**一个字都不要动**——它是本方案的安全依据。
- `max_reachable_step` 的推导逻辑（`src/lexicon/service/helpers.rs:154`）**可以先不动**：前端不再消费它做导航，列表落点仍在用。后续是否废弃单独评估。

**待后端回答**：选 1 还是 2；`intent: "save"` 与 `"complete"` 是否要区别对待。

## 复用与约定

- UI 全部落在 antd v6 的 `Steps` 上，不引入 tailwind / `@tsz/ui`（admin 硬约定）。
- 无新增请求，`@tsz/api-client` 不动；无新增共享逻辑，`@tsz/shared` 不动。
- `@tsz/types` 无 wire 变更，不需要重跑 `sync:openapi`。
- 改动集中在 `apps/admin/src/features/dictionary/word-creation/`，属 admin 业务逻辑层，受 90% 覆盖率门槛约束。

## 数据流 / 时序

放宽后，「先录词义」的路径：

1. 第 2 步只添加了词性、未填音标 → 用户点顶部第 3 步。
2. 前端直接 navigate，不再有重定向。
3. 第 3 步按 `word.meanings.pos`（后端在添加词性时已同步创建）渲染 Tab；`collectPronunciationHints(word.forms)` 因为音标为空而返回空提示——**降级，不报错**。
4. 用户填释义、点「保存草稿」→ `PUT /steps/meanings`，`intent: "save"`。
5. 后端放宽前置后返回 200；`completed_steps` 不变，`max_reachable_step` 也不变。
6. 「完成情况」面板照旧显示词形相关项未完成。
7. 用户切回第 2 步补音标 → 两边内容都在。
8. 都齐了点「提交生效」→ 完整性检查通过才发布。

**已有机制不受影响**：在第 2 步删除某个词性时，仍走 `meaningsForRemovedPos` 的「下游内容影响」确认流程。这条路径今天就存在（完成 meanings 后回头删词性），不是本次引入的新风险。

## 测试策略（概览）

具体用例设计与落地在动工阶段交给 **test skill**，此处只列方向：

- **单测（组件层）**：步骤条四步都不禁用；`changeStep` 越界也会导航；直接给越界 step 不再重定向；完成情况面板能跳到越界步骤；已发布词条仍锁 preview（防回归）。
- **单测（改写）**：上面列出的 5 条现有用例按新口径反过来断言。
- **集成**：词形未完成时进入第 3 步能编辑并保存成功（依赖后端放宽，先用 mock 覆盖）。
- **mock 同口径**：后端定了口径后，`adminWordsMock` 与 `e2e/mockAdminApi` 的保存前置要跟上，否则本地绿、真机 409。
- **e2e**：补一条「词形未完成 → 跳第 3 步 → 保存草稿 → 回第 2 步 → 内容都在」的冒烟。
- **真机**：后端上线后在测试服验一遍，重点是第 3 步保存不再 409、发布仍被完整性检查拦。

## 风险与回滚

| 风险                                 | 评估                                                                            | 处置                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 不完整词条被发布                     | **不成立**。发布独立重跑 `validate_forms` + `validate_meanings`，与步骤顺序无关 | 不动发布校验；补一条回归用例钉住                                           |
| 词义引用了 forms 里不存在的 `pos_id` | 结构性风险，取决于后端选哪个方案                                                | 后端建议方案 1（要求至少一个词性）；方案 2 需确认 `validate_meanings` 覆盖 |
| 一个词性都没有时第 3 步空白页        | 体验问题                                                                        | 需求文档开放问题 1，做空态引导                                             |
| 前端先上、后端未动                   | **会造成「能进去、一保存就 409」，比现状更糟**                                  | **两边必须一起上**；前端 PR 不得先于后端合入生产                           |
| 管理员漏做某步就去发布               | 完整性检查会拦，但反馈时机变晚                                                  | 完成情况面板全程可见；如需更早提示见开放问题 3                             |

**回滚**：前端改动是纯删除判断，回滚即恢复四处越界判断，无数据迁移、无契约变更，可独立回退。后端若已放宽而前端回滚，只是回到「进不去」，不产生脏数据。
