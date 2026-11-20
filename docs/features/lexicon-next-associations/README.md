# 新版词库语法与例句关联

## 目标

为 `/lexicon-next` 补齐 V1 已有的三类句内关联能力。

- 语法结构正文绑定词形
- 多维例句正文关联单词
- 多维例句正文关联短语

关联数据使用 `lexicon_next` 独立表保存，正文 JSONB 只保留文本与节点身份。关联目标支持 `v3` 与 `lexicon_next` 两种稳定节点来源，保持与语音合成和目标选择器的 wire 形状一致。

## 关键约束

- 旧客户端不发送扩展字段时，服务端保留已有关联，不静默清除。
- 关联锚点以变体节点和 Unicode 码点区间保存，正文变化后按现有文本重定位规则校验。
- 新版例句关联不复用 `lexicon.sentence_associations`，避免把 `lexicon_next.sentences` 身份混入旧库。
- 保存、删除、发布预览需检查目标词条、词义、词形、方言和权限。目标失效时回显问题并阻止发布。
- 关联字段通过独立能力头协商，旧后端或旧前端保持现有文本编辑路径。

## 数据表

- `lexicon_next.grammar_form_links` 保存语法变体到目标词形的关联。
- `lexicon_next.sentence_associations` 保存例句变体到目标词义/词形的单词或短语关联。
- 两表均保留稳定主键、来源节点、区间快照和目标节点，并为目标节点建立反向查询索引。

## 实施顺序

1. Rust DTO、迁移、保存/读取/发布校验与 OpenAPI。
2. 前端 wire 类型、运行时快照、请求协商和关联编辑器适配。
3. 定向契约、模型、组件与后端集成测试。
4. 真实页面链路验证保存、刷新、重开、失效目标和发布阻断。

## 验证结果

- 前端 `pnpm --filter @tsz/api-client test -- --runInBand` 通过，759 个测试通过。
- Admin `pnpm --filter @tsz/admin typecheck` 通过。
- Admin 关联编辑器定向 Vitest 通过，`GrammarStructures.test.tsx` 与 `NextSentenceEditor.test.tsx` 共 5 个测试通过。
- 后端 `cargo check --all-targets --all-features` 通过，`cargo fmt --check` 通过。
- 后端 `next_sentence_association_roundtrips_to_a_next_entry_target` 集成测试通过。
- 隔离数据库完成迁移 up/down/up 验证，最终版本为 `20261119120000`。
- 真实页面使用隔离 Postgres、Redis 和 `tsz-rust` API 验证了新版词条选择、保存、刷新、重新打开和回读。数据库中的 `lexicon_next.grammar_form_links` 与草稿 `form_links` 均回读出 `target_source=lexicon_next` 的关联。
- `deploy/api-target.json` 已固定到配套后端提交 `9e014ea2061672637c08c602e348ed8f12a64855`，用于 PR API 契约预检。

## 当前状态

实现与验证完成，等待提交。未推送、合并或部署。
