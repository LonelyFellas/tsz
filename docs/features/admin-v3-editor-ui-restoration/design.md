# Smart Lexicon V3 管理端编辑器 UI 恢复与统一创建入口技术设计文档

## 方案概述

本方案保留现有 V2/V3 契约与两套草稿编辑器，在创建前增加一个统一的两阶段编排层：`/words/new` 的 Step 1 接收一次输入，按固定空白规则归一化并分类，只调用对应 V3/V2 detection，稳定展示内置词典建议、重复项与 surface 决策，不创建草稿。只有管理员点击“创建并进入词形与发音”（需要确认时为“确认并创建，进入词形与发音”），才使用当前有效的同一 detection 调用 create，并跳转到对应原生编辑器 Step 2。

该时序是 2026-08-26 产品调整后的权威方案，替代本文早期版本的“无冲突自动 detect → create → navigate”；不要求后端、OpenAPI 或 wire contract 变化。

### 2026-08-27 Step 2 三行规则契约增量（已批准并实现）

#### 现状与缺口

V2 `WordPosFormsV2` 已持久化 `dialect_rules.spelling_mode` 与 `dialect_rules.phonetic_mode`，并支持产品图中的三种有效组合。当前 V3 `WordPosFormsV3` 只有 `forms[]`、`form_groups[]`；每个 form 的 `regional_variants.mode` 只能表达 `common` 或完整 `uk_us` 形状，不能持久化“拼写是否区分”和“音标是否区分”两个独立的管理员意图。

不能从内容相等性反推规则：管理员可能已选择“区分”，但两侧尚未填写或当前恰好相同；若前端按文本比较，刷新后会错误切回“不区分”。因此当前单一“本词性是否区分英式与美式？”只是一种降级，不满足最新产品图。

#### 选定方案：V3 POS 增加显式方言规则

在 V3 `WordPosFormsV3` 增加必填 `dialect_rules`，JSON 形状与成熟 V2 规则一致，但在 OpenAPI 中定义为 V3 正式契约，不把 V3 DTO 引用到 V2 组件或 wire 类型：

```json
{
  "pos_id": "<uuid>",
  "pos": "adjective",
  "dialect_rules": {
    "spelling_mode": "unified",
    "phonetic_mode": "distinguish"
  },
  "forms": [],
  "form_groups": []
}
```

枚举继续使用 `unified | distinguish`。合法组合及地区结构约束如下：

| `spelling_mode` | `phonetic_mode` | form 地区结构 | 约束                             |
| --------------- | --------------- | ------------- | -------------------------------- |
| `unified`       | `unified`       | `common`      | 一个通用拼写与通用发音集合       |
| `unified`       | `distinguish`   | `uk_us`       | UK/US 拼写必须相同，发音分别维护 |
| `distinguish`   | `distinguish`   | `uk_us`       | UK/US 拼写与发音分别维护         |
| `distinguish`   | `unified`       | 非法          | 后端 fail closed，不保存         |

规则属于 POS，不属于 form group。后端保存、完成、校验、发布和历史激活前必须同时验证：

1. 规则组合合法；
2. 同一 POS 下所有 concrete form 的 `regional_variants` 形状与规则一致；
3. `spelling_mode=unified + phonetic_mode=distinguish` 时每个 form 的 UK/US 拼写一致；
4. 共享 membership 不重复校验或转换同一个 form；
5. issue 定位到 `pos_id`，必要时同时带冲突 `form_id`，字段使用 `dialect_rules` 或 `regional_variants`，不暴露数据库结构。

现有“同一 POS 所有 form 必须使用同一 `regional_variants.mode`”校验继续保留，并升级为上述规则与形状联合校验。

#### 创建、存量草稿与迁移

- V3 detection/create 生成新 POS 时必须显式写入 `dialect_rules`；内置词典只有 common 证据时为 `unified/unified`，存在地区发音差异但拼写相同时为 `unified/distinguish`，拼写存在地区差异时为 `distinguish/distinguish`。
- 已存在但缺少字段的 V3 JSON 草稿不能由前端临时猜测并写回。后端迁移按现有 canonical 内容一次性补齐：`common → unified/unified`；`uk_us` 且 UK/US 拼写不同 → `distinguish/distinguish`；`uk_us` 且拼写相同 → `unified/distinguish`。这是旧数据没有显式意图时唯一可审计的确定性默认。
- 迁移不改变 form、variant、pronunciation、group 或 membership UUID，不重排数组，也不合并文本相同的地区节点。
- OpenAPI、Rust DTO/validation、前端 `@tsz/types`、api-client snapshot、fixtures 和契约测试必须同批更新；禁止手改生成快照。

#### 前端交互与代码影响

- `V3PosTab.tsx`：以 POS 的 `dialect_rules` 为受控值；首个可见变化组显示两行英美规则，后续组不重复。
- `V3FormGroupCard.tsx`：保留每组自己的“词形是否规则变化？”；接受首组的词性级规则区作为产品展示，不把规则写进 group。
- `V3ConcreteFormRow.tsx` / `operations.ts`：把现有单一 common↔uk_us 转换扩展为 POS 级三态原子转换；不弹逐 form Modal；共享 form 只处理一次；稳定 variant UUID 由身份账本提供。
- `V3WordCreationWizard.tsx` / `WordWizardV3.tsx`：保留 GET envelope 的 `retired_stable_nodes`，建立并向 forms editor 传递 variant 身份账本；canonical save 响应不带 retired 列表时不得清空本会话账本。
- `V3FormsAndPronunciationStep.tsx` / `V3PronunciationList.tsx`：直接复用 V2 `PronunciationPreviewProvider`、`PronunciationPreviewControls` 与 voice notice；Provider 只包一次 forms step，单条发音不重复加载语音目录。V3 variant 原生提供 spelling/dialect/pronunciation UUID，不做 V2 DTO 转换。
- `model.ts` / `readiness.ts`：校验本地规则、地区形状和未完成映射；服务端 issue 仍为最终权威并定位回两行规则或具体 form。
- `presentation.ts` / UI：只显示“英美拼写是否有区别？”“英美音标是否有区别？”以及“是/否”，不显示 wire 枚举、V3 或内部 ID。

交互状态机：

1. `unified/unified → unified/distinguish`：一次性把每个 common variant 复制为 UK/US；两侧初始拼写、音标和实际发音相同，新建 variant/pronunciation UUID，form UUID 不变。
2. `unified/distinguish → distinguish/distinguish`：保留两侧 variant/pronunciation UUID，只解锁英美拼写分别编辑；无需重建发音。
3. `distinguish/distinguish → unified/distinguish`：按管理员英美偏好侧的拼写覆盖为两侧共用拼写，保留两侧 variant/pronunciation UUID。
4. 任意分栏状态 → `unified/unified`：按管理员英美偏好侧选择完整 variant 作为通用内容，新建 common variant/pronunciation UUID；form UUID 不变。
5. 选择“拼写有区别”时前端同步设置音标为“有区别”；音标“否”禁用。整个 POS 在一次本地状态更新中完成转换并更新规则，不产生中间 mixed payload，也不显示转换 Modal。

