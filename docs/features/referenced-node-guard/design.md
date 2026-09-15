# 被引用节点保护设计

2026-09-15。需求见 [requirements.md](requirements.md)。用户已确认，Q1–Q5 按 requirements 中的建议执行。

## 基线与依赖

- 前端：origin/main `340f4a0`，分支 / worktree `claude/draft-save-issue-4f1bd2`。
- 后端：tsz-rust origin/main `c80d829`（测试服已部署同版）。主 checkout 为他人未提交改动，实施时另开 worktree。
- 复现：本地 c80d829 后端 + 本分支 admin，给副词 `for` 的原形变体直插一条共享例句标注；英美音标切「是」保存 409
  `reference_conflict`（响应无 meta），切回「否」200（`stableVariantIds` 还原 common 变体 ID，仅发音 ID 重生成）。

### 现状分类

- **可复用**
  - 禁用 + 悬停原因：`V3FormGroupCard` 删词形的 `lockedBaseFormIds` / `title` 模式。
  - 节点定位：`navigateToV3Issue`（切步骤、切词性、展开、聚焦 `data-v3-node-id`）。
  - 词义卡片内多维例句：`WordSentences` 按 `entry_id + sense_id` 列表，`onOpen(await api.sentences.get(id))` 打开编辑器。
- **缺口**
  1. 没有节点粒度的入站引用读取接口。共享例句只能按 `GET /sentences?entry_id=` 分页拼（`page_size ≤ 50`，每条多次查询），类型 2/3/4 完全不可读。
  2. `POST /steps/forms/impact`、`POST /validate` 不跑引用检查：管理员确认影响后仍 409。
  3. 引用类错误无位置：`reference_conflict` 无 meta，且同码三义（例句引用 / 移入垃圾桶被例句挡 / 锁忙）；
     `form_reference_conflict` 无 meta；422 `relation_target_unavailable` 只给一个词义 ID（`LIMIT 1`）；发布 422 丢弃了来源位置。
  4. 后端写校验口径不一：词义保存不查类型 2；词形保存不查类型 3；所有保存不查类型 4。
  5. 前端对上述错误统一落到「操作未完成」；例句库无按 ID 深链；向导无定位深链。

## 选定方案

后端提供「本词条入站引用」只读接口；前端据此计算「受保护节点 → 禁用操作」，在节点旁展示并跳转；后端写校验收敛到同一判定函数，
作为最终兜底并在错误里带引用列表。

不选：

- **纯前端拼装**：只覆盖例句，分页 N+1，需在前端复刻拼写规范化与方言规则，且漏掉类型 2/3/4。
- **只改错误提示**：保存才发现，不满足「禁用」。
- **自动迁移引用**：要改后端引用语义，通用例句拆分后挂英还是美未定，可作后续。

## 后端（tsz-rust）

### 新接口 `GET /api/v1/admin/lexicon/entries/{id}/inbound-references`

- 权限：活跃管理员，与 `GET /entries/{id}` 相同。
- 范围：指向该词条当前草稿节点的引用 1–4，并标出已失效的。
- 响应：

```text
InboundReferencesV3 {
  entry_id: uuid
  revision: i64                       // 计算时的草稿 revision
  nodes: [{ node_id, node_type, total }]   // 每个被引用节点的完整计数，不截断
  items: InboundReferenceV3[]         // 明细，总数上限 500
  truncated: bool
}
InboundReferenceV3 {
  id: string                          // kind + 来源行主键，稳定
  kind: "shared_sentence" | "publication_sense_ref" | "draft_relation" | "phrase_component"
  target: { pos_id, base_form_id?, form_id?, variant_id?, sense_id? }
  stale: bool                         // 目标在当前草稿已不成立，与保存用同一判定
  source: {
    entry_id?, entry_headword?, entry_kind?, entry_status?, sense_id?, sense_gloss?,
    node_id?, publication_id?, relation_type?, reference_kind?,
    sentence_id?, sentence_revision?, sentence_text?, source_dialect?, segments?
  }
}
```

- 数据来源：
  - 类型 1：`shared_sentence_annotations` ⋈ `shared_sentences`（`deleted_at IS NULL`）。例句允许自指，照计。
  - 类型 2：`entry_publication_sense_refs`，口径同 `current_inbound_sense_refs`。
  - 类型 3：`relations`。
  - 类型 4：`v3_phrase_variant_component_usages` / `v3_phrase_sense_component_usages` 中 resolved 行。
  - 类型 2/3/4 均排除本词条自身与已归档来源。
- `stale` 复用 `text_links::shared_target_matches` / `target_content_gloss`，保证与保存口径逐字一致。
- 禁用判定只依赖 `nodes`（完整计数），明细截断不影响判定。

