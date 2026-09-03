# 短语成分用词 技术设计文档（2026-09-02 定稿重写）

> **状态（2026-09-02 晚）**：本文是已上线的 v1（词形变体级）实现记录。产品已改判为
> **释义级绑定**（每条释义各自一份，位于多维释义与多维例句之间），新方案见
> [design-sense-binding.md](./design-sense-binding.md)；本文保留作为 v1 退役（B2/F2）的对照。

## 方案概述

v3 词条编辑器 step3、每个词性 tab 内（语法结构卡下方、词义列表上方）新增「成分用词」
卡片，仅短语渲染。短语拼写渲染成一排可点击单词（初始零操作）；点击单词 → Popover 内
antd `Cascader.Panel` 级联多选：**词条 → 词形 → 词义**（不设词性层，同词条多词性时词
形行括注词性），勾选即关联、取消即解除，同一单词允许多条关联。候选按**词形**命中（屈
折形命中原形词条），仅已发布。单词与短语候选**同构**；短语候选的成分用词不进级联、直
接**复用**其词条数据。数据读写该词性 **base 词形主变体**的 `component_usages`（后端现
有契约，无需扩展），保存搭乘向导既有「step3 保存前自动先存脏词形」链路。

已否决的备选：四层级联（短语 → 成分对位 → 词形 → 词义）——成分对应关系可按词形自动
推断，手选是重复劳动且多存一份会漂移的快照；sense 级挂载——数据是词形级的，会出现
N 份重复视图，且需要后端新增 sense 维度。

## 交互细节（与实现一一对应）

- token 区样式复用 `V3SentenceTargetDiscovery.css`（`.v3-sentence-target-discovery-tokens`）；
  已关联单词绿色高亮（#389e0d）+ 多关联 `×N` 角标；卡片 extra 显示总关联数。
- Popover 打开即按点击单词调 resolve（懒加载，每次打开取最新）；三态：加载 Spin /
  失败 Alert（已有关联不受影响）/ 空态 Empty「没有匹配的已发布词条」。
- 级联**只有词义叶子可勾选**（父级 `checkable: false`）：勾父级会展开成「全词形 ×
  全词义」，一次点击就能撑爆后端每变体 100 条上限。勾选 = 全量替换该单词的关联集合，
  但候选里查不到的存量条目（目标已归档/改版/落在分页外）会按原样保留，不被连带删除。
- 后端能力 `sentence_target_discovery` 关闭时：卡片给出说明并禁用编辑，不发请求。
- 回显：`component_usages` 里 resolved 条目按 literal 精确匹配 token 文本；同文本单词
  共享同一组关联（数据模型 literal 无位置信息，见需求开放问题 3）。
- 无 `onFormsChange`（只读场景）时 token 禁用、Popover 不开。

## 数据落点与保存

- 写入：`forms.pos[posId]` 下 `form_type === "base"` 的词形，unified 取 common 变体、
  distinguish 取 uk 变体（v1 约束）。注意 `model.ts` 的 `variantWire` 对每个变体都会
  显式输出 `component_usages`，存量靠草稿完整回传而非「省略即保留」。
- 重建规则（`rebuildUsages`）：以「该单词的全量勾选结果」替换其条目；其他 literal 条目
  原样保留；整体按短语中单词首次出现顺序排列；目标不变的条目**复用原节点 id**（避免
  假 diff 与节点账本漂移），新增生成 `newWordNodeId()`。
- 保存链路：组件 `onFormsChange` → 向导 `setDraftForms` → forms 脏 → step3 保存时向导
  先 `saveForms`（带 base_revision）再 `saveMeanings`（既有链路
  `V3WordCreationWizard.tsx:838-845`，无新增端点）。成分变更不动词形结构/拼写，按现
  契约不触发 forms impact 确认。
- 失效恢复：目标再发布/归档后保存 422（`invalid field: component_usages`，无节点定
  位）→ 全局错误提示，管理员重开 Popover 重选（v1 以 message 为准）。

## 代码影响范围

全部在 `apps/admin`（`@tsz/types` / `@tsz/api-client` 零变更）：

- `word-creation-v3/components/V3PhraseComponentUsagesCard.tsx` —— 卡片本体：
  props `{ posId, forms?, onFormsChange?, discoveryEnabled? }`；内部 `locateBaseVariant` /
  `rebuildUsages` / `CascaderLinkContent`（resolve → 候选分组 → 级联 options）。
  Resolved 字段中 `publication_id` / `pos_id` / `base_form_id` 取自**词义自带**的权威值
  （候选层的值只对命中词形成立）。
