# 新建单词流程重构：技术设计

## 结论

在 admin 中新增独立、可恢复的四步 `WordCreationWizard`。新流程使用明确的 V2 词条模型：第 1 步检测无副作用，确认后创建 `schema_version: 2` 的正式草稿资源；第 2、3 步分别保存互不覆盖的 step DTO；第 4 步做服务端同形完整性检查并直接发布。

TanStack Query 保存服务端/mock 事实，Ant Design Form 只保存当前步骤尚未提交的编辑态。真实数据源通过 `@tsz/api-client`，开发与测试 mock 实现与 `api.words` 相同的方法签名，并且同时覆盖列表、统计、草稿详情和发布结果，保证创建闭环不是“只弹成功消息”。

基本词性与细分词性改为数据驱动目录：新增“系统设置 → 词性配置”管理页，所有词条页面通过 TanStack Query 读取同一份 catalog，用不可变编码保存引用、用可编辑中文名展示。后端尚未提供接口时，catalog 与 CRUD 由和词条 mock 共享状态的 typed mock 提供；真实接口提案同步维护在 `tsz-rust/docs/frontend-integration.md`。

旧 `AdminWord` 明确定义为 legacy V1。新建、发布后的内容使用 `AdminWordV2`，列表通过 `schema_version` 选择编辑器；V2 数据绝不进入旧 `WordEditor` 的整树 `PUT`，防止新字段被覆盖丢失。

## 本轮复审后收敛的决定

1. 仅重构“创建单词”；“创建短语”继续走旧入口。
2. 第 1 步的建议词性只读展示，创建草稿后直接生成第 2 步 Tab；词性增删在第 2 步完成。
3. 检测成功后，原输入命中的方言为只读基准，管理员只确认另一方言。
4. 草稿创建后第 1 步只读；若要改语言或主词，必须明确废弃草稿并重新检测，不实现隐式级联清空。
5. 同一词性支持多个词形变化组；基准原形和方言拼写/音标规则属于词性，其他组只保存规则变化布尔值与派生槽位。
6. “保存草稿”和“完成并下一步”是两种 intent；未完成数据可保存，但只有通过步骤校验才能标记完成并推进。
7. 第 4 步首版是“完整性摘要 + 按前三步结构只读预览”，发布成功固定返回 `/words`。
8. 按原型“提交生效”理解为直接 `published`，暂不引入审核状态。
9. V2 已发布词条首版提供只读查看；再次编辑 V2 已发布内容不在本需求内。列表不得把它送入 legacy 编辑器。
10. 生产环境 mock fail-closed：生产构建检测到 mock 开关即失败，不允许静默伪发布。
11. 基本/细分词性不再由 UI 静态枚举决定；词条 wire 保存不可变编码，名称与缩写从配置目录解析。
12. 词性配置写操作首期仅超级管理员可用；普通管理员可读取 catalog 并继续创编词条。
13. 已被单词、短语或词义引用的配置禁止删除，但允许修改中文名、英文名、缩写与排序；编码创建后不可修改。
14. mock 预置现有 11 个基本词性和 19 个细分词性，保证存量 V1/V2 fixture 与新配置页面共享同一事实来源。

## 已核对的现状

当前前端链路：

`SmartDictionary` → `CreateWordModal` → `POST /admin/words` → `/words/:wordId/edit` → `WordEditor` → `PUT /admin/words/:id/content` → publish。

实际代码边界：

- admin 路由位于 `apps/admin/src/router.tsx`，所有词库页面嵌套在 `ConsoleLayout`；
- 列表入口位于 `SmartDictionary.tsx`，创建单词和创建短语共用 `CreateWordModal`；
- 请求 hooks 位于 `features/dictionary/api.ts`，直接调用 `apps/admin/src/lib/auth.ts` 暴露的 `api.words`；
- wire 类型位于 `packages/types/src/admin-word.ts`；
- endpoint 工厂位于 `packages/api-client/src/admin.ts`，其相对路径绑定在 `/api/v1/admin` base URL；
- `packages/api-client/src/endpoints.contract.test.ts` 会要求尚未进入 OpenAPI 的端点加入 `PENDING`，并在后端发布后移除；
- 当前 tsz-rust `docs/openapi.json` 与前端集成文档没有智能词库端点，因此本文所有新词条接口都是待后端确认的 proposal；
- 当前 Playwright 只启动 web 的 3000 端口，没有 admin E2E project。

旧模型已覆盖部分词形、语法、释义、例句和关系词，但不能表达：

- language 与检测快照；
- 输入命中的方言和双方言主词；
- 一个词性下的多组替代词形范式；
- 规则变化、拼写差异和音标差异元数据；
- 四种释义方式、例句中英双文本及例句关联；
- 可自动切换的英美文本 variants 与来源；
- 步骤完成度、revision 和可恢复草稿；
- V2 发布后安全的详情/查看契约。

因此不能只给旧长表单套 Stepper，也不能发布时降级回旧 `AdminWord`。

## 方案选择

### 采用：V2 词条草稿 + 分步 DTO + 可替换数据源

- 检测请求不创建数据。
- 创建成功即产生一条 `status: "draft"`、`schema_version: 2` 的词条，ID 在草稿与发布后保持不变，因此现有列表、统计和删除资源语义可以延续。
- forms 与 meanings 使用不同 DTO，后端按 `pos_id` 合并，绝不把未出现在当前 step body 的另一半内容清空。
- `revision` 是乐观锁；URL 决定当前展示步骤，服务端只返回 `completed_steps` 与 `max_reachable_step`，不维护容易与 URL 冲突的 `current_step`。
- admin 选择一个 `AdminWordsDataSource`。真实实现是 `api.words`；mock 实现同一接口并维护完整词库状态。

### 拒绝：单独的 `/word-drafts` 资源

独立草稿 ID 会让现有 `/words` 列表、统计、删除和发布后跳转出现双资源同步问题。V2 草稿本身就是 `status: draft` 的词条，更适合沿用同一 ID 与列表资源。

### 拒绝：继续用一个 `PUT /content` 保存整棵树

它不能表达步骤完成 intent，forms/meanings 局部编辑会产生不清晰的 merge/delete 语义，请求体和并发冲突范围也会持续放大。

### 拒绝：只用 Context/localStorage 做向导

它无法提供跨刷新恢复、服务端重复检测、并发控制和发布一致性。浏览器存储只允许作为开发 mock 的实现细节。

### 拒绝：组件直接 import mock fixture

真实接口接入时会重写组件，也无法验证 endpoint method/path/body。fixture 只能由 mock data source 消费。

## 核心领域不变量

### 方言主词

主词使用可判别联合，禁止用大量 optional 字段组成非法状态：

```ts
type WordHeadwordsV2 =
  | { mode: "unified"; common: string }
  | {
      mode: "distinguish";
      uk: string;
      us: string;
      source_dialect: "uk" | "us";
    };
```

- `source_dialect` 对应管理员原输入，在第 1 步只读；另一侧来自内置词典，可确认/修正。
- `distinguish` 时 `uk`、`us` 都必填；`unified` 时只允许 `common`。
- 创建草稿后该结构在本流程只读；修改需废弃草稿重建。

### 词形变化组

一个词性拥有一个共享 `base_form` 和多个 `form_groups`：

```ts
interface WordPosFormsV2 {
  pos_id: string;
  pos: WordPosTag;
  dialect_rules: {
    spelling_mode: "unified" | "distinguish";
    phonetic_mode: "unified" | "distinguish";
  };
  base_form: WordBaseFormSlotV2;
  form_groups: WordFormGroupV2[];
}

interface WordFormGroupV2 {
  id: string;
  is_regular: boolean;
  slots: WordDerivedFormSlotV2[];
}
```

- `base_form` 属于词性，不复制进各组；UI 在每组首行渲染同一个镜像。
- `form_groups[].slots` 不含 `base`，每个 slot 有稳定 ID 和 `form_type`。
- 同组双方言内容由相同 slot ID 对齐，不使用数组下标推断。
- 方言规则属于词性并应用到共享 base 和所有组，避免两个组要求同一 base 以不同单双列保存。UI 即使在每组卡片重复显示该问题，也绑定同一个 POS 级值并同步更新。
- `dialect_rules.spelling_mode === "distinguish"` 时 `phonetic_mode` 被强制为 `distinguish`，UI 不再显示“音标是否有区别”。
- 词条 `headwords.mode === "distinguish"` 时，每个 POS 的 base 必须区分方言，且 UK/US base spelling 分别等于词条主词；headwords unified 时 base spelling 统一，派生词形是否区分仍由 POS 规则决定。
- base spelling 始终从第 1 步 `headwords` 派生且只读，不能在第 2 步形成第二个主词来源；只有第一个词形组可编辑共享 base 的发音，后续组的 base 镜像全部只读。

### 分步所有权

- basics：language、entry kind、headwords、detection snapshot；创建后只读。
- forms：词性集合、共享原形、词形组、读音。
- meanings：通过 `pos_id` 引用 forms 的词性，拥有语法结构、词义、释义、例句和关系词。
- preview：无独立可写数据，只消费同一 revision 的完整性结果和词条详情。

`DraftFormsStepContent` 与 `DraftMeaningsStepContent` 是不同类型。meanings 只发送：

```ts
interface WordPosMeaningsV2 {
  pos_id: string;
  grammar_structures: GrammarStructureV2[];
  senses: WordSenseV2[];
}
```

后端以 `pos_id` 合并；保存 meanings 不得修改/删除 forms。删除词性属于 forms 操作，并通过影响预览显式处理其下游 meanings。

### 英美文本 variant

除语法结构外，需要英美切换的英语文本统一使用 variant，而不是只给例句加两个临时字段：

```ts
interface TextVariantV2<T> {
  value: T;
  origin: "dictionary" | "converted" | "manual";
}

type DialectVariantSlotV2<T> =
  { state: "missing" } | { state: "ready"; variant: TextVariantV2<T> };

type DialectValueV2<T> =
  | { mode: "unified"; common: TextVariantV2<T> }
  | {
      mode: "distinguish";
      source_dialect: "uk" | "us";
      uk: DialectVariantSlotV2<T>;
      us: DialectVariantSlotV2<T>;
    };

type EnglishTextV2 = DialectValueV2<RichText>;
```

适用白名单：词形拼写使用下文带 `origin` 的 `WordFormVariantV2[]`，英语定义/整句释义与英文例句使用 `EnglishTextV2`。语法结构明确排除，始终人工分别填写。关系词保存目标 `word_id + sense_id`，展示时读取目标词条对应方言主词，不转换只读快照。

`distinguish` 的 `source_dialect` 对应人工录入或词典给出的源侧，该侧必须为 `ready`；目标侧在草稿中可以是显式 `missing`，发布前必须补为 `ready`。第 3 步使用页面级 BrE/AmE 选择器只展示当前 variant：目标已存在时纯本地切换；目标缺失时收集全部英文定义/整句释义和英文例句，以一次批量建议请求补齐。批量结果只允许写入请求发出时仍为 `missing` 的槽位，并标记 `origin: converted`；任何 `ready` 目标都不自动覆盖。缺失目标没有覆盖风险，因此自动补全成功后直接写入，不再逐字段弹确认框；请求失败或部分返回时保留原值并允许重试/手填。选择器属于本地 view state，切换本身不写 wire、不标记 dirty，实际补全或手工编辑才标记 dirty。

语法结构不使用 `DialectValueV2`，但其 `GrammarVariantV2[]` 形状只能由 `headwords.mode` 派生：`unified` 恰好一条 `common`，`distinguish` 恰好各一条 `uk`、`us`。它不跟随 POS 的 `dialect_rules`，也不参与自动转换。

### 释义、例句与关系