### 写校验收敛

- 新增 `inbound_reference_violations(entry_id, forms, meanings) -> Vec<InboundReferenceV3>`，覆盖 1–4。
- 词形保存、词义保存、发布、切换版本、`/steps/forms/impact` 统一调用。
  - impact 响应新增可选 `blocked_references`：前端确认条直接展示并禁用「确认」。
  - 写入违例：409 新码 `inbound_reference_conflict`，`meta.inbound_references` 列出违例项。锁忙保持 `reference_conflict`。
- 按 Q1 / Q5 补齐：类型 4 纳入保存拦截；词义保存查类型 2；词形保存查类型 3。
- 移入垃圾桶、删除词条的拦截本期不改码，只在方便处补 `reference_locations`（非必需）。

### 发布顺序

- 新接口是新路径：后端可先上，前端后接。
- impact 响应新增字段、新错误码 / meta 属于已有响应形状变化；前端 V3 运行时 schema 为 `additionalProperties: false`，
  需**前端先 `sync:openapi` 并部署，后端再上**；拿不准时两端同批。
- 补齐校验（Q1 / Q5）会让部分原本能保存的草稿开始报错：上线前用测试服数据跑一次违例统计。

## 前端（tsz）

### 类型与请求

- `packages/types`：`InboundReferencesV3`、`InboundReferenceV3`；`ProblemMeta.inbound_references`；`FormsImpactResponseV3.blocked_references?`。
- `packages/api-client`：`inboundReferencesV3(entryId)`；`sync:openapi` 后更新契约测试与 PENDING 白名单。

### 判定（纯函数）

新增 `apps/admin/src/features/dictionary/word-creation-v3/referenceGuard.ts`：

- `buildReferenceIndex(response)`：按 pos / form（含作为 base_form）/ variant / sense 建索引。
- 判定只针对已保存节点 ID，本地新增节点无引用：
  - `posDeleteBlocked(posId)`：词性下任一节点被引用。
  - `formDeleteBlocked(posId, formId)`、`formTypeChangeBlocked(...)`：词形或其作为原形被引用。删组时对孤立词形逐个判定。
  - `groupDialectRulesBlocked(group)`：成员词形任一变体被引用。
  - `senseDeleteBlocked(senseId)`。
  - `spellingConflict(variantId, nextSpelling)`（Q2）：与引用片段规范化比较。规范化须与后端 `normalize_headword` 对齐，用同一批样例做对照测试。
- `staleReferences(response)`：供顶部提示。

### 数据流

- `WordWizardV3` 页面用 TanStack Query 加载，key 为 `["inbound-references", entryId, word.revision]`；
  保存成功、窗口重新聚焦、收到 `inbound_reference_conflict` 时失效重取。
- 经 `V3WizardSlotContext` 下发引用索引。加载中或失败按「无引用」处理并提示，不阻塞编辑，保存由后端兜底。

### 界面（antd，不引入 tailwind / `@tsz/ui`）

- 新组件 `components/V3ReferenceBadge.tsx`：`Tag`「被引用 N」+ `Popover` 列表（类型、来源摘要、高亮片段、跳转按钮）。
- 挂载点：
  - 第 2 步：`V3FormsAndPronunciationStep` 词性页签删除按钮；`V3PosTab` 英美规则两个 `Radio.Group`；
    `V3FormGroupCard` 删词形、删变化组；`V3ConcreteFormRow` 词形类型 `Select` 与拼写 `Input`（Q2）。
  - 第 3 步：`V3MeaningsAndExamplesStep` 词性页签删除、词义卡片删除。
- 禁用统一 `disabled` + `title`；徽标本身可点开列表（禁用按钮上的悬停在 antd 里不可靠，列表入口放徽标）。
- 错误：`problem.ts` 增加 `inbound_reference` 类别（新码 + 旧 `reference_conflict` / `form_reference_conflict` 兜底）；
  `V3WordCreationLayout` 显示后端 detail 与引用列表；impact 确认条展示 `blocked_references` 并禁用确认按钮。
- 顶部失效引用 `Alert`，列表同徽标。

### 跳转

- **同词条多维例句**：`setActiveStep("meanings")` → 按 `sense_id` 定位词义（复用 `navigateToV3Issue`）→
  `WordSentences` 新增 `focusSentenceId`：展开区块并直接 `sentences.get` + `onOpen`，不依赖分页位置。
- **跨词条**：新标签页打开 `/words/{source_entry_id}/v3/wizard/{step}?focus_node={node_id}`。
  `WordWizardV3` 读取 `focus_node`，加载后按节点类型推 step / pos 并调用定位。
- **多维例句库**：`/sentences?sentence={id}`，`SentenceLibrary` 读 searchParams 打开详情弹窗。