该自动转换行为直接复刻 `82203e0` 的 V2 `normalizeDialectRules()`：拆分时复制 fallback variant，收敛时优先选择管理员偏好侧。规则切换不属于风险确认；真正保存时若后端 impact 要求确认，继续显示现有“确认影响并保存”产品流程。

V3 额外受稳定槽位身份约束：`AdminWordDraftV3Envelope.retired_stable_nodes` 是模式往返时的身份事实源。Wizard 载入时建立 `(form_id, common_variant|uk_variant|us_variant) → UUID` 账本，同时播种当前 active variants 与 retired variants；本会话新建的 variant ID 也立即写入账本。common↔uk/us 再次出现时必须复用账本 ID，不能重新调用随机 UUID。pronunciation 在后端不是 stable slot，复制时仍生成新 UUID。

#### 不选方案

- **按 UK/US 文本是否相等推导两个开关**：无法保存用户意图，空白或暂时相同内容会在刷新后变状态。
- **继续使用一个总开关**：不能表达“拼写相同、音标区分”，与产品图和 V2 已验证能力不一致。
- **只加前端本地字段**：保存、刷新、历史和另一管理员会话均丢失，不是领域能力。
- **把 V3 forms 转成 V2 `WordPosFormsV2`**：破坏多个 base、同类型多条、共享 membership 和稳定 V3 身份，继续禁止。

#### 测试与验收增量

文档批准后，写测试代码前先用 test skill 扩展测试矩阵，至少覆盖：三种有效组合、非法组合、四条转换路径、取消/脏状态、共享 form、多个 base、多发音、保存读取回显、历史草稿迁移、服务端 issue 定位，以及 390/768/1024/1440 和键盘操作。

本节是对原设计“完全不改后端/OpenAPI/wire”的明确例外，已完成评审、批准与实现：后端已落正式契约并导出 OpenAPI，前端已同步类型、业务实现与测试。

### 2026-08-26 原形与关联词数据边界补充（已批准并实现）

只读核对 `tsz-rust` 当前实现后，数据边界分为“已经满足”和“需要后端改造”两部分：

1. `LexiconRepository::surface_sources` 已同时读取 draft 与 current publication surface，并由 source 自身携带 `pos` / `form_type`；查询没有要求目标已发布，也没有限制与输入相同词性。前端 presenter 继续只筛 `form_type=base`，接受草稿和其他词性候选，不新增状态或词性过滤。
2. `LexiconRepository::related_search` 已从 `entry.current_publication_id` 连接 publication snapshot，并排除 archived entry，因此关联词搜索候选已经只返回未归档的当前发布词条；这一查询约束必须保留并补契约回归。
3. 当前保存/发布校验仍通过 `resolve_relation_targets(_for_publish)` 左连接 current publication；目标 sense 不在 publication 时会回退读取 draft meanings。migration `20260822150000_allow_publication_relations_to_draft_targets` 还允许 `entry_publication_sense_refs.target_content_scope='draft'`，集成测试明确保证“已发布来源可以指向草稿目标”。这与最新产品规则冲突，必须在后端修正，前端隐藏候选不能替代服务端权威校验。

后端改造建议作为独立阶段实施：

- related-search 查询与响应结构保持不变；继续只返回 current publication 中的 sense。
- 保存绑定关联时只接受 target current publication 中存在的 sense；草稿、已归档或不在 current publication 的目标返回产品化 validation issue。复用现有 issue 结构，新增明确 code 时同步 Rust DTO、OpenAPI 和前端中文映射，禁止返回内部 SQL/UUID 细节。
- 发布时在同一事务和锁边界重新读取 target current publication，防止候选选择后目标撤回发布、归档或换版造成 TOCTOU；目标变化则 fail closed，不写 publication reference。
- **已被取代（2026-08-29）：**原“来源发布事务禁止自动物化、必须先选择已发布目标”的设计不再
  生效。当前批准方案允许 `pending_target_headword` + 可选 `pending_target_gloss` 在发布事务中
  自动匹配或物化目标草稿；成功后必须同步 canonical editor JSON 与关系投影并清除 pending。
- **已被取代（2026-08-29）：**原 publication-only migration 及删除“publication relation can target draft”测试的行动项不再执行；pending 发布时物化允许来源 publication 指向新建目标草稿的正式义项。
- 当前迁移与测试规则覆盖 pending 保存不建条、发布事务自动匹配或物化、canonical editor JSON 与关系投影同步清除 pending，以及发布后 GET、再次保存和重复发布；OpenAPI 与前端中文映射保持同一合同。

该产品决定已完成评审与前后端实现，不再处于“等待批准/等待 OpenAPI”状态；后续以
`pending-relation-predefined-gloss` 文档、当前 Rust OpenAPI 与回归测试为权威。

### 2026-08-26 原形优先展示修订（最新口径）

本节覆盖本文所有与之冲突的 Step 1 建议卡设计。统一入口不再把 `BuiltinDictionaryEvidenceV3` / `BuiltinDictionaryMatchedV2` 展开成词性、词形和发音建议矩阵，而是建立以下 schema-aware 只读展示模型：

实现参考固定为 `d707328` 的 `CreateEntryStep.tsx` 与同提交 `word-creation.css`，不是当前 `HEAD` 后续调整后的相似实现：

- 外层继续使用 `word-basics-result-grid`；沿用原提交的单列默认布局与 `@container word-creation-content (min-width: 1080px)` 左 `0.82fr` / 右 `1.18fr` 双栏规则。
- 左侧直接复用 `word-detection-result-card`、`Descriptions` 字段顺序、`word-smart-match-summary(-entry/-row)`、生命周期 Tag、“查看重复词条”和上下文详情结构；base form presenter 只负责筛选/分组数据，不另造视觉组件。
- 右侧直接复用 `word-headword-confirmation-card`、`word-dialect-detection-row`、`dialect-panel-uk/us` 和 BrE/AmE 内容层级。V2 保留正式 headwords 编辑能力；V3 使用相同静态层级展示 base form variants，但不复用 V2 wire 类型，也不渲染无法持久化的交互控件。
- 删除统一入口当前自创的 `DictionarySuggestionCard` 详情矩阵；不再显示“确认英美主词与词形”“已找到内置词典建议”、逐词性 form cards、音标或发音 style。

```ts
type DetectedBaseForm = {
  key: string;
  schemaVersion: 2 | 3;
  entryId: string;
  formId: string;
  entryLabel: string;
  status: "draft" | "published" | "archived";
  matchedSpellings: string[];
};

type RegionalBaseForm = {
  source: "database" | "builtin_dictionary";
  uk?: string;
  us?: string;
  common?: string;
};
```

数据流如下：