- `definition_mode` 为四态：`zh_definition | en_definition | zh_sentence | en_sentence`，不能只用旧 `zh | en`。
- `WordSentenceV2` 包含 `level`、`en_text`、`zh_text` 和 `links[]`。
- `links[]` 使用稳定 `{ word_id, sense_id, role }`。每条例句自动生成且锁定一条 `role: "focus"`，指向当前 V2 word 与父 sense；可选的 `role: "context"` 指向例句中的其他词条/词义。发布校验要求恰好一条合法 focus link，不能只保存显示字符串。
- 关系词继续保存目标 ID 与词义 ID；相似度/差异度/关联度 wire 用十进制定点字符串 `"0"`–`"100"`，最多两位小数，避免 JSON 浮点误差。
- 词条/词义词频同样使用百分比十进制定点字符串，UI 使用 number，wire 不使用二进制浮点。

### 稳定节点与删除引用

- 所有可排序节点使用 UUID v4，创建后跨保存不变。
- 校验和影响提示用 `node_id + field` 定位，不使用 `pos[0].senses[0]` 这类会随排序漂移的路径。
- 删除被释义引用的语法结构：先列出受影响 definition，确认后清空其 `grammar_structure_id`。
- 语义区间至少保留一个；删除被词义引用的非末项区间时，确认后把对应 `sense_group_id` 改绑到第一个剩余区间。
- 删除词义：同时删除其释义/例句；本草稿内指向该词义的 links/relations 先提示再清理。
- 删除词性：必须先调用影响预览，确认后服务端原子删除对应 meanings，并把 meanings 从 `completed_steps` 移除。

## 检测状态决策矩阵

内置词典与智能词库查重使用不同状态枚举，避免把“未匹配”和“没有重复”混为一谈。

| 内置词典      | 智能词库查重     | 行为                                                   |
| ------------- | ---------------- | ------------------------------------------------------ |
| `matched`     | `clear`          | 可确认并创建草稿                                       |
| 任意          | `duplicate`      | 阻断；展示所有命中的 UK/US 重复项并提供跳转            |
| `not_found`   | `clear`          | 基线阻断；提示无词典结果，等待产品决定是否开放人工录入 |
| `unavailable` | 任意非 duplicate | 阻断并重试，不能伪装成未匹配                           |
| 任意          | `unavailable`    | 阻断并重试；查重不可用时不能冒险创建重复词             |

检测响应包含原请求 echo、`detection_id` 和 `expires_at`。管理员修改 language/headword 时立即丢弃本地检测结果；在途响应只有与当前输入完全相等且未过期时才能落 UI。

## 路由与页面结构

建议路由：

- `/words/new`：第 1 步，无草稿；
- `/words/:wordId/wizard/basics`：V2 草稿只读回看第 1 步；
- `/words/:wordId/wizard/forms`：V2 草稿第 2 步；
- `/words/:wordId/wizard/meanings`：V2 草稿第 3 步；
- `/words/:wordId/wizard/preview`：V2 草稿第 4 步或 V2 已发布词条只读查看；
- `/words/:wordId/edit`：legacy V1 编辑页，保持现有行为。

列表行规则：

- `schema_version` 缺省或为 1：进入 `/words/:id/edit`；
- `schema_version === 2 && status === "draft"`：进入服务端 `max_reachable_step` 对应 wizard 路由；
- `schema_version === 2 && status === "published"`：操作文案为“查看”，进入 wizard preview，只读；
- 直接用 legacy 路由访问 V2 ID 时，详情判别后重定向到 wizard，绝不把 V2 映射进旧 Form。

无效 step、不可达 step、已发布草稿 URL 都由 `WordWizardRouteGuard` 归一化到唯一合法地址。服务端不返回 `current_step`，避免浏览器 URL 与服务端状态双主。

页面骨架：

- `WordCreationWizard`：加载 V2 详情、路由守卫和步骤编排；
- `WordCreationLayout`：顶部 Stepper、左侧摘要/完成度、主内容和底部动作；
- `CreateEntryStep`：无草稿时可编辑语言/词条和检测，有草稿时只读显示 detection snapshot；
- `FormsAndPronunciationStep`：词性 Tab、词形变化组、方言列与读音；
- `MeaningsAndExamplesStep`：按“词义 → 语法结构 → 例句”组织的语法、释义、例句和关联词；
- `PreviewAndPublishStep`：完整性摘要、只读预览和发布；
- `PublishedWordV2View` 可直接复用 preview 的只读组件，不复制页面。

“保存草稿”发送 `intent: "save"`，允许不完整；“下一步”发送 `intent: "complete"`，只有 422-free 响应才推进。回退、Stepper 点击、浏览器 back 和关闭页面遇到 dirty Form 时统一走离开确认；成功保存后不拦截。

保存退出后 V2 draft 仍出现在 `/words` 列表，操作为“继续创建”。废弃使用现有删除交互，删除后不可恢复。

## 计划影响的文件

以下是审批后的实施清单；发现变化时同步本文。

### `@tsz/types`

- 新增 `packages/types/src/admin-word-v2.ts`：detection、headwords、forms groups、text variants、definitions/sentences、step DTO、validation、V2 canonical word。
- 修改 `packages/types/src/admin-word.ts`：把当前模型标为 legacy；为 list item 增加 `schema_version?: 1 | 2` 和 V2 resume 所需 `max_reachable_step?`；增加 `AdminWordAnyEnvelope` 判别联合与 `isAdminWordV2` type guard。
- 修改 `packages/types/src/index.ts`：导出 V2 wire 类型。

### `@tsz/api-client`

- 修改 `packages/api-client/src/admin.ts`：在现有 `words` namespace 增加 `detect`、`suggestDialectVariants`、`createV2`、`previewFormsImpact`、`saveFormsStep`、`saveMeaningsStep`、`validateV2`、`publishV2`；现有 `get` 改为返回 V1/V2 判别联合，避免同一路径存在两个互相矛盾的静态返回类型；相对路径一律不重复 `/admin`。
- 修改 `packages/api-client/src/http.ts`：保留 `details: string[]` 兼容旧错误，新增结构化 `field_issues` 和 `meta` 解析。
- 修改 `packages/api-client/src/admin.test.ts`、`http.test.ts`：验证 method/path/body、错误元数据和兼容解析。
- 修改 `packages/api-client/src/endpoints.contract.test.ts`：把 proposal 精确加入 `PENDING`；后端 OpenAPI 发布后移除并转正式校验。

新增 PENDING 键应为：`post /admin/words/detect`、`post /admin/words/dialect-variants`、`post /admin/words/_/steps/forms/impact`、`put /admin/words/_/steps/forms`、`put /admin/words/_/steps/meanings`、`post /admin/words/_/validate`。`POST/GET /admin/words` 与 `POST /admin/words/_/publish` 已在现有台账，不重复增加。

### admin 数据边界与开关

- 修改 `apps/admin/src/lib/env.ts`、`env.test.ts`：增加 wizard feature flag 与 mock data-source flag。
- 修改 `apps/admin/vite.config.ts`：生产构建检测到 mock flag 时直接抛错；非生产解析失败也显式报错。
- 新增 `apps/admin/src/features/dictionary/dataSource.ts`：定义/选择 `AdminWordsDataSource`，真实实现委托 `api.words`。
- 新增 `apps/admin/src/features/dictionary/mock/adminWordsMock.ts`、fixtures 与 storage adapter：实现列表、统计、创建、V2 草稿、查看、保存、校验、发布、删除和幂等。
- 修改 `apps/admin/src/features/dictionary/api.ts`：所有列表和 wizard hooks 使用同一个 data source，不能混用 mock 创建与真实列表。

### admin 路由、入口与页面

- 修改 `apps/admin/src/router.tsx`：增加 new/wizard 路由和 guard。
- 修改 `apps/admin/src/features/dictionary/SmartDictionary.tsx`：创建单词导航；短语保留 modal；按 schema/status 选择“编辑 / 继续创建 / 查看”。
- 新增 `apps/admin/src/features/dictionary/wordRouting.ts`：集中 V1/V2 draft/published 的详情路由与操作文案，列表和旧编辑器防误入 guard 共用。
- 修改 `apps/admin/src/features/dictionary/CreateWordModal.tsx`：保留 word/phrase 两种 legacy 能力；feature flag 开启时列表只对“创建短语”调用它，关闭时“创建单词”也可回退旧 modal。
- 修改 `apps/admin/src/features/dictionary/WordEditor.tsx`：V2 防误入 guard；不重写 legacy 表单。
- 新增 `apps/admin/src/pages/WordCreate.tsx` 与 `WordWizard.tsx`。

### admin wizard

- 新增 `apps/admin/src/features/dictionary/word-creation/WordCreationWizard.tsx`。
- 新增 `WordCreationLayout.tsx`、`CreateEntryStep.tsx`、`FormsAndPronunciationStep.tsx`、`MeaningsAndExamplesStep.tsx`、`PreviewAndPublishStep.tsx`。
- 词形组、方言列、发音行、语法结构、词义卡、释义/例句/关系表先与各步骤文件共置；当前没有第二个调用方，不提前制造页面私有组件目录。
- 新增 `model.ts`：稳定节点工厂、不可变 clone/move、客户端即时校验和进度 selector。
- 新增 `useWordValidationIssueFocus.ts`：服务端 `node_id + field` issue 的步骤切换、折叠展开、精确/降级定位与聚焦。
- 新增 `api.ts`：V2 query keys/mutations；保存成功用 response 精确更新 detail cache，列表/统计按需失效。
- 提取旧 `word-editor/mapping.ts` 中 UUID、RichText、frequency 纯函数到共享的 `features/dictionary/word-model/`，新旧页面复用而不交叉引用页面私有代码。
- 复用 `VoiceActions`、`RelatedWordModal`、标签枚举前先下沉为无页面耦合组件；不直接复制。

实施阶段确认：在后端尚无 OpenAPI 的 mock-first 阶段，`AdminWordV2`/step DTO 被定义为前端稳定的 canonical editor contract，步骤本地态对它做深拷贝后编辑；组件不直接调用 `@tsz/api-client`，只依赖 `AdminWordsDataSource`。因此首版不再为一份仍属 proposal 的同形对象额外维护 `camelCase mapping.ts`。真实 OpenAPI 到位后必须先做 contract diff：若真实 wire 与该 canonical contract 不同，在 data source/adapter 边界新增双向映射，页面和步骤模型保持不变；不得把真实 wire 的变化扩散进组件。

### 测试与浏览器验证

- 更新 `apps/admin/src/pages/pages.test.tsx` 和词库入口测试。
- 新增 wizard mapping/validation/mock/step/integration 测试。
- 新增 `e2e/playwright.admin.config.ts`，启动 admin 3001；不修改现有 web E2E 的 baseURL。
- 新增 `e2e/tests/admin-word-creation.spec.ts` 与 admin auth/API route mock。
- 修改 `e2e/package.json` 和根 `package.json`，增加独立 `test:e2e:admin`，避免现有 web 套件被错误地跑到 admin。

## V2 wire 类型骨架

以下 snake_case 类型是 endpoint、typed mock 和 mapping 的共同基线。实现可以拆文件，但不能改变字段语义或用 `any`/可选字段绕过不变量。

