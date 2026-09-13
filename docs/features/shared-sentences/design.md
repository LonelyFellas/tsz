# 共享例句词义目标设计

2026-09-13。本方案替代此前只按 entry_id 绑定的方案；独立句子与按真实标注反查的原则保持。用户已决定先保存新词义，再添加例句。

## 基线、隔离与依赖

源环境为 tsz-main-local-20260912 / tsz-rust-main-local-20260912，用户页面 3101 和 API 8484 保留。

新工作树：tsz-sentence-senses-20260913、tsz-rust-sentence-senses-20260913；均使用 `codex/shared-sentence-sense-targets`，以各自 origin/main 为基线并复制完整源工作区差异。前端 main 为 9ae7275，后端为 d5bddc4。原差异和数据已备份；新数据库是 tsz_sentence_senses_20260913（原隔离库的克隆），Redis 使用 56392/2，计划 API 8485、前端 127.0.0.1:3102。

关键路径：词义目标身份与引用保护 → 原生契约同步 → 词义卡片与选择器 → 本地验收。

- 已有：共享实体、标注位置、幂等、revision、鉴权、独立保存、关联恢复与连读渲染。
- 可复用：多维释义的 V3TargetCascader、TextLinkV3 目标身份校验、词形候选服务与稳定 nodes。
- 小改动：将例句区块放回每个词义内、增加已保存词义门禁、影响提示。
- 新工作：annotation 保存完整词义目标、按 entry+sense 反查、按词义解除、引用节点保护、旧 entry-only 过渡。

## 目标与存储

Linked 保留 target_entry_id，并增加 target_pos_id、target_base_form_id、target_form_id、target_variant_id、target_sense_id 和可选 target_publication_id。与现有 TextLinkV3 的目标身份一致；不支持将短语选择绕到其成分词后忽略该路径。

annotations 表增加 target_sense_id 和 target_ref JSONB。target_ref 保存完整 Linked 目标，entry/sense 两列用于查询与约束；CHECK 保证二者与 JSON 中对应 ID 一致，并增加复合查询索引。sense 外键指向稳定 `lexicon.nodes(id,entry_id)`，不引用正常保存会重写的 senses 行。

旧行没有 target_ref/sense 时返回显式的待选择词义状态，不冒充完整 Linked。过渡列可空，新写入服务层拒绝不完整目标。down 在存在新词义目标时拒绝有损删除；不删除历史 collection/sense collection 表。

## 服务与校验

保留现有完整 token、码点位置、登记形式匹配。提取 text_links 的纯目标身份验证（POS、form、variant、base group、sense 从属关系）供两处复用；共享例句不调用会禁止自指、写宿主 publication_sense_refs 的整套 TextLink 流程。

目标加载采用已保存草稿/明确发布快照的现有规则。查询和保存都使用明确目标及其词形；不靠截断候选列表证明某 ID 不存在。当前词义可成为目标，历史 source 不成为永久约束。

新增上下文 source_sense_id / context_sense_id：上下文 entry 与 sense 成对验证，至少一条完整标注同时匹配二者。新词义尚未保存时没有权威节点，不自动造空节点、不隐式保存整个词义表单。

锁顺序维持词条上下文在前、句子在后。词义/词形保存时在已锁定 entry 的事务内检查真实共享引用：拟保留的 forms/meanings 必须仍包含引用身份。发布与切换发布版本同样检查，不向其他宿主引用表伪造行。

## 查询、解除与响应

- GET sentences 增加 sense_id；必须与 entry_id 配对，并在同一个 EXISTS annotation 条件中同时过滤。词义内按句 ID 去重；词条汇总可以跨词义去重。
- POST 必传 source_entry_id/source_sense_id；PUT 的可选 context_entry_id/context_sense_id 成对出现；其余全局编辑语义不变。
- 显式解除携带当前 sense_id，只移除该 entry+sense 的标注。旧 entry-only 状态从全局编辑器补全或清除。
- 响应关联词条中带词义 ID/摘要，已有关联面板能明确展示“make up · 编造”。摘要从权威目标内容读取，不信任客户端文案。

## 前端

WordSentences 改为词义级查询；V3MeaningsAndExamplesStep 在每个 sense 卡片内渲染区块。源 sense 是否保存从 canonical word 判断，草稿新 UUID 不构成已保存证据。删除/切换界面不暗中保存例句。

SharedSentenceAssociationPicker 复用 V3TargetCascader 的词条→词形→词义界面。共享例句允许当前词条，短语选择使用自身词义；现有多维释义的自指过滤和短语成分路径保持默认行为。Pending 继续独立于完整目标。

自动检测仅在当前词义有明确合法词形时给出确认入口；有多个词形身份时需要选择，不能用第一条任意候选。自动恢复同时携带完整目标身份，不丢 sense/form 字段。

新增/编辑仍直接显示 voice-editor，保存与未保存离开保护独立于词义表单。新环境验收使用任务专用样例，不改动源环境正在编辑的数据。

## 兼容、发布、回退

目标 union、必填上下文及响应字段改变，与旧严格 runtime 客户端不兼容。通过后端原生 export_openapi 和前端 sync:openapi 同步；不得手改生成字段或扩大 PENDING。

发布顺序：同批发布。后续获授权后，在维护窗口备份与清点数据，切换配套 API/客户端并修复明确的存量关系；不能猜配第一词义。此次只交付独立本地环境。旧环境与源工作树保留作为人工验收和回退依据，不恢复快照覆盖新增数据。

## 验证

重点验证同一词条不同词义隔离、同一句共享及局部解除、精确身份链、未保存词义门禁、旧数据修复、引用删除保护、权限、幂等与并发。迁移 up/down 在 SQLx 隔离数据库验证，不能对源库执行 down。

在后端工作树且已准备隔离测试依赖时执行：

```sh
SQLX_OFFLINE=true cargo test --locked --test shared_sentences
```