1. detection 仍走现有 V3 word / V2 phrase 契约，并使用 `useSurfaceSnapshotAny` 顺序加载完整 snapshot；不新增数据库直连、OpenAPI 字段或后端查询端点。
2. 从 snapshot items 中只提取现有 source 为 form/form variant 且 `form_type=base` 的记录；V3 用 `entry_id + form_id`、V2 用 `word_id + source_node_id` 去重，保留首次出现顺序。headword、非 base form 和 relation-derived 项不进入原形列表。
3. 左栏按旧版重复词条摘要结构渲染全部 `DetectedBaseForm`，不显示 `entry_id`、`form_id`、schema version 或原始枚举；可见内容为命中拼写、生命周期状态、“查看重复词条”和旧版上下文信息。顶部 Descriptions 仍按 `d707328` 显示词条类型、重复检测与响应可提供的建议词性。
4. 候选非空时取第一项，不增加候选选择器。通过既有 admin word detail 请求读取该词条 canonical 数据，并以候选自己的稳定 form id 定位原形：V3 读取该 concrete form 的全部地区 variants；V2 读取对应 base form variants。右栏按旧版 BrE/AmE 地区面板显示英式/美式（或通用）拼写，不展示其他词形、音标或发音建议。
5. 候选为空时不发详情请求，右栏回退内置词典：V2 从 `headwords` 取值；V3 从 response-order 第一条 `form_type=base` 建议的 regional variants 取值。`common` 同时填充英式和美式展示。
6. 存在候选但详情请求失败或稳定 form id 无法定位时 fail closed：保留左栏，右栏显示产品化错误与重试操作，创建按钮禁用；不得回退内置词典掩盖数据库证据不完整。
7. 智能词库 duplicate、surface acknowledgement、snapshot expiry、detection expiry 与幂等创建规则保持不变。确认创建继续提交原生 detection/token，展示模型从不参与 create body。

该方案复用现有 surface snapshot 与详情接口，不修改后端、OpenAPI 或 wire contract，也不把 V3 数据转换成 V2 组件/DTO。代价是命中数据库原形时增加一次详情读取；这是获得同一原形完整英美 variants 所必需的，因为现有 surface item 只保证携带命中的单个 variant。

V3 编辑器不复用 V2 数据组件，也不做 V3 → V2 转换。改造集中在 V3 的呈现层和布局层：保留现有 `model.ts`、`operations.ts`、`saveFlow.ts`、`readiness.ts`、API identity guard、稳定 UUID 和请求时序；通过中文展示映射、分层卡片、摘要侧栏、统一操作区、响应式 CSS 和可访问名称，让 V3 原生组件使用已经在 V2 Admin 中验证过的产品语言。

不选择以下方案：

- **继续保留两个创建按钮**：仍会把版本分流暴露给管理员，违背唯一入口目标。
- **在统一页先让用户选择单词/短语**：只是把两个按钮换成选择器，没有解决产品问题。
- **检测完成后自动创建并跳转**：建议卡只短暂闪现，新路由还会经过 detail loading，管理员无法在创建前稳定核对建议，也会产生明显页面闪动。Step 1 应保持为创建前检测区，Step 2 才代表词条已经建立。
- **只显示内置词典 matched/not_found**：丢失英美主词、基本词性、词形和音标建议，是明确的产品能力退化。
- **将 V3 映射成 V2 wizard**：无法无损表达多 base、一形多组、同类型多词形、多发音和稳定 membership，明确禁止。
- **重做一套 V3 状态模型**：现有 V3 save/dirty/conflict/impact/publish 状态机已有完整覆盖；本次只改呈现与创建编排，避免扩大风险。

## 现状证据

### 创建入口与路由

- `apps/admin/src/features/dictionary/SmartDictionary.tsx` 当前将“创建单词”导航到 `/words/new/v3`，将“创建短语”导航到 `/words/new?kind=phrase`。
- `apps/admin/src/router.tsx` 当前把 `/words/new` 限定为 V2 phrase 兼容入口，非 phrase 会重定向到 `/words/new/v3`。
- `apps/admin/src/pages/WordCreateV3.tsx` 单独挂载 `V3CreateEntryStep`，成功后进入 `/words/:id/v3/wizard/forms`。
- `apps/admin/src/features/dictionary/word-creation/CreateEntryStep.tsx` 已包含 V2 检测、词典建议、重复项、完整 surface snapshot 和 V2 创建能力，但当前要求先点击“词典检测”再点击创建。
- `apps/admin/src/features/dictionary/word-creation-v3/V3CreateEntryStep.tsx` 已包含 V3 检测、surface snapshot、幂等创建和过期响应保护，但文案与流程直接暴露 V3、检测和工程状态。
- V3 detection 的 `BuiltinDictionaryEvidenceV3` 在 `matched` 时已正式包含 `suggested_pos`、`suggested_forms`、`coverage`、`provenance`、地区拼写与多条发音证据；`docs/features/smart-lexicon-v3/requirements.md` 的“新建与检测”第 2 条也明确要求返回词典证据、已有 surface 候选和建议词性/词形。后端能力与契约没有丢失。
- 回归发生在新建的 `V3CreateEntryStep.tsx`：它从零实现了最小 detect/create/idempotency/surface 状态机，却把全部内置词典 evidence 压缩成 `内置词典：${detection.builtin_dictionary.status}`，没有迁移 V2 `CreateEntryStep` 的英美主词确认、建议词性、词形和音标展示。V3 create DTO 只接受 `detection_id`，因此建议应用必须继续由后端 canonical 创建结果承载，前端不能另造建议写入 DTO。
- 现有 `V3CreateEntryStep.test.tsx` 主要保护请求身份、异步过期、创建幂等与 surface acknowledgement；fixture 默认多为 `not_found`，没有断言 `matched` 建议的产品化内容、`unavailable` 与 `not_found` 的差异，也没有建立 V2/V3 建议 UI parity。质量门因此能证明状态机正确，却不能发现产品能力退化。
- `d707328` 将列表入口收敛成“创建词条”；`49e3bdc` 又明确拆分成两个按钮并更新单元/e2e 断言。恢复唯一入口应作为新的产品决策实现，而不是以冲突修复名义回滚整个 V3 提交。

### V3 编辑器

- `V3WordCreationWizard.tsx` 已集中管理 canonical word、forms/meanings dirty、revision 冲突、影响确认、问题导航、异步命令互斥和步骤切换。
- `operations.ts` 与 `model.ts` 已按稳定 UUID 实现 POS、变化组、共享关系、词形、地区变体、发音及 meanings 节点操作。
- `V3WordCreationLayout.tsx` 当前只有标题、英文状态、`Smart Lexicon V3 · revision`、Steps、问题列表和单列内容。
- `v3-layout.css` 与 `v3-forms.css` 合计约 77 行；V2 `word-creation.css` 约 2199 行，已包含摘要侧栏、步骤状态、卡片层级、操作区和多档响应式经验。
- forms 组件目前直接显示 `concrete form`、`membership`、原始 form type 与 UUID 尾段；meanings/examples 的大量 `aria-label` 拼入原始 ID。
- preview/publish 当前显示原始 form type、dialect、node type、node ID、blocked code；publication history 还提供完整 publication JSON。

### 契约边界

- `packages/types/src/admin-word-v3.ts` 已正式表达 `forms[] + form_groups[].members[]`、多 pronunciation、stable node location、impact、validation、publication 和 lifecycle 语义。
- `packages/api-client/src/admin-word-schema.ts` 与 `apps/admin/src/features/dictionary/word-creation-v3/api.ts` 已在响应 schema、请求路径身份、entry/publication 身份不一致时 fail closed。
- V2/V3 共用 `/lexicon/detections`、`/lexicon/entries` 和 surface snapshot 路径，通过正式 discriminator 与显式客户端方法区分。
- 本功能不需要也不允许修改 `@tsz/types`、`@tsz/api-client` OpenAPI snapshot 或后端。