```ts
type AdminWordLanguageV2 = "en";
type WordCreationStep = "basics" | "forms" | "meanings" | "preview";
type PersistedWordStep = Exclude<WordCreationStep, "preview">;
type StepSaveIntent = "save" | "complete";
type FixedPercent = string; // 十进制定点 "0"–"100"，最多两位小数

type WordHeadwordsV2 =
  | { mode: "unified"; common: string }
  | {
      mode: "distinguish";
      uk: string;
      us: string;
      source_dialect: "uk" | "us";
    };

interface TextVariantV2<T> {
  value: T;
  origin: "dictionary" | "converted" | "manual";
}

type DialectVariantSlotV2<T> =
  { state: "missing" } | { state: "ready"; variant: TextVariantV2<T> };

type DialectValueV2<T> =
  | { mode: "unified"; common: TextVariantV2<T> }
  | {
      mode: "distinguish";
      source_dialect: "uk" | "us";
      uk: DialectVariantSlotV2<T>;
      us: DialectVariantSlotV2<T>;
    };

type EnglishTextV2 = DialectValueV2<RichText>;

interface WordPronunciationV2 {
  id: string;
  dict_phonetic: string;
  actual_pron: string;
  style: PronunciationStyle;
  audio_url?: string;
  audio_source?: string;
}

interface WordFormVariantV2 {
  id: string;
  dialect: Dialect;
  spelling: string;
  origin: "dictionary" | "converted" | "manual";
  pronunciations: WordPronunciationV2[];
}

interface WordBaseFormSlotV2 {
  id: string;
  form_type: "base";
  variants: WordFormVariantV2[];
}

interface WordDerivedFormSlotV2 {
  id: string;
  form_type: Exclude<WordFormType, "base">;
  variants: WordFormVariantV2[];
}

type WordFormSlotV2 = WordBaseFormSlotV2 | WordDerivedFormSlotV2;

interface WordFormGroupV2 {
  id: string;
  is_regular: boolean;
  slots: WordDerivedFormSlotV2[];
}

interface WordPosFormsV2 {
  pos_id: string;
  pos: WordPosTag;
  dialect_rules: {
    spelling_mode: "unified" | "distinguish";
    phonetic_mode: "unified" | "distinguish";
  };
  base_form: WordBaseFormSlotV2;
  form_groups: WordFormGroupV2[];
}

interface DraftFormsStepContent {
  pos: WordPosFormsV2[];
}

interface GrammarVariantV2 {
  id: string;
  dialect: Dialect;
  content: RichText;
  audio_url?: string;
  audio_source?: string;
}

interface GrammarStructureV2 {
  id: string;
  variants: GrammarVariantV2[];
}

interface WordDefinitionBaseV2 {
  id: string;
  level: CefrLevel;
  grammar_structure_id?: string;
  audio_url?: string;
  audio_source?: string;
}

type WordDefinitionV2 = WordDefinitionBaseV2 &
  (
    | {
        definition_mode: "zh_definition" | "zh_sentence";
        content: RichText;
      }
    | {
        definition_mode: "en_definition" | "en_sentence";
        content: EnglishTextV2;
      }
  );

interface WordSentenceLinkV2 {
  word_id: string;
  sense_id: string;
  role: "focus" | "context";
}

interface WordSentenceV2 {
  id: string;
  level: CefrLevel;
  en_text: EnglishTextV2;
  zh_text: RichText;
  links: WordSentenceLinkV2[];
  audio_url?: string;
  audio_source?: string;
}

interface WordRelationV2 {
  id: string;
  relation: WordRelationType;
  target_word_id: string;
  target_sense_id: string;
  target_headword?: string; // 服务端只读快照
  target_gloss?: string; // 服务端只读快照
  score: FixedPercent;
}

interface WordSenseV2 {
  id: string;
  sub_pos: WordSubPos;
  level: CefrLevel;
  sense_group_id?: string; // wire 兼容历史草稿可空；向导 UI 始终补齐并要求有效引用
  frequency?: FixedPercent;
  depends_on_context: boolean;
  definitions: WordDefinitionV2[];
  sentences: WordSentenceV2[];
  relations: WordRelationV2[];
}

interface SenseGroupV2 {
  id: string;
  name_zh: string;
  name_en: string;
}

interface WordPosMeaningsV2 {
  pos_id: string;
  grammar_structures: GrammarStructureV2[];
  senses: WordSenseV2[];
}

interface DraftMeaningsStepContent {
  sense_groups: SenseGroupV2[];
  pos: WordPosMeaningsV2[];
}

interface WordDetectionSnapshotV2 {
  detection_id: string;
  request: {
    language: AdminWordLanguageV2;
    headword: string;
  };
  normalized_headword: string;
  entry_kind: "word";
  matched_dialect: "uk" | "us" | "common";
  builtin_dictionary_status: "matched";
  smart_dictionary_status: "clear";
  headwords: WordHeadwordsV2;
  suggested_pos: WordPosTag[];
  detected_at: string;
}

interface AdminWordV2 {
  schema_version: 2;
  id: string;
  language: AdminWordLanguageV2;
  kind: "word";
  status: "draft" | "published";
  revision: number;
  headwords: WordHeadwordsV2;
  frequency?: FixedPercent;
  detection_snapshot: WordDetectionSnapshotV2;
  forms: DraftFormsStepContent;
  meanings: DraftMeaningsStepContent;
  completed_steps: PersistedWordStep[];
  max_reachable_step: WordCreationStep;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

interface AdminWordV2Envelope {
  word: AdminWordV2;
}

type AdminWordAnyEnvelope =
  | { word: AdminWord } // legacy；schema_version 缺省或为 1
  | AdminWordV2Envelope;

interface SaveWordStepInput<TContent> {
  base_revision: number;
  operation_id: string;
  intent: StepSaveIntent;
  confirmed_impact_token?: string | null;
  content: TContent;
}

type SaveFormsStepInput = SaveWordStepInput<DraftFormsStepContent>;
type SaveMeaningsStepInput = SaveWordStepInput<DraftMeaningsStepContent>;

interface DraftValidationIssue {
  step: Exclude<WordCreationStep, "preview">;
  node_id: string;
  field: string;
  code: string;
  message: string;
}

interface DraftValidationResponse {
  validated_revision: number;
  valid: boolean;
  issues: DraftValidationIssue[];
}
```

`WordFormSlotV2.variants` 必须满足 POS 方言规则。草稿态统一拼写/音标时只允许唯一 `common`；任一维区分时源侧必须存在，目标侧尚未生成可暂时缺行，但同一 dialect 不能重复。发布时，区分模式必须补齐唯一的 `uk`、`us` 两项。拼写统一但音标区分时，UK/US variant 的 spelling 必须相等。base spelling 还必须与只读 `headwords` 精确一致。真实服务与 mock 共用同一份规则定义和契约 fixture，不能各自解释一套。

`WordDetectionSnapshotV2` 是创建瞬间的不可变审计摘要，也是草稿第 1 步只读回看的数据源；因此保留原始请求、归一化结果、类型、两个检测源结论、确认后的 headwords 与原始建议词性。完整词形/音标建议已持久化为 canonical `forms`，不在 snapshot 重复保存。

`AdminWordV2.language` 必须等于 `detection_snapshot.request.language`，`AdminWordV2.headwords` 必须与 `detection_snapshot.headwords` 深度相等；两者在草稿创建后都不可被 step save 修改。

检测类型同样是判别联合：

```ts
interface DuplicateWordMatchV2 {
  word_id: string;
  headword: string;
  dialect: "uk" | "us" | "common";
}

interface BuiltinDictionaryMatchedV2 {
  status: "matched";
  headwords: WordHeadwordsV2;
  suggested_forms: DraftFormsStepContent;
}

type BuiltinDictionaryUnmatchedV2 =
  | { status: "not_found" }
  | { status: "unavailable"; retry_after_seconds?: number };

type BuiltinDictionaryResultV2 =
  BuiltinDictionaryMatchedV2 | BuiltinDictionaryUnmatchedV2;

type SmartDictionaryResultV2 =
  | { status: "clear"; duplicates: [] }
  | { status: "duplicate"; duplicates: DuplicateWordMatchV2[] }
  | { status: "unavailable"; duplicates: [] };

interface DetectWordResponseBaseV2 {
  detection_id: string;
  expires_at: string;
  request: { language: AdminWordLanguageV2; headword: string };
  normalized_headword: string;
  entry_kind: "word" | "phrase";
  smart_dictionary: SmartDictionaryResultV2;
}

type DetectWordResponseV2 = DetectWordResponseBaseV2 &
  (
    | {
        matched_dialect: "uk" | "us" | "common";
        builtin_dictionary: BuiltinDictionaryMatchedV2;
      }
    | {
        matched_dialect?: never;
        builtin_dictionary: BuiltinDictionaryUnmatchedV2;
      }
  );

interface DetectWordInputV2 {
  language: AdminWordLanguageV2;
  headword: string;
}

interface CreateAdminWordV2Input {
  schema_version: 2;
  idempotency_key: string;
  detection_id: string;
  headwords: WordHeadwordsV2;
}

type DialectVariantSuggestionItemV2 =
  | {
      client_id: string;
      field_kind: "form";
      value: string;
    }
  | {
      client_id: string;
      field_kind: "definition" | "example";
      value: RichText;
    };

interface SuggestDialectVariantsInputV2 {
  source_dialect: "uk" | "us";
  target_dialect: "uk" | "us";
  items: DialectVariantSuggestionItemV2[];
}

interface SuggestDialectVariantsResponseV2 {
  suggestions: Array<
    DialectVariantSuggestionItemV2 & {
      model_version: string;
    }
  >;
}

interface FormsImpactItemV2 {
  node_id: string;
  node_type: "pos" | "grammar_structure" | "sense" | "definition" | "sentence";
  reason: string;
}

interface PreviewFormsImpactInputV2 {
  base_revision: number;
  content: DraftFormsStepContent;
}

interface FormsImpactResponseV2 {
  base_revision: number;
  requires_confirmation: boolean;
  affected: FormsImpactItemV2[];
  confirmation_token?: string;
}

interface ValidateAdminWordV2Input {
  base_revision: number;
}

interface PublishAdminWordV2Input {
  base_revision: number;
  idempotency_key: string;
}
```

matched detection 中的 suggestion 节点 ID 由服务端在临时 detection record 中生成；`createV2` 原样持久化这些 ID，因此检测确认到草稿响应之间不重新编号。

## 提议的 snake_case wire 契约

以下均是后端 proposal。外部完整 URL 前缀为 `/api/v1/admin`；`createAdminEndpoints` 内只写下列相对路径。

### 1. 检测词条

`POST /words/detect`

```json
{
  "language": "en",
  "headword": "center"
}
```

响应核心形状：

```json
{
  "detection_id": "det_...",
  "expires_at": "2026-08-02T10:05:00Z",
  "request": { "language": "en", "headword": "center" },
  "normalized_headword": "center",
  "entry_kind": "word",
  "matched_dialect": "us",
  "builtin_dictionary": {
    "status": "matched",
    "headwords": {
      "mode": "distinguish",
      "uk": "centre",
      "us": "center",
      "source_dialect": "us"
    },
    "suggested_forms": {
      "pos": [
        {
          "pos_id": "suggested-pos-noun",
          "pos": "noun",
          "dialect_rules": {
            "spelling_mode": "distinguish",
            "phonetic_mode": "distinguish"
          },
          "base_form": {
            "id": "suggested-base-noun",
            "form_type": "base",
            "variants": [
              {
                "id": "suggested-base-noun-uk",
                "dialect": "uk",
                "spelling": "centre",
                "origin": "dictionary",
                "pronunciations": [
                  {
                    "id": "suggested-pron-noun-uk",
                    "dict_phonetic": "ˈsentə",
                    "actual_pron": "ˈsentə",
                    "style": "normal"
                  }
                ]
              },
              {
                "id": "suggested-base-noun-us",
                "dialect": "us",
                "spelling": "center",
                "origin": "dictionary",
                "pronunciations": [
                  {
                    "id": "suggested-pron-noun-us",
                    "dict_phonetic": "ˈsentər",
                    "actual_pron": "ˈsentər",
                    "style": "normal"
                  }
                ]
              }
            ]
          },
          "form_groups": [
            {
              "id": "suggested-group-noun-1",
              "is_regular": true,
              "slots": [
                {
                  "id": "suggested-plural-noun",
                  "form_type": "plural",
                  "variants": [
                    {
                      "id": "suggested-plural-noun-uk",
                      "dialect": "uk",
                      "spelling": "centres",
                      "origin": "dictionary",
                      "pronunciations": []
                    },
                    {
                      "id": "suggested-plural-noun-us",
                      "dialect": "us",
                      "spelling": "centers",
                      "origin": "dictionary",
                      "pronunciations": []
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "smart_dictionary": {
    "status": "clear",
    "duplicates": []
  }
}
```

