# 智能词库多维例句关联技术设计

## 文档状态与评审门

- 功能标识：`multidimensional-example-linking`
- 目标端：管理后台 `apps/admin`
- 当前状态：前端开发/mock 实现已落地，正在做交付审查；真实 OpenAPI 接入仍阻塞
- 本文不修改 `tsz-rust` 或数据库；前端只在显式 mock 能力下启用新模型，真实数据源保持 legacy 行为
- `requirements.md`、本文与 `test-matrix.md` 共同记录需求、实现边界和证据；真实端点落地后需重新同步契约并联调

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
