# 智能词库第二阶段技术设计

## 选择的方案

继续复用 `AdminWordV2` canonical 聚合、`entries.current_publication_id`、不可变 `entry_publications` 与结构化 publication refs。生命周期是聚合可见性状态，不是内容版本：归档/恢复更新 `archived_at/archived_by_admin_id/updated_at`，但不增加内容 `revision`，也不创建 publication。独立的 `lifecycle_revision` 只对生命周期命令递增；命令同时提交 `base_revision` 和 `base_lifecycle_revision`，避免内容并发与相反状态命令互相覆盖。协议级重放仍由 `platform.idempotency_records` 保证。

归档安全检查只关注来源词条未归档、且来源 publication 仍是其 `current_publication_id` 的入站引用。历史 publication 引用继续保留用于解释历史，但不阻塞；已归档来源不会让另一个目标永久无法归档。归档目标的 `current_publication_id` 不清空，因此恢复不需要重发或复制快照。恢复前反向检查该词条当前 publication 的出站引用：目标必须已激活、仍有 current publication，且目标词义仍存在；批量恢复中的目标视为同一原子状态变更。

短语复用 detection/create/forms/meanings/validate/publication 全链路。matched phrase 采用现有词典建议；not_found phrase 创建 unified 主词、空 forms/meanings，随后由现有 V2 词形步骤补齐词性。单词 not_found 仍 fail-closed。

方言建议新增 `dictionary_region_rules` provider 边界。Repository 批量读取 active region surfaces 与 target term family；纯 provider 对 form 做精确替换、对 RichText 做带边界映射的英文 token 替换。无证据时不返回该 suggestion。响应在顶层返回真实 provider kind/version，不使用虚假的模型版本。

## 拒绝的方案

- 不物理删除未发布草稿或已发布词条：这会制造两套生命周期语义，并可能破坏稳定 ID、审计与查重。
- 不在归档时清空 current publication 或删除历史 refs：恢复会丢失线上版本语义，历史也不可解释。
- 不让归档增加内容 revision：否则未修改正文也会被误判为 `has_unpublished_changes`。
- 不回退 `/admin/words` legacy DTO 创建短语。
- 不硬编码英美词表或伪装调用外部 AI；dictionary evidence 不足时保持缺失。

## 后端影响

- `src/lexicon/dto.rs`：`archived` 状态、生命周期与批量 DTO、方言建议 DTO/provider 元数据。
- `src/lexicon/model.rs`：归档字段、方言 evidence 与生命周期引用记录。
- `src/lexicon/dialect_provider.rs`：纯确定性 provider、RichText offset 重映射与单元测试。
- `src/lexicon/repository.rs`：包含归档项的详情读取、显式状态列表、锁序、入站引用检查、生命周期事务/审计/outbox/idempotency、批量地区证据。
- `src/lexicon/service.rs`：phrase create 分支、生命周期命令、方言建议校验/编排、归档写保护。
- `src/lexicon/handler.rs`、`router.rs`、`src/openapi.rs`：新 HTTP 端点与稳定 Problem Details。
- migration：只增加支撑生命周期事件并发/查询所需索引或约束；不改写第一阶段 migration。
- `docs/word-data-model.md`、`docs/openapi.json`：落地状态、状态机、引用和 provider 契约。

## HTTP 契约

```text
POST /api/v1/admin/lexicon/dialect-variant-suggestions
POST /api/v1/admin/lexicon/entries/{id}/archive
POST /api/v1/admin/lexicon/entries/{id}/restore
POST /api/v1/admin/lexicon/entries/archive-batch
POST /api/v1/admin/lexicon/entries/restore-batch
```

所有生命周期端点要求 UUID `Idempotency-Key`。单条 body 为 `{base_revision,base_lifecycle_revision}`，返回 `AdminWordV2Envelope`；批量 body 为 `{entries:[{id,base_revision,base_lifecycle_revision}]}`，返回 `{words, affected}`。批量原子提交，任一目标失败则全部回滚。

方言建议 body 保持 snake_case：`source_dialect`、`target_dialect`、`items`。响应为：

```json
{
  "provider": { "kind": "dictionary_region_rules", "version": "1" },
  "suggestions": []
}
```

## 前端影响

- `packages/types/src/admin-word-v2.ts` 与 `admin-word.ts`：生命周期、归档状态、方言 provider、list revision。
- `packages/api-client/src/admin.ts`：新真实路径和 Idempotency-Key header。
- `packages/api-client/src/openapi.snapshot.json`：由权威 OpenAPI 同步生成精简快照。
- `apps/admin/src/features/dictionary/dataSource.ts`：真实 capability 开启；mock-only legacy/TTS 保持关闭。
- `apps/admin/src/features/dictionary/api.ts` 与 `word-creation/api.ts`：生命周期 mutation、缓存更新/失效。
- `SmartDictionary.tsx`：短语走 V2 向导、归档筛选/单条/批量、归档行恢复、pending 防双击。
- `CreateEntryStep.tsx`、`WordCreationWizard.tsx`：phrase/not_found phrase、类型展示、归档只读保护。
- `WordCreationLayout.tsx`、`word-creation.css`、`ConsoleLayout.tsx`：Step 2–4 统一为顶部两行摘要，Step 1 不显示摘要；1200/1440 使用同一宽工作台，不保留左侧摘要栏。

## 数据与状态流

```text
list row revision ── archive/restore command + idempotency key
       │                           │
       │                           ▼
       │                 lock entries in UUID order
       │                           │
       │            revision / state / inbound-current-ref checks
       │                           │
       └──────────────────── response canonical AdminWordV2

dialect items ── validate/canonicalize ── collect tokens
       └── active dictionary region evidence ── deterministic provider
                                      └── only evidence-backed suggestions
```

## 测试策略

- 后端纯单元：provider token/大小写/RichText offset/phoneme 保护、phrase helper。
- schema/repository：publication 与 refs 在归档/恢复后仍存在；归档 key 继续唯一。
- handler：400 header/path/JSON、422 semantic input、409 revision/idempotency/inbound refs、replay、concurrent command、历史 publication。
- 前端 contract：每个 method/path/header/schema 与 OpenAPI 快照一致。
- 前端 unit/integration：capabilities、phrase create UI、单/批归档恢复、双击、失败保留选择、方言建议失败重试。
- 完整质量门按仓库约定执行；不降低覆盖率或增加排除。

## 风险与回滚

- 风险：生命周期不增加内容 revision，两个不同 key 的相反状态命令会按数据库锁获得的顺序生效。该行为是目标状态命令的明确 last-committed-wins；每个响应都返回最终状态，UI 随即重取列表。
- 风险：RichText 替换改变码点数。provider 维护旧/新边界映射；音素覆盖或边界落在 token 内时跳过该 token，保证不产生错误标注。
- 风险：dictionary evidence 稀疏。无 evidence 的项目保持 missing，前端继续允许手工输入。
- 回滚：关闭对应真实 capability 即可隐藏入口；后端端点和新增索引可保留，不影响第一阶段读写。绝不通过删除 publication 回滚。