## 总体架构

```mermaid
flowchart TD
  list["智能词库列表\n唯一按钮：创建词条"] --> create["/words/new\n一次输入"]
  create --> normalize["trim + 折叠内部空白"]
  normalize --> classify{"归一化后是否含空格"}
  classify -->|否| v3detect["V3 word detection"]
  classify -->|是| v2detect["V2 phrase detection"]
  v3detect --> v3suggest["Step 1 稳定展示内置词典建议"]
  v2detect --> v2suggest["Step 1 稳定展示内置词典建议"]
  v3suggest --> v3decision{"智能词库 / surface 需要确认？"}
  v2suggest --> v2decision{"智能词库 / surface 需要确认？"}
  v3decision -->|否| ready["显示：创建并进入词形与发音"]
  v2decision -->|否| ready
  v3decision -->|是| confirm["产品化重复项 / surface 确认"]
  v2decision -->|是| confirm
  ready -->|管理员明确点击| branch{"检测分支"}
  branch -->|V3 word| v3create["幂等创建预填 V3 word 草稿"]
  branch -->|V2 phrase| v2create["幂等创建预填 V2 phrase 草稿"]
  confirm -->|确认并创建 V3| v3create
  confirm -->|确认并创建 V2| v2create
  v3create --> v3editor["/words/:id/v3/wizard/forms\nV3 原生编辑器"]
  v2create --> v2editor["/words/:id/wizard/forms\nV2 phrase 编辑器"]
```

统一只发生在“草稿创建前”。草稿建立后仍以 `schema_version` 和 `kind` 进入各自的原生编辑、保存、校验与发布路由，不建立跨版本公共编辑 DTO。

## 统一创建入口设计

### 路由决策

- `/words/new` 改为唯一 canonical 产品入口，挂载统一创建页。
- `/words/new?kind=word` 与 `/words/new?kind=phrase` 不再决定 UI；兼容访问时仍进入同一页面，由真实输入分类。
- `/words/new/v3` 保留为兼容路由并重定向到 `/words/new`，不再渲染独立 V3 创建 UI。
- 草稿创建后的路由保持不变：
  - V3 word：`/words/:wordId/v3/wizard/:step`
  - V2 phrase：`/words/:wordId/wizard/:step`
- 列表、空状态、返回入口和测试全部只生成 `/words/new`。

这样可以删除创建前的版本分流，同时避免改动已保存书签中的编辑路由。兼容创建深链不携带词条文本，因此不会绕过统一分类。

### 输入归一化与分类

新增无副作用纯函数，使用同一个结果做校验、分类、请求和回显：

```ts
export type ClassifiedEntryInput = {
  normalized: string;
  kind: "word" | "phrase";
};

export function classifyEntryInput(raw: string): ClassifiedEntryInput {
  const normalized = raw.trim().replace(/\s+/gu, " ");
  return {
    normalized,
    kind: normalized.includes(" ") ? "phrase" : "word"
  };
}
```

实现时的约束：

1. 空值和字符集校验在网络请求前执行；现有 `headwordIssue` 复用，但接收归一化后的值。
2. 长度限制按归一化结果计算，避免多个粘贴空白制造错误分类。
3. `-`、ASCII `'` 与弯撇号 `’` 不参与分词；只有折叠后真实存在的半角空格决定 phrase。
4. 归一化结果是本次 detection 的唯一输入。输入框可以在提交时同步显示归一化值，避免用户看到的内容与请求不同。
5. 后端 normalized surface/headword 仍是落库权威；若响应 request echo、kind 或 entry_kind 与本次分支不一致，沿用 fail-closed 策略并提示“词条检查结果不一致，请刷新后重试”，不自动改走另一分支。

### 创建状态

统一创建组件使用互斥的判别状态，避免 V2/V3 结果串流：

```ts
type UnifiedCreateState =
  | { phase: "editing" }
  | { phase: "checking"; request_id: symbol; kind: "word" | "phrase" }
  | { phase: "ready"; branch: V2Preparation | V3Preparation }
  | { phase: "confirming"; branch: V2Confirmation | V3Confirmation }
  | { phase: "creating"; kind: "word" | "phrase" }
  | { phase: "error"; recovery: "retry" | "edit" | "reload" };
```

这里的 `request_id` 仅为组件内过期响应隔离，不进入 wire 或 UI。实现继续使用 mounted/generation ref 与同步 in-flight lock，React state 只负责渲染，不单独承担防双击。

状态规则：

- 修改输入：递增 generation，清空 detection、surface snapshot、确认和创建 key，回到 `editing`。
- 首次提交：只建立 detection generation，进入 `checking`；此时不生成 create 请求，也不导航。
- detection 完成：进入 `ready`，稳定渲染产品化建议摘要；matched 说明创建后将采用的建议，not_found 明确说明将创建空白草稿，unavailable 或建议无法安全解释则停止。
- 无智能词库/surface 警告：停留在 `ready`，显示“创建并进入词形与发音”。只有用户明确点击后才生成/复用创建幂等键并进入 `creating`。
- 有警告：进入 `confirming`；完整 snapshot 到达且可确认前禁用主操作。
- 确认：用户点击“确认并创建，进入词形与发音”后，复用当前 detection 和终页 token 创建，不重复发送无意义检测。
- detection/snapshot 过期或 policy changed：旧结果和创建主操作失效，回到需要重新检测的状态；不得静默重新检测后直接创建。
- 网络未知结果：保留现有幂等 key 进行原样重试；只有正式错误要求新 key 时才更换。
- 创建成功：立即按响应中的 `schema_version/kind/id` 导航，不从输入猜测目标详情路由。

### V3 word 分支

复用 `createV3WordRequests()`：

1. `detect({ schema_version: 3, language: "en", kind: "word", surface })`；
2. 校验 response echo 与本次 normalized input；
3. `builtin_dictionary.status=matched` 时从 `suggested_pos` 和 `suggested_forms` 构造只读产品摘要：从 base form 的地区变体展示英式/美式“建议拼写”，按词性目录展示基本词性，按业务标签展示词形/地区，并汇总词典音标、实际发音与发音方式；不显示 provider、provenance、coverage 原始结构或枚举值，也不把建议拼写生成领域唯一主词或 legacy compatibility；
4. `not_found` 时展示“未找到词典建议，将创建空白草稿”；`unavailable` 时阻断并提供重试，不把不可用当未命中；
5. `requires_acknowledgement=false` 时只进入可创建状态；点击“创建并进入词形与发音”后才调用 `createV3(idempotencyKey, { schema_version: 3, detection_id, kind: "word" })`，由后端使用该 detection 生成 canonical 预填 forms；前端不把建议翻译成 V2 或自行拼装 V3 write DTO；
6. 需要确认时继续使用 `useSurfaceSnapshotAny` 顺序加载完整 V3 snapshot，只在终页 token 有效且用户点击最终主操作时提交 `confirmed_surface_match_token`；确认页同时保留建议摘要，但两者分别标记为“将预填内容”和“已有词条提醒”；
7. 创建成功只接受 V3 envelope，并进入 V3 forms；导航 state 只携不含 ID 的来源提示，编辑器以 response canonical forms 为事实源，显示“已根据内置词典预填，请核对”；
8. 继续保留 idempotency conflict、surface confirmation、snapshot expired、policy changed、503 和 runtime schema 错误的现有安全处理。

