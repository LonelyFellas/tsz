# 智能词库多维例句关联技术设计

## 文档状态与评审门

- 功能标识：`multidimensional-example-linking`
- 目标端：管理后台 `apps/admin`
- 当前状态：2026-08-30 正式前后端能力评估，等待联合评审；Mock 实现保留为产品证据，不作为生产数据模型
- 本轮只更新评估文档，不修改 `tsz-rust`、数据库、OpenAPI、正式前端数据流或业务数据
- `requirements.md`、本文与 `test-matrix.md` 形成一次性联合评审包；评审批准后才在独立实施阶段修改前后端

## 核对基线（2026-08-22）

### 前端 `tsz`

- 开始核对时工作区干净、处于 detached HEAD；`HEAD`、本地 `main`、`origin/main` 均为 `1bbf56b7582c`。
- 当前整理分支为 `codex/multidimensional-example-linking-frontend`，基于上述 `origin/main`；真实 OpenAPI 接入仍不在本次提交范围。
- `packages/api-client/src/openapi.snapshot.json` 生成时间为 `2026-08-21T12:16:01.957Z`。本次没有执行同步，避免把生成文件混入评估文档改动。

### 后端 `tsz-rust`（只读）

- `main` 与 `origin/main` 均为 `f96245176a39`，工作区干净。
- 契约权威文件：`tsz-rust/docs/openapi.json`。
- 数据模型依据：`tsz-rust/docs/word-data-model.md`。
- 当前 OpenAPI 与前端快照生成后发生过一次 publication 回滚相关变更，但本功能涉及的 `WordSentenceV2`、`WordSentenceLinkV2`、`RelatedWordResult`、`RelatedWordSense`、`SaveMeaningsStepInput` 和两个相关端点没有变化。

### 原型

- 需求参考：`/Users/darwish/.codex/visualizations/2026/08/21/01a02424-3d2f-7593-875a-739e9ff471e2/multidimensional-example-creator.html`。
- 原型只表达录入、标注、匹配、预关联/认领和偏好预览，不是生产契约或已实现功能。

## 当前实现事实与缺口

### 实现前前端事实

| 位置                                                       | 当前行为                                                                                               | 对一期的影响                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `packages/types/src/admin-word-v2.ts`                      | `WordSentenceV2` 内含正文、译文、难度和 `links[]`；`WordSentenceLinkV2` 只有 `word_id/sense_id/role`   | 无位置、词形槽位、预关联状态和认领身份                             |
| `MeaningsAndExamplesStep.tsx`                              | `SentenceEditor` 挂在单个 `WordSenseV2.sentences[]` 下；`ContextLinksEditor` 搜索并追加 `context` 链接 | 相同正文若要在多个词义编辑会出现多份 UI 状态；无法指向具体出现位置 |
| `model.ts`                                                 | `createSentence(wordId, senseId)` 默认生成唯一 `focus`；`toMeaningsWireContent` 原样写回嵌套句子及链接 | 数据形状以单一所属词义为中心，不符合共享对象语义                   |
| `meaningsAndExamples/validation.ts`                        | 完整性要求每句恰好一个指向所属词义的 `focus`，去重键仅为 `word_id:sense_id`                            | 无法表达“一句多位置、多词义、无固定 focus”                         |
| `meaningsAndExamples/mapping.ts`                           | 删除 sense 时扫描所有嵌套例句的 `context` 链接                                                         | 新模型需按共享关联反向计数，不能删除正文                           |
| `apps/admin/src/features/dictionary/api.ts`                | 已有 `useRelatedSearch` 和 exact/contains 分页的 `useRelatedSearchV2`                                  | 可复用词条/具体词义候选；不能解析具体词形                          |
| `packages/api-client/src/admin.ts`                         | `relatedSearch()` 只封装当前搜索；无例句位置解析、预关联查询和认领端点                                 | 需要新增契约后再扩展请求层                                         |
| `apps/admin/src/features/settings/useDialectPreference.ts` | 已从服务端 profile 读取并缓存管理员 `uk/us` 偏好                                                       | 管理端预览可直接复用，不新增例句级方言状态                         |

当前 `createEnglishText()` 已只创建 `mode: "unified"`，保存前也会把存量 `distinguish` 收敛为单份。这个方向与“一条例句不重复配置英美正文”一致；新设计不恢复例句级英美开关。

### 后端契约与数据模型事实

- `PUT /api/v1/admin/lexicon/entries/{id}/steps/meanings` 仍整体保存 `DraftMeaningsStepContent`，通过 `base_revision` 做词条级乐观锁，响应为 `AdminWordV2Envelope`。
- `WordSenseV2.sentences[]` 仍是必填数组，句子嵌在一个 sense 下。
- `WordSentenceLinkV2` 仍只有 `word_id/sense_id/role`；OpenAPI 没有位置、pending、form slot 或 claim 字段。
- `GET /api/v1/admin/lexicon/entries/related-search` 的说明是“搜索当前发布版本中的关联词目标”，结果有词条和具体词义，但 `RelatedWordSense` 只有 `sense_id/gloss`。
- 当前 Rust `RelatedWordResult` 还把 `headword_variants` 列为 required，但前端 `packages/types/src/admin-word.ts` 的同名类型没有该字段；这是本次只读核对发现的既有契约漂移，评估阶段不顺手修改，动工时应随新契约一起对齐。
- 当前 OpenAPI 把 `WordSentenceLinkV2.role` 仅声明为普通 `string`，前端类型则收窄为 `focus | context`；新 association 的 `state`/resolver `resolution` 必须在 OpenAPI 中导出闭合 enum，不能重复这个缺口。
- `lexicon.sentences` 当前保存 `entry_id + sense_id`，所以句子在数据库中仍从属于一个 sense。
- `lexicon.sentence_links` 当前主键为 `(sentence_id, target_entry_id, target_sense_id)`，只有 `focus/context` 和 `sort_order`；每句最多一个 focus。
- 当前 publication 引用表已经能记录跨词条 `sentence_context`，这是后续锚定共享句子目标 publication 的可复用基础，但它还不能锚定原句位置或目标词形槽位。

结论：现有实现能保存“一句属于一个词义、附带其他上下文词义”，不能通过纯前端改动升级为共享例句和预关联。必须先有后端 additive contract、数据约束和反向查询。

### 本轮前端开发/mock 落地

- 新增多维例句抽屉、Unicode 位置选择、resolver 三态、预关联、认领和方言预览，但只在 `ADMIN_WORDS_MOCK` 的非生产能力下开放。
- 普通候选使用 `relatedSearchV2` 的 word-only exact/contains 分页；当前草稿词义作为新句归属时使用本地 forms/meanings 快照解析，不把其他草稿混入发布候选。
- 真实数据源关闭能力时继续渲染原有 nested 例句编辑器；保存不会携带 `shared_sentences`，也不会拼接未发布的端点。
- 草案类型以 admin 局部交叉类型保存，不做 module augmentation；`@tsz/types` 与正式 save input 继续只镜像当前 Rust OpenAPI。后端契约发布后再同步权威快照并迁移类型。
- mock 只用于确定性前端状态机和交互测试，不能替代真实 HTTP、PostgreSQL 唯一约束、publication 引用或跨管理员并发证据。

## 方案概述

产品交互只使用“多维例句”这一名称。“shared sentence”及
`shared_sentences[]` 仅描述正文单份存储的内部聚合和契约草案，不对应独立页面区块或用户可见术语。

采用“**词条拥有写权限、例句脱离具体词义、关联承载语义**”的模型：

```text
owner entry
  └─ shared sentence（正文只存一次，沿用 owner entry revision）
       ├─ linked association ──> published entry + sense + form slot
       ├─ linked association ──> published entry + sense + form slot
       └─ pending association ─> normalized pending word
```

“owner entry”只决定谁能修改正文、使用哪个 `base_revision` 和由哪个 publication 保存句子快照，不表示该词条是唯一考查目标。各具体词义是否引用该句，完全由位置关联决定。

一期对现有 `DraftMeaningsStepContent` 做兼容性扩展：保留 `WordSenseV2.sentences[]` 读取存量数据，新增根级 `shared_sentences[]` 保存新模型。新例句不再复制到每个 sense；界面按 association 的目标 sense 派生各词义下看到的例句列表。

预关联随 owner entry 的 meanings 保存；目标词条发布后通过专用查询发现，再用幂等 claim 命令原子转成正式关联。普通候选继续使用 `related-search`，选定词条和具体词义后再调用只读 form resolver，让后端决定“唯一 / 歧义 / 不匹配”。

### 不选的方案

- **只扩展现有嵌套 `WordSentenceLinkV2`**：句子仍属于某个 sense，同一共享句在多 sense 的编辑与排序会产生重复状态，反向认领还要跨词条修改一棵不明确的聚合。
- **仅由前端按文本和数组去重**：无法防重试、并发和跨管理员操作，也无法提供目标词条侧的历史预关联查询。
- **按正文哈希自动合并历史句子**：相同英文可能有不同译文、难度或教学意图，自动合并不可逆。
- **把 `uk/us` 或具体方言 variant 写进关联**：会复制词库事实，并在词形更新后产生陈旧配置。关联只保存稳定 form slot。
- **前端自行推导词性/词形**：当前 `related-search` 没有足够字段，且词形目录、发布状态和槽位归属以服务端为准。

## 建议 wire 契约

以下名称和路径是供 `tsz-rust` 评估的建议，不表示当前 OpenAPI 已存在。字段继续使用 snake_case，所有 UUID 都是稳定身份。

### 1. 根级共享例句

```ts
interface DraftMeaningsStepContent {
  sense_groups: SenseGroupV2[];
  pos: WordPosMeaningsV2[];
  /** additive；缺省或 [] 表示尚未启用新模型 */
  shared_sentences?: SharedWordSentenceV1[];
}

interface SharedWordSentenceV1 {
  id: string;
  level: CefrLevel;
  /** 单份英文正文；不再提供 uk/us 分支 */
  en_text_id: string;
  en_text: RichText;
  zh_text_id: string;
  zh_text: RichText;
  associations: SentenceAssociationV1[];
}

interface SentenceSourceRangeV1 {
  /** Unicode code point；半开区间 [start, end) */
  start: number;
  end: number;
  /** 保存确认时的原文切片；服务端必须与 en_text.text 再比对 */
  surface: string;
}
```

英文改为 `en_text_id + RichText`，而不是新的 `EnglishTextV2` 分支：当前前端本来就只写 unified；显式单份还能避免后端和未来消费者误以为位置要为两侧正文分别维护。稳定 `en_text_id` 继续支持现有 text node、富文本和未来音频绑定。

### 2. 正式、预关联和兼容状态

```ts
type SentenceAssociationV1 =
  | LinkedSentenceAssociationV1
  | PendingSentenceAssociationV1
  | LegacySentenceAssociationV1;

interface LinkedSentenceAssociationV1 {
  id: string;
  state: "linked";
  source_range: SentenceSourceRangeV1;
  target_word_id: string;
  target_sense_id: string;
  /** 服务端解析并校验；管理员只在 ambiguous 时选择 */
  form_slot_id: string;
  /** 相对于目标 sense 的例句顺序 */
  sort_order: number;
  /** 以下均为只读投影，不允许客户端作为事实写回 */
  resolved_pos?: string;
  resolved_form_type?: WordFormType;
  target_headword?: string;
  target_gloss?: string;
  form_variants?: Array<{ dialect: Dialect; spelling: string }>;
}

interface PendingSentenceAssociationV1 {
  id: string;
  state: "pending";
  source_range: SentenceSourceRangeV1;
  pending_word: string;
  /** 只读；由后端统一规范化后回显 */
  normalized_pending_word?: string;
  created_by?: string;
  created_at?: string;
}

interface LegacySentenceAssociationV1 {
  id: string;
  state: "legacy_unpositioned";
  target_word_id: string;
  target_sense_id: string;
  legacy_role: "focus" | "context";
  sort_order: number;
}
```

实现时应把“保存输入”和“读取投影”拆成 DTO，确保 `normalized_pending_word`、目标快照和 `form_variants` 不被客户端写回。上面的合并展示仅用于说明业务形状。

### 3. 词性/词形解析

```ts
interface ResolveSentenceAssociationInput {
  en_text: RichText;
  source_range: SentenceSourceRangeV1;
  target_word_id: string;
  target_sense_id: string;
}

interface SentenceFormCandidateV1 {
  pos_id: string;
  pos: string;
  form_slot_id: string;
  form_type: WordFormType;
  variants: Array<{ dialect: Dialect; spelling: string }>;
}

type ResolveSentenceAssociationResponse =
  | { resolution: "resolved"; candidate: SentenceFormCandidateV1 }
  | { resolution: "ambiguous"; candidates: SentenceFormCandidateV1[] }
  | { resolution: "unmatched"; candidates: [] };
```

解析顺序：