## 测试

- **后端**：接口覆盖 4 类引用 + stale + 截断 + 自指 / 归档排除；各写路径对 1–4 的拦截与 meta；impact `blocked_references`；stale 与保存判定一致性。
- **前端**：
  - `referenceGuard` 纯函数矩阵：节点 × 操作 × 引用类型，含本地新节点与 stale。
  - 组件测试：禁用态、徽标列表、跳转回调。
  - 错误展示测试；契约测试。
  - admin e2e Mock 增加 inbound-references，断言英美切换禁用与跳转；本地须 `ADMIN_E2E_PORT=3007 CI=1` 手跑。
- **联调**：按 requirements 验收标准在本地真实后端逐条走；测试服验收用专用账号。

## 风险与回退

- 常用词被大量例句标注：明细截断 + `nodes` 完整计数；列表提示「共 N 处，显示前 500」。
- 口径漂移：前端只是提前禁用，后端保存仍是最终裁决；stale 由后端算，不在前端复刻。
- 补齐校验的存量影响：上线前统计；必要时 Q1 / Q5 拆到下一期，只做读取接口与前端禁用。
- 回退：接口不可用时前端退化为现状（保留改进后的错误提示）；后端新校验可单独回滚，不涉及迁移。

## 实施记录（2026-09-15，本地已验收，未提交）

分支：前端 `claude/referenced-node-guard`（本文档所在 worktree）、后端 tsz-rust `claude/referenced-node-guard`（从 origin/main c80d829 开出）。

与上文设计的差异 / 细化（都是实施时才看清的边界，已按此落地）：

- **钉住发布版本的短语成分不算入站引用**（`target_publication_id IS NOT NULL` 的 resolved 行）：它引用的是不可变发布快照，草稿改动伤不到它；短语一旦发布会以类型 2 出现。读接口与写校验同口径排除。
- **英美规则只锁会改变结构的切换**：通用变体被引用 → 锁「拼写有区别 / 音标有区别」（拆分换 id）；英 / 美变体被引用 → 锁「音标无区别」（合并丢变体）。uk_us 内部只改拼写模式不换 id，改坏拼写由 Q2 的拼写一致性即时标红兜底。比需求表「任一变体被引用即禁用两个控件」更精确，且与后端判定一致。
- **发布 / 切换版本的入站引用违例也改成 409 `inbound_reference_conflict`**（原发布路径是 422 `sense_has_inbound_publication_refs`，且丢位置）；`POST /validate` 不动。
- **`reference_conflict` 保留两种用途**：锁忙（重试）与移入垃圾桶被例句挡；前端把它归入同一错误类别但标 retryable，明细为空时提示刷新后重试。
- **词形影响预览**（`POST /steps/forms/impact`）无论 `requires_confirmation` 与否都带 `blocked_references`；前端拿到非空即不进确认、直接阻断并列出引用。
- 引用索引查询失败只提示「引用信息暂不可用」，不重试、不阻塞；保存被 409 拦下时重拉。
- 跳转：同词条例句 → `navigateTarget` 定位词义卡片 + `WordSentences.focusSentenceId` 直接 `GET /sentences/{id}` 打开；跨词条 → 新标签页 `/words/{id}/v3/wizard/{step}?focus_node=<节点>`（来源已发布时加 `mode=edit`），页面用 `locateV3Node` 按节点 id 落到词形类型 / 拼写 / 词义卡片；例句库 `/sentences?sentence=<id>` 打开详情。

测试服存量统计（2026-09-15，只读 psql，tshb-test `/opt/tsz-rust/.env` 的库）：16 条草稿；类型 2 / 3 / 4 引用各 0 条、失效 0 条；类型 1 标注 5 条、失效 0 条。补齐校验不会让任何存量草稿开始报错。

验证：后端 `cargo clippy` 无告警，`--lib` 273 通过、`--test shared_sentences` 24 通过、`--test lexicon_handler` 91 通过（含新增 7 条与改写 3 条）；前端 `pnpm typecheck` / `pnpm lint` 通过，admin vitest 新增 `referenceGuard` / `V3ReferenceBadge` / 词形步 / 布局 / 页面用例，e2e E06（`ADMIN_E2E_PORT=3007 CI=1`）12 通过；本地真实后端（8483，本分支构建）按验收标准 1–5、7、9 走通，6 由后端集成测试覆盖，8 由后端集成测试 + 前端布局单测覆盖。

## 估算

后端 2–3 人日（接口、校验收敛、测试）；前端 3–4 人日（判定、界面、跳转、错误、测试）；本地联调与验收 1 人日。
关键路径：接口契约定稿 → 前端 sync 与判定 → 界面挂载与跳转 → 后端校验收敛 → 联调。
