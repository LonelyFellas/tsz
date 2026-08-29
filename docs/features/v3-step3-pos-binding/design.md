# V3 Step 3 基本词性双向绑定技术设计

## 方案概述

推荐复用现有 V3 aggregate 和两个保存端点，不新增 wire 契约。Step 3 新增 POS 时调用 `addPartOfSpeech` 生成 forms 节点，再通过 Wizard 已有的 `setDraftForms` 路径调用 `ensureV3MeaningsForForms`，一次本地动作同步两份草稿。

持久化采用严格顺序保存：若 forms dirty，Step 3 的保存动作先调用 `save_forms`；服务端返回新 canonical revision 后，再调用 `save_meanings`。这不是数据库单事务，但失败边界明确且可恢复。

## 现状依据

- `components/V3FormsAndPronunciationStep.tsx` 已使用 `addPartOfSpeech`、catalog 去重和活动 POS 切换。
- `operations.ts::addPartOfSpeech` 已定义稳定 POS、form group、base form、地区 variant 和 pronunciation 骨架的唯一创建规则。
- `V3WordCreationWizard.tsx::setDraftForms` 已调用 `ensureV3MeaningsForForms`，Step 2 → Step 3 的新增同步已经存在。
- `meaningsModel.ts::ensureV3MeaningsForForms` 会为 forms 中缺失的 POS 建立默认 meanings 模板，并维护 sense-group 所有权。
- 当前 `saveMeanings` 仅在 `intent=complete` 且 canonical forms 尚未完成时保存 forms；普通保存和“forms 已完成但本地又变更”尚未覆盖。

## 代码影响范围

### 前端 tsz

- `apps/admin/src/features/dictionary/word-creation-v3/components/`
  - 提取或新增共享的 `V3AddBasicPosSelect`，由 Step 2、Step 3 共用 catalog 过滤和展示。
- `V3FormsAndPronunciationStep.tsx`
  - 改为使用共享选择器，保留现有 `addPartOfSpeech` 行为。
- `V3MeaningsAndExamplesStep.tsx`
  - 新增 `onFormsChange` 回调；在 Tabs 右侧渲染共享选择器。
  - 新增成功后调用 forms 回调并切换活动 POS；不直接创建另一份 meanings 节点。
- `pages/WordWizardV3.tsx`
  - 向 Step 3 传入 `context.setDraftForms`。
  - Step 3 saving 状态同时覆盖 `save_forms` 和 `save_meanings`。
- `V3WordCreationWizard.tsx`
  - `saveMeanings` 在 forms dirty 时先调用 `saveFormsContent`。
  - 只有 forms canonical 成功后才读取新 revision 并发送 meanings。
  - 保持部分成功时的 dirty/retry 状态。
- 对应测试：
  - `V3FormsAndPronunciationStep.test.tsx`
  - `V3MeaningsAndExamplesStep.test.tsx`
  - `V3WordCreationWizard.test.tsx`
  - `operations.test.ts` / `meaningsModel.test.ts` 仅在共享组件暴露新边界时补充。

### 类型与数据

- 不修改 `@tsz/types` wire 类型。
- 不修改 `@tsz/api-client` 或 OpenAPI 快照。
- `forms.pos` 继续是 POS 身份权威；`meanings.pos` 通过相同 `pos_id` 绑定。

## 后端对接

复用现有端点：

1. `POST /admin/lexicon/entries/:id/steps/forms/impact`
2. `PUT /admin/lexicon/entries/:id/steps/forms`
3. `PUT /admin/lexicon/entries/:id/steps/meanings`

本次无契约缺口。若产品要求 forms + meanings 数据库级原子提交，则需后端另行设计组合命令；前端不能通过并发请求或本地回滚模拟原子性。

## 复用与约定

- POS 创建复用 `addPartOfSpeech`。
- meanings 补齐复用 `ensureV3MeaningsForForms`。
- UUID 继续使用 `newWordNodeId`，不从词面或 POS code 推断。
- catalog 继续使用 `usePartOfSpeechCatalog` / 现有 data source。
- Admin UI 使用 antd v6，不引入新的 UI 库。
- wire 保持 snake_case，不增加转换层。

## 数据流 / 时序

### Step 3 新增 POS

1. 用户选择尚未添加的 catalog POS。
2. 共享选择器调用 `addPartOfSpeech(draftForms, catalogItem, idFactory)`。
3. `context.setDraftForms(nextForms)`：
   - 更新 `draftForms` 和 forms dirty；
   - 调用 `ensureV3MeaningsForForms`；
   - 更新 `draftMeanings` 和 meanings dirty。
4. `setActivePosId(newPosId)`，Step 3 立即显示默认模板。
5. 切回 Step 2 时读取同一份 `draftForms`，节点身份不变。

### Step 3 保存

```text
用户保存 Step 3
  ├─ forms clean → 直接 save_meanings
  └─ forms dirty
       ├─ preview/save_forms 失败 → 停止，不发 save_meanings
       └─ save_forms 成功 → flow canonical revision 更新
                              → save_meanings 使用新 revision
```

- `intent=save`：forms 和 meanings 都使用 `save`。
- `intent=complete`：forms 和 meanings 都使用 `complete`。
- forms 成功、meanings 失败：保留 meanings dirty 和重试上下文，不回写旧 revision。

## 测试策略（概览）

### 单元/组件

- Step 2/3 选择器使用相同可选集合和禁用状态。
- Step 3 新增后 forms POS ID 与 meanings POS ID 相同。
- 重复 POS 不可选、不产生新 UUID。
- 新增后活动 Tab 切到新 POS。

### Wizard 集成

- Step 3 add → Step 2 可见相同 forms 骨架。
- Step 2 add → Step 3 可见默认 meanings 模板。
- forms dirty 时保存顺序和 revision 正确。
- forms 失败不调用 meanings；meanings 失败保留 dirty 并可重试。
- 切换步骤不丢失未保存内容。

### 真实浏览器

- 在 Step 3 新增一个未使用 POS，检查 Step 3 Tab 和 Step 2 表单。
- 从 Step 3 保存后刷新，两个步骤仍显示同一 POS。
- 模拟第二步保存失败/第三步保存失败，检查中文错误和重试。

## 风险与回滚

- **部分成功：**两个端点不是事务；UI 必须明确保留 meanings dirty，不能显示“全部保存成功”。
- **影响确认：**未来若新增 POS 触发 forms surface/impact 确认，必须复用现有确认流程，不能跳过。
- **节点重复：**禁止 Step 3 自己生成 meanings-only POS 或复制 UUID 规则。
- **删除风险：**本次不在 Step 3 提供删除，避免绕过 Step 2 的下游影响确认。
- 回滚只需移除 Step 3 选择器和顺序保存分支；已有数据仍是标准 V3 aggregate，无需迁移。

## 推荐评审结论

建议批准：

1. 采用现有两接口顺序保存，接受可恢复的部分成功；
2. Step 3 本次只新增、不删除基本词性；
3. 新增默认模板不自动标记 Step 2/3 完成；
4. 不新增后端组合接口和 OpenAPI 变更。
