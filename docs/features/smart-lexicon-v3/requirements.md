# 智能词库 V3 数据模型需求

> 文档状态：Phase 1 推荐决策包已批准；后端 C2 已进入正式 OpenAPI 并据用户确认完成部署，前端 V3 Admin editor、unit/integration 与 Mock E2E 已实现。
>
> 初始评估基线：前端 checkout `296579c6c2d5`，2026-08-23。
>
> 当前核验基线：本次前端 feature worktree；后端 `main@4178ebe`，2026-08-25。
>
> 边界：当前权威 OpenAPI、前端契约和 Admin UI 自动化已落地，但仍不能替代真实 HTTP、PostgreSQL、测试服浏览器、capability flags 与迁移演练。生成 snapshot 只能由权威 OpenAPI 同步；Mock E2E 不得写成真实发布联调完成。

## 背景

当前智能词库使用 V2 词条聚合。一个词条有 `headwords`，每个基本词性在 `WordPosFormsV2` 中都有且只有一个 `base_form`，其余比较级、最高级、第三人称单数、过去式等只能作为 `form_groups[].slots` 中的派生槽位。前端还会校验每个词性的 `base_form` 拼写必须与词条级 `headwords` 一致。

这个结构把“词条展示主词”“每个词性的共享原形”“词形变化组的成员”耦合在一起，无法忠实表达以下事实：一个词条只是 UUID 标识的抽象容器；同一词性可以有多个变化组；一个变化组里可以有多个平级具体词形；原型、比较级、最高级等只是具体词形的 `form_type`，不是父子关系；同一个 `form_type` 可以出现多次，包括多个原型。

V3 需要先建立能表达上述关系的词形模型，再单独解决“取消主词”对列表、搜索、关联词和学习端展示的影响。两步必须分阶段完成；Phase 1 临时展示规则已经批准，最终显示策略明确延后至 Phase 2，避免同时破坏编辑、发布和读取链路。

## 当前事实基线

以下事实已在本次前端 checkout 与公开 OpenAPI 中重新核对：

- `packages/types/src/admin-word-v2.ts` 中 `AdminWordV2.schema_version` 固定为 `2`，词条仍有 `headwords: WordHeadwordsV2`。
- `WordPosFormsV2` 必填 `base_form` 与 `form_groups`；每个词性只有一个独立 `base_form`。
- `WordFormGroupV2.slots` 的元素是 `WordDerivedFormSlotV2`，其 `form_type` 明确排除 `base`；组内目前只有派生 slots。
- `formsValidation.ts` 的 `headwordConsistencyIssues` 把每个词性的 `base_form` 拼写与词条级 `headwords` 绑定；`model.ts` 的 `createPosForms` 也直接用 `headwords` 创建 `base_form`。
- 当前词义结构通过 `WordPosMeaningsV2.pos_id` 归属词性，没有正式的具体词形或变化组引用。
- 列表、surface 查重/检测、关联词展示和 related-search 等读取投影仍使用 `headword`；当前正式 V2 例句关联只读投影使用 `target_form_slot_id`，尚无 V3 `form_id/variant_id`。
- `tsz-rust/docs/openapi.json` 是权威公开契约；前端 `packages/api-client/src/openapi.snapshot.json` 是由同步命令生成的快照，禁止手工修改。
- 当前权威输入为 `tsz-rust main@4178ebe` 的正式 OpenAPI，SHA-256 为 `460535d2de2d9335fb1680ce86d65978085e42d5b50aea74f16431612e44c3e0`；后端已据用户确认部署，但本仓尚无真实 HTTP/PostgreSQL/测试服浏览器或 flags 验收证据。
- 前端已按当前正式 spec 生成契约快照与运行时 schema closure，并接入 V2/V3 判别类型、api-client 与独立 V3 Admin 编辑器；现有 V2 Admin 编辑器继续只消费 schema 2。

## 问题定义

V2 的结构限制会产生以下产品和工程问题：

1. 唯一 `base_form` 让“多个原型”无法在同一词性或同一变化组内平级存在。
2. `base_form` 位于变化组外，而其他词形位于组内，导致一个完整变化范式被拆成两层不一致的所有权。
3. “派生 slot”名称暗含原型派生其他词形的父子关系，与目标语言学模型不符。
4. 组内同一种 `form_type` 不能自然出现多条具体词形，无法表达多个合法拼写或多套变化范式。
5. 词条级主词同时承担身份、展示、搜索和查重入口；一旦取消主词，多个下游消费者缺少明确投影规则。
6. V2 发布快照、稳定节点 UUID、surface 投影、TTS 试听、关联词和例句关联都引用现有结构，不能通过一次无版本迁移安全替换。