示例仅省略了第二个 verb POS 和 plural 的音标内容，字段形状以 V2 wire 类型骨架为准；空 `pronunciations` 表示词典没有给出该项建议，不代表发布时允许缺失。suggestion ID 在 detection record 中已经稳定，创建 V2 草稿时原样持久化。

检测为 phrase 时仍返回 200 和 `entry_kind: "phrase"`，让 UI 能展示结果并引导旧入口，但不能调用 `createV2`。错误：400 输入非法；401/403；422 不支持语言/无法规范化的输入；429；502/503。业务状态优先放成功响应的两个检测源中，以便展示 partial result；创建是否可继续按决策矩阵判断。

### 2. 获取方言转换建议

`POST /words/dialect-variants`

```json
{
  "source_dialect": "uk",
  "target_dialect": "us",
  "items": [
    {
      "client_id": "definition-id",
      "field_kind": "definition",
      "value": { "version": 1, "text": "...", "spans": [], "liaisons": [] }
    }
  ]
}
```

`field_kind = form | definition | example`；grammar 不允许。响应逐 `client_id` 返回建议和来源版本。接口只给建议，不直接保存草稿；前端可以把建议自动写入本地 `missing` 目标，但目标已经是 `ready` 时不得把它加入批量请求或用响应覆盖。

### 3. 创建 V2 草稿词条

`POST /words`

```json
{
  "schema_version": 2,
  "idempotency_key": "uuid-v4",
  "detection_id": "det_...",
  "headwords": {
    "mode": "distinguish",
    "uk": "centre",
    "us": "center",
    "source_dialect": "us"
  }
}
```

后端重新校验 detection 未过期、查重仍 clear、headwords 与检测基准兼容。响应是确定的 `AdminWordV2Envelope`，包含：

- `schema_version: 2`、稳定 `id`、`status: draft`、`revision: 1`；
- language/kind/headwords 与只读 detection snapshot；
- 根据 `suggested_forms` 初始化且带稳定 ID 的 `forms.pos[]`；
- `meanings.pos[]` 按相同 `pos_id` 初始化：一个空语法结构、一个空词义、一个本语言释义行和一个带 focus link 的空例句；本轮不假定词典能生成释义/例句正文；
- `completed_steps: ["basics"]`、`max_reachable_step: "forms"`；
- created/updated 元数据。

同一 `idempotency_key` 重试必须返回同一草稿。错误：409 `duplicate_word`；410 `detection_expired`；422 `detection_mismatch`。

### 4. 加载词条详情

`GET /words/{word_id}` 返回有 `schema_version` 判别字段的 `AdminWordAnyEnvelope`。兼容期内缺省视为 V1；V2 必须返回完整 canonical `AdminWordV2`，草稿与发布后字段同形，仅 status/发布元数据不同。API client 只保留这一个 `get`，legacy editor 与 wizard 分别用 type guard 收窄，不能为同一路径声明两个不相容响应。

### 5. 预览 forms 变更影响

`POST /words/{word_id}/steps/forms/impact`

请求携带 `base_revision` 和完整 `DraftFormsStepContent`。响应返回 `requires_confirmation` 和稳定 ID 的 affected meanings。首次完成第 2 步且还没有下游内容时响应为空。确认 token 绑定 revision 与内容 hash，防止预览后数据变化。

### 6. 保存 forms / meanings

- `PUT /words/{word_id}/steps/forms`
- `PUT /words/{word_id}/steps/meanings`

forms 的最小 draft-save 请求（允许不完整）：

```json
{
  "base_revision": 3,
  "operation_id": "uuid-v4",
  "intent": "save",
  "confirmed_impact_token": null,
  "content": { "pos": [] }
}
```

meanings 对应的 `content` 最小形状为 `{ "sense_groups": [], "pos": [] }`。非空节点严格使用上文 `SaveFormsStepInput` / `SaveMeaningsStepInput`，两类 endpoint 不接受另一类 content。

- `intent = save | complete`。每次保存后服务端都重算完成态：`save` 允许不完整；若一个原本完成的步骤被改残，移除该步骤及所有后续 `completed_steps` 并降低 `max_reachable_step`。内容仍完整时保持其完成态。`complete` 通过该步骤校验后新增/保持完成态并推进可达步骤。
- forms content 与 meanings content 是由 URL 映射的不同泛型，不能互传。
- 响应返回完整 V2 word 与递增 revision；同一 operation ID 的网络重试返回同一结果。
- 409 `revision_conflict` 返回 current revision；409 `downstream_confirmation_required` 返回影响信息；413；422 返回结构化 field issues。

### 7. 完整性检查

`POST /words/{word_id}/validate`

```json
{ "base_revision": 5 }
```

响应：

```json
{
  "validated_revision": 5,
  "valid": false,
  "issues": [
    {
      "step": "meanings",
      "node_id": "sense-uuid",
      "field": "definitions",
      "code": "native_definition_required",
      "message": "至少填写一条本语言释义"
    }
  ]
}
```

预览只展示与当前 revision 相同的结果；任意保存后旧结果立即失效。

### 8. 发布 V2

`POST /words/{word_id}/publish`

```json
{
  "base_revision": 5,
  "idempotency_key": "uuid-v4"
}
```

响应固定为 `AdminWordV2Envelope`，其中 status 为 `published` 并包含 `published_at`；不允许返回旧 `AdminWord`。同一 key 重试返回同一发布结果。422 issues 与 validate 同形；409 区分 revision conflict 和已发布。

### 9. 列表、统计与删除兼容

- `GET /words` 的每行新增 `schema_version`；V2 draft 还返回 `max_reachable_step`。
- `GET /words/stats` 的基线口径为所有未删除 V1/V2 词条（含 draft）：`total` 在草稿创建成功时增加，`today/month` 按 `created_at` 与 Asia/Shanghai 计算；publish 不重复计数。后端若采用只计 published 的口径，必须在实施前同步修改 mock 与验收。
- `DELETE /words/{id}` 同时支持 V1 与 V2 draft；是否允许删除 published 沿用当前行为。
- publish 的 word ID 不变化，因此发布后列表不需要 draft→word ID 映射。

## 发布完整性最小矩阵

第 4 步没有视觉稿，但校验必须可测试。首版最小规则：

| 模块       | 最小发布要求                                                                                |
| ---------- | ------------------------------------------------------------------------------------------- |
| basics     | 草稿由当时有效的 detection 创建、entry kind 为 word、headwords 形状合法                     |
| forms      | 至少一个词性；每个词性有共享 base；每个启用方言有非空拼写和至少一条完整发音                 |
| form group | 每个词性至少一组；slot 类型合法且组内不重复；英美差异模式满足强制联动                       |
| grammar    | 每个词性至少一条；headwords 统一则恰好 common，区分则恰好 uk/us；文本非空且不做自动方言转换 |
| sense      | 每个词性至少一个；level、细分词性、词频合法；grammar/sense group 引用有效                   |
| definition | 每个词义至少一条本语言（中文）释义；definition mode 与文本语言一致                          |
| sentence   | 若存在例句，中英文本、level、恰好一条合法 focus link 必填；context link 可选                |
| relation   | target word/sense 存在，score 为 0–100 且最多两位小数                                       |

真实后端若有不同业务规则，需要在实现前修改本文和验收标准，不能只在 mock 中另写一套。

## 结构化错误契约

现有 `HttpError.details: string[]` 保留。新增错误体：

```ts
interface AdminWordApiError {
  error: string;
  code: string;
  details?: string[];
  field_issues?: DraftValidationIssue[];
  meta?: {
    current_revision?: number;
    word_id?: string;
    max_reachable_step?: WordCreationStep;
    affected_node_ids?: string[];
  };
}
```

前端按稳定 `code` 分支，不匹配可变 message。`http.ts` 将 field issues 与 meta 保留到 `HttpError`；legacy `DetailsList` 继续消费字符串 details。

## mock 设计

`AdminWordsDataSource` 取自 `api.words` 的方法签名，不再同时存在 `words` 与 `wordDrafts` 两套 namespace：

- `realAdminWordsDataSource = api.words`；
- `mockAdminWordsDataSource` 实现列表、统计、V1 创建单词/短语、V2 detection/create/get/save/validate/publish/delete/related search。

所有 dictionary hooks 使用同一个已选择实例。mock 发布后保留同 ID 的 V2 published 记录，所以返回列表能看到新行、统计能变化、详情能读取。

mock 状态使用内存 Map，并为硬刷新镜像到 `sessionStorage`：

- key 包含 schema version 和 admin profile ID；
- 读取先校验版本/形状，损坏时清理并显示开发态提示，不能让页面崩溃；
- 登出或切换管理员清理对应 namespace；
- 发布后保留 canonical V2 和轻量幂等记录，不删除整个存储；
- create/save/publish 的 idempotency/operation ID 在结果确定前保持不变；
- mock 抛出与真实层同形 `HttpError`，支持 401/403/409/410/413/422/500 场景和可控延迟。

固定 fixture：

- `center`：AmE 输入锁定、BrE `centre`、noun + verb、完整基础词形建议；
- `far`：同拼写可区分音标、adjective + adverb，并有 `farther` 与 `further` 两个词形组；
- 已存在词：UK/US duplicates；
- phrase、builtin not found、builtin unavailable、smart unavailable；
- 38 个词义/38 个例句的大数据草稿；
- revision conflict、expired detection、validation failure、publish response-lost retry。

开关：

- `VITE_WORD_CREATION_WIZARD`：控制入口切换，支持回滚旧创建单词入口；
- `VITE_ADMIN_WORDS_MOCK`：选择整套 dictionary mock data source。

production mode 若 mock flag 为 true，Vite 配置直接失败；不能自动回真实 API，也不能带着 mock 产物继续构建。`tshb-test` 的 admin 部署脚本使用显式 `test` mode 优化构建并开启 mock，作为后端接口未落地期间的验收通道；其他 build mode 即使设置 mock flag 也继续 fail closed。单元测试通过依赖注入选择 mock，不依赖进程级开关。

## 状态与请求流

1. `/words/new` Form 持有输入；点击检测触发 mutation。
2. mutation result 只有 request echo 与当前 Form 完全一致时才显示。修改输入立即 reset detection。
3. 点击继续复用一个 create idempotency key；成功后写入 V2 detail cache，replace 到 forms。
4. wizard 按 URL 加载 V2；canonical detail 只在 revision 改变且当前步骤不 dirty 时同步到本地编辑副本。
5. 保存先做客户端即时校验，再按 intent 发送精确 step DTO。写 mutation不自动重试；响应丢失时用同 operation ID人工重试。
6. forms 修改若影响 meanings，先取 impact，确认后携 token 原子保存；成功响应更新 detail，必要时移除 meanings 完成态。
7. 成功保存用 `setQueryData` 写最新详情，不先 invalidate detail 造成旧响应覆盖；列表/统计按需失效。
8. 进入 preview 调 validate；issues 按 step/node/field 索引。点击 issue 导航后聚焦对应字段。
9. publish key 在得到成功或确定失败前保持不变。成功后写 published detail、失效 list/stats 并导航 `/words`。
10. Query 读取可有限重试；检测和所有写操作不做无条件自动重试。401 仍由现有 HTTP runtime single-flight refresh 一次。

左栏完成度和数量由一个纯 `selectWordProgress(AdminWordV2)` 计算，UI 各处共用；最终可发布性只以 validate 响应为准。服务端不下发与客户端重复、可能漂移的展示计数。

## 权限与安全

建议后端权限能力拆为：

