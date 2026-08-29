# Smart Lexicon 短语 V3-native 编辑统一技术设计

> 审批状态：2026-08-28 用户已批准完整 V3 aggregate、Step 3/4/lifecycle 同步 V3、V2 phrase 清理重建和后端 OpenAPI 先行。

## 设计结论

采用完整 V3 aggregate 扩展：把 V3 entry kind 从仅 `word` 扩展为 `word | phrase`。新建短语从 detection、create、forms、meanings、validate、publish 到 lifecycle 全程使用 V3 contract，并直接复用当前单词 V3 wizard 与 Step 2 组件。

本设计不采用“V2 phrase 数据 + V3 外观”的适配层。后端正式 OpenAPI 是前端实现前置条件。

## 当前事实

### 类型分叉

- `packages/types/src/admin-word-v3.ts`
  - `WordEntryKindV3 = "word"`
  - `AdminWordV3.kind` 与 `CreateAdminWordV3Input.kind` 被限制为 word
  - forms 为 `DraftFormsStepContentV3`
- `packages/types/src/admin-word-v2.ts`
  - `AdminWordV2.kind = "word" | "phrase"`
  - forms 为 `base_form + form_groups[].slots[]`

### 创建和路由分叉

- `UnifiedCreateEntryStep.tsx` 对 word 调用 schema 3 detect/create，对 phrase 调用 schema 2 detect/create。
- `WordCreate.tsx` 根据创建响应的 schema 导航到 `/v3/wizard/forms` 或 `/wizard/forms`。
- `wordRouting.ts` 根据 schema 选择两套 wizard 前缀。

### UI 分叉

- V3 word 使用 `V3WordCreationWizard`、`V3FormsAndPronunciationStep` 及其 components/CSS。
- V2 phrase 使用 `WordCreationWizard`、`FormsAndPronunciationStep` 和 V2 `word-creation.css` 数据路径。
- 即使两套页面复用部分视觉 token，DOM、状态机和保存 DTO 仍不同，响应式行为会继续漂移。

## 选择方案

### 后端契约提案

后端需先正式扩展并导出 OpenAPI：

1. 将 V3 entry kind 改为 `"word" | "phrase"`。
2. `DetectLexiconSurfaceV3Input.kind`、检测响应 request kind、`CreateAdminWordV3Input.kind`、`AdminWordV3.kind`、V3 list/publication/history snapshot kind 使用同一枚举。
3. V3 detection 对 phrase 返回 V3-native `suggested_pos/suggested_forms`；没有建议时返回 phrase 空骨架，不转 V2 headwords。
4. V3 create 按 detection 中真实 kind 建立 aggregate；不得把 phrase 强制写成 word。
5. V3 forms impact/save、meanings save、validate、publish、history activation、archive/restore 对 phrase 使用同一校验和并发语义。
6. surface projection 的 `entry_kind` 保持真实 phrase；presentation 继续只收集 base forms，并按 wire 顺序去重拼接。
7. related search、sentence association 与 relation consumer 继续携带真实 kind，不按 kind 排除 phrase。
8. OpenAPI 导出后同步 generated/runtime schema；禁止手改 snapshot 伪造支持。

### 前端 wire 变更

按实现顺序：

1. `packages/types/src/admin-word-v3.ts`
   - `WordEntryKindV3` 扩展为 `"word" | "phrase"`，或重命名为中性 `EntryKindV3` 并保留兼容导出。
   - 所有 V3 envelope/list/publication/detection/create 类型使用新枚举。
2. `packages/api-client`
   - 从后端 `docs/openapi.json` 同步 snapshot 和 runtime schema。
   - contract tests 覆盖 schema 3 phrase detect/create/detail/forms/validate/publish。
3. `apps/admin`
   - 所有 response identity guard 同时校验 schema、ID 和 kind。

### 统一创建入口

`UnifiedCreateEntryStep.tsx` 保留前端输入归一化和 kind 分类，但删除 V2 phrase 创建分支：