## 目标

### 目标数据模型

V3 最终模型必须满足：

- 词条是由稳定 UUID 标识的抽象容器，最终状态没有唯一主词。
- 一个词条可包含多个词性。
- 每个词性可包含多个词形变化组。
- 一个词形变化组包含多个平级的具体词形。
- 每个具体词形有 `form_type`；原型、比较级、最高级、第三人称单数、过去式等都只是类型，不表示父子派生关系。
- 同一种 `form_type` 可以有多条具体词形，包括多个 `base`/原型。
- 每个具体词形下保存地区变体：要么一条 `common`，要么同时包含 `uk` 与 `us`。
- `common`、`uk`、`us` 是同一个具体词形下的地区变体，不是两个或三个词条。
- 每个地区变体保存拼写，并拥有一个或多个发音；每个发音包含词典音标、实际发音和发音方式。

### 用户体验目标

- Admin 编辑器按词性分栏或标签展示数据。
- 每个词性下按词形变化组展示；组内以原型、比较级、最高级等 `form_type` 为行，同类型可出现多行。
- 每行展示并编辑 common，或英式/美式拼写、词典音标、实际发音和发音方式。
- 错误摘要能定位到词性、变化组、具体词形、地区变体与具体发音，不能只报“词条不完整”。
- 预览与发布结果忠实呈现 V3 结构，不选择或暗示某个具体词形是其他词形的父节点。

### 可量化结果

- 正式 V3 wire 能无损往返：多词性、多组、同类型多具体词形、多个原型、common/uk+us、每变体多发音。
- V3 草稿保存、完成校验、预览和发布均使用稳定 UUID；内容修改不更换节点身份。
- V2 历史数据在迁移期间保持可读；V2 历史 publication 不因 V3 上线被原地重写。
- V3 surface、搜索、查重和关联解析不会把 uk/us 变体误建成独立词条。
- Phase 1 词形模型落地期间仍有受控的主词兼容桥；Phase 2 先切换下游消费者，完整取消主词在 Phase 3 单独验收。

## 术语

| 术语                          | 定义                                                         | 非定义                                                                 |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 词条 / entry                  | 由 UUID 标识的抽象容器，承载词性、词形、词义、发布等内容     | 不是某个拼写，也不等于主词                                             |
| 词性 / part of speech         | 词条下的基本词性节点，如 noun、verb、adjective               | 不等同于具体词形                                                       |
| 词形变化组 / inflection group | 同一词性下组织一组平级具体词形的容器                         | 不以唯一原型为父节点                                                   |
| 具体词形 / concrete form      | 有稳定 UUID 与 `form_type` 的词形节点                        | 不是 uk/us 两个词条；也不是只能有一个的 slot                           |
| `form_type`                   | 具体词形的分类，如 `base`、`comparative`、`superlative`      | 不表达派生方向或唯一性                                                 |
| 地区变体 / regional variant   | 同一具体词形下的 `common`，或 `uk` 与 `us` 拼写侧            | 不是独立词条，也不是新的具体词形                                       |
| 发音 / pronunciation          | 某个地区变体下的一条发音记录，含词典音标、实际发音、发音方式 | 不等于临时 TTS 音频 URL                                                |
| 展示名称 / display label      | 列表、搜索或关联场景中由服务端投影出的可读标签               | 不是领域模型中的唯一主词；Phase 1 临时规则已批准，最终规则留待 Phase 2 |
| 主词兼容桥                    | V3 词形模型上线初期，为 V2 消费者临时保留的兼容字段或投影    | 不是 V3 的长期数据权威                                                 |
| publication                   | 某次发布产生的不可变内容快照                                 | 不应被后续迁移原地改写                                                 |

## 用户故事

### Admin 创编人员