- `words.create`：detect/create；
- `words.edit`：load/save/delete draft；
- `words.publish`：validate/publish。

在权限目录正式增加前，前端沿用 `words.access` 控制入口，后端仍必须对每个写端点做 403。mock 根据当前 profile 权限模拟相同结果；直接输入 URL 不能绕过。最终权限 key 是实施前后端确认项。

所有文本按普通文本/RichText 结构渲染，不注入 HTML。mock 存储仅在非生产启用，不存 token、供应商密钥或后端内部信息。

## UI、可访问性与性能

- admin 继续使用 Ant Design，不引入 web 的 `@tsz/ui`。
- 保留 ConsoleLayout；wizard 在内容区内提供局部 Stepper 与摘要栏，1440/1920 对照原型。CSS Grid 在空间不足时单列或受控横向滚动。
- BrE 蓝与 AmE 洋红只作辅助；始终有文本标签。
- 锁定的来源方言使用 `readOnly` 并保留提交值，不使用会从 Form 丢值的 disabled 控件。
- Stepper 有 `aria-current`；词性为 tablist；折叠有 `aria-expanded`；检测/保存/发布结果用 `aria-live`。
- 错误摘要关联输入 `aria-describedby`；点击错误后移动焦点。
- 图标按钮有带上下文的 accessible name；新增/删除后焦点落到可预测位置。
- 拖拽排序同时提供键盘“上移/下移”操作。
- 未接真实音频时按钮明确 disabled 并说明，不能呈现可点击但只 toast 的假操作。
- 默认只挂载当前词性和展开的词义卡；折叠数据仍由 Form/store 保留。
- 以 38 个词义 + 38 个例句 fixture 做性能手测：单字段输入不得触发所有折叠卡重渲染；切 Tab/折叠保持可交互。若 profiling 显示明显卡顿，再按测量引入虚拟化，不预先增加复杂度。

## 测试策略

实现阶段先按 `$test` 技能形成正式矩阵，再写测试。

### 单元测试

- detection stale/expiry 与两源决策矩阵；
- detection snapshot 完整持久化、headwords 深度一致与 basics 只读恢复；
- V2 wire ↔ form、snake_case、decimal string；
- shared base + 多 form group，base 拼写只读派生且 `farther/further` 往返不丢；
- spelling/phonetic 联动；
- variants 的 missing/ready 草稿与发布校验、provenance 和 manual 不覆盖；
- grammar 方言形状只由 headwords.mode 派生；
- 四种 definition mode、sentence links；
- step DTO 分离和按 stable ID merge；
- issue/impact 定位与引用删除；
- progress selector；
- mock revision、operation/idempotency、storage schema 和发布后 list/stats。

### 组件/集成测试

- “创建单词”导航、“创建短语”仍开旧 modal；
- source 方言 readOnly、建议词性只读、stale response 不显示；
- phrase/duplicate/not-found/partial outage 阻断矩阵；
- 建草稿直接生成词性 Tab 与建议 forms；
- 草稿 Step 1 只读回看，修改动作要求废弃重建；
- 多词形组、共享 base、双方言行对齐和键盘排序；
- 已有 variant 切换不请求；缺失 variant 点击生成、预览确认后写入，manual 值拒绝静默覆盖；
- meanings 的录入顺序、四种释义、双语例句、links、关系词；
- save vs complete、422 issue、409 conflict/impact、410、413、401/403；
- 已完成步骤用 save 改残时撤销自身与后续完成态；
- 刷新恢复、保存退出、继续创建、废弃、不可达步骤与 dirty leave；
- preview revision 失效、issue 定位、幂等 publish；
- 发布后列表可见、统计更新、V2 不进入 legacy editor。

### API 与 contract 测试

- 新 endpoint 的 method/path/body 和相对 `/admin` 前缀约定；
- step method 的泛型 body、`base_revision`、operation/idempotency key；
- 结构化 error parse；
- proposal PENDING 台账；真实 OpenAPI 到位后移除并校验。

### admin E2E

- 独立 config 启动 admin 3001，route mock admin refresh/profile 和 words API；
- `center` 四步发布并回列表；
- duplicate 阻断；
- `far` 两组词形；
- 中途硬刷新恢复；
- 保存失败保值重试；
- preview issue 跳回稳定节点；
- 已发布 V2 的“查看”不进入旧编辑器。

### 手工与视觉

- 1440px、1920px、1200px、浏览器缩放；
- 六张原型的步骤头、摘要栏、双方言列、多个词形组和折叠长表单；
- 键盘、焦点、读屏标签、颜色对比、loading/disabled；
- 38/38 大数据 fixture；
- mock flag 关闭走真实 API，生产 mock 构建 fail-closed。

### 质量门禁

- `pnpm --filter @tsz/types typecheck && pnpm --filter @tsz/types lint`
- `pnpm --filter @tsz/api-client test && pnpm --filter @tsz/api-client typecheck && pnpm --filter @tsz/api-client lint`
- `pnpm --filter @tsz/admin test && pnpm --filter @tsz/admin typecheck && pnpm --filter @tsz/admin lint`
- `pnpm --filter @tsz/admin build`
- `pnpm --filter @tsz/e2e test:e2e:admin`
- `pnpm format:check`

## 风险与缓解

- **后端尚无词库 OpenAPI**：proposal 全进 PENDING；真实 spec 到位后先 contract diff，再替换 data source。
- **方言自动转换范围仍需产品/后端确认**：通过白名单与独立 suggestion endpoint 隔离；后端未提供时只允许 mock 演示，不把假转换带到真实模式。
- **V2 与 legacy 并存**：schema_version 路由矩阵和旧编辑器 guard 双保险；V2 不降级保存。
- **深表单性能**：步骤拆 Form、只挂载活动/展开内容、稳定 key，按 38/38 fixture profiling。
- **引用级联**：影响预览 + revision-bound token + 后端原子保存，不由客户端分多次请求清理。
- **mock/真实漂移**：同一 wire 类型、同一 data-source 签名、endpoint 单测、OpenAPI contract 测试。
- **发布重复与 response loss**：稳定 ID、operation/idempotency records，mock 与后端同语义。

## 回滚

- wizard feature flag 只控制“新建单词”入口：关闭后恢复 legacy word modal；已有 V2 draft 的“继续创建”和全部 wizard 路由仍可编辑访问，V2 published 仍可只读查看，避免回滚制造孤儿草稿。
- legacy `WordEditor` 和旧 endpoint 不在本需求中删除。
- mock 开关与 feature flag 独立；关闭 mock 不改变真实 API endpoint 代码。
- V2 是增量类型，回滚入口不把 V2 数据转换成 V1。

## 本轮追加：系统设置 / 词性配置

### 目标与边界

词条页面当前依赖 `WordPosTag` / `WordSubPos` 静态联合与 `POS_TAG_ZH`、`SUB_POS_LABEL` 常量。该结构能保证编译期穷举，但无法满足运营侧新增、改名、排序和配置细分词性的要求。本轮把“可用词性与展示信息”迁移为目录数据，同时保留稳定编码作为词条引用键：

- 配置目录决定“有哪些基本/细分词性、如何显示、按什么顺序出现”；
- 词条内容只保存稳定编码，不保存中文名/英文名/缩写快照；
- 基本词性编码在全目录唯一，细分词性编码也全目录唯一，创建后不可修改；
- 修改展示字段会即时影响所有词条页面，但不会制造词条内容 revision；
- 删除必须由数据源重新核对引用，不能只相信列表返回的 `usage_count`；
- 词形类型 `WordFormType`、方言和发音方式不属于本配置范围，仍维持现有枚举。

为兼容已存在的 V1/V2 mock 数据，默认种子的基本编码沿用小写 `noun`、`verb`、`adjective` 等；细分编码沿用 `N-COUNT`、`V-T` 等。`name_en` 是可编辑展示字段，例如编码 `noun` 的英文名可为 `NOUN`，二者不得混为同一个可变字段。

### 配置 wire 类型

以下类型放入 `@tsz/types`，字段继续 1:1 使用 snake_case：

```ts
type PartOfSpeechCode = string;
type SubPartOfSpeechCode = string;

interface PartOfSpeechCreator {
  id: string;
  display_name: string;
}

interface PartOfSpeechConfig {
  id: string;
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
  usage_count: number;
  sub_part_count: number;
  revision: number;
  created_by: PartOfSpeechCreator;
  created_at: string;
  updated_by?: PartOfSpeechCreator;
  updated_at: string;
}

interface SubPartOfSpeechConfig {
  id: string;
  part_of_speech_id: string;
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  sort_order: number;
  usage_count: number;
  revision: number;
  created_by: PartOfSpeechCreator;
  created_at: string;
  updated_by?: PartOfSpeechCreator;
  updated_at: string;
}

interface PartOfSpeechCatalogItem {
  id: string;
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
  sub_parts: Array<{
    id: string;
    code: SubPartOfSpeechCode;
    name_zh: string;
    name_en: string;
    sort_order: number;
  }>;
}

interface PartOfSpeechCatalogResponse {
  catalog_version: number;
  items: PartOfSpeechCatalogItem[];
}

interface PartOfSpeechConfigListQuery {
  q?: string;
  page?: number;
  page_size?: number;
}

interface PartOfSpeechConfigListResponse {
  items: PartOfSpeechConfig[];
  pagination: AdminPaginationMeta;
}

interface SubPartOfSpeechListResponse {
  items: SubPartOfSpeechConfig[];
}

interface CreatePartOfSpeechInput {
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
}

interface UpdatePartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
}

interface CreateSubPartOfSpeechInput {
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

interface UpdateSubPartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  sort_order: number;
}
```

`created_by.id` / `updated_by.id` 的 wire 类型固定为 string：普通管理员 actor 使用 UUID 字符串，
系统种子使用 `{ id: "system", display_name: "系统" }`。`created_by` 必须存在；尚未修改的记录
省略 `updated_by`，不返回 `null`。所有时间为 RFC 3339。

`WordPosTag` 迁移为 `PartOfSpeechCode` 的兼容别名，`WordSubPos` 迁移为 `"" | SubPartOfSpeechCode` 的兼容别名。TypeScript 中它们最终是 string，但业务代码不得随意拼接；输入只能来自 catalog、检测响应或已加载的历史 wire。后端/mock 保存与发布时必须验证编码仍存在且细分词性属于当前基本词性。

编码约束基线：基本词性 `^[a-z][a-z0-9_]{0,31}$`，细分词性 `^[A-Z][A-Z0-9_-]{0,31}$`。
中文名、英文名长度 1–64，缩写长度 1–16，统一 trim；基本编码和基本中文名全局唯一，基本
英文名、缩写忽略大小写后全局唯一；细分编码全局唯一，细分中文名和英文名只在同一基本词性
下唯一，英文比较忽略大小写。`sort_order` 是有符号 32 位整数。mock 与真实接口必须一致。

### 后端接口提案

`createAdminEndpoints` 使用 `/api/v1/admin` base URL，以下均为相对路径：

| 方法   | 相对路径                                                                     | 成功 | 响应                                 | 权限             |
| ------ | ---------------------------------------------------------------------------- | ---: | ------------------------------------ | ---------------- |
| GET    | `/settings/parts-of-speech/catalog`                                          |  200 | `{ catalog_version, items }`         | 任意已登录 admin |
| GET    | `/settings/parts-of-speech`                                                  |  200 | `{ items, pagination }`              | `super_admin`    |
| POST   | `/settings/parts-of-speech`                                                  |  201 | 完整 `PartOfSpeechConfig`            | `super_admin`    |
| PATCH  | `/settings/parts-of-speech/{id}`                                             |  200 | 完整新 `PartOfSpeechConfig`          | `super_admin`    |
| DELETE | `/settings/parts-of-speech/{id}?base_revision={revision}`                    |  204 | 无 body                              | `super_admin`    |
| GET    | `/settings/parts-of-speech/{id}/sub-parts`                                   |  200 | `{ items: SubPartOfSpeechConfig[] }` | `super_admin`    |
| POST   | `/settings/parts-of-speech/{id}/sub-parts`                                   |  201 | 完整 `SubPartOfSpeechConfig`         | `super_admin`    |
| PATCH  | `/settings/parts-of-speech/{id}/sub-parts/{sub_id}`                          |  200 | 完整新 `SubPartOfSpeechConfig`       | `super_admin`    |
| DELETE | `/settings/parts-of-speech/{id}/sub-parts/{sub_id}?base_revision={revision}` |  204 | 无 body                              | `super_admin`    |

