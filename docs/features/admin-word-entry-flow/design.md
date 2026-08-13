# 优化后台添加单词流程技术设计文档

## 方案概述

采用“前端交互整治 + 后端权威建议/规则契约”两阶段方案。

第一阶段可在现有 `AdminWordV2`、分步保存和 `DraftValidationIssue` 契约上先完成：把校验改为纯函数聚合、按稳定节点建立 issue 索引；Tab/步骤展示计数并支持定位；按后端下发的词性能力过滤词形；普通文本框作为主编辑器，高级语音编辑按需打开；第三步改为受控渐进展开；预览补齐关键字段；所有页面状态按 `word.id` 重置并以服务端保存版本为恢复基准。

第二阶段由 `tsz-rust` 扩展检测/创建契约，返回结构化词典建议（词形、发音、释义、例句、词频、来源和缺失摘要）以及基本词性的合法词形能力。创建草稿时由后端消费检测上下文并生成完整建议树，服务端在步骤完成和发布时再次校验词性/词形组合。前端只展示和编辑真实返回，不内置 `high`、`access` 数据，也不在客户端猜词典内容。

不选择“仅前端按 noun/verb/adjective/adverb 写死并生成常见拼写”的方案：catalog 编码可配置，前端规则会漂移；不规则变化、音标、释义和例句不能可靠推断；仅靠隐藏下拉项也无法阻止非法 API 请求写入。

## 现状结论与边界

### 已确认的前端现状

- `CreateEntryStep.tsx` 读取 `builtin_dictionary.suggested_forms`，但创建请求只发送 `detection_id + headwords`；检测页主要展示词性数量，无法说明发音、释义、例句、词频的真实覆盖情况。
- `FormsAndPronunciationStep.tsx` 使用全局 `FORM_TYPE_OPTIONS`，所有基本词性共享同一派生类型集合；`createDerivedSlot` 接收任意非 `base` 类型，缺乏按词性约束。
- forms 和 meanings 完成动作先做“返回第一条字符串”的本地校验，服务端错误也只取第一个匹配 step 的 `field_issue`，因此用户反复点击才能发现下一个问题。
- 现有稳定 `node_id + field` 定位基础已经存在，forms/meanings 能切换所属词性并聚焦；可扩展为聚合问题列表，无需推翻 wire 节点模型。
- `MeaningsAndExamplesStep.tsx` 已有普通 RichText 数据模型，但多个编辑区把语音富文本操作放在主路径；关系词仅局部折叠，词义 Collapse 与内容默认展开策略造成高密度页面。
- `useUnsavedWordChanges` 已负责离开提示；步骤 state 以组件局部状态为主，但部分 active Tab、展开和 validation location 没有统一按 `word.id` 生命周期清理。
- `PreviewAndPublishStep.tsx` 已调用 validate 并支持 issue 跳转，但预览层级和来源/缺失表达不足。

### 已确认的后端契约现状

权威依据为 sibling `tsz-rust/docs/openapi.json`、`tsz-rust/docs/word-data-model.md` 和当前前端镜像 `packages/types/src/admin-word-v2.ts`：

- 检测 matched 结果当前只明确返回 `headwords` 和 `suggested_forms`；没有结构化的 meanings、词频或建议覆盖摘要。
- `WordFormVariantV2` 支持 `origin: dictionary | converted | manual`，`TextVariantV2` 也有 origin，具备 provenance 基础；读音节点目前没有 origin/provider 字段。
- `WordFormType` 是全局枚举，`PartOfSpeechCatalogItem` 没有 `allowed_form_types/default_form_types`，OpenAPI 也未表达 POS 与 form type 的约束关系。
- `DraftValidationIssue[]` 已能承载多个问题并稳定定位，RFC 9457 `ProblemDetails.field_issues` 也支持数组；前端没有充分消费。
- 后端文档明确 dictionary schema 是运行时只读参考数据，lexicon 创建/发布是独立领域；因此建议生成与来源治理应在 `tsz-rust`，不应进入前端 mock 或常量。