1. 作为管理员，我可以在同一词条中添加多个词性，并分别管理每个词性的变化组。
2. 作为管理员，我可以在同一变化组里添加多个原型，也可以添加多个相同 `form_type` 的其他具体词形。
3. 作为管理员，我可以为一个具体词形选择 common 模式，或 uk+us 模式，并为每个地区变体维护拼写和多条发音。
4. 作为管理员，我可以保存尚不完整的 V3 草稿；选择“完成”或发布时，系统才执行完整性校验。
5. 作为管理员，我可以从完成情况面板直接进入第一个出错的词性、变化组、具体词形、地区变体或发音字段。
6. 作为管理员，我在预览和发布前能看到词形结构变化对词义、例句关联、surface 和关联词的影响。
7. 作为管理员，我查看旧 publication 时看到的是当时的 V2 内容，而不是被 V3 迁移后回写的内容。

### 内容审核与运营

1. 作为审核人员，我可以区分“同一词条内的地区变体”“同一类型的多个具体词形”和“同拼写的多个词条”。
2. 作为审核人员，我能看到迁移来源、自动转换、人工修改、发布人与版本信息。
3. 作为运营人员，我可以在功能开关关闭时继续使用 V2 读取路径，不让未完成的 V3 能力影响现有词条。

### 学习端与关联内容消费者

1. 作为学习端消费者，我可以通过版本化 DTO 读取 V2 或 V3 publication，并得到明确的展示投影。
2. 作为例句/关联消费者，我引用的是稳定词条、词义和具体词形 UUID，不依赖可变化的拼写或数组下标。
3. 作为搜索用户，我输入任一地区变体拼写时，可以得到所有符合策略的词条候选；系统不能静默把歧义合并为一个结果。

### QA 与运维

1. 作为 QA，我可以用确定性 fixture 覆盖多原型、同类型重复、地区模式、多发音、迁移与回滚。
2. 作为运维，我能按 `schema_version`、迁移批次、错误码和投影版本观察 V2/V3 流量与失败。

## 主流程

### 新建与检测

1. 管理员输入待创建拼写并发起检测。
2. 检测返回词典证据、已有 surface 候选和建议词性/词形；这些都是建议或候选，不生成领域上的唯一主词。
3. 创建命令携带幂等键和目标 `schema_version`。
4. Phase 1 的 legacy 主词兼容桥只来自 V2 迁移 entry 的既有 headwords；新建 V3 不填写、不生成也不从具体词形猜测 legacy headwords。
5. 创建成功后返回稳定 entry UUID、revision 和 V3 词形骨架。

### 编辑词形

1. 管理员选择词性标签。
2. 管理员新增、删除、排序变化组。
3. 管理员在组内新增、删除、排序具体词形，并选择 `form_type`；相同 `form_type` 不被前端自动去重。
4. 管理员为具体词形选择 common 或 uk+us，编辑拼写与一条或多条发音。
5. 保存草稿时提交 `base_revision`；服务端以 UUID 校验节点所有权、引用和并发。
6. 服务端返回 canonical V3 聚合；前端以响应替换本地草稿。

### 完成、预览与发布

1. “保存草稿”允许内容不完整，但必须拒绝结构破坏、越权引用、非法 UUID、重复节点身份和超限内容。
2. “完成”校验全部必填内容、地区模式、发音和待决业务规则。
3. 词形结构删除或迁移影响词义/例句/关联引用时，先返回结构化影响预览和确认 token。
4. 发布命令带 revision、幂等键与所需确认 token；只有 capability/policy gate 允许的 entry 才生成不可变 V3 publication。Phase 1 只允许带只读 legacy bridge 的迁移 entry 做 canary，新建 V3 的激活发布必须被稳定错误阻断。
5. surface 与搜索投影在同一事务或可靠 outbox 流程中更新；投影落后必须可观测且不能静默丢失候选。

### 读取、搜索与关联

1. 详情读取按 `schema_version` 返回 V2 或 V3 DTO。
2. 列表与 related-search 返回服务端生成的展示名称、候选拼写和 entry UUID；展示名称只是投影。Phase 1 对 V3 surface/search 只做 shadow 与对账，Phase 2 才切换正式消费者。
3. 任一 common/uk/us 拼写都可进入 surface 索引；同一具体词形的 uk/us 仍共享同一个 `form_id`。
4. 同拼写命中多个词条或同一词条的多个具体词形时返回可区分候选，不做无依据的自动选择。
5. Phase 1 的 sense 仍只归属 POS；保存关联时继续校验既有 entry、publication、sense 与 POS 所有权，不新增可选 form/group 归属字段。
6. Q5b 已批准延后至 Phase 2：Phase 1 不记录 `form_id`/`variant_id` 命中证据，也不得用客户端私有字段或 mock 固化未来契约。

