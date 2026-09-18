# TASK#59 实施设计与验证

## 基线

- 前端：03e88e4，工作区 `tsz-task-59`，分支 `codex/task-59-form-order`。
- 后端：df92519，工作区 `tsz-rust-task-59`，分支 `feat/task-59-form-order`。
- 未改动其他工作区；不涉及提交、推送、部署授权。

## 根因与实现

前端 `V3FormGroupCard` 的上下移动调用 `reorderMemberships`，更新 `form_groups[].members[]`；后端 `PublishedAssociationTarget::from_v3_parts` 原先却按 `pos.forms[]` 创建顺序构建候选。

在 `src/lexicon/service/sentence_association.rs` 的公共转换层：

1. 建立当前词性内 form_id 到词形的查找表。
2. 按词形组/成员序遍历，首次 form_id 胜出。
3. 追加原始 forms 中尚未出现的词形，保留历史候选集合。
4. 沿用原来的变体展开、base_form_ids 和可关联词义计算。

该转换由草稿目标和发布快照共同调用，候选搜索/发现共享结果。仅改变读取时的展示顺序，不改写持久化数组、UUID、发布快照，不改 DTO、OpenAPI 或迁移。旧快照读取时即可应用其已保存的成员顺序。

前端 `V3TargetCascader` 已按候选 forms 保序分组；不增加第二套排序，也不额外请求目标词条。增加组件测试锁住“过滤/合并后保序、原形不置顶、相同拼写不同词形不合并、旧关联身份不变”。

例句快捷入口 `savedSenseTargets()` 直接读取 `AdminWordV3`，不经过后端候选接口。已局部采用相同的组/成员首次出现及历史词形末尾兜底规则；保留原有原形配对、方言展开和同片段歧义保护。编辑器上下文文案使用首个候选，因此也随配置顺序变化。

关联词的 `RelationsGrid` 走独立 `useRelatedSearch`，按目标词条/词义选择，无独立词形层；本任务不改变词条搜索排序或词义排序。旧 `V3SentenceTargetDiscovery` 未发现生产挂载点，不改造其展示模型。

## 兼容、生效与回退

- API 形状不变，旧前端能消费有序数组；无强制前后端发布顺序。
- 已发布目标仍读取发布快照，不能把未发布草稿顺序混入发布内容。
- 已打开候选可能驻留组件状态；刷新页面重新查询生效，不新增全局实时同步。
- 回退代码只恢复原顺序，不需要回退数据。

## 验证记录

后端（在 `tsz-rust-task-59`）：

- 修复前：`SQLX_OFFLINE=true cargo test --lib v3_snapshot_derives_form_group_bases_for_candidate_inventory` 确定失败，实际为创建顺序，预期为组/成员顺序。
- 修复后：`SQLX_OFFLINE=true cargo test --lib sentence_association`：29 项通过。
- `cargo fmt --check`、`SQLX_OFFLINE=true cargo clippy --all-targets -- -D warnings`：通过。
- 初次未配置数据库时 14 项未完成；随后新建 TASK59 专用 PostgreSQL 16/Redis 7，`cargo test --lib`：294 项全部通过，`shared_sentences`：24 项通过，`lexicon_handler` 定向候选测试：10 项通过。日志 `/tmp/task59-db-tests.log`。

前端（在 `tsz-task-59`）：

- `pnpm --filter @tsz/admin exec vitest run src/features/dictionary/word-creation-v3/components/V3TargetCascader.spelling.test.tsx src/features/dictionary/word-creation-v3/components/V3TargetCascader.pagination.test.tsx src/features/dictionary/word-creation-v3/components/V3TextAssociationPicker.test.tsx src/features/dictionary/word-creation-v3/components/V3SentenceTargetDiscovery.test.tsx src/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.test.tsx`：5 文件、148 项通过。
- `pnpm --filter @tsz/admin exec vitest run src/features/sentences/SentenceEditor.test.tsx src/features/dictionary/word-creation-v3/components/V3PhraseComponentUsagesCard.test.tsx`：2 文件、44 项通过；两轮合计 192 项。
- 快捷入口修复前 `pnpm --filter @tsz/admin exec vitest run src/features/sentences/associationModel.test.ts`：新增调序测试失败，7 通过、1 失败。
- 快捷入口修复后，以上 7 文件加 `src/features/sentences/associationModel.test.ts` 联合运行：8 文件、200 项通过。最终审查后补强独有成员、交换组序与编辑器首候选/歧义保护测试，重新联合运行：8 文件、202 项通过。
- `pnpm --filter @tsz/admin typecheck`：通过；变更 TS/TSX 的 ESLint、Prettier 检查通过。

## 最终审核

只读审核未发现本次新增阻断缺陷。补齐组序及快捷入口用户行为测试后，202 项前端测试、typecheck、ESLint、Prettier 和两仓 diff 检查均通过。

既存非本次回归：`savedSenseTargets()` 未按专用组绑定筛选当前词义，可能生成后端不接受的快捷关联候选。排序前已存在，单独跟踪，不在本任务改动候选语义。

最终真实验收已补齐所有列明的适用入口：多维释义、多维例句、共享例句、短语成分、关联词、快捷关联，以及发布A→未发布调序B隔离→再发布B生效、英美筛选、同拼写身份及刷新持久化。均通过，详见 [full-acceptance.md](./full-acceptance.md)；此前 [acceptance.md](./acceptance.md) 的未验证项已由本轮补齐。跨组共享 form_id 被当前写入契约拒绝，列不适用；历史读取兼容以单测验证，不宣称浏览器通过。专用环境及会话凭据已清理，无共享库/生产数据操作。当前证据支持提交本任务改动，不代表生产部署验收；未提交、推送或部署。