catalog 不分页，返回所有基本词性及嵌套细分词性，并按 `sort_order`、`created_at`、`id` 稳定排序。
它不返回审计与 usage 字段。相同 sort_order 项必须保留服务端相对顺序，客户端不能因 DTO 缺少
created_at 而重新按 id 覆盖服务端顺序。`catalog_version` 和 `items` 由后端在同一个数据库快照中
读取，前端可以把整个响应当作同一代目录。

基本管理列表使用 `{ items, pagination }`；`page` 默认 1，`page_size` 默认 10、范围 1–100，
非法值返回 400 `invalid_query` 而非静默 clamp。`q` trim 后对编码、中文名、英文名和缩写做
忽略大小写的字面子串匹配，`%`、`_` 不作为 SQL 通配符。细分列表不分页，但必须返回
`{ items }`，不能返回裸数组。

创建/修改后全局 `catalog_version` 递增。当前前端仍依靠 5 分钟 staleTime 和本机 mutation 后
失效缓存，并未主动比较该版本；后续可基于它增加 ETag/跨管理员刷新。PATCH 使用
正整数 `base_revision` 做乐观锁，冲突返回 409 `revision_conflict`；缺失/类型错误返回 422，
小于 1 返回 400 `invalid_part_of_speech` 且顶层 `field=base_revision`。

两个 DELETE 同样使用乐观锁，`base_revision` 是必填正整数查询参数。API client 调整为
`remove(id, baseRevision)` / `removeSubPart(id, subId, baseRevision)`，页面从当前行读取 revision；
后端锁行后先比较 revision，再做引用检查。过期删除返回 409 `revision_conflict`，不能删除其他
管理员刚修改过的配置。缺失、非整数或小于 1 的 query 返回 400 `invalid_query`。

所有写 DTO 必须严格拒绝未知/只读字段。PATCH 携带 `code`、`part_of_speech_id`、usage 或 actor
等字段时返回 422 `invalid_request_body`，不能静默忽略。字段缺失/类型错误同为 422；JSON 合法、
类型正确但值违反 code/长度/排序规则时返回 400 `invalid_part_of_speech`。

唯一冲突按层级区分：基本词性返回 409 `part_of_speech_conflict`，细分词性返回 409
`sub_part_of_speech_conflict`；具体冲突字段位于 Problem Details 顶层 `field`。

删除基本词性时，后端在同一事务内检查当前草稿和所有仍保留 publication 的单词/短语引用；
有引用返回 409 `part_of_speech_in_use`，`meta.usage_count` 给出按 entry 去重后的数量。删除细分
词性同理检查当前草稿和 publication 中的 sense，返回 `sub_part_of_speech_in_use`，数量按稳定
sense node 去重。publication 事务必须写带 `ON DELETE RESTRICT` catalog FK 的结构化引用表，
不能只扫描 JSONB snapshot。客户端 usage_count 只用于提前禁用/提示，不能替代事务与 FK 检查。

配置接口错误码固定为：

| HTTP | code                           | 场景                                        |
| ---: | ------------------------------ | ------------------------------------------- |
|  400 | `invalid_json`                 | JSON 语法非法                               |
|  400 | `invalid_query`                | 查询或分页非法                              |
|  400 | `invalid_path_parameter`       | 路径中的基本/细分 ID 不是合法 UUID          |
|  400 | `invalid_part_of_speech`       | 配置字段值违反业务规则                      |
|  404 | `part_of_speech_not_found`     | 基本词性不存在                              |
|  404 | `sub_part_of_speech_not_found` | 细分词性不存在或不属于路径中的父级          |
|  409 | `part_of_speech_conflict`      | 基本编码、名称或缩写冲突                    |
|  409 | `sub_part_of_speech_conflict`  | 细分编码或同父级名称冲突                    |
|  409 | `revision_conflict`            | PATCH body 或 DELETE query 的 revision 过期 |
|  409 | `part_of_speech_in_use`        | 基本词性被引用                              |
|  409 | `sub_part_of_speech_in_use`    | 细分词性被引用                              |
|  422 | `invalid_request_body`         | 字段缺失、类型错误或出现未知/只读字段       |

错误继续使用 `application/problem+json`。`field` 位于 Problem Details 顶层；
`current_revision`、`usage_count`、`part_of_speech_id` 和被引用的配置 code 位于可选 `meta`。
`ProblemDetails.meta` 与 `HttpError.meta` 使用共享 `ProblemMeta`，原
`AdminWordApiErrorMeta` 只保留为迁移期类型别名。正常引用检查会返回 usage_count；极端并发下
由已知 FK `23503` 兜底的 `*_in_use` 允许省略 meta，页面错误提示不能依赖计数存在。
客户端只能按 `status/code/field/meta` 分支，不能匹配 title/detail 文案。

词条相关端点同步增加约束：

- detection 的 `suggested_forms.pos[].pos` 必须是 catalog 中存在的基本编码；
- create/save/publish 遇到未知基本编码返回 422 `unknown_part_of_speech`；
- meanings 中细分编码不存在或不属于该 POS 时返回 422 `invalid_sub_part_of_speech`；
- 配置在管理员未保存的表单期间被并发删除时，保存请求按上述 422 失败，前端保留本地值并要求重新选择；
- 后端词典供应商自己的词性枚举必须在服务端映射到平台编码，不把供应商原始值直接透传给前端。

完整契约与请求/响应样例同步写入 `../tsz-rust/docs/part-of-speech-config-design.md` 和
`../tsz-rust/docs/frontend-integration.md`。后端将九个 handler/DTO 注册进 utoipa、生成
`docs/openapi.json` 后，前端同步 `openapi.snapshot.json` 并运行 endpoint contract test；只有
method、path、状态码、响应信封和 schema 全部一致，才移除 PENDING 台账。

### 前端结构与数据流

新增路由 `/settings/parts-of-speech`，侧栏新增顶级分组“系统设置”和叶子“词性配置”。配置写操作属于全局高影响治理能力，菜单按 `super_admin` 显示；页面本身复用 `/admins` 的纵深守卫，普通 admin 直达时显示 403。catalog 读取不受该页面守卫限制。

页面使用 antd v6：

- `PartOfSpeechSettingsPage`：路由级超级管理员守卫；
- `PartOfSpeechSettings`：Breadcrumb、搜索表单、Table、分页、加载/错误/空态；
- `PartOfSpeechFormModal`：新增/修改基本词性，编辑态编码只读；
- `SubPartOfSpeechPanel`：在“细分词性”Tab 内维护选中基本词性的细分词性；
- 删除按钮在 `usage_count > 0` 时禁用并显示“已有 X 个单词或短语引用，只能修改”；提交时仍处理 409；
- 未引用配置删除前用 Modal 二次确认，明确会同时删除其细分词性。

TanStack Query key：

```ts
const partOfSpeechKeys = {
  all: ["part-of-speech-config"] as const,
  catalog: () => [...partOfSpeechKeys.all, "catalog"] as const,
  lists: () => [...partOfSpeechKeys.all, "list"] as const,
  list: (query) => [...partOfSpeechKeys.lists(), query] as const,
  subParts: (id) => [...partOfSpeechKeys.all, "sub-parts", id] as const
};
```

catalog `staleTime` 可设为 5 分钟；配置 mutation 成功后同步失效 catalog、管理列表和相关 sub list。词条内容只保存 code，因此 catalog 更新只改变展示，不应把正在编辑的词条 Form 标为 dirty。catalog 加载失败时：

- 已存在的词条 tab/列表以原始 code 安全降级，并显示一次目录不可用 Alert；
- “添加基本词性”和“细分词性”选择器禁用并提供重试；
- 第 1 步检测到未知/无法解析编码时阻断创建；
- 绝不回退到另一份隐藏的静态中文映射，否则配置页面与业务页面会再次双主。

业务页面迁移：

- `SmartDictionary` 列表和基本词性筛选使用 catalog 的 code/value 与 `name_zh`；
- `CreateEntryStep` 用 catalog 解析检测建议，未知编码显示错误；
- `FormsAndPronunciationStep` 从 catalog 计算尚未使用的基本词性 options；
- `MeaningsAndExamplesStep` 根据当前 POS code 只展示所属 `sub_parts`；
- `PreviewAndPublishStep`、`WordCreationWizard`、legacy `WordEditor`/`PosTabsSection` 都通过同一个 selector 解析中文名；
- `labels.ts`/`editorConstants.ts` 不再保存业务可配置的基本/细分词性全集，只保留与配置无关的固定枚举。

为避免每个深层组件重复 query，向导和 legacy 编辑器在页面壳加载一次 catalog，并通过轻量 context/props 传递只读 lookup：`by_code`、`sub_parts_by_pos_code` 和 options。列表页可独立使用 query。lookup 由纯函数构造并单测，未知 code 统一回退自身，不在组件里各写一套判断。

### mock 与默认种子

现有 `createAdminWordsMock` 扩展为共享的 dictionary mock runtime：words 与 part-of-speech settings 共用同一份 session state，才能准确计算引用数量和执行删除约束。外部仍保留 `adminWordsDataSource` facade，同时新增 `partOfSpeechDataSource` facade；两个 facade 延迟解析到同一个 runtime 实例，不能各建一份 Map。

mock schema version 升级并增加：

```ts
interface MockPartOfSpeechState {
  catalog_version: number;
  parts_of_speech: PartOfSpeechConfig[];
  sub_parts: SubPartOfSpeechConfig[];
}
```

默认种子从当前静态常量机械迁移：11 个基本词性、19 个细分词性及所属关系。种子只存在 mock/storage adapter，不再被 UI 直接 import。首次初始化或 schema 不兼容时载入种子；同一管理员刷新保留 CRUD 结果，登出沿用现有清理规则。

usage_count 从 mock 当前 V1/V2 word tree 实时派生，不持久化为第二事实源：基本词性统计当前 mock
持有的草稿/已发布 word/phrase，细分词性统计 senses。mock 没有多 publication 历史模型；真实
后端额外按上述 publication 引用表保护所有仍保留版本。删除与保存放在同一同步临界区内重算。

真实接口启用前必须修正 mock 的已知契约漂移：字段值校验目前仍返回 422
`invalid_request_body`，细分唯一冲突仍错误地返回 `part_of_speech_conflict`，404 仍使用通用
`not_found`。同时页面补充 `sub_part_of_speech_conflict` 中文提示。修正后 mock 才能继续称为与
真实提案同形，并覆盖 409 in-use、409 revision、422 unknown code。

Mock detection fixture 继续返回 `noun`/`verb` 等默认编码。测试可新增配置并验证第 2 步 options 动态出现；也可删除未使用配置并验证消失。若测试故意让 detection 返回未知编码，create step 必须阻断。

### 代码影响范围

#### `@tsz/types`

- 新增 `packages/types/src/part-of-speech.ts`：配置、catalog、query、CRUD input/response 类型。
- 修改 `packages/types/src/admin-word.ts`、`admin-word-v2.ts`：基本/细分词性改为稳定字符串编码别名；注释明确来源与服务端校验。
- 修改 `packages/types/src/index.ts`：导出新类型。

#### `@tsz/api-client`