1. 校验 range 与 `surface`；
2. 校验 target sense 属于 target word 且存在于当前 publication；
3. 从 sense 的父 POS 取得基本词性；
4. 只在该 POS 的 base/derived form slots 中匹配 `surface`；
5. 返回唯一候选、真实歧义或不匹配，不按英语拼写规则生成不存在的值。

`related-search` 继续负责“候选词条 + 具体词义”，resolver 负责“选定目标后的权威 form slot”。这样不改变现有关系词编辑器的响应语义。

### 4. 预关联列表与认领

```ts
interface PendingSentenceAssociationItemV1 {
  association_id: string;
  sentence_id: string;
  owner_entry_id: string;
  owner_entry_revision: number;
  en_text: RichText;
  zh_text: RichText;
  source_range: SentenceSourceRangeV1;
  pending_word: string;
  created_at: string;
}

interface ClaimPendingSentenceAssociationInput {
  target_word_id: string;
  target_sense_id: string;
  form_slot_id: string;
  base_owner_entry_revision: number;
}

interface ClaimPendingSentenceAssociationResponse {
  association: LinkedSentenceAssociationV1;
  owner_entry_id: string;
  owner_entry_revision: number;
}
```

推荐分页响应复用当前 `results/total/next_cursor` 约定。查询由后端根据目标词条当前发布词头和词形匹配 `normalized_pending_word`，不能让前端拉全量后自行过滤。

## 建议端点

| 方法与路径                                                                 | 用途                                                                         | 并发/幂等边界                                                 |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 现有 `PUT /admin/lexicon/entries/{id}/steps/meanings`                      | additive 接受 `shared_sentences[]`，创建/修改 owner entry 内的共享例句与关联 | 继续使用 `base_revision`；数据库唯一约束兜底重复 pending/link |
| `POST /admin/lexicon/sentence-association-resolutions`                     | 只读解析选中位置、目标 sense 和 form slot                                    | 不写状态；响应不可直接替代保存校验                            |
| `GET /admin/lexicon/entries/{id}/linked-sentences`                         | 按 sense 分页读取本词条拥有及其他词条指向本词条的共享例句                    | cursor 分页；只读投影返回 owner 信息                          |
| `GET /admin/lexicon/entries/{id}/pending-sentence-associations`            | 按目标词条当前发布词头/词形查询可认领历史项                                  | cursor 分页；默认只返回 active pending                        |
| `POST /admin/lexicon/pending-sentence-associations/{association_id}/claim` | 选择具体 sense/form 后原子认领                                               | 必须带 `Idempotency-Key` 和 `base_owner_entry_revision`       |

所有端点沿用 admin bearer 鉴权、现有智能词库权限和 RFC 9457 Problem Details。

## 后端存储与一致性建议

### 表与所有权

1. `lexicon.sentences` 对新 shared sentence 允许 `sense_id` 为空；保留 `entry_id` 作为 `owner_entry_id`，继续复用词条 revision、审计和 publication 边界。旧 nested sentence 的 `sense_id` 原样保留到它被显式升级。
2. 推荐新建有稳定 `id` 的 `lexicon.sentence_associations`，让位置/pending 生命周期与旧 `sentence_links` 并存；一期不要直接改写旧表主键和 `focus/context` 语义。回滚窗口结束后再评估合表。
3. 建议列：`id`、`sentence_id`、`state`、`start_cp`、`end_cp`、`source_surface`、`target_entry_id`、`target_sense_id`、`target_form_slot_id`、`pending_word`、`normalized_pending_word`、`sort_order`、claim/create 审计字段。
4. `legacy_unpositioned` 允许 range/form 为空；新 `linked` 必须三项 target 与 range/form 全部非空；`pending` 必须 range 和 pending word 非空且 target 为空。

### 数据库约束

- 活跃预关联唯一：`(sentence_id, start_cp, end_cp, normalized_pending_word) WHERE state = 'pending'`。
- 同一位置只有一个活跃业务状态：对 `(sentence_id, start_cp, end_cp)` 建覆盖 `linked/pending` 的 partial unique 或等价约束。
- 同一句的不同位置允许指向同一个 target sense；按 sense 展示时以 sentence ID 去重，这些 association 的 `sort_order` 必须一致，避免一条例句在同一词义下出现两次或顺序冲突。
- 正式关联的 target sense 必须属于 target entry；form slot 必须属于同一 target entry，并位于该 sense 的父 POS 下。
- `start_cp >= 0`、`end_cp > start_cp`；新状态不得有 NULL range。
- pending 不进入 publication sense refs；linked 才能进入。
- 认领事务锁定 pending 行和 owner entry，先校验 revision/状态，再更新同一 association 身份；不采用“删 pending 后另插 link”的两步非原子流程。

### 服务端校验

- 位置以 Unicode 码点计算，`surface` 必须逐码点等于 `en_text.text[start:end]`。
- 一期只允许平台判定为单个英文词的连续区间，拒绝空白、跨多个词、重叠或交叉标注。
- 新 linked 目标必须有当前 publication；sense 和 form slot 都必须在同一个目标 publication 中有效。
- `intent: "save"` 与 `intent: "complete"` 都允许合法 pending；pending 不阻断 owner entry 发布。
- ambiguous 解析结果没有显式 `form_slot_id` 时拒绝保存 linked；unmatched 只能改选目标或保存 pending。
- 英文原文内容发生变化时，旧的 positioned association ID 不得原样复用。前端必须清除并用新 ID 逐项重建，服务端据此防止“看似仍命中相同字符串但实际没有重新确认”。
- 只改译文、难度或富文本中不改变 `text` 的标注时可以保留位置身份，但仍要通过 range/surface 校验。
- 删除目标 sense/form slot、归档目标或切换 current publication 时，要么由现有 inbound publication 引用阻断，要么把关联明确标成 unavailable；不能留下能渲染但已无权威目标的假 linked。

### publication 边界

- owner entry 发布时，把 shared sentence、positioned linked associations 和目标 form slot 一起写入不可变 snapshot/reference；pending 只保留在编辑投影。
- 可扩展现有 `entry_publication_sense_refs(reference_kind = 'sentence_context')`：继续用 `source_node_id = sentence_id` 证明来源 publication 成员，新增稳定 `source_association_id` 区分同句多个位置，并锚定 `target_sense_id + target_form_slot_id + target_publication_id`。
- 某个外部目标 sense 查看关联例句时，读取当前有效的来源 publication 引用；不能直接读来源 entry 的可变草稿正文。
- claim 先修改 owner entry 的编辑投影并递增 owner revision；若 owner entry 已发布，它会产生待发布变更。管理后台可立即看到认领结果，但不可变 publication/未来学习端要等 owner entry 再发布后才更新。
- 一期学习端不消费这些新字段，但 publication 必须保持可解释和不可变，避免未来接学习端时重做数据基础。

### 建议稳定错误码

| HTTP | `code`                                 | 场景                                                 |
| ---- | -------------------------------------- | ---------------------------------------------------- |
| 409  | `entry_revision_conflict`              | owner entry revision 已变化，刷新共享例句后重试      |
| 409  | `pending_sentence_association_claimed` | 同一 pending 已被认领；响应 meta 可带当前目标        |
| 409  | `idempotency_key_conflict`             | 同 key 对应不同 claim payload                        |
| 422  | `sentence_source_range_invalid`        | 范围空、越界、非单词或重叠                           |
| 422  | `sentence_source_text_mismatch`        | `surface` 与当前原文切片不一致                       |
| 422  | `sentence_reannotation_required`       | 原文变化后复用了旧 positioned association ID         |
| 422  | `sentence_target_not_published`        | 普通关联/一期认领的目标没有当前 publication          |
| 422  | `sentence_target_sense_mismatch`       | sense 不属于目标词条或不在当前 publication           |
| 422  | `sentence_form_unmatched`              | 选中文本无法匹配目标 sense 所属 POS 的任何 form slot |
| 422  | `sentence_form_ambiguous`              | 存在多个合法 form slot 但请求未明确选择              |

错误文案可以演进，前端只按稳定 `code` 分支并使用现有 issue 定位机制落到 sentence/association 节点。

## 前端数据流

### 正常关联

1. 管理员在某个 sense 的“多维例句”区域点击“添加例句”，右侧抽屉打开；前端先在抽屉本地维护草稿，只有点击完成才在 `shared_sentences[]` 创建一次正文并保留当前 sense 的待确认归属，取消不落数据。
2. 管理员选中单词位置；前端把 UTF-16 Selection 安全转换为 Unicode code point range，并保存 `surface`。
3. 用选中文本调用现有 `related-search`：先 exact，再 contains；候选限制为 `kind=word`。
4. 管理员选择词条和具体词义；普通发布候选调用 resolver。若目标就是正在编辑的当前草稿词义，前端只用当前本地词形快照解析归属，不开放其他草稿候选。
5. `resolved` 直接创建 linked；`ambiguous` 才展示 form candidate；`unmatched` 提供改选或保存 pending。
6. meanings 保存只上送 canonical 输入字段。保存成功后用服务端 envelope 替换缓存，不合并旧局部状态。

### 未匹配与预关联

1. 搜索无候选或 resolver 为 unmatched 时，管理员点击“保存为预关联”。
2. 前端生成稳定 association UUID，保留 range/surface/pending_word。
3. 同一页面先按业务键禁用重复添加；服务端保存时再由 partial unique 保证最终只有一条。
4. 保存响应回显服务端规范化值，前端用响应替换本地值。

### 反向认领

1. 目标词条发布成功后，在预览/发布步骤或重新进入详情时查询 pending 列表。
2. 管理员查看句子上下文并选择当前词条的具体 sense。
3. resolver 确认 form slot；若歧义，管理员选择。
4. claim mutation 带独立 Idempotency-Key 和 pending 返回的 owner revision。
5. 成功后失效目标词条 pending 列表、owner entry 详情和受影响 linked-sentences 查询；冲突时只刷新对应 source，不覆盖。

### 方言预览

1. 从 `useDialectPreference` 取得当前管理员 `uk/us`。
2. 对每个 linked association 读取后端只读 `form_variants`：优先精确方言，其次 `common`。
3. 无可用 variant 时保留 `source_range.surface` 并显示数据缺口。
4. 替换展示从句尾向句首处理，避免前面拼写长度变化破坏后续 range；持久化正文和 range 不随偏好改变。

### 原文修改

1. 英文 `text` 发生变化即把所有 positioned associations 放入本地“待重新确认”集合，展示 linked/pending 影响数量。
2. 管理员确认全局影响后，界面保留旧目标作为建议，但清除旧 range 和旧 association ID。
3. 管理员逐项重新选择，生成新 association ID；全部处理后才允许保存。
4. 409/422 时刷新 owner entry，以服务端版本为准。

## 前端代码影响范围

### 类型与请求层

| 文件                                                            | 建议改动                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `word-creation/meaningsAndExamples/sentenceAssociationTypes.ts` | 在真实 OpenAPI 落地前保存 admin 私有草案类型，不污染 `@tsz/types` wire 镜像                      |
| `packages/types/src/admin-word-v2.ts`                           | 当前保持 Rust OpenAPI 镜像；后端发布 additive contract 后再通过权威契约同步 root 字段            |
| `packages/types/src/admin-word.ts`                              | 对齐 Rust 已 required 的 `RelatedWordResult.headword_variants`，不再让候选类型落后于当前 OpenAPI |
| `packages/types/src/index.ts`                                   | 如类型拆分文件则补导出；优先不为单一功能制造多余包层级                                           |
| `packages/api-client/src/admin.ts`                              | 增加 resolver、linked sentences、pending 列表、claim 封装；claim 注入 `Idempotency-Key`          |
| `packages/api-client/src/admin.test.ts`                         | 验证 method/path/query/body/header，特别是 cursor 与幂等键                                       |
| `packages/api-client/src/endpoints.contract.test.ts`            | 后端契约落地后移除对应 PENDING/补 schema、状态码与 header 断言                                   |
| `packages/api-client/src/openapi.snapshot.json`                 | 后端 OpenAPI 合入后运行原生 `sync:openapi` 生成，禁止手改                                        |

### admin 数据层与 UI