### V2 phrase 分支

复用当前 `useDetectWordV2`、`useCreateWordV2`、词性目录和 `useSurfaceSnapshot`：

1. 向 V2 detection 提交归一化 `headword`；
2. 要求 response `entry_kind === "phrase"` 且 request echo 一致，否则 fail closed；
3. `builtin_dictionary.status=matched` 时使用后端返回的 headwords 与建议，不再要求用户重复输入；`not_found` 时使用 `{ mode: "unified", common: normalized }`；
4. matched 时使用与 V3 相同的信息层级展示英美主词、词性、词形和发音建议；不显示 V2、原始状态或内部 ID；
5. 保留现有词性目录完整性校验，检测建议引用未知词性时不得自动创建；
6. `smart_dictionary.status=clear` 时允许创建 V2 phrase 但停留在 Step 1 等待明确点击；warning 时完整加载 V2 surface snapshot 后显示统一确认；blocked 时说明不能继续；
7. 创建输入仍只提交正式的 `detection_id`、确认后的 `headwords` 和可选 surface token，不新增前端契约；suggested forms 继续由后端按 detection 应用；
8. 成功后进入 V2 phrase forms，并通过导航 state 展示不含 ID 的“已根据内置词典预填，请核对”提示；后续 editor 完全沿用现状。

统一入口保留一次明确的“进入 Step 2”动作；该动作同时是创建边界，不取消 V2/V3 后端建议、建议摘要、词性约束、surface 策略或创建幂等。

### 自动检测、建议预填与冲突确认的边界

三类状态不得折叠成一个“检测结果”：

1. **词典检测**负责取得后端权威的 normalized input、内置词典建议、智能词库匹配和 surface 决策。它由输入框内“词典检测”或 Enter 触发，只读不写。
2. **建议预填**回答“新草稿会带入什么”。`matched` 对 V2 展示正式英美主词，对 V3 展示 base form 地区建议拼写，并共同展示词性、词形和发音；`not_found` 说明为空白草稿；展示模型只读且 schema-aware，创建仍只提交正式 detection 引用，由后端生成 canonical 草稿。
3. **冲突确认**回答“已有相同/相似词条时是否继续新建”。智能词库 duplicate 按现有规则阻断，warning/surface acknowledgement 加载完整快照并等待明确确认，clear 进入普通可创建状态。普通词典命中不是冲突，不产生风险确认。

建议卡在 detection 返回后立即渲染，并稳定保持在 `ready` / `confirming`；创建请求期间继续保留原页面结构并锁定操作，不切换成临时结果页。创建成功后，目标编辑器用一次性 navigation state 显示来源提示，而实际预填内容以创建响应中的 canonical forms/headwords 为准。刷新后即使提示消失，字段内容仍完整保留；不得把 navigation state 当成保存依据。

### 产品化确认视图

V2/V3 的原始 match 类型不同，确认卡使用现有 `surfaceSnapshot.ts` 生成的 schema-aware 产品视图，不做 V3 → V2 wire 转换。共同呈现字段为：

- 展示名称；
- 单词/短语；
- 草稿/已发布/已归档；
- 命中词面与业务原因；
- 响应可提供的词性、释义预览和关联来源；
- 已加载数量/总数；
- 继续创建的影响说明。

snapshot ID、cursor、token、policy name/epoch、schema version、word/sense/form ID 不进入可见文本或 aria name。技术信息只保留在请求上下文和测试 fixture。

重复候选按 entry 身份在展示层归并：同一词条命中主词、词形或发音等多个类别时显示一张候选卡和多个中文原因标签；详情抽屉/弹窗只展示契约已经提供的产品字段，不为了“详情”请求新后端接口，也不回退展示原始 ID 或 JSON。V2 duplicate 无 match category 时不伪造原因，V2/V3 surface snapshot 有 category/context 时按既有优先级展示。

## V3 编辑器呈现设计

### 保留与改造边界

保持原样或只做必要接线：

- `model.ts`：V3 wire ↔ 可写 meanings 视图、stable node identity；
- `operations.ts`：POS/group/member/form/variant/pronunciation 的原子操作；
- `saveFlow.ts`：命令互斥、supersede、canonical replacement；
- `readiness.ts`：步骤完成度与问题聚合；
- `problem.ts`：错误分类；
- `api.ts`：schema 与 path identity guard；
- `V3WordCreationWizard.tsx` 中的 canonical/dirty/conflict/impact/publish 状态语义。

重点改造：

- `V3WordCreationLayout.tsx` 与 `v3-layout.css`：产品外壳、侧栏、状态、操作区、响应式；
- forms 子组件与 `v3-forms.css`：中文层级、矩阵、复用关系、地区与发音；
- `V3MeaningsAndExamplesStep.tsx`：卡片层级、中文 label、序号、可访问名称；
- `V3PreviewAndPublishStep.tsx`：业务预览、校验/影响/发布文案；
- `V3PublicationHistory.tsx`：业务历史与详情，移除原始结构展示。

### 中文展示映射

在 `word-creation-v3` 内新增单一呈现映射模块，供 forms、meanings、preview 和 history 使用。它只把正式枚举/状态映射为中文，不改变 wire 值：

| 内部值/概念                  | 产品文案                                  |
| ---------------------------- | ----------------------------------------- |
| `concrete form`              | 词形                                      |
| `membership`                 | 在变化组中使用 / 复用已有词形             |
| `base`                       | 原形（允许多条，不附加“唯一”语义）        |
| `third_person_singular` 等   | 第三人称单数 / 现在分词 / 过去式等        |
| `common` / `uk` / `us`       | 通用 / 英式 / 美式                        |
| `normal` / `strong` / `weak` | 常规 / 强读 / 弱读                        |
| draft/published/archived     | 草稿 / 已发布 / 已归档                    |
| sentence link `role`         | 主关联 / 上下文关联                       |
| definition mode              | 中文释义 / 中文例句 / 英文释义 / 英文例句 |
| publication block code       | 可理解的发布受限原因                      |
| impact node type             | 词形 / 发音 / 词义 / 例句 / 发布内容等    |

词性优先从现有词性目录读取 `name_zh`。未知枚举或后端新增 code 不直接显示原值，使用“未识别类型”“存在受影响内容”等安全兜底，并保留日志/内部对象用于诊断。

### 外壳与侧栏

桌面布局采用 `aside + main` 两列：

- 页头：返回智能词库、词条展示名、中文状态、未发布修改提示；不显示版本名或 revision。
- 侧栏：创建信息摘要、四步导航、完成/待处理计数、保存状态。
- 主区：当前步骤标题、说明、步骤级问题、编辑卡片和操作栏。
- 问题列表以业务分组去重；同一个稳定 issue 可以同时驱动侧栏计数和步骤定位，但只在一个主要位置展开全文。
- archived 或只读 publication view 仍使用同一外壳，通过清晰只读提示和禁用操作表达，不靠灰色状态代码。