```text
normalized input
  -> classify word|phrase
  -> V3 detect { schema_version: 3, kind, surface }
  -> V3 create { schema_version: 3, kind, detection_id, token? }
  -> require response schema=3 and response.kind=classified kind
  -> /words/:id/v3/wizard/forms
```

`createV2/detectV2` 从统一新建 requests 中移除。V2 data source 仅保留历史 entry 读取/生命周期所需能力。

### 路由

- `/words/new`：唯一创建入口。
- 新 V3 word/phrase：统一 `/words/:id/v3/wizard/:step`。
- `WordCreate.tsx` 不再按 schema 分支新建路由；创建成功必须为 schema 3。
- `WordWizardV3.tsx` detail guard 接受 V3 word/phrase，不因 phrase 回退或重定向 V2。
- `wordRouting.ts` 继续按真实 schema 为历史 V2 生成旧路由；所有新 phrase list item 为 schema 3，自然进入 V3 路由。

### V3 wizard 与 UI 复用

直接复用：

- `V3WordCreationWizard.tsx`
- `V3FormsAndPronunciationStep.tsx`
- `V3PosTab.tsx`
- `V3FormGroupCard.tsx`
- `V3ConcreteFormRow.tsx`
- `V3PronunciationList.tsx`
- `operations.ts / model.ts / readiness.ts / saveFlow.ts`

需要中性化的内容：

- 类型名和局部变量可分阶段从 word 改为 entry，但不得为重命名制造大范围无业务 diff。
- 页面业务文案根据 `kind` 在必要处显示“单词/短语”，其余保持“词条”。
- readiness、问题导航和 node identity 不按 kind 分叉。

Step 2 不新增 phrase 条件渲染。任何 `if (kind === "phrase")` 的 UI 分支都需单独论证；默认禁止。

### Step 3/4 与 lifecycle

选择完整 V3 aggregate 后，phrase 自动复用 V3 meanings/preview/publish/history。理由：

- V3 forms 节点 ID 会被 meanings、relations、sentence links 和 validation location 引用；切回 V2 meanings 会破坏身份链。
- schema discriminator 必须描述整个 aggregate，不能只在一个 step 改版本。
- 发布 snapshot 与历史激活必须保存一致的 schema。

### 既有 V2 phrase 处理

推荐按环境分两条明确路径，不做运行时兼容转换：

#### A. 未上线/可清理环境（推荐）

- 备份后清理现有 V2 phrase 测试数据；
- 保留 word、catalog 和无关数据；
- 用 V3 phrase 重新创建验收样本；
- 不编写长期 V2→V3 兼容代码。

#### B. 必须保留的环境

- 后端独立 migration 读取 V2 phrase aggregate/publication；
- 一次性生成 V3 POS/form/group/membership/variant/pronunciation UUID；
- 保留可对应文本、顺序、生命周期和审计记录；
- 对无法无损表达的数据 fail closed 并输出报告；
- 明确 publication history 是全量迁移还是仅当前版本。

迁移逻辑必须在后端，前端不参与。

## 不采用方案

### 只修 CSS

拒绝。页面看似一致，但保存 DTO、身份、校验和响应式分支仍不同，问题会重复出现。

### V2 phrase 转成本地 V3 view model

拒绝。V2 单 base/slots 无法无损表达 V3 多 base、同类型多 form 和共享 membership；刷新、冲突和保存会丢身份。

### 混合 aggregate：V3 forms + V2 meanings

拒绝。跨 step 的 node reference、revision、publication snapshot 和 validation location 无法保持同一 schema。

### 新建 phrase 专用 V3 组件

拒绝。会再次形成 UI 分叉。现有 V3 组件必须按 entry kind 中性复用。

## 精确影响范围

### 后端提案（需在 tsz-rust 独立任务实施）

- V3 kind DTO/OpenAPI discriminator
- detection/create service
- V3 aggregate persistence/read/list projection
- forms/meanings validation and publication
- surface projection/search/relation consumers
- V2 phrase migration或清理工具
- Rust contract/integration/storage tests