## 代码影响范围

### 前端 `tsz`

预计修改：

- `packages/types/src/part-of-speech.ts`
  - 镜像 catalog 新增的词形能力字段。
- `packages/types/src/admin-word-v2.ts`
  - 镜像检测建议摘要、suggested meanings/metadata、读音/建议 provenance 等最终 OpenAPI 字段；不提前臆造落地类型。
- `packages/api-client/src/openapi.snapshot.json`
  - 后端契约落地后由 `sync:openapi` 同步。
- `packages/api-client/src/endpoints.contract.test.ts`
  - 若新增建议端点则纳入契约；若只扩展现有响应则确保快照一致。
- `apps/admin/src/features/dictionary/part-of-speech/catalog.ts`
  - 建立 `allowed_form_types`、默认顺序和标签 lookup；catalog 缺能力时 fail closed，不展示派生类型。
- `apps/admin/src/features/dictionary/editorConstants.ts`
  - 保留 wire label；移除创建页对全局派生类型 options 的直接依赖。
- `apps/admin/src/features/dictionary/word-creation/model.ts`
  - 新增按 POS 创建/补齐派生 slot、建议应用、字段完成度、聚合校验、issue 分组与状态重置等纯函数。
- `apps/admin/src/features/dictionary/word-creation/CreateEntryStep.tsx`
  - 展示建议覆盖摘要、真实来源与缺失项；创建成功/重新检测时清理本地状态。
- `apps/admin/src/features/dictionary/word-creation/FormsAndPronunciationStep.tsx`
  - 使用 POS 能力过滤/默认词形；展示建议来源和 Tab issue badge；接入聚合问题面板。
- `apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.tsx`
  - 普通文本优先；高级语音编辑入口下沉到字段；受控渐进展开；明确词频规则；接入聚合校验/定位。
- `apps/admin/src/features/dictionary/word-creation/PreviewAndPublishStep.tsx`
  - 补齐全量关键字段、来源/缺失标识与跨步骤聚合问题导航。
- `apps/admin/src/features/dictionary/word-creation/WordCreationLayout.tsx`
  - 由简单节点数量改为各步骤完成/阻断数量，Steps 与侧栏同步显示。
- `apps/admin/src/features/dictionary/word-creation/useWordValidationIssueFocus.ts`
  - 从单 issue location 扩展为问题集合中的当前选中项，支持展开祖先区块、聚焦与返回问题面板。
- `apps/admin/src/features/dictionary/word-creation/useUnsavedWordChanges.ts`
  - 保留现有离开保护；补足浏览器刷新和允许已保存导航的回归测试，不在此持久化未保存正文。
- `apps/admin/src/features/dictionary/word-creation/word-creation.css`
  - issue badge、问题面板、建议来源、紧凑核心区和高级编辑入口样式。
- 同目录现有 `*.test.ts(x)` 与 `e2e/tests/`：按后文矩阵扩展。

可能新增：

- `apps/admin/src/features/dictionary/word-creation/validation.ts`
  - 无副作用地收集 forms/meanings/preview 问题，输出与 `DraftValidationIssue` 可映射的统一视图模型。
- `apps/admin/src/features/dictionary/word-creation/ValidationIssuePanel.tsx`
  - 统一展示、按步骤/POS 分组、点击定位。
- `apps/admin/src/features/dictionary/word-creation/PlainRichTextField.tsx`
  - 普通 textarea/input 与可选高级语音编辑的组合壳；保持原 RichText 节点 ID。

最终文件名可在实现时按现有组件边界微调，但校验纯逻辑不得继续散落为多个组件内“第一条错误”函数。

### sibling `tsz-rust`（仅对接建议，本分支不实现）

预计影响由后端团队评估：