现有 Steps 可以保留为视觉组件，但数据来源统一为 `STEP_ORDER + readiness + dirtySteps`，避免 Steps、侧栏和内容各自推导状态。

### forms 层级

渲染结构保持 V3 原生关系：

```text
词性
└── 词形变化组 1..n
    ├── 新增词形
    ├── 复用已有词形
    └── 组内词形顺序
        └── 词形（稳定 form id）
            ├── 词形类型
            ├── 通用 或 英式+美式
            └── 每个地区 0..n 条发音
```

实现规则：

- `forms[]` 仍由 POS 拥有，group 仍只保存稳定 member；组件不能把同一 form 复制成多个对象。
- 同一个 form 在多个组出现时编辑同一个 canonical form；视觉上以“已在 2 个变化组中使用”提示，不显示关系 ID。
- 同类型多条使用 form ID 作为 key，当前显示序号只作为标题。
- 移除最后一个关系时继续拒绝普通移除，并提供“删除该词形及其所有使用位置”的影响确认。
- 地区结构切换继续使用现有显式 mapping/确认逻辑；确认卡显示将保留/覆盖哪些拼写和发音，不显示 variant ID。
- pronunciation 继续按稳定 ID 排序；序号变化不重铸 ID。
- 表单定位保留 `data-v3-node-id` 等非展示属性；按钮 aria-label 使用“上移词形 2”“删除第 1 条发音”等视图序号。

### meanings/examples 层级

- 每个 POS 为一级分区；sense group、grammar structure、sense、definition、sentence、relation 使用有序 Card/Collapse。
- 标题按当前可见顺序生成，例如“语法结构 1”“释义 2”“例句 1”；ID 仅用于 key、数据更新和 issue location。
- 核心字段在卡片首层，高级关系与来源范围按需展开，避免 1000 行表单在视觉上完全平铺。
- Select option 的 `value` 保持稳定 ID/code，label 使用中文业务名；管理员不能编辑 value。
- 例句主关联保持锁定语义，上下文关联继续可编辑；`role` 不进入 UI。
- 删除、排序和折叠只改变数组顺序或显式节点操作，不根据序号重新生成节点。
- `issueNavigation.ts` 继续根据 stable node location 找目标；呈现层根据目标计算当前序号和中文 breadcrumb。

### 核对、发布与影响确认

- 预览从 canonical `AdminWordV3` 派生只读业务卡，不序列化原始对象。
- forms 预览按“词性 → 变化组 → 词形 → 地区/发音”展示；共享词形可提示被多个组使用，但只展示一次详细内容。
- meanings 预览按“词性 → 词义 → 定义/例句/关联”展示。
- 校验 issue 按步骤/业务节点中文聚合；点击继续使用 stable node location 导航。
- impact 不显示 `node_type + node_id`，而是按中文类别计数并展示后端可理解原因；未知 reason 使用中性兜底。
- publication capability block code 经映射后呈现，不直接显示 code。
- validate → impact/surface confirmation → publish 的请求顺序、base revision、幂等 key 与失败恢复保持现状。

### 发布历史与生命周期

- 历史列表显示“第 N 次发布”、展示名称、发布时间、发布人和“当前版本”；不显示 V2/V3 badge 或 revision。
- 详情根据 snapshot 的 schema discriminator 使用各自只读 presenter，但输出统一业务结构。
- 删除 `PublicationStructureSnapshot` 的 UI 入口，不渲染完整 JSON。
- V2 历史继续永久只读；符合现有 capability 的 V3 历史继续允许激活。
- 激活仍受 unsaved changes、surface confirmation、idempotency、revision/lifecycle revision 和 409 canonical refresh 保护。
- 归档/恢复继续由列表当前 lifecycle command 提供；V3 archived 详情保持只读，不新建第二套归档入口。

## 响应式布局

响应式规则集中在 V3 CSS，不把 viewport 判断写进数据组件：

| 宽度   | 外壳                                           | 复杂字段                                                | 操作区                           |
| ------ | ---------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| 1440px | 限宽容器；约 260–280px sticky 侧栏 + 弹性主区  | 英美双栏；发音行保持矩阵；多列摘要                      | 右对齐、可 sticky                |
| 1024px | 约 240px 侧栏 + `minmax(0, 1fr)` 主区          | 英美双栏按内容收缩；长 label 换行                       | 保持一行优先，空间不足换行       |
| 768px  | 单列；摘要移到内容上方或可展开                 | 英美、发音、Descriptions 降为单列                       | 主次操作换行，主操作仍明确       |
| 390px  | 12–16px 页面内边距；单列卡片；无页面级横向滚动 | Tabs 可滚动但内容不横滚；输入、Select、按钮占满可用宽度 | 底部操作安全换行，不遮挡最后一项 |

所有 Grid/Flex 子项设置 `min-width: 0`，长词面、错误文案、标签和按钮允许换行。只允许 Ant Tabs 自身的受控横向滚动，不允许整个页面或表单矩阵横向滚动。

## 键盘与基础无障碍

- 统一输入使用真实 label；Enter 与点击主按钮触发同一 submit handler。
- 提交、检查和创建期间主按钮使用 loading/disabled 与同步 ref 双重互斥。
- antd Tabs、Select、Collapse、Modal 保持组件原生键盘行为，不用点击 div 替代按钮。
- 所有 icon-only 排序/删除按钮提供中文 aria-label，按当前业务序号描述且不包含 UUID。
- 错误摘要使用可感知区域；提交失败后焦点进入摘要，点击问题后聚焦具体字段。
- Modal 打开后焦点限制在确认区，关闭后回到触发控件。
- 状态同时使用文字/图标/结构，不只依赖颜色。
- DOM 中可用于定位的 `data-*` ID 不进入可访问名称；测试不得再以原始 UUID 作为面向用户断言。

## 数据流与时序

### 统一创建

1. 用户编辑 raw input；本地只保留输入，不预请求。
2. 检测提交：归一化 → 校验 → 分类 → 建立 detection generation；不生成草稿、不切路由。
3. 按 kind 调用对应 detection；校验 response echo/discriminator，并把内置词典 evidence 映射成不含工程字段的建议摘要。
4. matched/not_found 且可安全继续时展示建议摘要；unavailable、未知必需词性或契约异常停止并反馈。
5. 智能词库 clear/无需 surface 确认：显示“创建并进入词形与发音”；warning：在保留建议摘要的同时加载完整 immutable snapshot 并显示确认创建操作；duplicate/blocked/error：停止并反馈。
6. 用户点击进入 Step 2：确认 detection/snapshot 仍有效，建立或复用 idempotency key，调用对应 create。若已过期则停在 Step 1 并要求重新检测。
7. 创建成功使用 response canonical word 决定路由，并传递仅用于来源提示的 navigation state；导航前释放离开保护。
8. 组件卸载或输入改变后，所有旧 promise 结果因 generation 不匹配被丢弃。

### V3 编辑与保存