前端 feature 技能阶段不修改上述后端实现。

### 前端实现文件（OpenAPI 落地并批准后）

- `packages/types/src/admin-word-v3.ts`
- `packages/api-client/src/openapi.snapshot.json`（只通过 sync 生成）
- `packages/api-client/src/admin-word-v3.runtime-schema.json`（只通过生成流程）
- `packages/api-client/src/*contract*.test.ts`
- `apps/admin/src/features/dictionary/word-creation/UnifiedCreateEntryStep.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/api.ts`
- `apps/admin/src/pages/WordCreate.tsx`
- `apps/admin/src/pages/WordWizardV3.tsx`
- `apps/admin/src/features/dictionary/wordRouting.ts`
- V3 wizard/components 中仅与 hard-coded word kind 相关的最小文件
- 相应 fixtures、unit/integration/e2e tests

## 数据流与状态

1. 输入归一化后得到 immutable `classifiedKind`。
2. detection request/response 必须回显同一 kind。
3. surface snapshot 完整加载并可确认后，create 携带同一 kind 和 token。
4. create response schema/kind/ID 三重校验通过后导航。
5. wizard detail GET 再次校验 schema=3、ID 和 kind。
6. forms/meanings draft state始终使用响应原生节点，不从输入或 V2 数据重建。
7. 每次 save/impact/publish 保留现有 scope token、revision 和 idempotency 状态机。

## 测试策略

文档批准后，写测试前调用 test skill 生成正式矩阵。

### 后端契约/集成

- schema 3 word/phrase detect/create 成功与 kind 回显。
- phrase dictionary matched/not_found/unavailable。
- phrase 多 base、同类型多 form、membership、多 pronunciation、UU/UD/DD。
- save/complete/impact/validation/publish/history/lifecycle。
- surface detection 可命中 phrase base，并允许不同 entry 共享 surface。
- V2 phrase migration/清理边界。

### 前端 unit/integration

- 空格分类后 phrase 发送 V3 request，不调用 V2。
- response kind/schema 不一致 fail closed。
- phrase 创建导航 V3 route。
- V3 Step 2 对 word/phrase 渲染同一组件和关键 DOM class。
- 所有现有 V3 identity、dirty、impact、conflict、readiness 测试参数化覆盖 phrase。
- 历史 V2 phrase 仍按批准策略读取或重定向。

### E2E/真实浏览器

- `run` 与 `take care of` 并排验收。
- 390/768/1024/1440 视口。
- Step 1 检测、二次确认、创建、Step 2 编辑保存刷新、Step 3、预览、发布和继续编辑。
- 控制台/网络无英文原始错误、内部 ID 或错误 schema 路由。

## 风险

- **后端契约未就绪：**前端不能先行伪造；以正式 OpenAPI 为硬门。
- **V2 历史数据丢失：**清理前需明确授权；迁移需独立审计。
- **kind 被现有代码当版本：**必须搜索并逐处改成 schema/kind 正交判断。
- **V3 发布消费者只接受 word：**后端需要消费者清单和 phrase canary。
- **测试量扩大：**优先参数化现有 V3 矩阵，避免复制测试套件。

## 回滚

- 前端在后端 phrase V3 contract 未启用前不发布相关代码。
- 若 V3 phrase create 出现问题，后端停止接受新的 schema 3 phrase；已有 V3 phrase 保持可读，不转换回 V2。
- cutover 后不得把已生成 V3 phrase 静默降级为 V2。
- 数据清理不可逆时必须先有备份；数据迁移失败按批次回滚并保留审计报告。

## 审批请求

实施前需要一次性批准：

1. 新 phrase 一律使用完整 V3 aggregate，而不是只统一 Step 2 外观；
2. Step 3/4、发布和 lifecycle 同样走 V3；
3. 后端先扩展并导出正式 OpenAPI，前端不伪造；
4. 现有 V2 phrase 选择“清理重建”或“独立迁移”；
5. 旧 V2 phrase 路由的保留策略。
