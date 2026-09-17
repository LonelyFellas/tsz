# 专用词形组：技术设计与交付

基线：tsz `617f7db`、tsz-rust `02de3eb`。两仓共用本设计；产品规则见 [requirements.md](requirements.md)。

## 现有能力与最终改动

一形一组、组的 general/dedicated、词义的可选 form_group_id、同词性约束与原有影响预览均已在主线。
本次补齐关联筛选与保存校验，并在词形卡片内提供词义绑定编辑。

- 后端 `service/form_senses.rs::allowed_form_senses` 统一判定：同基本词性，通用组全义，专用组仅绑定义。
- `sentence_association.rs` 为每个候选词形计算允许列表；保留完整候选词义集合，以便跨组切换。
- `phrase_component_matches_target`、`text_links::target_content_gloss`、自动关联复用规则；正文/成分保存、发布和共享例句校验一致。
- 发布重新复核固定版本成分，避免旧版保存的错配绕过新规则；保留目标归档及并发锁的 reference_conflict 语义。
- 前端 `V3TargetCascader` 按具体词形过滤；短语来源词义的成分入口也按命中词形过滤。
- `V3FormGroupSenseEditor` 在卡片内选择，头部“专用词义”负责进入；数据仍保存在原有词义模型。
- 词义草稿比较复用规范化 JSON：对象字段顺序不算修改，数组顺序和真实内容变化仍算修改。

## API 契约

| 接口/类型                                                     | 变化                                            |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `POST /api/v1/admin/lexicon/entries/component-targets/search` | `forms[].allowed_sense_ids?: UUID[]`            |
| `POST /api/v1/admin/lexicon/entries/sentence-targets/resolve` | 同上                                            |
| `PreviewFormsImpactInputV3`、`SaveFormsStepInputV3`           | `sense_bindings?: [{sense_id, form_group_id?}]` |
| `AdminWordV3.capabilities`                                    | `atomic_form_sense_bindings?: boolean`          |

新后端始终返回 allowed_sense_ids，包括空数组。缺省供新前端兼容旧服务，空数组明确不可选，不能被省略或当作全量。
sense_bindings 只修改当前词条既有词义的绑定；缺省 group 表示解除，空列表不修改。拒绝重复/未知词义及跨词性绑定，不创建词义或保存其他词义草稿内容。
OpenAPI、types、api-client 快照与严格运行时 schema 使用原生生成链同步。

## 保存与确认

影响预览和词形保存都对拟议 forms + bindings 做同词性及入站引用校验。后端已有事务同时写词形、词义和投影，复用它实现原子保存。
普通影响 token 和词面确认 token 的命令摘要包含按 sense_id 排序的补丁；纯词面证据的 forms digest 保持不变。
前端确认指纹同样包含补丁，保存成功只同步词义绑定基线，其他未保存词义编辑继续保留；失败不丢失选择。
仅当 atomic_form_sense_bindings=true 时显示绑定入口并发送补丁。

## 兼容、历史数据与发布顺序

无 schema migration、词形 ID 重建或清库。

| 组合            | 行为                                               |
| --------------- | -------------------------------------------------- |
| 新前端 + 旧 API | 接受缺省字段；维持原关联行为，不开放原子组绑定入口 |
| 旧前端 + 新 API | 旧严格 schema 会拒绝新增响应字段，不能作为过渡组合 |
| 新前端 + 新 API | 候选按允许列表筛选，组状态和绑定原子保存           |

先发布兼容前端，再发布后端；旧标签页需要刷新。回退两个组件时先回退后端再回退前端，后端回退会恢复旧的宽松校验。
固定 publication ID 只校验指定不可变快照。未固定发布版本的草稿成分继续受已有入站引用保护；正文草稿未全部纳入入站收集，来源保存/发布会重新校验，不声称所有目标编辑均能立即拦截它。
旧错误配对在再次保存/发布时可能被拒，应定位后重选，不自动换义。线上存量盘点尚未执行，应在部署准备时只读进行。

## 验证与审核

- 已运行后端库测试 279 项、词条 HTTP 集成 95 项、共享例句集成 24 项，全部通过；fmt 与全目标、全特性 Clippy 通过。
- 前端全仓检查及后续定向回归证据见浏览器验收记录。一个未改动的包加载测试曾在并发检查时超时，单独复跑通过，未放宽超时或断言。
- Chrome 真实后端已验证三种关联入口、设置/保存/刷新/恢复、取消与折叠、多词性隔离、空态跳转及 1024px 窗口。
- 最终提交/推送门禁由原生 hooks 执行；独立提交审查与 CI 结果记录在 PR。

## 可执行验收

前端根目录：

```bash
pnpm --filter @tsz/admin test src/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep.test.tsx src/features/dictionary/word-creation-v3/components/V3TextAssociationPicker.test.tsx src/features/dictionary/word-creation-v3/V3WordCreationWizard.test.tsx src/features/dictionary/word-creation-v3/saveFlow.test.ts
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/admin typecheck
```

后端根目录，DATABASE_URL / TEST_REDIS_URL / REDIS_URL 显式指向任务隔离实例：

```bash
SQLX_OFFLINE=true cargo test --locked --lib --test lexicon_handler --test shared_sentences
```

预期全部通过；HTTP 用例包括有入站引用时原子设专用、绑定不匹配的保存/发布拒绝、解绑确认不可换补丁复用。浏览器人工验收入口与样例见 [browser-acceptance.md](browser-acceptance.md)。