1. detail GET 返回 canonical V3 draft，wizard 以 `word.id` 为 session key 初始化 forms/meanings。
2. UI 修改只更新对应稳定节点并设置步骤 dirty；presentation 序号不写回。
3. forms 保存前仍执行 impact；无影响直接保存，有影响/surface warning 等待确认。
4. save 成功以 response 替换 canonical、清对应 dirty 并更新 readiness；冲突时保留本地草稿。
5. validate issues 通过 stable node location 驱动步骤、POS、祖先卡片展开和字段聚焦。

### 发布与历史激活

1. 发布页先检查 dirty，再请求 validate。
2. valid 后按现有 V3 流程处理 impact/surface context，再幂等 publish。
3. history 以 entry ID 列表、以 publication ID 取详情；ID 只在请求和内部 key 中使用。
4. 激活前检查 dirty/capability，必要时确认 surface；409 或确认上下文失效后并行刷新 canonical 与 history，再允许下一次操作。

## 代码影响范围

### 列表、路由与页面

- `apps/admin/src/features/dictionary/SmartDictionary.tsx`
  - 两个创建按钮收敛为“创建词条”，只导航 `/words/new`。
- `apps/admin/src/router.tsx`
  - `/words/new` 改为统一入口；`/words/new/v3` 改为兼容重定向；移除 query kind 对产品路由的控制。
- `apps/admin/src/pages/WordCreate.tsx`
  - 挂载统一创建流程，并按创建响应进入 V3 word 或 V2 phrase 编辑路由。
- `apps/admin/src/pages/WordCreateV3.tsx`
  - 不再渲染独立创建 UI；若路由层直接重定向后成为本次改动产生的孤儿，则删除该页面及只属于它的测试。
- `apps/admin/src/features/dictionary/wordRouting.ts`
  - 仅在现有 schema-aware 编辑路由辅助需要时调整；保持已创建词条按 schema 路由。

### 统一创建流程

- 新增 `apps/admin/src/features/dictionary/word-creation/entryClassification.ts`
  - 归一化、分类与纯函数边界。
- 新增 `apps/admin/src/features/dictionary/word-creation/UnifiedCreateEntryStep.tsx`
  - 统一编排 V2/V3 detection、Step 1 稳定建议摘要、显式进入 Step 2 时的预填创建、智能词库/surface 确认和幂等恢复；展示模型按 schema 分支构造，不修改 wire。
- `apps/admin/src/features/dictionary/word-creation/CreateEntryStep.tsx`
  - 保留为 V2 既有能力参考；若统一入口落地后无调用方，不扩大本次范围做无关重构。
- `apps/admin/src/features/dictionary/word-creation/WordCreationWizard.tsx`
  - create mode 接受 V2/V3 创建结果并在进入 V2 内部状态前显式缩窄；resume/edit 仍只处理 V2。
- `apps/admin/src/features/dictionary/word-creation-v3/V3CreateEntryStep.tsx`
  - 将其可靠的 generation、幂等、surface 确认和错误处理迁入统一入口；迁移完成且无调用方后删除，避免保留第二套 UI。
- `apps/admin/src/pages/WordWizardV3.tsx` 与 V2 wizard 页面
  - 消费一次性 navigation state，显示“已根据内置词典预填，请核对”或“未找到词典建议，已创建空白草稿”；保存数据仍只来自详情响应。
- `apps/admin/src/features/dictionary/surfaceSnapshot.ts` 与 `useSurfaceSnapshot.ts(x)`
  - 优先直接复用；只有统一确认视图确有缺失的纯展示字段时才做最小扩展，不改变 snapshot/token 语义。

### V3 编辑器呈现

- 新增 `apps/admin/src/features/dictionary/word-creation-v3/presentation.ts`
  - 集中维护中文枚举、状态、能力阻断和影响类别映射；不产生 wire 转换。
- `apps/admin/src/features/dictionary/word-creation-v3/V3WordCreationLayout.tsx`
  - 页头、摘要侧栏、步骤完成度、dirty/冲突/问题区和外壳结构。
- `apps/admin/src/features/dictionary/word-creation-v3/v3-layout.css`
  - 两列/单列外壳、侧栏、卡片、操作区与 1440/1024/768/390 响应式规则。
- `apps/admin/src/features/dictionary/word-creation-v3/v3-forms.css`
  - 词性、变化组、词形、英美矩阵、发音行和移动端布局。
- `apps/admin/src/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/components/V3PosTab.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/components/V3FormGroupCard.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/components/V3ConcreteFormRow.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/components/V3PronunciationList.tsx`
  - 替换工程文案和 ID 展示，建立产品层级与不含 ID 的可访问名称；底层 operations 不变。
- `apps/admin/src/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.tsx`
  - 中文字段、序号卡片、渐进层级、业务 aria-label；stable ID 更新逻辑不变。
- `apps/admin/src/features/dictionary/word-creation-v3/V3PreviewAndPublishStep.tsx`
  - 业务预览、问题/影响摘要、发布能力中文提示与一致操作栏。
- `apps/admin/src/features/dictionary/word-creation-v3/V3PublicationHistory.tsx`
  - 产品化列表/详情，移除 schema/revision/ID/JSON 展示，保留原生激活时序。
- `apps/admin/src/pages/WordWizardV3.tsx`
  - 只调整 slot 的产品化确认与操作栏接线；现有 impact/surface/save/publish 时序保持。

### 明确不修改

- `packages/types/src/admin-word-v3.ts`
- `packages/api-client/src/admin-word-schema.ts`
- `packages/api-client/src/openapi.snapshot.json`
- `packages/api-client/src/admin.ts` 的正式请求 DTO 与路径
- 后端仓、数据库与共享 OpenAPI
- `apps/web`

若实现过程中发现必须修改以上契约文件，说明本设计假设失效，应停止代码修改并回到技术评审，不得顺手扩契约。

## 后端对接

本功能不引入后端对接缺口，继续使用已经存在的正式能力：

- `POST /admin/lexicon/detections`：V2 phrase / V3 word 显式输入；
- `GET /admin/lexicon/surface-match-snapshots/{snapshot_id}`：V2/V3 immutable warning pages；
- `POST /admin/lexicon/entries`：按 schema 输入和 `Idempotency-Key` 创建；
- `GET /admin/lexicon/entries/{entry_id}`：schema-aware draft detail；
- forms impact/save、meanings save、validate、publications、publication detail、activate；
- archive/restore 与 batch lifecycle 继续由现有列表数据层使用。

鉴权、snake_case、schema discriminator、base revision、lifecycle revision、confirmation token 与 Idempotency-Key 均保持现状。前端不把本地分类字段添加到新 wire，只选择已有 V2 或 V3 正式输入。

## 复用与项目约定

- Admin UI 只使用 antd v6；不引入 tailwind 或 `@tsz/ui`。
- wire 继续 1:1 snake_case；组件局部 props/state 可使用 camelCase。
- 不手改 OpenAPI snapshot，不新增命名转换层。
- V2/V3 共用的是入口编排和纯展示能力，不共用会损失语义的数据组件。
- 继续使用 React `field.key`、稳定 UUID 和现有 model operations，不能以数组 index 作为保存身份。
- 保留 jsdom 的 matchMedia/ResizeObserver 垫片；大组件测试避免无范围的 `getByRole` 全树扫描。
- CSS 与文案改动限定在 V3 和统一入口，不顺手重构 V2 编辑器或其他 Admin 页面。

## 测试策略（概览）