- `V3MeaningsAndExamplesStep.tsx` —— `entryKind` prop + 渲染位 + 透传能力门。
- `pages/WordWizardV3.tsx` —— 传 `entryKind={context.word.kind}`。
- `components/V3ConcreteFormRow.tsx` 等 —— 删除 step2 内嵌旧「成分用词」编辑器与
  `entryKind` / `sentenceTargetDiscoveryEnabled` 整条 props 链（联调通过后执行）。

## 后端对接（并行开工接口）

现状可用（前端已接）：

- `POST /admin/lexicon/entries/sentence-targets/resolve`：按词形命中已发布单词候选，
  返回 `pos` / `matched_form_id` / `matched_variant_id` / `matched_dialect` /
  `matched_form_type` / `senses` / `component_usages`。
- `PUT .../steps/forms`：variant 携带 `component_usages` 保存；省略字段保留现值；校验
  仅 phrase 可带、≤100/变体、literal 规则、Resolved 与目标当前发布快照逐字段一致。

后端三项已于 2026-09-02 落地并联调通过（本仓已 `sync:openapi` 跟进契约快照）：

1. **放开短语作目标**（`v3.rs` 的 kind 限制 + resolve 放出短语候选，含自环与套娃深度守卫）。
2. **候选补 `kind`**：级联第一列据此渲染 单词/短语 标签。
3. **候选补全词形清单 `forms`**：级联第二层列出目标词条全部词形，命中行标「命中」，
   管理员可改选屈折形之外的词形。

契约缺口已由后端 #86 补齐（2026-09-02）：`SentenceTargetCandidateFormV3` 新增
`base_form_ids`——该词形可搭配的全部原形 id。前端据此选 `target_base_form_id`：词义自带
的原形在清单内就沿用，否则取清单里任意一个；清单为空表示该词形不可作成分目标（目标来自
V2 发布，或词形没挂进任何带原形的变化组），直接不进候选。跨变化组改选词形被 422 的问题
就此关闭。

> 部署顺序：该字段在后端为**必填**，而前端 runtime schema 对候选对象是
> `additionalProperties: false`。前端未同步契约快照时，带此字段的后端一上线会让
> `sentence-targets/resolve` 整体解码失败（成分用词与多维例句的句中目标发现同时不可用）。
> 本仓已 `sync:openapi` 跟进（源 sha `7596eede…`）。后端此后每次改动 spec，前端都须先
> 同步再部署。

## 复用与约定

- 类型全取 `@tsz/types`（snake_case wire 不转换）；请求走 `createV3WordRequests`。
- UI 全 antd v6（Cascader.Panel / Popover / Card / Tag）；两字按钮插空格；admin 禁
  tailwind/@tsz/ui。
- jsdom 测试：matchMedia / ResizeObserver 垫片已有；Popover/级联用受控 `open` 测试
  （参照 antd v6 Select/Modal 在 jsdom 的既有经验）。

## 测试策略（概览）

- 单测（Vitest + RTL，新增 `V3PhraseComponentUsagesCard.test.tsx`）：
  - `locateBaseVariant`：unified/distinguish/无 base 词形三态；
  - token 渲染与回显：resolved 条目按 literal 映射、同文本共享、×N 角标、总数 Tag；
  - resolve → 级联 options 组装：多词性括注、命中词形标注、按 formKey/senseId 去重；
  - 勾选/取消 → `rebuildUsages`：多关联、保序（短语语序）、只动本 literal、id 复用与
    新增、unresolved 存量保留；
  - 三态渲染（pending/error/empty）、能力关闭态与只读禁用态；
  - 候选缺失的存量关联在勾选其他项时不被删除（数据保全回归）。
- 集成（`V3MeaningsAndExamplesStep.test.tsx` 补 phrase 分支）：仅短语渲染卡片；
  `onFormsChange` 载荷正确。
- 手测清单（联调）：关联/解除/多关联/屈折形命中/保存后重进回显/发布后引用保护/目标再
  发布后 422 重选/step2 旧入口删除后无回归。
- 覆盖率照常出报告（2026-08-31 起不设百分比门槛），盯边界与错误路径是否被真断言覆盖。

## 风险与回滚

- 同名单词共享关联（literal 无位置）：需求开放问题 3 挂账，若要精确区分需后端加序号。
- step3 隐式保存 forms 无 impact 确认 UI：成分变更按现契约不触发；联调时验证一次。
- **旧入口删除的已知副作用**（留待后续处理）：非 base 词形与 us 变体上的存量成分数据
  失去编辑入口——既看不见也删不掉，但仍随草稿回传并参与发布；`unresolved` 存量同理。
  连带影响：`operations.ts` 的英美合并守卫要求两侧成分都为空，而 us 侧现已无法清空，
  「分拼 → 英美共用」的回退路径会被永久拒绝。需要后续把卡片扩成 uk/us 双行编辑。
- 回滚：渲染由 `entryKind === "phrase"` 单点控制；数据层无迁移、无破坏性变更。