- 修改 `packages/api-client/src/admin.ts`：新增 `partOfSpeechSettings` namespace 与 9 个 endpoint。
- 修改 `admin.test.ts`：覆盖方法、路径、query、body 和动态 id。
- 修改 `endpoints.contract.test.ts`：把上述 endpoint 加入 PENDING；后端 OpenAPI 到位后移除。

#### admin 数据与 mock

- 重构 `features/dictionary/dataSource.ts`：words/config facade 共享一个 runtime 解析结果。
- 新增 `features/dictionary/part-of-speech/api.ts`、`catalog.ts`：query hooks 与纯 lookup。
- 修改 `features/dictionary/mock/adminWordsMock.ts`、storage、fixtures：配置种子、CRUD、引用检查和 schema migration。

#### admin 菜单、路由与页面

- 修改 `features/console/ConsoleSidebar.tsx`：新增 super-only “系统设置 → 词性配置”。
- 修改 `router.tsx`：新增 `/settings/parts-of-speech` lazy route。
- 新增 `pages/PartOfSpeechSettings.tsx` 和 `features/dictionary/part-of-speech/` 页面组件。
- 修改 `SmartDictionary.tsx`、V1 `WordEditor` 相关组件、V2 wizard 各步骤组件：移除静态基本/细分词性标签与 options，改用 catalog lookup。

#### 后端对接文档

- 修改 `../tsz-rust/docs/frontend-integration.md`：新增“系统设置 / 词性配置（前端 Mock、后端待实现）”章节，记录类型、端点、错误码、权限和与词条端点的联动约束。
- 不修改 `../tsz-rust/docs/openapi.json`；它只能由后端真实实现生成后同步。

### 测试策略补充

进入代码动工后先使用 `$test` skill 完成用例矩阵，再写测试：

- 单元：catalog lookup、稳定排序、未知 code 回退、过滤已用 POS、细分词性按所属 POS 过滤；
- mock：默认 11/19 种子、CRUD、唯一性、revision、引用计数、基本/细分删除约束、过期 revision
  不删除、级联删除、storage 恢复，以及与真实契约一致的状态码/错误码；
- 组件：菜单与 403、配置层级 Tab、列表搜索分页、新增/修改/删除、细分页内面板、错误/重试；
- 集成：新增配置进入 forms selector，改名传播到列表/向导/预览，未知 detection code 阻断，配置并发删除后保存 422；
- API contract：9 个 endpoint 的 method/path/query/body（含两个 DELETE 的必填 `base_revision`）、
  201/200/204 状态码、基本分页信封、细分 `{ items }` 信封、严格 PATCH schema 与 PENDING；
- E2E：超级管理员新增基本词性及细分词性 → 创建词条选择它 → 返回配置页验证删除被阻断。

质量门沿用本文既有 admin/types/api-client/test/build/lint/typecheck/e2e 要求。

### 风险与回滚补充

- **静态联合改为动态 code**：编译器不再替后端枚举穷举。通过 catalog lookup、服务端/mock 保存校验和未知 code 明确降级补偿，禁止裸字符串由 UI 自造。
- **配置修改影响全局展示**：这是需求预期；编码不可改、词条不保存名称快照，避免内容 revision 与配置 revision 耦合。
- **删除竞态**：usage_count 仅提示，最终使用事务内引用检查；前端处理 409 后刷新列表。
- **mock runtime 双实例**：words/config facade 必须共享一次 lazy factory 结果，并用测试断言跨 facade 可见同一状态。
- **真实后端未就绪**：生产 mock 仍 fail-closed。真实数据源请求不存在时页面显示不可用，不静默使用 seed；后端落地前该配置功能仅用于开发/测试演示。
- **紧急回滚**：隐藏系统设置菜单与路由入口，但保留 catalog 读取和 code fallback；默认种子可退回只读 catalog mock。不得恢复散落的静态 UI 映射作为第二事实源。

## 真实后端接入前仍需用户/后端确认

1. 是否接受 V2 草稿与发布词条保持同一 word ID，以及 `schema_version` 的兼容方案。
2. detect/create/step impact/save/validate/publish/dialect-variants 的 endpoint 与错误 envelope。
3. 内置词典返回词形/音标 suggestions 的供应商、覆盖率和失败语义；第 3 步本轮按空骨架初始化。
4. 方言转换建议 endpoint、字段白名单和 manual 覆盖确认语义；真实服务未提供时只在 mock 演示，真实 data source 明确禁用按钮。
5. 例句固定 focus link + 可选 context links 的模型是否符合“关联单词”业务含义。
6. 发布完整性矩阵，尤其“每词性至少一个语法结构/词义”“本语言释义”和例句 link 规则。
7. create/edit/publish 的正式 permission keys。
8. V2 published 首版只读、不能立即纠错编辑是否可接受；若不可接受，需要把 V2 发布后编辑扩入本轮并补保存语义。
9. 服务端草稿保留期、数量/文本上限；统计基线按含 draft 的所有未删除词条计算是否接受。
10. 词性配置写权限是否最终限定为 `super_admin`；本文与前端首版按 super-only 设计。
11. 基本词性删除是否按本文级联删除未引用细分词性，还是要求先手动清空细分词性。
12. 是否需要“停用”状态以禁止新引用但保留存量；原型未给出，本轮只有修改与删除。
13. 内置词典供应商词性到平台稳定编码的映射表由哪个后端模块维护，以及未知供应商词性的处理策略。

## 语义区间中英文双名与必选规则（2026-08-09 修订）

### 方案结论

V2 新建向导的语义区间从 legacy `SenseGroup { id, name }` 分离为 `SenseGroupV2 { id, name_zh, name_en }`。`sense_group_id` 继续只引用稳定 ID，不复制名称。V1 编辑器和既有 `/admin/words` 单树契约继续使用 `name`，本轮不做 V1 数据迁移，也不根据单名自动猜测另一语言。

```ts
interface SenseGroupV2 {
  id: string;
  name_zh: string;
  name_en: string;
}

interface DraftMeaningsStepContent {
  sense_groups: SenseGroupV2[];
  pos: WordPosMeaningsV2[];
}
```

选用两个明确字段而不是 `{ locale, name }[]`：当前产品只支持固定的中文和英文两种名称，固定对象能在 TypeScript 和后端校验中直接表达“两侧都存在”，不需要处理重复 locale、缺失 locale 或数组排序。也不复用 `DialectValueV2`，因为这里是语言翻译，不是 BrE/AmE 方言变体。

### UI 与数据流

- `MeaningsAndExamplesStep` 的每个语义区间行展示两个输入，可见标签和可访问名分别为“中文”“英文”，不显示红色必填星号；视觉序号仅在最左侧使用圆圈数字 `① / ②`，不重复“区间 N”文案。桌面宽度并列，空间不足时允许换行，不引入 Tailwind。
- 卡片头部只保留“语义区间”和新增操作，不使用醒目的“必填”标签，也不额外显示必选说明；必选约束由默认绑定、禁用清空和完成校验表达。
- 左侧“完成情况”在“词形变化”和“语法结构”之间增加“语义区间”行；已有 word 时至少显示默认区间的 `1`，保存后按 canonical `sense_groups.length` 显示。
- 语法结构列表与语义区间使用同一套左侧圆圈数字序号；不重复显示“结构 N”，卡片头部不显示“英美文本独立维护”，方言差异直接由并排的英式/美式输入表达。多条语法结构通过右侧拖动手柄重排，拖放目标显示描边反馈，同时保留手柄聚焦后的上下方向键操作；不再展示独立的上移/下移按钮。每个方言输入复用上一步发音行的播放、获取语音、上传语音图标和禁用状态；真实音频接口未接入前，获取与上传只显示 Mock 提示，不伪造 `audio_url`。
- 空草稿首次进入第 3 步即初始化 `{ id: newWordNodeId(), name_zh: "", name_en: "" }`，不显示需要先点击添加的空卡片；编辑任一名称不改变 ID，也不影响既有词义引用。
- 词义的语义区间 `Select` 仍以 `group.id` 为 value，label 使用 `name_zh + " / " + name_en`，不提供清空入口；新增词义自动绑定第一个区间。草稿缺一侧名称时用已填名称和明确的“待填写中文名/英文名”占位，不让两个未命名区间不可区分。
- UI 至少保留一个区间，最后一项的删除按钮禁用。删除被引用的其他区间时显示影响确认，并把引用改绑到第一个剩余区间；不制造新的未选状态。
- “保存草稿”原样提交不完整的双语行；`intent: "complete"` 的客户端、mock 和真实后端校验两侧 trim 后均为 1–200 字符。校验 issue 使用语义区间 `id` 作为 `node_id`，`field` 分别为 `name_zh` / `name_en`。
- `intent: "complete"` 同时要求至少一个区间以及每个词义的 `sense_group_id` 都存在且指向当前词条内的区间；mock 使用 `sense_group_required` / `sense_group_not_found` 区分缺失和悬空引用。
- 保存成功后 canonical V2 detail 原样返回双语名称，刷新恢复不经过本地翻译或 camelCase 映射。

### 代码影响范围

- `packages/types/src/admin-word-v2.ts`：移除对 legacy `SenseGroup` 的复用，新增并导出 `SenseGroupV2`，把 `DraftMeaningsStepContent.sense_groups` 改为该类型；`packages/types/src/admin-word.ts` 保持不变。
- `packages/types/src/index.ts`：导出 `SenseGroupV2`。
- `apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.tsx`：双输入、新增行、Select 双语 label、complete 客户端校验和字段定位。
- `apps/admin/src/features/dictionary/word-creation/model.ts`、测试 helper 与 fixtures：初始化首个双语区间，并把既有/新增词义默认绑定到它。
- `apps/admin/src/features/dictionary/mock/adminWordsMock.ts`：draft-save 原样保留；complete/validate/publish 校验双语名称及长度，引用完整性仍按 ID 判断。
- `apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.test.tsx`、`model.test.ts`、`mock/adminWordsMock.test.ts`：补双语录入、恢复、展示、缺失/超长和删除引用回归。
- `../tsz-rust/docs/frontend-integration.md`：后端团队确认后，把 V2 meanings proposal 的 `SenseGroupV2` 与 422 issue 字段补入共享契约；当前 Rust OpenAPI 尚无 V2 meanings schema，不能把前端字段误标为已落地接口。

`@tsz/api-client` 的 endpoint 和请求封装不新增方法：`saveMeaningsStep` 已按泛型透传 `DraftMeaningsStepContent`，类型变更会让现有 method/path/body 测试继续约束新 body。无需修改 legacy `word-editor/SenseRangesSection.tsx`、`mapping.ts` 或 V1 fixtures。

### 风险与回滚

- **真实后端尚未确认字段**：真实数据源启用前必须对齐 `name_zh` / `name_en`；后端未支持时只允许 contract-shaped mock 演示，不能在传输层静默合并回 `name` 造成英文丢失。
- **V1/V2 同名概念不同形**：使用 `SenseGroupV2` 显式隔离，禁止扩大修改共享 `SenseGroup`，避免旧编辑器、旧 fixture 与已发布 V1 契约被连带破坏。
- **草稿中的半成品双语行**：save 允许名称未填、complete 阻断，但区间节点和词义引用由 UI 始终保持完整；下拉显示缺失提示，避免空 label。
- **回滚**：在后端尚未落地时可整体回退 V2 类型和步骤 UI 的本修订；稳定 ID 和 `sense_group_id` 未改变，不涉及引用迁移。

## 基本词性 / 细分词性配置 Tab（2026-08-08 修订）

### 方案结论

“基本词性 / 细分词性”是系统设置中词性目录的两个管理视图，不是单词/短语类型。V2 新建向导继续只处理单词，不扩展 phrase wire，不增加 `expected_kind`、forms `sub_pos` 或按 kind 分流。

### 页面交互