首版设计批准后已经完整读取并使用 `test` skill，且在本目录建立了 `test-matrix.md`。本次建议能力增补批准后、继续新增或修改测试代码前，必须先更新矩阵并把下列回归场景落成明确 case；新增实现仍遵守“先设计测试、再写测试”的顺序。

### 纯逻辑

- trim、连续空格、Tab、换行、Unicode 空白折叠；
- 单 token、hyphen、ASCII/弯撇号、phrase 分类；
- 空值、字符集、长度边界；
- 中文展示映射与未知 code 安全兜底；
- 展示序号变化不影响 stable ID。

### 统一创建组件与路由

- 列表唯一按钮和 canonical/兼容路由；
- V3 word 无警告 detect → 稳定展示建议且 create 为 0 次 → 点击进入 Step 2 → create → navigate；
- V2 phrase 无警告 detect → 稳定展示建议且 create 为 0 次 → 点击进入 Step 2 → create → navigate；
- V2/V3 matched 建议摘要覆盖主词、词性、词形和发音，create 使用同一 detection，目标编辑器显示来源提示且 canonical 字段已预填；
- V2/V3 not_found、unavailable、未知词性分别验证空白继续、安全阻断和可重试，不能只断言状态字符串；
- matched fixture 必须至少含两个基本词性、英美地区建议拼写、多词形和多条发音，断言中文标签与具体建议值，禁止仅断言“已匹配”或 `status`；同时断言 V3 没有生成 legacy 主词/compatibility 写入；
- 重复候选覆盖同一 entry 多命中原因归并、词条类型/生命周期/原因/可用词性释义详情、分页完整性、键盘开关，以及 DOM/aria 不泄露内部 ID；
- V2/V3 warning 完整 snapshot、确认、过期、policy change、disabled；
- 双击、输入变化、旧响应、卸载、网络未知结果和 idempotency conflict；
- response echo/kind/schema 不一致 fail closed；
- 不出现类型选择器；“词典检测”只检测，“创建并进入词形与发音”才创建，两者职责清楚且键盘行为可验证。
- 检测完成但未点击进入 Step 2 时，刷新/离开不会留下草稿；detection 过期、输入修改与策略变化都会使创建操作失效。

### V3 组件语义回归

- 同 form_type 多条与多个 base 不合并；
- 一形多组只编辑一个 canonical form；
- 最后 membership 删除保护、组删除影响确认；
- common ↔ uk/us 转换与多 pronunciation；
- meanings/examples 稳定 ID、排序、删除、role 语义；
- dirty、save、impact、conflict、issue navigation；
- preview/publish、history/detail、activation、archived/read-only；
- 可见文本和 aria-label 不泄露 UUID、原始工程术语或 code。

### e2e 与真实浏览器

- mock-backed 单词与短语统一入口主链；
- V3 forms → meanings → preview/publish 的关键路径；
- 390 / 768 / 1024 / 1440 分档检查溢出、遮挡、sticky 与焦点；
- 键盘完成创建、步骤切换、编辑、确认和保存；
- 本地真实后端可用时验证 detection/create/save/read-back；后端或数据条件不可用时明确记录证据缺口，不把 mock 成功报告为真实 E2E。

### 质量命令

实现完成后至少执行：

- 统一入口和 V3 相关 targeted Vitest；
- 相关 Playwright e2e；
- `pnpm test:cov`；
- `pnpm typecheck`；
- `pnpm lint`；
- `pnpm --filter @tsz/admin build`；
- 本地启动构建产物，并用 Codex 内置浏览器完成四档宽度与键盘验收。

## 风险与缓解

### 检测完成后结果过期

Step 1 与显式创建之间存在阅读时间，detection 或 surface snapshot 可能过期。创建前检查现有过期时间和确认上下文；过期时清空创建资格并要求重新检测，不静默重检、不自动创建。使用单一 normalized value、discriminated state、同步 in-flight lock、generation 丢弃和响应 identity guard；任何分支不一致都 fail closed。

### V2 matched phrase 的 headwords 与检测摘要漂移

Step 1 展示 detection 返回的正式 headwords，用户明确进入 Step 2 后仍必须复用同一 detection。测试覆盖 matched/not_found、区分方言建议、未知词性、输入修改与 warning；后端要求确认的 surface 场景继续阻断普通创建，不把“词典匹配”误当作冲突。

### Step 1 与 Step 2 切换产生页面闪动

检测完成后停在稳定的 V2 Step 1 结构，不挂载临时建议页、不自动导航。创建请求期间保持检测结果与页面尺寸，只锁定操作并显示 loading；成功后一次性进入 Step 2。组件测试使用可控 promise 验证检测不会调用 create，e2e 验证按 Enter 只更新 Step 1，点击进入 Step 2 后才发生路由切换。

### V3 建议展示与实际预填漂移

建议摘要只读取 detection，实际编辑数据只读取 create response canonical word；前端不复制建议生成草稿。测试同时断言 create 复用同一 `detection_id`、响应字段按原生 V3 结构呈现；若响应与建议不一致，canonical 数据优先，来源提示不得承诺未实际写入的字段。

### 隐藏 ID 后问题定位或测试失效

ID 只从 visible/aria presentation 中移除，仍保留在 state、React key、request 和 `data-*` 定位属性。测试从“可见 UUID”迁移到业务序号/label，并另用 model 测试断言 ID 稳定。

### 产品映射落后于契约枚举

集中映射并提供不回显 raw code 的安全兜底。正式契约测试继续发现 schema drift；新增枚举时更新单一映射文件，而不是让每个组件自行显示原值。

### 大型 V3 表单的响应式与性能

不复制 V3 数据树，不引入 V2 转换层；使用现有受控组件和局部 Collapse/Card。CSS 只改变布局，复杂派生继续 memoize；浏览器验收检查大数据 fixture 下的滚动、焦点和交互延迟。

### CSS 影响 V2 或其他 Admin 页面

所有新增选择器以 `.v3-word-creation` / `.v3-*` 为根，避免全局覆盖 antd 或 V2 `.word-*`。不直接复制整份 2199 行 V2 CSS，只复用已验证的布局语言与 antd 组件模式。

### 发布/激活语义被视觉重构破坏

发布和激活 controller 不重写；UI 只替换 presenter 与文案。既有 409、幂等、surface token、dirty block 和 canonical refresh 测试继续保留并调整可见断言。

## 回滚

- 本功能没有数据库、后端、OpenAPI 或 wire 迁移，前端提交可整体回退。
- 统一入口若出现问题，可回退本分支恢复旧两个入口；已创建的 V2/V3 草稿仍由各自原生路由读取，不需要数据修复。
- V3 样式与 presenter 选择器有独立根节点，可回退 UI 层而不回退 model/save/publish 语义。
- 回滚不得删除、重写或降级已经创建的 V3 草稿与 publication。

## 评审门

本 `design.md` 与同目录 `requirements.md` 必须一次性获得用户明确批准后，才能修改业务代码或测试代码。批准后先使用 `test` skill 产出 `test-matrix.md`，再按矩阵写测试和实现；若实现发现需要改后端、OpenAPI、wire 或把 V3 转为 V2，应立即停止并回到本设计评审。