- `docs/openapi.json`：扩展 catalog 与检测/创建响应 schema。
- `docs/frontend-integration.md`：补充智能词库建议覆盖、来源与兼容策略。
- dictionary provider/lexicon detection orchestration：从真实数据源生成建议，不由前端拼装。
- lexicon create：消费 detection 上下文，将建议落为稳定节点 ID 的 V2 草稿。
- lexicon validation：按 POS 能力校验 form type，在 save-complete、validate、publish 均执行。
- 后端 contract/service/integration 测试：固定覆盖 `high`、`access` 以及恶意非法组合。

## 后端对接

### 现有接口继续使用

- `POST /api/v1/admin/lexicon/detections`
- `POST /api/v1/admin/lexicon/entries`
- `GET /api/v1/admin/lexicon/entries/{entry_id}`
- `PUT /api/v1/admin/lexicon/entries/{entry_id}/steps/forms`
- `PUT /api/v1/admin/lexicon/entries/{entry_id}/steps/meanings`
- `POST /api/v1/admin/lexicon/entries/{entry_id}/validate`
- `POST /api/v1/admin/lexicon/entries/{entry_id}/publications`
- `GET /api/v1/admin/settings/parts-of-speech/catalog`

鉴权继续使用 admin Bearer；保存和发布继续使用 `base_revision`，生命周期操作继续使用独立 `base_lifecycle_revision`。

### 建议的词性能力契约

在 `PartOfSpeechCatalogItem` 增加只读创编能力，示意：

```jsonc
{
  "code": "verb",
  "allowed_form_types": [
    "third_person_singular",
    "present_participle",
    "past_tense",
    "past_participle"
  ],
  "default_form_types": [
    "third_person_singular",
    "present_participle",
    "past_tense",
    "past_participle"
  ]
}
```

要求：

- `default_form_types` 必须是 `allowed_form_types` 的有序子集。
- noun、verb、adjective、adverb 按需求文档固定基线配置；其他词性可为空。
- catalog 只是前端渲染来源；服务端仍必须按同一权威规则验证。
- 未升级后端时前端 fail closed：允许查看/编辑已有 slot，但不允许新增无法确认合法性的派生类型，并显示“词形规则未加载”。

### 建议的词典建议契约

优先扩展现有 detection matched 结果，避免新增一次网络往返：

```jsonc
{
  "builtin_dictionary": {
    "status": "matched",
    "provider": { "kind": "...", "version": "..." },
    "headwords": { "mode": "unified", "common": "access" },
    "suggested_forms": { "pos": [] },
    "suggested_meanings": { "sense_groups": [], "pos": [] },
    "suggested_frequency": "...",
    "coverage": {
      "forms": "complete|partial|missing",
      "pronunciations": "complete|partial|missing",
      "meanings": "complete|partial|missing",
      "examples": "complete|partial|missing",
      "frequency": "complete|missing"
    }
  }
}
```

最终字段以 OpenAPI 评审为准，核心语义是：

- 建议树与 `AdminWordV2.forms/meanings` 尽量同构，减少前端易错转换；节点由后端创建草稿时生成稳定 ID，detection 临时响应若带 client ID，不能被当成已持久化节点 ID。
- 每个内容节点可追踪 `origin/provider/version`；至少能区分 dictionary、converted、manual。读音也需要等价 provenance。
- 建议只含数据源真实给出的内容；coverage 明确 partial/missing。
- 创建接口仍只提交 detection ID 与用户确认后的 headwords，由后端原子消费 detection 上下文并持久化建议，避免客户端篡改来源或因两次请求丢失建议。
- detection 有 TTL；过期继续返回 410 并要求重新检测。

若现有 dictionary 数据集只包含词头/地区证据，第一阶段后端只应宣称 forms 等实际覆盖；音标、释义、例句、词频待合法数据源接入后逐项开放。前端按 coverage 展示，不为了“少量确认”伪造字段。

### 服务端验证补强