- `PartOfSpeechSettings` 标题下方增加一级 `Tabs`，固定为“基本词性 / 细分词性”。
- “基本词性”Tab 保留现有搜索、分页、增改删和引用保护。
- “细分词性”Tab 提供所属基本词性筛选；默认选择目录中的第一个基本词性，在当前页面展示该基本词性下的细分列表及增改删操作。
- 基本词性表格不再以“配置细分词性”抽屉作为主要入口；两个目录层级通过顶部 Tab 明确分开。
- `FormsAndPronunciationStep` 只读取基本词性 catalog，分组、添加器和保存 wire 均为 `forms.pos[]`。
- `MeaningsAndExamplesStep` 中每个 sense 保留“细分词性”选择器，并根据当前 forms 分组的基本 `pos` 过滤所属细分项。
- 预览中词形分组显示基本词性中文名，词义卡片显示所选细分词性中文名。

### 类型与数据模型

词条 V2 模型保持原约束：`AdminWordV2.kind` 与 detection snapshot 仍固定为 `"word"`；`WordPosFormsV2` 只保存基本 `pos`，细分 `sub_pos` 只存在于 sense。配置目录继续使用稳定 code 建立归属关系：

```ts
interface WordPosFormsV2 {
  pos_id: string;
  pos: PartOfSpeechCode;
  // 其余现有词形与发音字段
}

interface WordSenseV2 {
  sub_pos: SubPartOfSpeechCode;
  // 其余现有词义字段
}
```

mock/后端在 meanings 保存与发布时校验 sense 的 `sub_pos` 存在且属于其 `pos_id` 对应的基本 `pos`。未知或归属错配返回 422 `invalid_sub_part_of_speech`。

### 代码影响范围

- `PartOfSpeechSettings.tsx`：增加配置层级 Tabs，并把细分列表作为页内视图。
- `SubPartOfSpeechDrawer.tsx`：复用其表格与表单能力为页内细分管理组件，或拆出共享内容；不再由基本词性行按钮触发主要流程。
- `FormsAndPronunciationStep.tsx`：移除错误的分类 Tabs/phrase 分支，只保留基本词性选择。
- `MeaningsAndExamplesStep.tsx`：保持 sense 级细分词性选择及按所属基本词性过滤。
- `SmartDictionary.tsx`、V2 types/mock/api：撤销错误的 phrase V2 / expected_kind 扩展，恢复原创建入口语义。
- 同步修订测试矩阵与 `tsz-rust/docs/frontend-integration.md`。

### 测试策略与风险

重点覆盖配置页两个 Tab 的切换与各自操作、细分 Tab 默认/切换所属基本词性、词形步骤不出现细分词性添加器、词义步骤只显示当前基本词性所属细分项、归属错配保存被拒绝。风险主要是配置页 Tab 与创建页具体基本词性 Tab 名称相近；测试必须断言双 Tab 只存在于系统设置页。

## 第 3 步全局方言选择与自动补全（2026-08-09 追加评估）

### 方案概述

在 `MeaningsAndExamplesStep` 增加页面级 `activeDialect: "uk" | "us"`，仅当 `word.headwords.mode === "distinguish"` 时在“语义区间”卡片上方展示 antd `Segmented`（英式 / 美式），默认值取 `headwords.source_dialect`。英文释义和例句的 `EnglishTextEditor` 从双栏改为只渲染 `activeDialect` 对应槽位；语法结构继续使用独立的 `GrammarVariantV2[]` 双栏编辑器，不接收 `activeDialect`。

用户切换到目标方言时，先扫描整份 `DraftMeaningsStepContent`，只收集目标槽位为 `missing`、另一侧源槽位为 `ready` 且文本非空的英文定义/整句释义和例句。所有合格项复用现有 `POST /words/dialect-variants` 一次批量请求。响应按 `client_id + field_kind` 建立索引，只写回仍为 `missing` 且响应类型匹配的目标槽位，写入 `origin: "converted"`；不存在、重复、类型错误或切换期间已被手工填写的目标全部跳过。语法结构不会进入收集器，类型层也不允许 `field_kind: "grammar"`。

不采用“每次键入立即转换”：它会产生高频请求、响应竞态和目标文本持续被重写。也不继续使用每字段双栏 + 单独生成按钮：这无法实现用户要求的统一选择和自动填充，并会让长表单宽度和操作负担继续增加。

### 代码影响范围

#### admin 页面与模型

- `apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.tsx`
  - 新增页面级方言选择器、加载/结果提示和“重试补全当前方言”入口；选择器在所有基本词性 Tab 间共用。
  - `EnglishTextEditor` 增加 `activeDialect`，区分模式只渲染当前槽位；`missing` 状态提供空输入以便手填，不再渲染两块方言面板和逐字段生成按钮。
  - 切换到缺失方言时调用批量补全；请求中禁用重复切换，成功写入后调用现有 `updateContent` 标记 dirty。
  - 只读模式只允许切换查看已保存 variant，不请求补全、不展示重试或编辑操作。
- `apps/admin/src/features/dictionary/word-creation/model.ts`
  - 新增纯函数 `collectMissingMeaningDialectItems(content, targetDialect)`，只返回 definition/example 项及其稳定定位信息。
  - 新增纯函数 `applyMeaningDialectSuggestions(content, targetDialect, suggestions)`，不可变写回并返回 `{ content, applied_count, skipped_count }`。
  - `createEnglishText`、`EnglishTextV2` 和 grammar 工厂保持原形；新增释义/例句仍按主词源方言初始化。
- `apps/admin/src/features/dictionary/word-creation/word-creation.css`
  - 增加方言工具条、补全状态和单方言输入布局；保持 admin antd v6，不引入 Tailwind 或 `@tsz/ui`。

#### 测试文件

- `MeaningsAndExamplesStep.test.tsx`：选择器显示/默认值、完整目标零请求、缺失目标单批请求、成功/部分/失败、手工保护、只读和 grammar 排除。
- `model.test.ts`：收集范围、跨 POS/多词义顺序、响应精确匹配、重复/错误类型/竞态跳过、不可变性。
- `mock/adminWordsMock.test.ts`：既有 endpoint 的多 item definition/example 响应和字段类型保持。
- `wordCreation.test.helper.ts`：补充同时含英文定义、例句和混合 ready/missing 的 fixture builder。

#### 无需修改

- `packages/types/src/admin-word-v2.ts`：现有 `EnglishTextV2`、`SuggestDialectVariantsInputV2` 和响应已经支持批量 definition/example；不新增 UI 方言字段，不改变 snake_case wire。
- `packages/api-client/src/admin.ts`、`word-creation/api.ts`：复用既有 `suggestDialectVariants` 和 mutation，不新增 endpoint。
- `apps/admin/src/features/dictionary/mock/adminWordsMock.ts`：现有 mock 已按 `input.items.map` 支持多项转换；若测试发现重复 `client_id + field_kind` 处理缺口，只修正契约校验，不增加页面专用接口。
- `PreviewAndPublishStep.tsx`：预览继续按 canonical variants 展示双方言，不跟随编辑页的临时选择器。
- legacy V1 编辑器和 web 不受影响。

### 后端对接

真实 Rust OpenAPI `../tsz-rust/docs/openapi.json` 当前没有智能词库方言转换端点，`../tsz-rust/docs/frontend-integration.md` 也尚未声明本接口；因此生产能力继续由 `adminWordsDataSourceCapabilities.dialectVariantSuggestions` 关闭，不能静默使用 mock。

后端落地时复用现有前端 proposal：

```jsonc
POST /api/v1/admin/words/dialect-variants
{
  "source_dialect": "uk",
  "target_dialect": "us",
  "items": [
    {
      "client_id": "definition-or-sentence-id",
      "field_kind": "definition",
      "value": { "version": 1, "text": "...", "spans": [], "liaisons": [] }
    }
  ]
}
```

- `items` 必须支持同一请求混合 `definition` 与 `example`，并允许跨 POS/词义的稳定客户端 ID。
- 响应逐项回传 `client_id`、`field_kind`、转换后的 `value` 和 `model_version`；允许部分返回，但不得返回 `grammar`。
- 需后端确认单批最大条数、请求体大小、超时、限流、计费、审计以及单项失败表达。前端首版不自行硬编码未知上限；若后端给出上限，再在 data source/编排层透明分批。
- 接口仍是“建议生成”，不直接保存词条；草稿保存继续走 meanings step 的 revision/operation 契约。

### 复用与项目约定

- canonical wire 继续使用 `@tsz/types` 的 snake_case 类型，页面不创建 camelCase 传输模型。
- 批量收集和写回是当前 admin 向导私有纯逻辑，先放 `word-creation/model.ts`；只有出现第二个跨页面消费者时再下沉 `@tsz/shared`。
- UI 仅使用 antd v6 `Segmented`、`Button`、`Alert`/`Typography` 等组件。
- 真实数据源能力关闭时 fail closed：选择器可查看已有内容，但自动补全按钮禁用并说明服务未接入。

### 数据流与时序

1. 初次进入第 3 步：`activeDialect = headwords.source_dialect`，不发请求。
2. 用户切换方言：先更新目标意图并锁定选择器，扫描当前最新 `content`。
3. 无 eligible item：立即切换展示；不调用 API、不标记 dirty。
4. 有 eligible item：发送一个 `{ source_dialect, target_dialect, items }` 请求；页面显示“正在补全美式/英式内容”。
5. 成功：用请求快照的键集合和当前最新内容双重校验，只写仍缺失的目标；`applied_count > 0` 时生成新的 operation ID、标记 dirty 并提示结果。
6. 部分响应：写入合法匹配项，剩余目标保持 missing，显示“已补全 N 项，M 项待手工填写/重试”。
7. 失败：不修改 content，切换仍落在目标方言以便手填，显示失败并保留重试入口。
8. 保存草稿/完成：沿用现有 meanings 保存和完整性校验；未补全目标仍会在 complete 时被阻断。

实现时应以单次任务 token 或递增 request ID 防止过期响应写入；补全期间选择器和重试按钮禁用。即使未来放开并发，写回函数也必须再次检查目标仍为 `missing`，不能用旧响应覆盖用户刚完成的手填。

### 测试策略（代码动工阶段由 test skill 落地）

- 纯函数单测：统一模式无项目；英美模式只收集 missing；忽略空源、中文释义、grammar、ready 目标；跨 POS 顺序稳定；响应匹配和不可变写回。
- 组件集成：默认源方言、全局跨 Tab 选择、单方言渲染、零请求切换、一个批次包含多 definition/example、loading 禁用、成功/部分/失败/重试、手工保护。
- 回归：语法结构仍双栏并可拖动，现有语音操作不变；保存/刷新/完成规则不变；unified 词条和 V1 编辑器不出现选择器。
- 数据源/契约：mock 多 item；API method/path/body 仍与 PENDING proposal 一致；真实能力关闭时无网络调用。
- 浏览器手测：三条以上词义、多个 POS、长文本、切换后页面无宽度跳动；慢请求期间不会出现交叉写入。

### 风险与回滚

- **自动写入的信任边界**：只写 missing，现有 ready 永不覆盖；转换来源明确标记 `converted`，预览可辨认。
- **批量请求过大**：后端上限未定；在契约确认前由 mock 验证全量批次，真实接入时按服务端上限在编排层分批，页面语义不变。
- **响应乱序/部分失败**：以 `client_id + field_kind` 匹配，不依赖数组位置；未知和重复响应跳过并计入提示。
- **源文本后改导致目标陈旧**：本轮不自动重写任何 ready 目标，这是保护手工内容的明确取舍；后续若需要“重新生成”，必须作为显式操作并展示覆盖确认。
- **真实接口未落地**：生产只提供已有 variant 切换和手填；mock 自动补全不会伪装成生产能力。
- **回滚**：恢复 `EnglishTextEditor` 双栏展示和逐字段按钮即可；wire、保存 DTO、已生成 variants 和语法结构数据均无需迁移。