| 文件                                                                      | 建议改动                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/features/dictionary/dataSource.ts`                        | 扩展真实/mock 能力类型与 facade，保持生产环境不打入 mock                                                 |
| `apps/admin/src/features/dictionary/api.ts`                               | 增加 linked/pending 分页 query hooks，复用现有 query key 体系                                            |
| `apps/admin/src/features/dictionary/word-creation/api.ts`                 | 增加 resolver 与 claim mutation；成功后精确失效相关缓存                                                  |
| `word-creation/MeaningsAndExamplesStep.tsx`                               | 在现有“多维例句”区域按 association 派生列表；新增/点击英文例句打开抽屉，不增加独立区块                   |
| `word-creation/meaningsAndExamples/SentenceAssociationEditor.tsx`（新增） | 承载多维例句抽屉、位置选择、候选/歧义/pending 状态；内部共享模型不暴露为产品术语                         |
| `word-creation/meaningsAndExamples/mapping.ts`                            | 新增按 sentence ID 更新根池、按目标 sense 派生/排序、删除 sense 时影响计数；不得删除共享正文             |
| `word-creation/model.ts`                                                  | 新 shared sentence/association factory；wire 映射剥离只读投影；原文变化重建 positioned association       |
| `word-creation/meaningsAndExamples/validation.ts`                         | range、surface、单位置状态、target/form 完整性、legacy 兼容校验与 issue 定位                             |
| `word-creation/readiness.ts`                                              | pending 允许完成；未处理 ambiguity/待重新确认阻断完成                                                    |
| `word-creation/contentLimits.ts`                                          | 根级共享句只计一次，不能按多个 sense 重复计数                                                            |
| `word-creation/PreviewAndPublishStep.tsx`                                 | 按当前管理员偏好预览 form variant，展示 pending/legacy/unavailable 状态                                  |
| `word-creation/contentCompletion.ts`                                      | 生成例句先作为 `legacy_unpositioned`/待标注候选，不让模型输出伪造 range/form；人工句去重改按 sentence ID |
| `word-creation/word-creation.css`                                         | 最小增加选区、状态徽标、歧义列表和影响确认样式；继续使用 antd v6，不引入 Tailwind/`@tsz/ui`              |
| `apps/admin/src/features/dictionary/mock/adminWordsMock.ts`               | 镜像唯一约束、published-only 解析、cursor、claim 幂等和 revision 冲突，不能只返回静态成功                |

`ContextLinksEditor` 的现有关系词搜索行为仍可供 legacy 例句使用；新 shared sentence 应由 `SentenceAssociationEditor` 承接，避免用兼容分支把两套语义混在一个控件里。

## 迁移与兼容

采用 expand → lazy upgrade → switch → contract：

1. **Expand**：后端先加 nullable/new table、root wire、resolver/pending/claim/read endpoints；旧 `WordSenseV2.sentences[]` 和旧 `sentence_links` 继续原样读写。
2. **不做上线即全量迁移**：存量例句保持 nested，因此旧前端仍能读取、编辑和发布；相同正文绝不自动合并。
3. **Lazy upgrade**：管理员对某条 legacy sentence 点击“补齐位置”后，在同一个 owner entry 事务里把它从 nested 移到 root，保留 sentence/en/zh 节点 ID、正文、译文、难度；旧 focus/context 先转为 `legacy_unpositioned` 建议，逐项确认后换成新 association ID。
4. **方言兼容**：若旧 `en_text` 还是 `distinguish`，先沿用现有收敛提示和管理员偏好把它安全转为 unified，再把保留的 common text node ID 用作 `en_text_id`；不能静默丢弃另一侧。
5. **Switch**：新前端只为新建/已人工升级内容写 `shared_sentences[]`；未升级 legacy 继续走旧字段，不双写同一句。
6. **可选批量升级**：只有人工流程稳定后才另开迁移任务。脚本必须逐项对账 sentence、英文/中文 text node 和 focus/context 数量；任一不等即回滚事务。
7. **Contract**：确认所有活跃数据已升级、旧前端不再部署且回滚窗口结束后，才另开任务移除 nested sentence wire 和 `focus/context` 假设。

lazy upgrade 保存必须拒绝同一个 sentence ID 同时出现在 nested 与 root，防止兼容阶段产生双份事实源。

## 测试策略

项目 `test` skill 已先产出 `test-matrix.md`；本轮开发/mock 实现按矩阵落地，以下仍是交付审查和后续真实联调的最低覆盖范围：

### 前端单元测试

- UTF-16 selection → Unicode code point range：ASCII、emoji 前缀、撇号/连字符、同词两次。
- shared sentence 按 ID 只存一次；按 target sense 派生列表和独立 `sort_order`。
- pending 业务键去重；同句同位置一条、不同句三条、同句不同位置两条。
- 同句两个位置指向同一 sense 时保留两个 range，但 sense 例句列表只显示一次且排序一致。
- resolver 三态；唯一结果无额外选择、歧义必须选择、unmatched 只能 pending/改选。
- 方言展示精确匹配、`common` fallback、缺失保留原文；从句尾替换不破坏范围。
- 英文原文变化清除旧位置身份；中文/难度变化保留。
- legacy 数据读取、升级和 wire 输出不丢节点 ID。
- content limit 对共享正文只计一次。

### admin 组件/集成测试

- 真实 Selection 操作后显示选中文本和候选；键盘可完成位置选择与候选确认。
- normal / ambiguous / unmatched 三条 UI 路径。
- 重复点击 pending、保存 pending 与其他 linked 共存。
- 从 center/picture/wall 三个 sense 看到同一 sentence ID，编辑 owner 后全部视图同步。
- 外部 owner 的共享句只读并能定位来源词条。
- publish 后出现历史 pending，选择具体 sense 后 claim；409 刷新且不覆盖。
- 原文修改影响确认、全部 reannotation 门禁和服务端 issue 聚焦。
- 现有 legacy `ContextLinksEditor`、拖拽排序、删除 sense 引用清理回归。

### API client / contract

- 新 method/path/query/body/header 精确断言；claim 必有 UUID `Idempotency-Key`。
- OpenAPI schema required/enum、Problem Details 状态码、published-only 描述和 cursor 形状。
- 前端类型与 OpenAPI 的 snake_case 字段逐项对账，不手工维护第二套 camelCase wire。

### 后端建议测试（由 `tsz-rust` 团队实现）

- 数据库 partial unique 在并发事务下防重复，不只测串行 service。
- range 码点、surface mismatch、overlap、目标 sense/form 复合归属。
- related target 已归档/重发/移除 sense 或 form slot 的保存与发布结果。
- pending claim 同 key 重放、不同 payload 同 key、双管理员并发、owner revision 冲突。
- pending 不进 publication；linked 正确锚定 target publication/sense/form slot。
- migration 一对一对账和 legacy publication 回归。

### 联调与验收证据

- 单元/mock、真实 HTTP、真实 PostgreSQL 约束、已登录浏览器验收分别记录，不把 mock 绿或 HTTP 200 当成真实并发/数据库证据。
- 使用真实 `tsz-rust` 和已发布测试词条复验 `Center the picture on the wall.`：三个正式位置、一个 `on` pending、重复保存仍一条、目标发布后认领。
- 管理员方言偏好分别为 `uk/us` 各验一次；数据库 payload 中确认无 association dialect 字段。
- 一期明确把学习端出题和音频联动标为 OUT-OF-SCOPE。

## 风险与缓解

| 风险                                 | 影响                               | 缓解                                                                                  |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| 共享对象仍被某 entry 持有            | 从外部 sense 直接编辑会跨 revision | 外部引用只读，正文修改必须回 owner entry；claim 用 owner revision                     |
| Unicode 位置错位                     | 关联到错误字符，ASCII 测试发现不了 | 前后端统一码点；surface 双校验；覆盖 emoji/重复词                                     |
| 原文修改后旧 range 偶然仍命中        | 静默关联错误词                     | 英文 text 改变即禁止复用旧 positioned association ID                                  |
| related-search 结果过期              | 保存时目标已归档或换 publication   | resolver 与保存阶段都重新校验，搜索只作候选                                           |
| form slot 在新 publication 中退役    | 方言展示失去事实源                 | publication ref 锚定 form slot；目标变更走 inbound 影响检查                           |
| pending 并发重复或双认领             | 多行脏数据/后写覆盖                | partial unique + 行锁 + Idempotency-Key + owner revision                              |
| root shared 与 legacy 双模型长期并存 | 映射、计数和发布分支复杂           | 明确 expand/contract 截止条件；不双写同一业务句                                       |
| content completion 仍生成旧 links    | AI 结果伪造位置或破坏新模型        | 生成结果先保持 nested legacy/待标注，位置和 form 只能由管理员 + resolver 确认         |
| inbound 例句很多                     | 词条详情响应膨胀/N+1               | 独立 cursor endpoint，批量加载目标快照，不嵌入主详情全量响应                          |
| 旧前端回滚后看不到新 shared 内容     | 数据仍在但编辑入口缺失             | 后端先长期保留兼容读；回滚期间对含 shared 内容的词条进入只读告警，不做 down migration |

## 发布与回滚建议

虽然本次不部署，落地时建议顺序为：

1. 后端 additive schema/API/OpenAPI 先上线，旧前端行为不变。
2. 验证旧 nested 数据继续读写/发布；一期上线不做全量数据迁移，也不删除旧列/旧 JSON。
3. 前端同步 OpenAPI、完成测试和真实联调后再切新 UI。
4. 观察 duplicate/claim/reannotation 错误码、migration 计数和 owner revision 冲突率。
5. 若前端需回滚，恢复旧前端并把含新 shared 内容的编辑置为只读；后端和数据保持不动。
6. 若后端需回滚，先停止新前端写入、导出新增 association 数据，再回退服务；禁止直接执行破坏性 down migration。
7. 删除 legacy 字段和兼容代码必须另开评审与迁移任务，不与一期上线绑在一起。

## 前后端评审清单

- [ ] 产品确认 requirements 的一期范围、单位置单词语义和原文全量重新确认规则。
- [ ] 产品确认认领必须等目标发布，还是增加草稿 `reserved` 生命周期。
- [ ] 后端确认“entry owner + root shared_sentences”而非全局独立 revision 的聚合边界。
- [ ] 后端确认 form slot 可作为长期稳定引用，并给出 target publication 锚定方式。
- [ ] 后端确认 partial unique、claim 行锁顺序、revision 和幂等键语义。
- [ ] 前端确认 owner 外引用只读、现有 related-search + 新 resolver 的交互拆分。
- [ ] 双方确认 legacy migration 对账、publication 兼容和回滚只读策略。
- [ ] 两份评估文档统一批准后再进入 `test` skill 与业务实现。

## 2026-08-29 V3 前端 Mock 技术与产品设计切片

### 设计目标与判断顺序

本切片优先验证“管理员是否能顺着界面理解一条多维例句”，而不是验证旧模型能否在 V3 中复用。判断顺序固定为：

1. **先识别编辑对象**：顶部只放英文例句和 CEFR，避免管理员进入抽屉后先面对关联字段。
2. **再建立空间映射**：把句子拆成词块，用蓝色关联、紫色短语范围和绿色目标区分“句中哪里发生了什么”。词块可点击，选中态只负责定位详情，不承担正式标注语义。
3. **随后解释关联事实**：用目标词/短语分组卡片承接高密度信息。卡片摘要先回答“关联到谁、哪个词义、几处”，内部的小型词形面板再回答“句中形式是什么、BrE/AmE 怎么显示、属于哪种词形”。
4. **最后处理译文层级**：中文译文独立成区，初/中/高作为内容难度而不是表格列，避免与词形信息横向挤压。
5. **动作始终说明边界**：Mock 操作的反馈直接写“仅保留在抽屉内存 / 未写入词条”，不借成功色或“保存成功”文案制造已持久化错觉。

### 从参考图和旧方案保留什么、舍弃什么

| 材料中的元素                                                 | 本切片处理                       | 理由                                                   |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------ |
| 参考图的例句、等级、成分词、关联详情、译文顺序               | 保留并重组为四个清晰区块         | 顺序符合从文本到语义再到本地化的认知路径               |
| 参考图中的黄框批注、长页面、灰色连续字段                     | 舍弃                             | 黄框是说明材料；连续表格造成视觉疲劳且不符合当前 admin |
| 旧版英文原文、CEFR、具体词义、词形状态概念                   | 保留概念                         | 是后续正式能力仍需回答的核心事实                       |
| 旧版浏览器 Selection、真实搜索、resolver 三态、pending/claim | 本切片舍弃执行逻辑               | 会让原型依赖未落地契约，也会把 Mock 误解为联调结果     |
| 旧 `SharedWordSentenceV1` 与 `sentenceAssociations` 数据源   | 完全隔离                         | 不能污染 V3 wire 或偷偷形成第二套正式数据源            |
| 旧抽屉单列堆叠所有控件                                       | 改成摘要 + 分组卡片 + 局部详情   | 高密度信息应渐进展开，不应成为连续大表格               |
| 短语与内部成分                                               | 仅做一张明确标注 Mock 的评审卡片 | 用户本轮要求评审单词/短语分组，但它不是正式契约承诺    |

### 组件与文件边界

- 新增 `apps/admin/src/features/dictionary/word-creation-v3/components/V3MultidimensionalSentenceDrawerMock.tsx`：拥有 Drawer、本地状态、Mock 固定数据和全部交互；props 只有 `open` 与 `onClose`，从类型层面就无法修改父级 meanings。
- 新增同目录 `V3MultidimensionalSentenceDrawerMock.css`：只使用局部 `v3-sentence-mock-*` 命名，控制抽屉宽度、分区卡片、词块、关联卡片和响应式布局，不改相邻 V3 行样式。
- 新增同目录测试文件：直接验证抽屉本地状态、反馈与关闭行为。
- 修改 `V3MeaningsAndExamplesStep.tsx`：只把临时 Drawer 空壳替换为新组件，沿用现有 `sentenceDrawerOpen`，不把 sense、wordId 或 `onChange` 传给 Mock。
- 修改 `V3MeaningsAndExamplesStep.test.tsx`：保留并扩展“打开不预写”“最后一条删除后空状态”集成证据。

不修改 `@tsz/types`、`@tsz/api-client`、data source、旧 `SentenceAssociationEditor`、正式 V3 映射或保存函数。

### 本地状态模型

组件每次挂载都从一份只读的代表性样例创建状态：

- `sentence`：`It is centered on the center of the wall.`；
- `level`：`B1`；
- `selectedToken`：当前词块定位；
- `matchState`：`ready | stale | matched`，英文变化进入 `stale`，模拟匹配回到 `matched`；
- `translations[]`：本地 ID、层级和文本，可独立增删改；
- `feedback`：模拟匹配、模拟生成或保存预览后的可见 Mock 提示。

Drawer 使用 `destroyOnHidden`；关闭后组件卸载，重新打开回到代表性样例。该重置是原型会话行为，不是撤销正式草稿。模块不导入请求层，也不接受父级数据回调；“保存预览”只更新 `feedback`，不会关闭 Drawer。

### 视觉与渐进披露

- 抽屉桌面宽度约 `960–980px`，给高密度卡片足够横向空间；窄屏退化为单列，但本轮主要验收桌面端。
- 顶部使用轻蓝 Mock 边界提示，而不是占满空间的警告大块；标题区用 `前端 Mock` 标签持续提醒能力状态。
- 四个区域均用小标题、说明和轻背景分开；只有例句本体是主视觉卡片，其余卡片降低阴影，保持克制。
- 词块以原句阅读顺序排布。普通文本无底色；关联词使用品牌蓝，短语范围使用紫色下划线，其他目标使用绿色。按钮保留原生 focus-visible，不用不可达的纯 `span`。
- 关联分组在桌面端用 2 列卡片，卡片内的英美词形用 2 列迷你面板；摘要、状态 Tag、词形详情形成三层，而不是把每个字段摊成一行表格。
- 译文以纵向卡片呈现，每张只包含层级选择、文本和删除，新增入口放区块底部；不做拖拽或复杂排序，避免超出本轮判断目标。
- Footer 固定提供“取消”和“保存预览”；模拟匹配/生成靠近各自内容区，减少跨区寻找动作。

### Mock 交互时序

```text
主页面“添加例句”
  -> 打开抽屉（父级数据不变）
  -> 编辑英文/CEFR（matchState=stale，仅本地）
  -> 点击词块定位关联卡片（仅本地）
  -> 模拟匹配（matchState=matched + Mock 反馈）
  -> 编辑/增删译文，或模拟生成三级译文（仅本地）
  -> 保存预览（反馈“未写入词条”，抽屉保持打开）
  -> 取消/X（卸载本地会话，父级数据仍不变）