- 保存 forms（尤其 `intent=complete`）、`validate` 和 `publications` 均校验 `pos -> allowed_form_types`。
- 非法组合返回 422 `validation_failed`，`field_issues` 包含全部问题；每项 `step=forms`、`node_id=slot.id`、`field=form_type`、稳定 `code=invalid_form_type_for_part_of_speech`。
- 词条总词频、词义词频、语法、释义、例句等发布规则一次性聚合返回，不因第一条失败提前结束。
- catalog/version 与草稿创建时版本不一致时，服务端按当前规则校验；若旧草稿因此失效，返回可修复 issue，不能静默删除 slot。

## 复用与约定

- wire 类型进入 `@tsz/types`，请求封装进入 `@tsz/api-client`；创建页纯 UI/流程逻辑保留在 admin feature 内。
- admin 全部使用 antd v6；Tab badge 用 `Badge`，聚合问题可用 `Alert + List/Anchor`，高级编辑使用现有 voice editor，不引入 `@tsz/ui`。
- 保留稳定 UUID 节点模型、revision 乐观锁、forms impact preview 和全树服务端校验。
- 普通文本修改只更新 `RichText.text` 并保留节点 ID；从高级编辑保存时同时写回 annotations。普通编辑导致偏移失效时，必须走现有富文本规范的显式清理/重算策略，不保留错误 annotation。
- 客户端问题收集使用纯函数，输出统一 issue view；服务端 issue 为最终权威，二者按 `step/node_id/field/code` 合并去重。

## 数据流 / 时序

### 检测与创建

1. 用户输入 headword，前端清空上一检测版本、建议摘要和幂等键。
2. detection 返回 duplicate 状态、真实词典建议、coverage 和 provider。
3. 前端展示已建议/待补项；仅 catalog 已加载且建议 POS 均合法时允许创建。
4. 用户确认 headwords 后提交 `detection_id`；后端原子消费检测上下文并创建带建议内容的 V2 草稿。
5. 前端以创建响应中的完整 `word` 为唯一后续初始值，不复用 detection 临时对象。

### 编辑、完成度与保存

1. 每个步骤的局部 content 由当前 `word.id + revision` 初始化；用户输入只更新所属稳定节点。
2. 纯函数每次从 content 全量计算 issue，按 step/POS/section 建索引，Steps、Tab 和侧栏只消费派生计数。
3. 点击 issue：选中 issue → 切到目标 POS → 展开祖先 section/sense → 下一帧滚动和聚焦 `data-word-node-id + data-word-field`。
4. `save` 允许保存未完成草稿；`complete` 先展示全部客户端 issue，无阻断才请求服务端。
5. 服务端返回多个 field issues 时合并展示；保存成功后用响应替换 word/content、清 dirty、更新 revision。

### 普通文本与高级语音

1. 字段默认显示普通文本输入和“高级语音编辑”次级按钮。
2. 打开高级编辑时复制当前 RichText 到弹窗草稿。
3. 取消不写回；确认才原子写回同一内容节点。
4. 高级能力不影响普通文本必填判定；判定以 trim 后正文为准。

### 返回、刷新与第二词

- dirty 时由离开保护拦截站内导航和浏览器刷新；确认离开后丢弃仅客户端改动。
- 保存成功后返回/刷新，GET 恢复服务端最新 revision。
- 路由 `word.id` 变化或从 resume 回到 `/words/new` 时，卸载/重建编辑状态；所有 active Tab、collapse、issue selection、requestVersion 和 idempotency key 均不得放入跨词条单例。
- Query cache 使用 entry ID 区分；创建成功后的响应只写入新 ID 对应 cache，不沿用上一词对象引用。

## 测试用例矩阵

以下矩阵由 `test` skill 在写测试代码前设计；P0 在实现阶段必须逐项落成自动化测试。