### V2 迁移

1. 迁移任务先只读盘点 V2 结构、publication、引用与异常数据。
2. 迁移 dry-run 产生逐词条映射、计数、异常和校验摘要，不写生产数据。
3. Phase 1 转换语义已批准；实际写迁移仍须等待 C1、migration dry-run 与数据负责人放行，再按批次幂等迁移当前工作聚合。
4. 历史 V2 publication 保持不可变，并由双版本 reader 读取。
5. 切流前后比较数量、UUID、surface、引用和 publication checksum；不一致则停止扩大流量。

## 错误与边界流程

- UUID 不合法、节点不属于当前词条或父节点不匹配：拒绝保存，返回稳定节点定位。
- 同一个 UUID 在提交树中承担多个不同角色：拒绝保存，不能自动重新生成 ID 掩盖错误。
- common 与 uk/us 同时存在、`uk_us` 模式缺少任一 variant 节点或地区值重复：属于结构错误，草稿也拒绝。合法 draft 必须保留 uk 与 us 两个稳定节点，但允许节点内 spelling/pronunciations 暂空；完成与发布再阻断空内容。
- 完成状态下地区变体拼写为空、发音数组为空、词典音标/实际发音/发音方式为空：返回 422 与精确字段路径。
- 同组内出现多个相同 `form_type`：这是合法目标能力，不能返回“类型重复”。
- 多个 `base`：这是合法目标能力，不能要求选出唯一主词或唯一原型。
- 删除仍被词义、例句或 publication 引用的具体词形：先返回影响预览；未经确认不得删除或静默重绑。
- revision 落后：返回 409，前端保留用户输入并提供刷新/比较路径。
- 同幂等键、同请求重放：返回首次成功结果；同幂等键、不同请求：返回 409。
- 迁移遇到一个 V2 `base_form` 配多个 `form_groups`：保留一个 base form UUID，并为每个既有 group 建确定性 membership；禁止复制 concrete form、只挂第一组或设为组外主节点，异常数据进入 blocked 队列。
- 读取未知 `schema_version`：fail closed，只记录安全的数字版本、值类型、原因和响应路径，不在错误对象或常规日志中保留完整响应，且不能当 V2 解析。
- V3 投影尚未完成或版本落后：相关写操作必须按发布策略阻断或降级只读，并记录明确原因。

## 完整范围

### 本功能最终包含

- V3 词条/词性/变化组/具体词形/地区变体/发音领域模型。
- V3 snake_case wire、OpenAPI、数据库迁移与版本化读写提案的落地。
- V2/V3 详情、列表、搜索、surface、关联词、publication 和学习端兼容。
- Admin 词形编辑器、完成情况、错误定位、影响预览和发布预览的 V3 适配。
- 稳定 UUID、审计、幂等、乐观并发、功能开关、回滚与迁移演练。
- TTS 试听按具体地区变体/发音消费，不把临时音频 URL写入 V3 canonical 数据。
- 自动化测试与真实浏览器、真实 HTTP/数据库、迁移演练证据。

### Phase 1 已批准施工范围

- V3 首期只支持 `kind=word`；既有 phrase 保持 V2 读写，不迁移、不进入 V3 editor。
- Phase 1 不尝试回答短语是否需要 POS、变化组或多个原型；phrase 的 V3 语义另立需求后再进入契约。
- Q1/Q2/Q7/Q8/Q9/Q10/Q12 的 Phase 1 推荐值已冻结；C2 正式 wire、稳定错误码与 Admin UI 已施工，真实环境和 capability flags 仍是独立验收门。
- Q3/Q4/Q5a/Q5b 的最终形态可分阶段延后，但 Phase 1 必须使用下文明确的中性兼容行为，不能由客户端猜测。
- 当前施工产物包括 requirements/design、`test-matrix.md`、生成契约、`@tsz/types`、运行时解码、`@tsz/api-client`、V3 Admin 编辑器及其 unit/integration/Mock E2E；不包含真实 HTTP/PostgreSQL/测试服浏览器、flags 启用或迁移演练 PASS 证据。

## 明确不在范围