```

### 自定义多个单词组成词语

不依赖拖拽或隐藏的 Shift 多选，采用明确的“两端点连续范围”模式：

1. 点击“标记词语”进入组词模式，界面提示“先点首词，再点尾词”。
2. 第一次点击记录起点；第二次点击记录终点，支持从左到右或从右到左选择。
3. 起止之间的英文词块以紫色连续范围预览，标点不作为词语成员；少于两个单词时“组为词语”禁用。
4. 确认后更新抽屉本地的短语范围和短语分组卡片，并给出明确 Mock 反馈；取消只清除本次端点选择。
5. 正式版本若允许同句多个短语，可重复该流程生成多组稳定 range；本切片先验证单次组词的认知路径，不发明持久化 ID、重叠规则或 wire。

该方案的核心是可发现和可撤销：管理员不需要知道桌面快捷键，键盘也能通过 Tab 聚焦词块并用 Enter 选择端点。正式契约仍需另行定义 Unicode range、短语重叠和成分语义，本 Mock 不作承诺。

自定义短语确认后，在短语分组卡片中增加一条橙色 `Pending 词义` 本地草稿。代表性短语使用确定性的 Mock 文案预填；其他短语使用包含当前短语表面的待确认文案，避免伪装成自动语义推断。输入框可编辑，但状态仍由 Drawer session 持有，不生成 sense ID、不进入 `DraftMeaningsStepContentWritableV3`，关闭后随会话一并丢弃。

### 与未来正式契约的边界

- 当前组件的数据常量是 presentation fixture，不命名为 wire、不带正式 UUID、不导出给业务层，也不经过 `toMeaningsWireContent`。
- “模拟匹配”不调用 `relatedSearch` 或 resolver，不声称候选来自已发布词条；词义、词形类型和 BrE/AmE 都明确显示为 Mock 状态。
- “模拟生成”是确定性的本地填充，不调用 AI，不承诺翻译质量。
- “保存预览”不是 save intent，不生成 `WordSentenceWritableV3`，不触发 `onChange`/`onSave`。
- 短语卡片只用于评审信息层级。未来若正式契约仍只支持单词位置，卡片可以删除而不影响组件外部契约；若未来支持短语，则需另做 requirement/OpenAPI/validation 评估。
- 正式接入时应新建 production 组件或显式替换本 Mock，而不是逐步给 Mock fixture 接请求，防止原型状态与真实状态混杂。

### 测试策略与验收证据

实现前先在 `test-matrix.md` 增加 `VM-*` 用例。组件测试覆盖英文/CEFR 本地编辑、词块选择、模拟匹配/生成、译文增删、保存预览和关闭重置；父组件集成测试覆盖打开与父级数据不变、删除最后一条后的空状态。视觉密度、分区层级、桌面宽度和最终完成态由 Codex 内置浏览器手测并截图/停留，不用 jsdom 断言像素代替视觉验收。

### 风险与控制

| 风险                     | 控制                                                           |
| ------------------------ | -------------------------------------------------------------- |
| Mock 被误认为已接后端    | 标题 Tag、顶部说明、每个模拟动作反馈三重标识；组件不导入请求层 |
| 临时状态误写 V3 meanings | props 不接收 `value/onChange/onSave`；父组件回归断言完整值不变 |
| 信息密度退化成旧表格     | 四段式层级、分组卡片、卡内渐进详情；浏览器专项验收             |
| 与并行大改动冲突         | 主要新增独立文件；父文件只替换现有临时空壳，不整理相邻代码     |
| 短语示例被当成契约结论   | UI 和文档明确标记 Mock 候选；不进入任何 wire/保存映射          |
| 关闭后残留原型状态       | `destroyOnHidden` 卸载会话；测试重新打开恢复代表性样例         |

## 2026-08-30 正式前后端能力技术设计

### 当前真实基线

本切片以 2026-08-30 当前 checkout 为准，覆盖并替代本文 2026-08-22 基线中“后端没有例句关联契约”的过时结论。

- 前端评估 worktree：`feat/multidimensional-example-linking`，核对时 `HEAD=8ed4900`，工作区已有 44 个并行修改/未跟踪项；本次仅追加文档，不整理或覆盖其他改动。
- 后端 `tsz-rust`：`main@0d89a3b`，核对时工作区干净。
- 当前 OpenAPI 已有 `WordSentenceAssociationV3` 和 `associations_state` 只读投影。
- `WordSentenceWritableV3` 明确不接受 `associations`；meanings 保存会清除客户端回传的只读投影。
- 当前独立命令 `PUT /api/v1/admin/lexicon/entries/{id}/sentences/{sentence_id}/associations` 支持整组替换、`base_revision`、`base_lifecycle_revision` 与 `Idempotency-Key`。
- 当前 `SentenceAssociationInputV2` 只接受 `source_dialect + source_range + target_word_id + target_sense_id`，无法表达 Pending target/headword/gloss。
- `lexicon.sentence_associations` 已独立于 meanings 内容表，锚定稳定 sentence node；目标 entry/sense 和只读快照目前均为非空。
- 自动解析只放行 noun、verb、adjective、adverb；人工命令允许连续、非空、首尾无空白且不超过 200 码点的范围，并拒绝同方言侧重叠。
- V3 关联词已有 `pending_target_headword + pending_target_gloss` 互斥形状，可借鉴产品语义和发布校验，但例句关联继续使用独立 DTO、表和生命周期。
- 前端 `@tsz/types` 已镜像只读关联投影，但 `@tsz/api-client` 和 admin 生产 UI 尚未封装/调用整组替换命令。

### 选定方案

采用“**现有 sentence node + 独立 sentence_associations 状态机的 additive 扩展**”：

1. 例句正文继续属于 V3 meanings 中的具体 sense，不在本轮引入根级 `shared_sentences[]`。
2. 正式和 Pending 位置关联继续存放在 `lexicon.sentence_associations`，避免 meanings 整步保存覆盖关联。
3. 现有 linked 输入保持兼容；关联目标扩展为 linked/pending 互斥形状。
4. Pending 只由管理员人工标记产生，自动 resolver 仍只写 linked，不扩大词性闸和停用词口径。
5. Pending 不自动创建目标短语；管理员显式进入创建或选择已发布目标后，再通过 claim 原子转为 linked。
6. linked/Pending 都保持为独立 lifecycle 投影，不进入 publication snapshot；claim 沿用现有人工关联语义，只推进 lifecycle revision。
7. 前端生产抽屉替换 Mock 数据源，但关联保存继续走独立命令，不把字段塞进 `WordSentenceWritableV3`。

### 不选方案

| 方案                                | 不选原因                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 把 `associations` 写入 meanings DTO | 当前后端刻意将关联与整步内容重写隔离；会让下一次 meanings 保存删除人工修正，并污染严格 V3 wire                       |
| 重新建立根级 `shared_sentences[]`   | 当前已上线 stable sentence node + 独立关联表；本轮目标可以增量完成，根级共享会扩大迁移、publication 和编辑所有权范围 |
| 直接复用 `WordRelationV3`           | 关联词没有原句方言侧、码点范围、文本变更失效和 scan 语义；只能借鉴 pending target 形状，不能共用对象                 |
| 打开/关闭抽屉即创建目标短语         | 产生孤儿草稿和不可见跨词条写入，违背取消无副作用                                                                     |
| 来源词条发布时自动物化所有 Pending  | 同名短语、词义选择和并发冲突会变成隐式跨 entry 写入；第一期采用显式创建/认领                                         |
| Mock 组件逐步接生产请求             | 原型 fixture、确定性词义和真实 revision 状态会混在一起；生产组件应独立实现并在能力开关下替换                         |

### 建议 wire 增量

保持现有整组替换请求外壳不变，只扩展 association item 为互斥 target shape。现有 linked payload 继续合法，服务端按字段形状派生状态；响应显式返回 `state`。

#### Linked 输入

```json
{
  "id": "association-uuid",
  "source_dialect": "common",
  "source_range": {
    "start": 17,
    "end": 23,
    "surface": "center"
  },
  "target_word_id": "target-entry-uuid",
  "target_sense_id": "target-sense-uuid"
}
```

#### Pending 输入

```json
{
  "id": "association-uuid",
  "source_dialect": "common",
  "source_range": {
    "start": 17,
    "end": 35,
    "surface": "center of the wall"
  },
  "pending_target_kind": "phrase",
  "pending_target_headword": "center of the wall",
  "pending_target_gloss": "墙的中心位置"
}
```

#### 输入互斥规则

- linked：`target_word_id + target_sense_id` 必须同时存在，全部 `pending_target_*` 缺失。
- pending：`pending_target_kind + pending_target_headword` 必须存在，target ID 缺失；`pending_target_gloss` 可选。
- 任一半套形状返回 422，稳定 issue field 指向缺失/冲突字段。
- 服务端不接受 `target_headword`、`target_gloss`、`resolved_pos`、`resolved_form_type` 或 `target_form_slot_id` 只读投影输入。

#### 响应投影

`WordSentenceAssociationV3` 增加 `state: linked | pending`，linked 返回现有 target/snapshot/form 投影；pending 返回 target kind/headword/gloss 和规范化键，不伪造 target UUID、POS 或词形。

### API 设计

#### 扩展现有整组替换

`PUT /api/v1/admin/lexicon/entries/{id}/sentences/{sentence_id}/associations`

- 沿用整组目标状态、revision、lifecycle revision、幂等键和 200 envelope。
- 允许 linked 与 pending 混合列表。
- 空列表清空该句全部关联；删除单项通过从完整列表移除表达。
- 409 后前端必须刷新，不重放旧 base revision。

#### Pending 反向列表

`GET /api/v1/admin/lexicon/entries/{id}/pending-sentence-associations`

- 只允许查询目标词条当前词头/词形可命中的 active Pending。
- cursor 分页，返回来源 entry、sentence、方言侧、range、surface、pending gloss、owner revision 和创建信息。
- 默认只返回 active；已认领/失效项不混入。

#### Pending 认领

`POST /api/v1/admin/lexicon/pending-sentence-associations/{association_id}/claim`

```json
{
  "target_word_id": "target-entry-uuid",
  "target_sense_id": "target-sense-uuid",
  "base_owner_entry_revision": 12,
  "base_owner_lifecycle_revision": 3
}
```

- Header 必须携带 UUID `Idempotency-Key`。
- 服务端锁定 association 和 owner entry，重新校验来源 range、目标 publication 和目标 sense。
- 原行、原 association ID、原 sentence/range 原地转 linked，不采用“删 Pending 再插 linked”。
- 重复同 key/同 payload 返回首次结果；不同 payload 同 key、已认领或 revision 过期返回稳定 409。

#### 目标短语创建

第一期不新增隐式 materialize API。前端从 Pending 卡片显式进入现有 V3 phrase 创建流程，并携带页面级 navigation state：

- `pending_association_id`
- `pending_target_headword`
- `pending_target_gloss`
- `return_to`

创建页只把它们作为预填建议；不把 association ID 写进词条 wire。目标达到可引用状态后返回来源页，再由 claim 命令完成绑定。

### 数据库迁移建议

对 `lexicon.sentence_associations` 做 additive migration：

1. 新增 `state TEXT NOT NULL DEFAULT 'linked' CHECK (state IN ('linked', 'pending'))`。
2. 新增 `pending_target_kind`、`pending_target_headword`、`normalized_pending_target_headword`、`pending_target_gloss`。
3. 将 `target_entry_id`、`target_sense_id`、target snapshot 和 `resolved_pos` 改为 nullable；现有数据保持 linked 且值不变。
4. 增加 linked/pending 完整形状 CHECK；pending 的 `origin` 必须为 `manual`，不得带 target form slot 或 resolved form type。
5. 保留现有 `(sentence_id, source_dialect, range_start)` 唯一约束，继续保证同一起点只有一个状态；服务层维持完整 overlap 校验。
6. 增加 active Pending 反向索引：`(normalized_pending_target_headword, pending_target_kind) WHERE state = 'pending'`。
7. `sentence_association_scans` 不迁移；自动解析只管理 linked，不能覆盖人工 Pending。
8. 回滚时保留新增 nullable 列和状态，不执行破坏性 down migration；通过 capability flag 停止新 Pending 写入。

### 后端服务规则

- 关联 replacement 在事务内校验完整列表，任一错误整组不写。
- range 使用 Unicode 码点半开区间，surface 必须与具体方言侧正文逐码点一致。
- 同一方言侧禁止重叠；uk/us 各自独立计算位置。
- Pending headword 走智能词库统一 normalization，不由前端生成权威规范化键。
- 当前已实现版本要求 `pending_target_kind=phrase` 至少两个连续 token；文末 2026-08-30 一键发现切片批准后，将由 `source_segments[]` 多段契约取代这一限制。
- 自动发布 resolver 不能删除/替换人工 Pending；正文 hash 改变时将受影响 Pending 标为失效或随整句重标流程删除，不能静默平移。
- claim 必须校验目标 entry 未归档、当前 publication 存在、sense 属于目标 publication。
- Pending/linked 都不进入 publication snapshot；claim 后 owner lifecycle revision 增加，当前读取立即返回 linked，历史 publication 不变。
- 审计记录 create/update/delete/claim 和操作者，但不额外复制完整例句正文。

### 新增例句保存时序

当前 association 命令要求 sentence node 已存在，因此生产抽屉采用可恢复两阶段保存，不在一期新增跨 meanings/association 的复合命令：

1. 对新例句先通过 V3 meanings save 创建稳定 sentence node；主页面暂不关闭抽屉。
2. 使用返回的新 revision 调整 association 整组目标。
3. 两步都成功后关闭抽屉并刷新主页面。
4. 如果第一步失败，服务端无新 sentence，保持抽屉草稿。
5. 如果第一步成功、第二步失败，服务端保留 `associations_state=unresolved` 的可恢复例句；抽屉保持打开并明确提示“例句已保存，关联待重试”，刷新后不得隐藏这一状态。

已有例句只改关联时直接从第 2 步开始。人工 association PUT 必须以当前正文重新校验全部 range/surface，并在同一事务写入当前 resolver scan；因此新增例句在 meanings 保存后虽然暂为 unresolved，第二步可以安全建立为 resolved。若第二步失败，例句仍保留 unresolved 并允许用同一抽屉草稿重试，不能靠前端补偿伪装事务。

### 分层中文译文的正式契约提案

2026-08-30 用户确认一条例句最多包含初阶/中阶/高阶三档中文译文，每档最多一条，映射按初阶=C1/C2、中阶=B1/B2、高阶=A1/A2 原样执行。主页面的多维例句只做只读摘要，汉语译文行首只显示“初/中/高”档位，不加序号，所有修改统一进入右侧抽屉。抽屉编辑行则只保留“初阶/中阶/高阶”一个层级标签，不重复叠加短徽标和 CEFR 括号；底层 band 与 CEFR 映射不变。

译文区采用“一个区块、一组轻量列表”的视觉结构，不再给每条译文叠加独立底色卡片。桌面端按层级名、译文输入、删除操作单行对齐，以留白和细分隔线区分条目；输入聚焦时仅提升层级文字的品牌蓝反馈。新增入口与现有条目用虚线分隔并对齐输入列，窄屏再自然折为“层级/删除在上、输入在下”，数据和操作顺序不变。

关联状态的 wire 仍使用 `linked/pending`，但管理员界面不暴露工程枚举。来源例句的编辑与预览使用“已关联/待关联”；目标词条的反向处理列表使用动作导向的“待认领”；词义输入统一称“待关联词义”。空状态、按钮、标签、提示和 aria 名称都遵循同一映射。

当前 `zh_text_id + zh_text` 是单值结构，不能无损承载三档。选择在 V3 sentence 上新增 canonical `zh_translations[]`，而不是换行拼接、JSON 塞进 text、只取第一条或仅前端内存。

建议 wire：

```json
{
  "zh_translations": [
    {
      "id": "uuid",
      "band": "c1_c2",
      "content": { "version": 2, "text": "……", "annotations": [] }
    }
  ]
}
```

- `band` 闭合为 `c1_c2 | b1_b2 | a1_a2`；UI 分别显示“初 / 中 / 高”。不使用 `low/high`，因为产品叫法与标准 CEFR 难度方向相反。
- 数组长度 1–3，band 唯一，ID 稳定，RichText 非空；服务端、数据库双层校验。
- 新 `WordSentenceWritableV3` 只把 `zh_translations` 作为写权威。响应在过渡期保留只读 `zh_text_id + zh_text` 别名，值由服务端从数组派生；新前端不得回传别名。
- 兼容别名优先选择与句子 `level` 同带的译文；若缺失则按“中 → 初 → 高”确定性回退，避免同一响应随机变化。

数据库复用现有 meanings node/text-variant 模型，不新增重复 RichText 表。三个闭合 `field_role`（`zh_translation_c1_c2 / b1_b2 / a1_a2`）直接编码 band，现有 `(owner_node_id, field_role, language, dialect)` slot 唯一约束保证同句同档最多一条；translation ID 继续是稳定 text-variant node ID。迁移把 V3 既有 `zh_text` 行按句子 CEFR 原地改为对应 role，保留 ID、content 和 hash；down migration 在发现同句多档时显式失败，禁止破坏性折叠。

前端 Drawer session 改为维护 translation full list；新增按钮只展示缺失 band，三档齐全时隐藏。删除最后一条前端阻止，服务端仍以 422 兜底。外层摘要直接遍历响应数组，只读显示全部档位。

拒绝方案：

- 把三条拼成一个 `zh_text.text`：无法独立编辑、校验或朗读。
- 继续用句子 `level` 推导所有译文：一条例句无法同时拥有三档。
- 前端临时数组、保存时只取一条：会造成用户看到成功但刷新丢数据。

### 前端正式架构

#### 类型与请求层

- `@tsz/types` 1:1 镜像 expanded association input/projection、pending page 和 claim wire，全部 snake_case。
- `@tsz/api-client` 增加 replace/list/claim 封装与 method/path/header/body 测试；不得从 Mock 类型导出业务 DTO。
- OpenAPI 同步后删除对应 pending 契约白名单，不手改 snapshot。

#### admin 状态流

- 新建 `V3MultidimensionalSentenceDrawer` 生产组件；Mock 继续独立保存，待生产能力验收后删除或移入 story/demo。
- Drawer session 分开维护 sentence draft、association full list、selection、target search/resolution、save phase 和 conflict state。
- 现有已发布目标使用 `related-search` exact/contains 查询；管理员最终选择具体 sense。
- 自定义短语无目标时生成 pending association draft，预填 headword/gloss 可编辑；不触发父级 meanings `onChange`。
- Pending 卡片内的 gloss 使用受控输入，加入关联后仍可编辑或清空；只有保存抽屉时才进入 association payload。
- 位置选择统一支持一个 token 或连续多个 token：一个 token 生成 `word` Pending，多个 token 生成 `phrase` Pending，不拆成两套交互。
- 新例句按两阶段保存；已有例句只调用 association command。
- 409 时丢弃本地 base revision、刷新 entry，再让管理员重新确认；不得静默重试覆盖。
- claim 成功后精确失效 owner entry、目标 entry pending list、preview/publication impact 查询。
- 能力开关未启用时保持现有 V3 行编辑与只读投影，不显示不可用按钮或伪成功提示。
- 已保存 Pending 可显式进入目标创建：只通过 React Router navigation state 携带 association ID、headword、gloss 建议和 return URL；创建页预填词面，V3 meanings 只在首个中文定义仍为空时填入 gloss 建议。取消或返回不调用 claim、不修改来源 Pending；目标发布后仍由管理员在 Pending panel 选择具体词义认领。

### 代码影响范围

#### 后端 `tsz-rust`（评审批准后由独立实施任务修改）

- `migrations/*sentence_associations*.sql`：additive state/pending columns/check/index。
- `src/lexicon/dto/operations.rs`、`dto/v3.rs`、`dto/aggregate.rs`：expanded input/projection/page/claim DTO。
- `src/lexicon/service/sentence_association.rs`：replacement state validation、pending query、claim、文本变更失效和审计。
- `src/lexicon/repository/*`：pending persistence、反向分页、行锁和原地 claim。
- `src/lexicon/handler/commands.rs`、queries/router/openapi：扩展 PUT、增加 GET/POST。
- `docs/openapi.json`、`.sqlx/`：仅通过仓库原生命令生成并审查 diff。
- backend unit/service/integration/HTTP tests：range、shape、revision、idempotency、DB unique、双认领。

#### 前端 `tsz`

- `packages/types/src/admin-word-v3.ts`：正式 wire 镜像。
- `packages/api-client/src/admin.ts`、tests、contract snapshot：replace/list/claim。
- `apps/admin/src/features/dictionary/word-creation-v3/api.ts`：query/mutation 与精确失效。
- `V3MeaningsAndExamplesStep.tsx`：生产 Drawer 入口和服务端状态展示；不继续堆叠抽屉主体。
- `components/V3MultidimensionalSentenceDrawer.tsx`（新增）及局部 CSS/tests：生产交互。
- `V3MeaningsPreview.tsx`、publication history/review model：linked/pending/unresolved 展示。
- phrase creation navigation：只传页面 state，不扩展词条 wire。
- `docs/features/multidimensional-example-linking/test-matrix.md`：正式 `FS-*` 证据状态。

### 测试策略概览

- 后端纯函数：Unicode range、连续短语、互斥 shape、normalization、正文变化失效。
- 数据库/服务：linked/pending CHECK、反向索引、整组原子替换、双管理员 claim、幂等键和 revision。
- HTTP/OpenAPI：现有 linked payload 兼容、pending replace、list cursor、claim header/body/status/problem code。
- 前端组件：选择范围、已有目标、pending headword/gloss、两阶段保存、取消、409、partial recovery、claim。
- 契约：`@tsz/types`/api-client 与当前 OpenAPI 精确对账。
- 浏览器：真实本地 backend + 测试词条，完整走新增/刷新/冲突/认领；Mock 成功不算生产证据。

### 能力开关、发布与回滚

- 后端增加独立 pending sentence association capability；默认关闭写入，linked 现有读写不受影响。
- 顺序：additive migration → 后端读兼容 → 后端写开关 → 前端生产抽屉 → 测试环境验收 → 灰度。
- 监控 pending 创建/claim/409/422、两阶段第二步失败率、正文失效数量和目标创建取消率。
- 回滚只关闭 Pending 写入口并恢复旧前端；数据库新增列和已有 Pending 保留，不做破坏性 down。
- 删除 Mock、旧投影分支或兼容读取必须另开清理任务，不与首发绑定。

### 风险与缓解

| 风险                         | 影响                            | 缓解                                                                       |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| 旧评估基线过时               | 重复建设已存在的 endpoint/table | 以当前 OpenAPI、migration 和代码为权威，更新 2026-08-30 基线               |
| 两阶段保存第二步失败         | sentence 已保存但关联未完成     | 显示 unresolved 可恢复状态、保持抽屉、支持幂等重试；评审决定是否需复合命令 |
| Pending 被自动 resolver 覆盖 | 管理员草稿丢失                  | 自动 resolver 仅管理 linked；人工 Pending 独立状态和审计                   |
| 同名短语重复创建             | 多个目标竞争认领                | 创建前 exact search；显式创建与显式 claim；数据库/服务并发保护             |
| 正文改变后 range 仍貌似命中  | 错绑目标                        | hash 变化失效并强制重标，不按字符串自动平移                                |
| Pending 进入 publication     | 非权威内容对外暴露              | publication 只消费 linked；Pending 管理态单独查询                          |
| 前端把 Mock fixture 接生产   | 伪造词义/状态                   | 独立生产组件和正式 DTO，Mock 不导出业务类型                                |

### 联合评审清单（历史切片，已由文末独立深评裁决取代）

- [ ] 产品确认 Pending 允许来源词条发布，但不进入正式投影。
- [ ] 产品确认目标短语必须显式创建、显式 claim，不在来源发布时自动物化。
- [ ] 产品确认两阶段新增例句保存的 unresolved 恢复语义；若不接受，批准新增复合命令。
- [ ] 产品确认第一期禁止 range 重叠和短语内部成分并存。
- [ ] 后端确认扩展现有 association 表而非新建 shared sentence/root 模型。
- [ ] 后端确认 linked/pending 互斥约束、claim 锁顺序、revision 和 idempotency。
- [ ] 前端确认生产 Drawer 独立实现、meanings wire 不扩展、phrase creation 只走 navigation state。
- [ ] 双方确认 OpenAPI delta、错误码、feature flag、迁移和回滚顺序。
- [ ] 三份文档统一批准后再进入 `test` skill 与代码动工。

## 2026-08-30 句内一键发现与草稿候选技术设计

### 现状与缺口

当前 `GET /api/v1/admin/lexicon/entries/related-search` 一次只接收一个 `q`，只读取当前 publication snapshot，并返回 mixed V2/V3 `RelatedWordResultAny`。生产抽屉在管理员选定范围后分别请求 exact/contains；一键同时发现单词/短语不能靠前端生成组合后循环调用该 GET，否则会形成指数级候选、请求风暴、竞态和重复解析，也无法原子说明“本次扫描基于哪一版正文”。

现有列表接口虽然能按 `status=draft&q=` 查词条，但列表结果不是可关联 sense 契约；再逐条 GET 会形成 N+1。草稿候选因此不能靠前端拼接现有两个接口冒充完整功能。

### 方案概述

新增例句专用只读端点 `POST /api/v1/admin/lexicon/entries/sentence-targets/resolve`。请求发送英文例句、方言侧和模式；例句 service 调用内部通用 discovery core 完成 Unicode 切词、word surface/phrase pattern 匹配和原形解析，再由 adapter 生成例句 segments、候选与稳定排序。外部契约保持业务明确，不提前承诺通用 discovery API。

- `mode=all_published_targets`：仅允许 `scope=published`，供“一键发现已有单词/短语”使用。
- `mode=selected_segments`：允许 `scope=published_and_draft`，供手动任意多 token 选择使用。
- 现有单 `q` related-search 保持不变，继续服务关联词等旧消费者和单 range 翻页。
- 新端点只读，不需要 Idempotency-Key，不写 association、meanings 或解析状态。

### 模块边界与复用

```text
Lexicon Discovery Core
  tokenize → form/pattern recall → base resolver → sense summaries
                    ↓
          internal neutral result
             ↙               ↘
Sentence Discovery Service     Future internal callers
HTTP DTO / segment adapter     own handler / own DTO
             ↓
Sentence Association UI
```

- Core 只依赖 publication/search projection、tokenizer、form resolver 和 phrase matcher。
- Sentence discovery service 负责 text hash、segments、例句查询限额和对外 DTO；association adapter 再把候选转为“关联已有词义/待关联”、检查冲突并生成写 payload。
- 内部 core 类型不导出到 OpenAPI，也不要求与任何消费者响应 1:1；只通过 Rust 模块边界和单元测试保证复用。
- UI 组件只负责例句请求、渐进展示与候选选择；不得 import meanings save flow 或直接调用 association PUT。
- 新的异步批处理消费者可在后端内部复用 core，但必须提供自己的 handler、请求大小、队列、权限、审计和 DTO。

### 为什么不让前端逐个查询

前端既不能逐 token 查询，也不能生成连续/非连续组合。40 token 的任意有序子序列接近 `2^40`；正确方向是让后端用数据库中有限的已发布 pattern 反向匹配句子。前端始终只有一个请求。

### 数据库驱动的自动匹配算法

#### 发布模式索引

- 每个已发布 word surface 形成一个单 token pattern。
- 每个已发布 phrase surface 形成有序 literal token pattern，默认 `matching_layout=contiguous`。
- 只有词库明确登记为可分离的短语动词才使用 `matching_layout=separable`，并存储 literal segments、允许插入槽位、gap 上限和必要边界规则。
- 为 pattern 的首尾及稀有 literal token 建倒排索引；普通 `surface_sources` exact 索引继续服务单词和手动查询。

一个 phrase 可以拥有多个发布模式，例如 `turn off` 同时支持连续和可分离：

```json
{
  "matching_patterns": [
    {
      "layout": "contiguous",
      "literal_segments": [["turn", "off"]]
    },
    {
      "layout": "separable",
      "literal_segments": [["turn"], ["off"]],
      "gaps": [{ "slot": "object", "min_tokens": 1, "max_tokens": 8 }]
    }
  ]
}
```

pattern 是发布内容的一部分并进入不可变 publication snapshot；管理员修改分离规则后必须重新发布，自动发现只读取当前 publication pattern，不读取未发布草稿规则。

#### 单次解析

1. 服务端使用 Unicode 码点 tokenizer 得到正文 token 与 `[start,end)`；标点不生成候选，词内撇号/连字符沿用现有规则。
2. 单词用去重 normalized token 集合一次 exact join。
3. 短语不枚举句子组合；使用正文 token 集合命中倒排锚点，取回有限的 published phrase pattern ID。
4. 对候选 pattern 执行有序验证：contiguous 必须逐 token 相邻；separable 按登记的 segments/gap/slot 规则允许跨过中间成分。
5. 命中位置规范化为 `source_segments[]`，只连接当前 publication 和当前可引用 sense；同一 pattern 的重复位置全部返回。
6. 结果按 `first_segment.start ASC → segment_count DESC → entry_id → sense_id` 稳定排序。

复杂度约 O(n + C × L + R)，C 为倒排锚点召回的短语候选数，L 为 pattern literal 数，R 为真实命中数；不依赖句子子序列数量。高频 `take/get/set` 采用双锚点交集、稀有 token 优先和候选上限，避免单锚点放大。

100 万 entry、约 1000 万已发布 form alias/word/phrase pattern、40-token 句子的目标是服务端 P95 ≤ 700ms、端到端 P95 ≤ 1s。匹配索引在服务内部按 publication generation 加载，性能不达标时先优化 token 编码、postings 与锚点选择，而不是把组合移到前端。

### 选定开源实现栈

用户确认推荐 `aho-corasick + fst + 自定义可分离短语状态机`，三者职责严格分开：

首期唯一生产查询链路为：`FST exact alias → Aho contiguous phrase → anchor postings + separable state machine → PostgreSQL current-publication recheck / delta / sense hydration`。前文“数据库倒排”只描述派生 projection 的权威构建来源和降级校验，不是与 AC 并列的第二套主查询算法。

#### `fst`：词形/原形与精确词面目录

- normalized form surface、phrase base surface 和 anchor token 进入内存映射 FST。
- FST value 只存 postings offset；一对多的 `entry/publication/POS/form/group/base` 候选放在紧凑 sidecar postings，不能假设一个 key 只对应一个原形。
- 读取使用 memory map；同一原形的多个 alias 在 resolver 阶段归并，不在 FST 构建时丢弃歧义。

#### `aho-corasick`：连续短语扫描

- 只装当前发布的 contiguous phrase token pattern；单词 exact lookup 继续走 FST。
- 正文与 pattern 都编码为带不可冲突 token 分隔符的 normalized token stream，禁止原始字节子串导致 `cat` 命中 `concatenate`。
- 使用可重叠匹配，确保 `location` 与 `central location`、长短嵌套短语都能同时发现；重叠只在后续 association 选择阶段处理。
- 匹配字节偏移必须通过 token offset table 恢复成 Unicode 码点 segments，不能直接作为前端 range。

#### 自定义状态机：可分离短语

- FST/倒排锚点先召回 separable pattern ID，状态机只验证有限候选。
- 状态转移按有序 literal segments、slot、min/max gap 和句法硬边界执行；普通 contiguous pattern 不进入该状态机。
- 输出与 Aho-Corasick 相同的内部 `DiscoverySegments`，保证自动/手动和连续/可分离路径共享后续原形 resolver。

#### 不可变 generation 与增量更新

- PostgreSQL publication 仍是权威；FST、Aho automaton、separable pattern/postings 都是同一 `publication_generation` 的可重建派生快照。
- manifest 保存 generation、构建时间、文件 hash、pattern/form 计数和版本；服务只原子切换完整校验通过的 `Arc<DiscoveryIndexSnapshot>`。
- FST/Aho 均不适合原地修改：发布变更先进入小型 delta FST/automaton 与 tombstone 集合，查询同时读取 base+delta；达到数量/时间阈值后后台 compact 成新 base generation。
- 新 generation 未就绪时不得漏掉刚发布目标：查询必须叠加数据库 publication delta；若 delta 也不可用则返回明确 503，不能静默使用过期快照。
- 多实例通过 publication generation/outbox 通知失效，各实例独立构建或下载相同 manifest；不把某一实例内存状态当集群权威。

依赖许可均需锁定并进入 SBOM：`aho-corasick` 与 `fst` 采用 MIT/Unlicense 双许可。实施时固定 Cargo 版本，跑供应链审计，并以 100 万 entry / 1000 万 alias 基准记录索引构建时间、磁盘、mmap RSS、delta 合并和查询 P95。

### 词形识别、原形归并

搜索分成两层，避免把“可识别 surface 数”误当成“需要展示的原形数”：

1. **识别索引**：当前 publication 的 base、plural、past、participle、英美/common variant 等 surface 只保存轻量定位：`entry_id + publication_id + pos_id + form_id + form_type + form_group_membership`。
2. **原形解析**：直接 base 命中指向自身；非 base 命中通过同 POS form group membership 找到所有 base form membership。
3. **歧义保留**：一个 surface 映射多个 entry/POS/group/base 时返回全部 `BaseFormCandidate`，状态为 `ambiguous`，不使用数组首项。
4. **候选归并**：按 `entry_id + publication_id + pos_id + base_form_id` 分组，把多个 `RelatedWordMatchV3` 合并进 `matches[]`。
5. **词义加载**：完成原形归并后，才按少量 entry/POS/base 候选批量读取 publication senses；不在 surface 索引中复制完整 sense。

建议解析状态复用闭合集合：`resolved | ambiguous | unmatched`。`resolved` 只表示原形唯一，仍不代表具体词义唯一；UI 最终仍需管理员选择 sense。

候选新增字段：

```json
{
  "resolver_state": "resolved",
  "entry_id": "...",
  "publication_id": "...",
  "pos_id": "...",
  "pos": "noun",
  "base_form_id": "...",
  "base_form_surface": "location",
  "matches": [
    {
      "matched_surface": "locations",
      "form_id": "...",
      "form_type": "plural",
      "dialect": "common"
    }
  ],
  "senses": []
}
```

一个词条多个原形属于多个独立候选；一个词形组包含多个 base membership 时不得猜测归属。短语 pattern 的命中也以 phrase base form 为候选，连续/可分离位置只影响 `source_segments`，不改变 base identity。

按 100 万 entry 的偏高估算，完整识别 alias 可能达到约 1000 万 surface，但最终原形候选约 300–500 万。PostgreSQL 搜索投影只存轻量 alias→base 定位，详情两阶段加载，40-token 目标仍保持端到端 P95 ≤ 1s。

### 手动多段短语：选择驱动而非组合穷举

用户确认管理员可在 `turn the light off` 中任意选择 `turn` 和 `off`。因为 token 是人工明确选择，系统只形成一次查询 `turn off`，复杂度与普通手动短语相同，不枚举 `2^n` 子序列，也不要求数据库预先声明 gap 模式。

前端选择模型：

1. 进入标记模式后，每个 word token 是可切换按钮；选择集合始终按原句位置排序。
2. 相邻已选 token 合并为一个 segment；不相邻 token 保持多个 segment。
3. 查询 surface 由每个已选 token 的原文按单空格连接，例如 `turn` + `off` → `turn off`；后端按 segments 从正文重新计算，拒绝前端伪造 surface。
4. 预览用省略号连接 segment，例如 `turn … off`；同时显示最终查询词面 `turn off`。
5. 查询命中词库中的普通 phrase headword 后，仍必须选择具体 sense；未命中则进入现有 Pending phrase 流程。

位置权威从单一 `source_range` 扩展为：

```json
{
  "source_layout": "segmented",
  "source_segments": [
    { "start": 0, "end": 4, "surface": "Turn" },
    { "start": 15, "end": 18, "surface": "off" }
  ]
}
```

- `source_segments` 长度 1..20，按 start 严格递增、内部不重叠；连续选择也规范化为一个 segment。
- 服务端保存前逐段验证 Unicode 码点、surface 和 word 边界，并生成 segment fingerprint 用于幂等/去重。
- 中间未选中的 object 不是关联范围，可以独立关联其他词义。
- 冲突检测按 segment 的区间交集执行；不能用 `[first.start,last.end)` 外包络参与冲突。

数据库建议新增 `sentence_association_segments`：`association_id + ordinal + sentence_id + source_dialect + range_start + range_end + surface`，现有 association 每条回填一个 segment。segment 表对同 sentence/dialect 的 `int4range` 建 GiST 排斥约束，从数据库最终阻止真实片段重叠。旧 `source_range` 在过渡期只作为连续记录兼容别名；新前端和所有写校验以 `source_segments` 为权威。

该 migration 和 OpenAPI 变更必须与新前端 capability 同步启用；旧前端遇到已有 segmented association 时必须拒绝整组覆盖并提示升级，不能静默压平成连续范围。

### 契约建议

#### Request

```json
{
  "schema_version": 3,
  "sentence_text": "The office is in a central location.",
  "source_dialect": "common",
  "mode": "all_published_targets",
  "scope": "published",
  "selected_segments": null,
  "page_size_per_range": 20
}
```

约束：

- `sentence_text` 非空且不超过现有例句 RichText 文本上限；语言由当前 English V3 词条能力确定，不把未来通用语言字段放进本接口。
- `all_published_targets` 不接受 `selected_segments`，且 `scope` 必须为 `published`；服务端返回数据库 pattern 实际命中的 word/phrase。
- `selected_segments` 模式必须提交 1..20 个服务端可复算的 Unicode 码点半开区间与 surface；乱序、重叠、错位或非单词边界返回 422。
- `source_dialect` 只决定匹配哪一侧已发布 surface，不保存用户偏好。
- token 超过 100 返回 `sentence_discovery_token_limit_exceeded`，不截断正文。

#### Response

```json
{
  "schema_version": 3,
  "sentence_hash": "sha256:...",
  "token_count": 7,
  "scanned_token_count": 7,
  "matched_word_count": 1,
  "matched_phrase_count": 1,
  "range_results": [
    {
      "source_layout": "contiguous",
      "source_range": { "start": 35, "end": 43, "surface": "location" },
      "normalized_surface": "location",
      "target_kind": "word",
      "published_total": 1,
      "published_matches": [
        {
          "entry_id": "...",
          "schema_version": 3,
          "kind": "word",
          "target_state": "published",
          "publication_id": "...",
          "headword": "location",
          "resolver_state": "resolved",
          "pos_id": "...",
          "pos": "noun",
          "base_form_id": "...",
          "base_form_surface": "location",
          "has_unpublished_changes": false,
          "matches": [
            {
              "matched_surface": "location",
              "form_id": "...",
              "form_type": "base",
              "dialect": "common"
            }
          ],
          "senses": []
        }
      ],
      "draft_matches": [],
      "next_cursor": null
    },
    {
      "source_layout": "contiguous",
      "source_range": { "start": 27, "end": 43, "surface": "central location" },
      "normalized_surface": "central location",
      "target_kind": "phrase",
      "published_total": 1,
      "published_matches": [],
      "draft_matches": [],
      "next_cursor": null
    }
  ]
}
```

新类型：

- `SentenceTargetResolveModeV3 = all_published_targets | selected_segments`
- `SentenceTargetScopeV3 = published | published_and_draft`
- `SentenceTargetStateV3 = published | draft`
- `SentenceTargetSourceV3 = { source_layout: contiguous, source_range } | { source_layout: segmented, source_segments }`
- `SentenceTargetMatchV3`
- `SentenceTargetBaseCandidateV3`

草稿候选额外返回 `entry_revision`、`updated_at`、`has_completed_sense` 和 editor projection 的只读词义摘要；不返回可直接上行的正式 target payload。`linkability` 明确为 `formal` 或 `pending_only`，前端不能自行推断。

`all_published_targets` 的 word/普通 phrase 返回 contiguous，可分离 phrase 返回 segmented；`selected_segments` 根据规范化后的 segment 数返回 contiguous 或 segmented。查询响应与 association 写入共用同一 source union，避免 UI 预览一套范围、保存时再重算成另一套范围。

### 草稿候选查询边界

- `published_and_draft` 只用于一次手动 segments 选择，避免把全部未发布编辑内容批量暴露进一键结果。
- 从未发布草稿读取 `entry_headwords`/当前 forms surface 与 `entry_editor_projection`；排除 archived。
- 已发布且有未发布修改的同一 entry 在 published 组只出现一次，并标记 `has_unpublished_changes=true`；草稿差异作为只读补充，不制造第二个正式候选。
- 草稿候选的 sense UUID 只用于“打开草稿/界面定位”，不能进入 `target_word_id + target_sense_id` association input。
- 用户选择草稿候选时，前端只复制规范化 headword、kind 和可编辑 gloss 到现有 Pending 输入；目标发布后仍须通过现有 claim/正式选择流程。

### UI 信息层级

在生产抽屉“句中位置与目标”卡片增加：

1. 标题栏右侧“一键发现已有单词/短语”按钮；正文为空或正在保存时禁用。
2. 扫描摘要：`已扫描 7 个 token · 命中 1 个单词、1 个短语 · 2 个候选词条`。
3. token canvas 复用现有按钮，给命中 segments 增加低饱和下划线；连续短语连成一段，可分离短语用 `…` 连接多段。
4. 下方只列有命中的单词/短语卡片，默认收起具体 sense；按首段原句位置排序，不做连续大表格。
5. 已发布候选显示“已发布”、词条类型、匹配词形、POS、具体词义和“关联这个词义”。
   单词候选按原形归并，明确显示“命中词形 → 所属原形”；resolver_state=ambiguous 时要求先选原形/POS，再选 sense。
6. 手动模式额外显示“草稿候选”分组；操作为“查看草稿”和“设为待关联”，不显示“已关联”假状态。
7. 已确认 association 继续留在现有“本次关联”，扫描结果只是候选层，两者不合并成一个状态列表。

### 并发、失效与缓存

- 前端 query key 包含 `sentence_hash + source_dialect + mode + selected_segments_fingerprint + scope`；正文或方言改变即 abort/忽略旧响应。
- 服务端响应以例句正文计算 `sentence_hash`，抽屉应用结果前再次对账。
- 首期不缓存整句结果；依赖当前 publication/surface 索引的事务一致读取，确保刚发布词条立即可发现。
- automatic 与 selected 响应都可在具体 range 返回 opaque `next_cursor`；下一页统一改用相同 `selected_segments` 携带该 cursor。cursor 绑定 discovery generation、source dialect、segments fingerprint 和稳定排序键，前端不得解析或跨位置复用；正文、方言、片段或 generation 变化后旧 cursor 必须 fail closed，不能混页。

### 错误码

- `sentence_discovery_token_limit_exceeded`
- `sentence_discovery_invalid_range`
- `sentence_discovery_invalid_segments`
- `sentence_discovery_surface_mismatch`
- `sentence_discovery_scope_invalid`
- `sentence_discovery_response_truncated`（作为响应标志，不是 5xx）

参数/范围问题返回 422 Problem Details；数据库或 snapshot 解码问题遵循现有 related-search 错误边界。无命中是 200 + 空 `range_results`。

### 代码影响范围

#### 前端 tsz

- `packages/types/src/admin-word-v3.ts`：新增例句 target resolve request/response、segment/base candidate/status，并扩展 association 多段位置 wire。
- `packages/api-client/src/admin.ts`、runtime schema、OpenAPI snapshot：在 `words` 下新增 `resolveSentenceTargetsV3`。
- `apps/admin/src/features/dictionary/word-creation-v3/api.ts`：将新 endpoint 纳入抽屉 request boundary，并继续隔离 association 写请求。
- `components/V3MultidimensionalSentenceDrawer.tsx`：接入一键扫描、手动 draft scope、失效和选择状态。
- 推荐新增 `components/V3SentenceTargetDiscovery.tsx` 与局部 CSS，避免继续扩大 Drawer 主文件；不建设跨业务公共前端组件。
- meanings writable 仍不承载 discovery；association input/response 从单 range 扩展为有序 segments。

#### 后端对接建议

- OpenAPI 新增 `/entries/sentence-targets/resolve` 及上述例句专用严格 DTO。
- `Cargo.toml` 固定引入 `aho-corasick` 与 `fst`；新增内部 discovery core、snapshot builder/loader、postings 编码与 separable state machine 模块。
- 复用当前 publication surface 索引、mixed V2/V3 reader、Unicode range 和 related-search presentation/sense 投影；补齐 published form alias→POS/group/base 定位，并新增 phrase pattern/token 倒排投影。
- 手动 draft 查询复用当前 entry/headword/editor projection，不新增持久化表。
- 新增 phrase matching metadata（contiguous/separable、segments、slot/gap 规则）及发布 pattern projection；普通短语默认 contiguous，只有显式配置才可 separable。
- 新增 association segments migration，并把全部现有连续 range 原 ID 回填为 ordinal=0 segment；pattern projection 与 segment migration 均需可回滚开关。

### 测试策略

- 纯逻辑：Unicode token/segments、连续/可分离 pattern、gap/slot、任意手动切换、相邻合并、原句顺序、100/101 token。
- HTTP/DB：一次批查、word/contiguous phrase/separable phrase、V2/V3 current publication、刚发布立即可见、归档/激活失效、多候选/分页、manual draft scope。
- 前端：按钮只读、正文变化 abort、命中分组、非连续 token 选择/取消/预览、segment 重叠冲突、草稿 pending-only、无自动 onChange/save。
- 性能：100 万 entry/1000 万 alias+pattern + 40/100 token 基准，记录构建时间、磁盘、RSS、锚点候选 C、P50/P95 和 compact。
- 浏览器：使用已发布 `location`、`central location`、可分离 `turn off` 与一个未发布草稿，验证自动/手动两种模式并停留代表状态。

### 独立深度评审后的权威修订

本节优先级高于前文历史兼容描述；以下 P0 未落成红测试前不得开始业务实现。

#### V3 位置契约只保留 segments 单权威

- 新写契约使用 `association_schema_version=3`，每项必须提交 `source_segments[1..20]`；连续位置也是单 segment。
- V3 `AdminWord`、replace、Pending list、claim 和 discovery response 全部返回同一严格 segments 结构。V2 继续使用 `source_range`，不把两个位置权威塞进一个 nullable DTO。
- request 使用 tagged union：`all_published_targets` 只带正文/方言/分页；`selected_segments` 额外带 segments 与 `include_drafts`。OpenAPI 必须生成 `oneOf + discriminator`。
- `segments_fingerprint` 由服务端在相邻段合并后计算，不接受客户端上行：`SHA-256(version || sentence_id || dialect || source_text_hash || count || each(start,end))`。请求幂等仍使用完整 canonical payload hash，两者不混用。
- canonical query 与 Pending headword 统一限制 1..200 码点；单 segment surface、拼接 query 和全部段数分别校验。

#### 数据库父子模式与冲突约束

- parent 增加 `association_schema_version`、`segment_count`、`segments_fingerprint`；segmented V3 不保存外包络 range。
- child `sentence_association_segments` 主键 `(association_id, ordinal)`，`ordinal 0..19`；保存 sentence_id/dialect/range/surface，并通过 `(association_id,sentence_id,source_dialect)` 复合 FK 证明与 parent 一致。
- 服务层保证 ordinal 密集、start 递增、相邻段先合并、surface/码点/word 边界逐段正确。
- 删除旧 `(sentence_id,dialect,range_start)` 唯一约束。优先评估安装 `btree_gist` 后以 sentence/dialect + `int4range` 建排斥约束；若生产不允许 extension，则明确降级为 entry row lock + SQL 冲突检查，不虚构数据库兜底。
- deferred exclusion 在写审计/幂等响应前显式设为 immediate；SQLSTATE `23P01` 映射稳定 422 segment overlap issue，禁止落成 500。

#### 混合版本与迁移顺序

1. Guard release：先部署旧 payload 写保护、claim owner 事务内复验和独立 capability；尚不写多段。
2. Expand：创建 segment 表/复合 FK/索引，旧 writer 通过临时 dual-write trigger 自动生成 ordinal=0；回填并对账 count/range/surface hash。
3. Dual-read：后端读 segments、影子比对 legacy range，但 capability 仍关闭。
4. Validate：`NOT VALID → VALIDATE CONSTRAINT`，排除 orphan、ordinal gap、错方言和错 surface。
5. Pattern projection：增加 phrase pattern/anchor/tombstone 与 discovery generation，影子构建 FST/Aho 快照。
6. Cutover：新 OpenAPI、后端和前端均就绪后先开 discovery read，最后开 segmented write。

句中存在任一多段关联时，V2/旧 payload replace 返回 409 `sentence_association_client_upgrade_required`，不能删除父子行。首个多段写入后禁止回滚到当前旧二进制；只能关闭 capability 并向前修复。down migration 发现任何 `segment_count>1` 必须显式失败。

#### Phrase pattern 是 publication 权威内容

- 每个 pattern 有稳定 ID，并锚定 `entry_id + publication_id + pos_id + base_form_id`。
- `contiguous | separable` 是严格 union；V2 phrase 只从当前 publication 主词面生成 contiguous pattern，绝不推断 separable。
- separable 首期状态机只保证 literal 顺序、min/max token gap 和硬标点边界；`slot=object` 只是产品标签，不声称完成句法宾语识别。真正 object 校验需另开 dependency parser 切片。
- pattern 修改属于 entry 内容变更，必须推进 revision 并重新发布；publish/activate/archive/restore/历史切换同步 pattern projection 与 tombstone。

#### 强一致 discovery generation

- 新增事务串行的单调 `discovery_generation`：publish/activate/archive/restore/pattern 更新在同一事务锁定单行并只推进一次，rollback 不推进。
- snapshot builder 在 `REPEATABLE READ` 视图中读取 generation G 与完整当前 projection；manifest 记录 `through_generation=G`。
- 查询合并 base snapshot 与 `generation>G` 的数据库 delta，先应用 tombstone 再去重；hydration 再断言 `entry.current_publication_id == posting.publication_id`。
- generation/outbox gap、manifest/hash/tokenizer/normalizer 版本不符或 delta 不可读时返回明确 503，不静默使用旧索引。
- generation 文件永不原地覆盖：新 inode 写入、逐文件 hash、fsync 文件、manifest 最后 fsync、目录原子切换；旧 mmap 文件生命周期跟随 snapshot `Arc`。

#### FST/Aho 容量与增量边界

- Aho automaton 只装**去重后的多 token contiguous normalized surface**。相同短语对应多个 entry/publication 时，一个 PatternID 指向一对多 postings；1000 万 alias 绝不全部进入 AC。
- Aho 使用 `MatchKind::Standard` 与 overlapping iterator；记录并校验 automaton kind、pattern_count、pattern bytes 和 `memory_usage()`，禁止未记录的自动回退。独立连续 pattern 达百万级时必须先过 512MB AC 内存门，否则分片或降级为有界 n-gram + FST exact。
- FST 按 alias/phrase/anchor namespace 分文件，value 是自描述 postings block offset；block 含版本、count、byte length 和 checksum，UUID 转 generation-local dense integer 后 varint/delta 编码。
- delta exact alias 用小型有序 map，连续短语用不可变微批 AC shard，可分离短语用 anchor postings；查询最多同时读 8 个 shard。delta 达 base 1%/10万条或最老 shard 超过5分钟触发 compact。
- AC 构建对象不能 mmap；热切换时旧、新与构建中间态并存，峰值 PSS 单独验收。磁盘至少预算当前、下一代和临时构建三份 artifact。

固定基准环境建议为 8 vCPU、32GB RAM、NVMe、与 PostgreSQL 同区域；数据集必须记录 alias/pattern/fanout/高频 anchor 分布，而不只记录总条数。

| 指标                                      |               起始门槛 |
| ----------------------------------------- | ---------------------: |
| 40 token、warm、20 并发服务端 P95 / P99   |              ≤1s / ≤2s |
| 100 token、warm、20 并发服务端 P95 / P99  |            ≤1.5s / ≤3s |
| discovery 纯匹配 40 token P95             |                 ≤150ms |
| 新发布/归档结果反映 P95 / 硬上限          |  ≤2s / ≤10s 或明确 503 |
| AC `memory_usage()` / discovery 私有 heap |          ≤512MB / ≤1GB |
| warm PSS / 热切换峰值 PSS                 |          ≤2.5GB / ≤4GB |
| 全量 artifact / 全量构建 / compact        | ≤3GB / ≤30min / ≤15min |
| 原子切换停顿 / 同时读取 delta shard       |            ≤100ms / ≤8 |
| 单请求 SQL 数                             |      固定且 ≤4，无 N+1 |

#### API 完整性、分页与 UI 状态

- 候选响应定义严格 sense 摘要：`sense_id、pos/base identity、level、gloss、publication_id`；每个 range 的候选分页绑定 segments fingerprint、generation 和稳定排序键，automatic 返回的 `next_cursor` 只能通过相同片段的 selected 请求继续。
- 正常分页必须已完成全量匹配并返回真实 total。召回阶段超限返回 `completeness=overloaded` 与 `completed_capabilities/omitted_capabilities`，不能伪装为普通 cursor 分页。
- 前端自动/手动模式使用独立 reducer：手动 token 切换不请求，点击“查询所选词语”才发一次请求；切换模式、失败或关闭不清空本次关联。
- token canvas 只表达位置；重叠/嵌套命中通过独立“发现位置”按钮组导航。候选归并 key 为 `source_fingerprint + entry + publication + POS + base`。
- 请求同时使用 AbortSignal、单调 request ID、sentence_hash、mode、dialect 和 segments fingerprint 对账。
- AD-F-07 可访问性提升为 P0；加载、空、失败、截断和冲突通过 `aria-live` 与中文产品文案宣告。

#### 正文失效与 claim 锁

- 推荐英文正文保存时在同一事务删除对应 dialect 的 resolver scan、association parent 和 segments；只改 CEFR/中文译文不动关联。若要保留旧建议，必须新增显式 invalidated 状态，不能让 linked/pending 隐身。
- claim 的 owner lookup 必须进入同一事务；统一锁顺序 `owner entry → association`，锁后再次断言 association.entry_id。replace、claim、正文失效使用同一顺序。
- Pending reverse list 与 claim 按 ordinal 聚合全部 segments；任一 segment surface/hash 失效即 fail closed。canonical pending headword 从 segments 按单空格重算。

### 风险与回滚

| 风险                   | 影响                 | 缓解                                                                   |
| ---------------------- | -------------------- | ---------------------------------------------------------------------- |
| 前端逐组合请求         | 指数爆炸与旧响应串入 | 只提供一个数据库驱动批量 endpoint；测试断言一次请求                    |
| 重复单词重复查询       | 无谓数据库工作       | normalized surface 去重后集合查询，再恢复全部原句位置                  |
| 草稿被误当正式目标     | 发布引用不稳定       | 服务端 `linkability=pending_only`；association input 继续拒绝草稿 UUID |
| 多段被旧客户端压平     | 中间单词被误关联     | capability 同步启用；旧客户端遇 segmented 写入时 fail closed           |
| 普通短语被错误分离     | 大量假阳性           | 默认 contiguous；只有权威 separable pattern 才允许 gap                 |
| 高频锚点候选过多       | 查询尾延迟抬升       | 双锚点交集、稀有 token 优先、候选上限与性能门                          |
| 多 POS/多原形被猜测    | 关联到错误原形       | resolver_state=ambiguous；返回全部 base candidate，禁止取首项          |
| surface×sense 膨胀     | 搜索投影与响应过大   | alias 轻量定位；原形归并后再批量加载 sense                             |
| generation 过期/损坏   | 漏掉刚发布目标       | manifest hash、base+delta、原子切换、DB publication delta 兜底         |
| automaton/FST RSS 过高 | 服务实例内存失控     | mmap FST、压缩 postings、构建基准与 capability 回滚                    |
| 结果过密               | 抽屉退化成长表格     | 只列命中单词/短语、sense 渐进展开、摘要先行                            |
| 发布后结果不新鲜       | 刚发布仍搜不到       | 首期不缓存整句；cursor 绑定 generation；真实浏览器回归                 |

### 评审决策

- 一键发现自动匹配已发布单词、连续短语和明确登记的可分离短语；不枚举任意组合。
- 自动模式只看已发布；手动模式可看草稿，但草稿只能转 Pending。
- 数据库 pattern 倒排召回 + 服务端有序验证，前端只发一次请求。
- 底层实现正式选用 `fst + aho-corasick + 自定义可分离短语状态机`，PostgreSQL 保持唯一业务权威。
- 唯一词条且唯一词义的一键发现结果自动加入抽屉内“本次关联”；多词条、多原形、多词义仍由管理员选择。自动加入不发 association PUT。
- 新 discovery capability 启用后停止新增 publication refresh 隐式关联，存量关联保持原样；不同 association 的真实 segment 交集禁止同时保存。
- 自动加入使用最长短语优先的确定性贪心顺序；被短语覆盖的单词保留为“成分用词”展示，不产生独立 association。连续短语展示全部 token；可分离短语只展示 literal token。
- 成分用词的业务权威归属于短语 publication 内的具体 `phrase_variant`，不归属于某条例句。`common` 只有一套；`uk` 与 `us` 各自拥有独立 `component_usages[]`，即使短语拼写相同也不得合并。
- 每个 component usage 保存稳定 ID、ordinal、literal 词面、目标 entry/publication/POS/base/sense、命中词形 ID、目标方言、词形类型及词头/释义快照；未解析成分只保存 literal 与顺序，不猜测多词义。
- 例句 linked association 已固化 `target_publication_id + target_form_variant_id`，并在只读投影中返回该命中侧的 `target_component_usages[]`；服务端以这组 identity 校验并定位实际命中的 common/BrE/AmE 短语词形，而不是按拼写重新猜测。短语 publication snapshot 同时保存各具体 variant 的 `component_usages[]`，因此当前读取与历史 publication 查看都能恢复当时的精确方言侧和成分配置；后续目标 publication 变化不会改写既有历史快照。
- 推荐数据库模型为 `phrase_variant_component_usages(phrase_variant_id, ordinal, ...)`；variant 与 phrase entry/publication/POS/base 组成复合身份，外键阻止把 BrE 成分挂到 AmE 词形。发布/激活/归档/恢复与 discovery pattern projection 同事务更新。
- resolved 成分的 publication/POS/base/sense/form/variant/dialect/type/headword/gloss 不是客户端权威。保存前服务端必须加载目标当前 V3 publication，校验完整父子链与词义归属；数据库再以 `entry_publication_nodes(publication_id, entry_id, node_id)` 复合外键兜底，拒绝把 draft 或另一 publication 的节点拼进来。
- component usage 本身注册为 `phrase_component_usage` node，并以 `phrase_component` reference kind 进入 publication inbound sense reference；这样目标词义被历史/当前短语 publication 引用时，仍沿用现有引用保护。
- common 拆成 BrE/AmE 时，两侧 component ID 必须重新分配并独立演进；BrE/AmE 任一侧已有成分时，不允许静默合并回 common，前端明确要求管理员先处理保留侧。

### 2026-08-30 实施状态与默认开关

- 已落严格 V3 `source_segments`、旧 writer 409 Guard、segment 父子表/回填/dual-write、事务内 generation 水位、句子专用 resolve endpoint、FST 精确词形索引、Aho overlapping 连续短语匹配、自定义 gap 状态机以及 admin 自动/手动发现 UI。
- `SMART_LEXICON_V3_SENTENCE_TARGET_DISCOVERY` 默认关闭。显式开启后，publication refresh 不再新增隐式自动关联；存量关联不删除，管理员通过发现结果选择具体词义后才写 association。
- 当前在线 adapter 先用 PostgreSQL 按正文 token 与最长 40-token 连续 n-gram 做有界召回，再在请求内构建 FST/Aho 小索引；前端始终只发一个 HTTP 请求，不枚举或逐项查询。
- 百万级全局 mmap snapshot、base+delta/tombstone、checksum/热切换与 100 万 entry/1000 万 alias 性能门仍未完成，因此 capability 维持 fail-closed，不能把当前实现描述成已达到生产规模。
- 可分离短语状态机与单测已完成，但 phrase pattern 的正式 V3 authoring/projection 尚未落库；在这项权威内容契约完成前，在线自动模式只保证单词与连续短语，手动多段选择和 Pending 保存已经可用。
- 已落 `component_usages` 严格 DTO、具体 variant 子表、component node/publication node、publication-scoped 目标外键、发布快照和 inbound sense reference；admin 词形页按 common/BrE/AmE 独立增删编辑，discovery 响应返回实际命中的 variant 与该侧完整成分信息。
- 例句 association 已持久化 `target_publication_id + target_form_variant_id`，linked 响应同步返回服务端校验后的 `target_component_usages[]`。discovery、replace 与 claim 使用同一组 publication/variant identity，刷新后不会因 BrE/AmE 同拼写而换侧；历史 owner publication 仍保持不可变，association lifecycle 的后续认领或目标变化不会回写旧 publication snapshot。