| #   | 层       | 场景                 | 输入/前置                                                         | 预期                                                          | 优先级  |
| --- | -------- | -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ------- |
| 1   | 单元     | POS 合法词形能力     | noun/verb/adjective/adverb catalog capability                     | 分别得到需求规定的类型与默认顺序，其他 POS 为空               | P0      |
| 2   | 单元     | 非法类型 fail closed | adjective + past_tense、verb + comparative、catalog 无 capability | 生成阻断 issue，不能创建/切换为非法类型                       | P0      |
| 3   | 单元     | 自动补齐缺失 slot    | access 动词已有 past_tense，点击新增/补齐                         | 只补合法且缺失类型，稳定顺序，不覆盖已有变体                  | P0      |
| 4   | 单元     | 聚合 forms 校验      | 多 POS 同时缺音标、实际发音、拼写且含非法类型                     | 一次返回全部 issue，并正确归属 node/field/POS                 | P0      |
| 5   | 单元     | 聚合 meanings 校验   | 缺总词频、词义词频、语法、释义、例句                              | 一次返回全部问题，词频文案明确                                | P0      |
| 6   | 单元     | issue 合并去重       | 客户端与服务端返回同定位/不同 code                                | 同问题不重复，服务端文案优先，未知定位保留                    | P0      |
| 7   | 集成     | `high` 检测摘要      | 真实形状 mock：noun/adjective/adverb，部分字段缺失                | 展示已建议与待补覆盖，不宣称空字段已完成                      | P0      |
| 8   | 集成     | `access` 检测摘要    | noun/verb 完整建议                                                | 创建请求仅带 detection ID/headwords；创建响应完整建议进入草稿 | P0      |
| 9   | 集成     | high 词形 Tab        | noun/adjective/adverb 连续编辑                                    | 下拉只含合法项；Tab 不跳，内容不串，badge 分别计数            | P0      |
| 10  | 集成     | access 词形 Tab      | noun/verb 连续编辑并增行                                          | noun 默认 plural；verb 按四类顺序；非法项不可选               | P0      |
| 11  | 集成     | 多错误定位           | 两个 Tab、多个 section 同时缺失                                   | 问题面板一次列全；逐项点击切 Tab、展开、滚动、聚焦            | P0      |
| 12  | 集成     | 普通文本主路径       | 不打开语音弹窗填写语法、英文释义、英文例句                        | 保存 payload 正确，刷新 fixture 后正文一致                    | P0      |
| 13  | 集成     | 高级编辑取消/确认    | 先填普通文本，再打开高级编辑                                      | 取消不覆盖；确认保留 node ID 并写回正文/annotation            | P0      |
| 14  | 集成     | 渐进展开             | 新建 meanings 页面                                                | 只展开首个核心词义；空关系折叠；错误定位自动展开              | P0      |
| 15  | 集成     | 保存/返回/刷新       | 编辑→保存→返回→重新进入；另一路径未保存刷新                       | 已保存恢复服务端响应；未保存触发确认，不误标完成              | P0      |
| 16  | 集成     | revision 冲突        | 保存返回 409 current_revision                                     | 不覆盖本地内容，提示重新加载，用户可选择留下                  | P0      |
| 17  | 集成     | 跨词条隔离           | 完成 high 后进入 `/words/new` 创建 access                         | 检测、Tab、collapse、issue、幂等键和内容全部重置              | P0      |
| 18  | 集成     | 发布预览完整         | high/access 完整草稿                                              | 按 POS 展示全部关键字段、来源与词频；无遗漏                   | P0      |
| 19  | 集成     | validate 多问题      | validate 200 valid=false 或 422 携多个 field_issues               | 全部显示并可跨步骤定位，禁止 publish                          | P0      |
| 20  | 契约     | OpenAPI 对账         | catalog/detection schema 更新                                     | `@tsz/types` 与 api-client snapshot 保持 snake_case 一致      | P0      |
| 21  | e2e      | high 完整流程        | mock API 含三 POS 建议                                            | 检测→少量确认→保存→刷新→预览→发布成功                         | P1      |
| 22  | e2e      | access 隔离流程      | 紧接 high 后创建 access                                           | 两 POS 数据正确，第二词无残留，发布成功                       | P1      |
| 23  | 手测     | 真实后端 high        | 本地/测试服真实 `tsz-rust` 与真实 dictionary dataset              | 词形/发音/释义/例句/词频的实际覆盖与 UI 标识一致              | 必验收  |
| 24  | 手测     | 真实后端 access      | 同上                                                              | noun/verb 合法词形齐全或明确缺失，保存发布读回一致            | 必验收  |
| 25  | 后端契约 | 恶意非法 wire        | adjective+past_tense、verb+comparative                            | save complete/validate/publish 均返回全部可定位 issue         | 后端 P0 |