- V3 Admin editor 已实现；本次前端文档校准不修改数据库、后端仓库或部署配置，也不启用 capability flags。前端生成契约只能通过原生同步命令更新，禁止手改。
- 提交、推送、PR 与部署属于独立交付门；本文不把尚未执行的前端交付或部署写成已完成。
- 不重新引入“唯一主词”“唯一原型”或“原型派生其他词形”的领域概念。
- 不把 uk/us 地区变体拆成两个词条。
- Phase 1 不把 phrase 升级为 V3，也不改变既有 V2 phrase 行为。
- 不在 V3 模型中顺带设计词源学派生关系；如果未来需要，应使用独立关系模型。
- 不在本阶段新增语言、澳式/加式等更多地区枚举；未来扩展需要单独契约评估。
- 不更换 TTS 服务、语音供应商或音频存储策略。
- 不借 V3 重做词义编辑器、例句富文本、关联类型、审核流或权限体系。
- 不物理删除历史 V2 publication，不以重建 publication 伪装迁移。
- 不手工编辑 `packages/api-client/src/openapi.snapshot.json`。

## 数据规则

### 身份与所有权

- entry、词性、变化组、具体词形、地区变体和发音均使用稳定 UUID。
- 内容修改不更换 UUID；删除后的 UUID 是否可恢复及退休身份策略需与现有 stable-node 规则对齐。
- 具体词形的领域身份独立于拼写；改拼写不创建新词条。
- `form_type` 不是身份键，也不是唯一键。
- 不允许用数组下标、展示名称或拼写作为跨资源长期引用。

### 词形与变化组

- 一个词性可有多个变化组；组内具体词形平级。
- Phase 1 同一 entry 内每个 POS code 至多一个 POS 节点；“多个词性”指不同 POS code，不重复建两个 noun/verb 节点。
- `base` 与其他 `form_type` 在结构上等价，均是具体词形的属性。
- 同组内可有多个相同 `form_type`；同一 POS 内允许多个 group 通过不同 membership 引用同一个 `form_id`，禁止跨 POS 引用和同组重复 membership。
- wire 只以数组顺序为权威，不同时暴露 `sort_order`；数据库可内部使用 ordinal 并确定性序列化。
- 推荐的 draft 语义是允许零 group 或空 group，以便保存未完成编辑；complete/publish 要求每个 POS 至少一个 group，且所有保留 group 都非空。空 group 必须在完成前填充或删除。
- 任何已经保存的具体词形必须至少有一个 membership，不允许 POS 持有孤立 form。
- 删除 form 的最后一个 membership 时，必须在同一事务中显式删除/退役该 form，或拒绝操作；不能留下 orphan，也不能自动把 form 移到未指定的 group。
- 无派生词性的合法完成态是一个只含一个或多个 `form_type=base` 的非空 group。

### 地区变体

- 每个具体词形必须选择且只能选择一种形状：`common`，或完整的 `uk` + `us`。
- `common` 与 `uk/us` 互斥；uk_us 模式在 draft wire 中也必须同时保留 uk 与 us 两个稳定 variant 节点，但草稿内容可为空，complete/publish 时两侧均须完整。
- 拼写需做 Unicode、大小写、空白和标点规范化，但规范化算法必须版本化并由后端权威执行。
- 地区模式只属于具体词形；POS/group 不保存继承规则，实际拼写记录属于具体词形下的地区变体。

### 发音

- 草稿可暂缺发音；完成或发布时每个地区变体至少一条发音。
- 每条发音至少包含 `dict_phonetic`、`actual_pron`、`style`，字段命名保持 snake_case。
- 同一地区变体允许多条发音；规范化后的 `dict_phonetic + actual_pron + style` 完全重复则拒绝，未完成 draft 行不参与重复判断。
- TTS `audio_url` 是有有效期的试听结果，不进入 V3 canonical 发音数据；如未来持久化音频，必须单独建稳定资产引用。

### 词义、搜索与重复

- Phase 1 sense 只通过 `pos_id` 归属词性，不增加可选 form/group 字段；任何所有权改变留待 Phase 2 独立契约评审。
- 例句 form/variant 命中证据已批准延后至 Phase 2，且不反向改变 sense ownership。
- 所有地区拼写都进入候选 surface 投影；Phase 1 继承 warning + acknowledgement/policy gate，不建立全局唯一约束，最终重复策略留待 Phase 2。
- Phase 1 默认继承当前 V2 的 warning + acknowledgement/policy gate：相同拼写可产生多个按稳定 entry/form/variant ID 区分的候选，不静默合并；是否改成更严格阻断留待 Q4 批准。
- 展示名称不能被当作查重主键或词条身份。

## 权限

- 沿用现有 Admin 认证、角色和词库编辑/发布权限，不因 V3 扩大权限。
- 草稿编辑、完成、发布、迁移、回滚与功能开关操作分别记录操作者。
- 批量迁移和切流只能由受控运维身份执行；普通编辑者不能改变 `schema_version` 或迁移映射。
- 学习端只读取已发布 projection，不能读取 Admin 草稿或迁移中间态。
- 服务端必须重新校验目标 entry、sense、form 的 publication 与所有权；不能信任前端只读字段。

## 兼容性

- V2 与 V3 必须通过 `schema_version` 判别，客户端使用判别联合，禁止把 V3 强制断言成 V2。
- Phase 1 允许为迁移 entry 保留主词兼容桥，但只能在迁移事务中从 V2 headwords 一次性复制；迁移后为 response-only，无写 API、无持续同步，并须标记 deprecated、限定消费者和移除条件。它不是 V3 权威数据。
- V2 词条继续走 V2 编辑/只读路径，V3 词条走 V3 路径；禁止把 V3 数据降级保存为 V2。
- 历史 V2 publication 保持不可变，读取层双版本解析。
- 列表、搜索、关联词和学习端应先切换到版本化“展示投影”，再取消主词字段。
- OpenAPI 先由后端权威 spec 更新，再用项目原生命令同步前端 snapshot；禁止手改生成文件。

## 性能

以下是评估阈值，需在技术评审时结合真实数据基线确认：

- 标准词条（不超过 20 个词性、每词性 20 个变化组、每组 20 个具体词形、每变体 5 条发音）的草稿读取与保存不得出现 N+1 查询。
- 同等数据量下，V3 详情读取、列表和 related-search 的 p95 不应比 V2 当前基线恶化超过 20%。
- surface 投影必须支持按规范化拼写索引查询，不能在请求路径扫描 publication JSON。
- Admin 编辑器切换词性/变化组时不全量重建无关面板；大词条输入仍能维持可用响应。
- 迁移按批次限流，并报告扫描、转换、投影和失败数量；不能长事务锁住全表。

## 安全

- 所有字符串执行长度、字符集和结构校验；错误响应不回显密钥、SQL、内部路径或完整敏感载荷。
- UUID、revision、幂等键、确认 token 和 publication 引用均由服务端验证。
- 前端展示拼写、音标和错误信息时按文本渲染，禁止注入 HTML。
- 迁移产物和审计日志不记录管理员 token、cookie、TTS 签名 URL 或供应商密钥。
- 发布与关联变更在事务内验证引用，避免 TOCTOU；投影通过 outbox 时需保证至少一次消费的幂等性。

## 可观测性

- 指标按 `schema_version` 区分读取、保存、完成、发布、搜索、投影和错误。
- 记录 V3 校验错误码及节点角色聚合，不记录完整词条正文。
- 迁移指标至少包含 scanned、eligible、migrated、skipped、blocked、failed、projection_lag、checksum_mismatch。
- surface/搜索投影记录 source schema、projection version、outbox lag 与失败重试。
- 兼容桥只记录读取次数和一次性迁移复制结果；未迁移 schema 2 的 canonical headword 写入指标必须另行统计，不能记作 V3 bridge 写入。只有连续观测无读取依赖后才允许移除 bridge。
- 关键日志携带 entry_id、revision、publication_id、migration_batch_id、request_id；不记录签名音频 URL。

## 迁移和发布约束

1. Phase 0/C1：Phase 1 产品决策、正式 V3 wire 与稳定错误码已冻结；前端契约接入完成后停在统一评审门，不自动进入 C2 或 Admin UI。
2. Phase 1：落地 V3 词形模型和版本化读写，保留受控主词兼容桥；V2 历史 publication 继续按 V2 读取。
3. Phase 2：列表、搜索、关联词、surface 与学习端切到展示投影，完成同拼写/歧义策略。
4. Phase 3：单独停止剩余 schema 2 canonical headword 写入并移除只读兼容桥；清理只能在依赖计数归零和回滚窗口结束后进行。
5. 迁移必须 dry-run、可重放、分批、可暂停；每批有输入/输出 checksum 和异常清单。
6. 一旦保存了 V3 独有结构（如多个 `base`），不得通过有损 V2 回写作为回滚；只能关闭写入、保持 V3 只读并前向修复。
7. 发布前需完成真实数据库迁移演练、真实 HTTP 契约、真实浏览器主路径与回滚演练，mock 绿不能替代这些证据。