## 测试执行策略

- 纯逻辑优先放 `model.test.ts` 或新增 `validation.test.ts`，覆盖合法能力、聚合和状态派生。
- 组件行为扩展现有四个 step 测试和 wizard/layout 测试，沿用项目的 antd/jsdom 垫片和请求 hook mock。
- 后端契约落地后运行 `pnpm --filter @tsz/api-client sync:openapi` 并更新 contract test。
- e2e 只保留 `high`、`access` 两条关键跨页路径；复杂错误分支留在快速集成测试。
- 实现完成执行相关单文件测试、`pnpm typecheck`、`pnpm lint`、`pnpm test:cov`，并用真实 `tsz-rust` 手测两词。

## 分阶段落地

### Phase A：前端立即可解（不依赖新词典内容）

- 聚合本地/服务端 issue、步骤/Tab 计数和点击定位。
- 明确总词频与词义词频的必填、范围和错误。
- 普通文本主编辑 + 高级语音可选。
- 第三步渐进展开、预览补齐、按 `word.id` 状态清理。
- catalog capability 未落地前 fail closed，并可临时只读展示已有派生 slot；不以前端固定映射作为最终数据规则。

### Phase B：后端规则契约

- catalog 返回 allowed/default form types。
- 服务端保存/validate/publish 拒绝非法 POS/form 组合并聚合问题。
- 前端接入后开放合法派生词形新增和正确默认值。

### Phase C：真实词典建议增强

- 后端逐字段接入已授权的数据源，扩展 detection coverage/provenance 与建议树。
- create 从检测上下文持久化真实建议；前端展示来源和缺失项。
- 以 high/access 真后端验收；只有字段真实有数据时才标记“已建议”。

建议 Phase A 与 Phase B 同一发布窗口完成，先消除脏数据风险；Phase C 可按数据源准备程度增量上线。若只交付 Phase A，目标“少量确认完成 high/access”不能宣称达成。

## 风险与回滚

- **词典许可/覆盖不足**：coverage 必须真实反映缺失；按字段 feature flag/provider version 渐进开放，回滚时仅隐藏自动应用，不影响人工编辑。
- **catalog 能力变更破坏旧草稿**：旧 slot 不静默删除，展示服务端 issue 让用户显式修复；必要时只关闭新增入口。
- **聚合校验与服务端规则漂移**：服务端为最终权威；前端按稳定 code 映射展示，未知 code 原样可见并记录。契约测试与 high/access 真后端验收防漂移。
- **RichText annotation 偏移损坏**：普通文本变更时采用明确的 annotation 清理策略并测试 Unicode；高级编辑取消使用隔离草稿。
- **大表单性能**：issue 计算使用 memoized 纯遍历，不在 render 中触发状态更新；折叠非核心区可减少 DOM。大表格测试避免 role 全树查询。
- **状态串扰**：所有局部状态以 `word.id` 为边界初始化，异步检测用 request version 丢弃过期响应；创建幂等键每次新检测/新词重建。
- **回滚**：前端 UI 改造可整体回退到旧 step 组件；后端新增响应字段保持向后兼容，catalog capability 缺失时前端 fail closed；数据库中已保存的 V2 wire 不做破坏性迁移。