## 可测试验收标准

### 模型与契约

- AC-01a：系统可无损保存“一个 entry 含至少两个不同 POS、每个 POS 至少两个变化组”的复杂 fixture；这验证能力，不是所有真实词条的最小数量约束。
- AC-01b：一个 POS、一个非空 group、仅一个或多个 `base` 的无派生词条也是合法完成态；draft 还可保存零 group/空 group。
- AC-02：同一变化组可保存两个 `form_type=base` 和两个相同的非 base `form_type`，往返后 UUID、顺序和内容不变。
- AC-03：具体词形可保存 common + 多发音，或 uk+us 各自多发音；uk_us draft 两个节点都存在但内容可暂空，非法混合/缺节点形状被精确定位。
- AC-04：OpenAPI、`@tsz/types` 与 HTTP 运行时 shape 一致且全部 snake_case；schema 由后端 spec 生成同步，不手改 snapshot。
- AC-05：V2 与 V3 详情、列表和 publication 通过 `schema_version` 正确路由；未知版本 fail closed。

### 编辑与校验

- AC-06：Admin 按词性/变化组展示平级具体词形，同类型不被合并；uk/us 始终显示为同一具体词形的两个地区侧。
- AC-07：draft 可保存零/空 group 和其他不完整内容；complete/publish 阻断零 group、任何残留空 group、缺拼写、缺地区侧、无发音和发音字段缺失。
- AC-07b：任何已保存 form 至少有一个 membership；删除最后 membership 必须显式连同 form 删除/退役或被拒绝，刷新后不存在 orphan form。
- AC-08：错误项能从总览导航到正确 POS、group、form、variant、pronunciation 字段。
- AC-09：revision 冲突、幂等重放、同键异请求和双击行为有确定性自动化与真实 HTTP 证据。

### 投影与下游

- AC-10：common/uk/us 全部进入 surface 候选；同一具体词形的 uk/us 共享 form UUID，不生成两个 entry。
- AC-11：相同拼写命中多个词条或多个具体词形时，返回多个可区分候选，不静默选择。
- AC-12a：Phase 1 sense 只归属 POS；保存与发布继续校验既有 entry/publication/sense/POS 所有权，form 退役影响预览覆盖兼容桥可解析的既有 relation、surface 与 V2 form 引用，但不新增 sentence form/variant 字段。
- AC-12b：Q5b 批准并进入 Phase 2 后，例句的 `form_id`/`variant_id` 命中证据及目标 publication 所有权有独立契约和测试；该能力不反向改变 sense ownership。
- AC-13：TTS 试听按当前地区变体内容生成，有效期 URL 不写入 canonical V3 聚合或 publication。
- AC-14：学习端能够读取 V2 与 V3 publication，并只依赖版本化展示投影，不依赖 `headwords` 作为身份。

### 迁移与发布

- AC-15：V2 dry-run 对每个 base/group/slot/variant/pronunciation 产生可审计映射；阻塞项不被自动猜测。
- AC-16：已批准方案下历史 V2 publication 字节/语义 checksum 保持不变，双版本 reader 回归通过。
- AC-17：迁移前后 entry、当前 publication、引用、surface 数量与抽样内容对账；异常超过批准阈值自动停止。
- AC-18：功能开关可分别关闭 V3 创建、编辑、发布和读取切流；关闭不会删除 V3 数据或回写 V2。
- AC-19a：Phase 1 真实浏览器完成新建 V3、编辑多原型、保存、刷新、错误定位和预览；尝试激活发布时被 capability/policy gate 稳定阻断，且不会生成 publication 或正式搜索数据。
- AC-19b：Phase 1 仅对带只读 legacy bridge 的迁移 entry 做 V3 canary 发布，并完成历史 V2 publication 不可变回看；新 V3 不借用该 bridge。
- AC-19c：Phase 2 下游消费者切换后，真实浏览器再验收新 V3 激活发布、列表、搜索、关联与学习端读取。

## 决策登记与后续未决项

下表保留原始决策问题供审计。用户已于 2026-08-24 按 `design.md` 的 Phase 1 推荐值和中性延后行为整体批准；Q3 最终展示策略、Q4 最终重复政策、Q5a/Q5b 的 Phase 2 形态等后续决策仍不得由实现者擅自扩张。

| ID  | 已批准的 Phase 1 决议                                                                                                                           | 后续状态                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Q1  | 同一 POS 内允许一个 concrete form 通过不同 membership 属于多个 group；禁止跨 POS 和同组重复 membership                                          | 已冻结；C1 已固化 wire/约束          |
| Q2  | 地区模式只属于 concrete form；形状为 common xor 完整 uk+us，POS/group 不保存继承规则                                                            | 已冻结；C1 已固化判别联合            |
| Q3  | Phase 1 使用 response-only presentation：迁移 entry 格式化 legacy headwords，新 V3 使用去重 surface 摘要，无 surface 时使用 short UUID fallback | 最终 display strategy 延后至 Phase 2 |
| Q4  | 允许同拼写多 entry/form；Phase 1 继承 warning + acknowledgement/policy gate，不建全局唯一约束、不静默合并                                       | 最终重复政策延后至 Phase 2           |
| Q5a | Phase 1 sense 只归属 POS，不给 meanings 增加可选 group/form 字段                                                                                | 所有权变化延后至 Phase 2 独立评审    |
| Q5b | Phase 1 不增加 sentence `form_id`/`variant_id` 命中字段，不反推 sense ownership                                                                 | 命中证据契约延后至 Phase 2           |
| Q6  | V2 一个 base 配多个既有 group 时保留一个 base form UUID，并为每个 group 建确定性 membership，不复制 concrete form                               | 语义已冻结；写迁移仍待 C2/dry-run    |
| Q7  | 历史 V2 publication 原样不可变，使用双版本 reader；V3-only 数据只前滚                                                                           | 已冻结                               |
| Q8  | draft 可零/空 group；complete 每 POS 至少一组且所有保留 group 非空；禁止 orphan；删除最后 membership 必须同事务退役/删除 form 或拒绝            | 已冻结                               |
| Q9  | `form_type` 使用版本化固定枚举，不允许自由文本                                                                                                  | 已冻结；枚举值已由 C1 固化           |
| Q10 | wire 数组顺序是唯一权威，不返回 `sort_order`；数据库 ordinal 仅内部使用                                                                         | 已冻结                               |
| Q11 | 同一 variant 下规范化后完全相同的发音三元组拒绝；未完成 draft 行不参与重复判断                                                                  | 已冻结；错误码已由 C1 固化           |
| Q12 | 迁移时一次性复制 V2 headwords 为 response-only bridge，无写 API/持续同步；新 V3 不填不猜 legacy headwords，Phase 1 不激活新 V3 publication      | 已冻结；新 V3 激活留待 Phase 2       |

## 统一评审结果与契约施工门

2026-08-24 用户回复“按推荐方案批准，进入契约施工”，以下 Phase 1 评审项视为已确认：

- 本文目标模型与明确不在范围内容；
- Phase 1 仅支持 `kind=word`、phrase 保持 V2 的范围决定；
- Q1–Q12（含 Q5a/Q5b），至少先冻结会改变 Phase 1 wire/数据库形状的 Q1、Q2、Q7、Q8、Q9、Q10、Q12；
- Q3/Q4/Q5a/Q5b/Q6/Q11 的 Phase 1 中性兼容行为与后续 BLOCKED/LATER 边界；
- `design.md` 中推荐 wire、数据库方案、V2/V3 兼容和分阶段路线；
- 前端、后端、QA、数据迁移和学习端负责人；
- 时间估算、真实环境验收与回滚标准。

C2 正式 OpenAPI、`@tsz/types` V3/Any wire、V2/V3 runtime guard、V3/Any api-client、生成 snapshot 与 V3 Admin editor 已完成实现，并有 unit/integration/Mock E2E 证据。当前停止点是真实环境验收门：真实 HTTP、PostgreSQL、测试服浏览器、capability flags 与迁移演练仍为 BLOCKED，不能由契约或 Mock 结果替代。
