# 智能词库第二阶段需求

## 背景与目标

第一阶段已经把 V2 canonical 聚合、稳定节点 ID、RichText、跨词条引用、发布版本和后台真实数据源接通。第二阶段补齐当前真实模式主动关闭的生命周期、短语和方言建议能力，并继续以 `tsz-rust/docs/openapi.json` 为唯一 wire 契约。

可量化目标：管理员可在真实模式下完成短语检测、创建、分步编辑、校验和发布；可幂等归档/恢复单条或最多 100 条词条；可用现有内置词典地区证据获得可解释、确定性的方言建议。所有写失败返回 RFC 9457 Problem Details，前后端自动化覆盖 400、409、422、幂等重放、并发和双击。

## 目标应用

- admin 智能词库列表与 V2 创编向导。
- `@tsz/types` 与 `@tsz/api-client`。
- 后端 `tsz-rust` 的 lexicon 模块、数据库约束、OpenAPI 与架构文档。

## 用户故事

1. 管理员可创建内置词典已命中的短语；内置词典未命中的多词输入也可创建一个空 V2 草稿，再在词形步骤选择词性，不退回 legacy DTO。
2. 管理员可编辑、校验和多次发布短语，行为与单词共享同一 V2 聚合与 publication 模型。
3. 管理员可归档单条或批量词条；归档后不出现在默认列表、统计、关联搜索和引用目标中。
4. 管理员可筛选已归档词条并恢复；恢复稳定 ID、查重键、草稿 revision、当前 publication 和全部历史 publication。
5. 管理员在英美内容缺失时可请求方言建议。建议只来自当前 active dictionary 的 region evidence 与确定性替换规则，并明确返回 provider 元数据；无证据的项目保持缺失，允许手工填写。
6. 重复点击创建、发布、归档、恢复或批量操作不会产生重复副作用；同幂等键不同请求返回 409。

## 主要流程与错误流程

- detection 判定 `entry_kind=phrase` 后，matched 结果复用建议词性/词形；not_found phrase 使用规范化输入作为 unified 主词并创建空 forms。
- 归档/恢复命令携带 `Idempotency-Key`、`base_revision` 与独立的 `base_lifecycle_revision`。相同 key/hash 重放首次响应；key/hash 不同为 `idempotency_conflict`。
- 归档已发布目标前检查其他未归档词条的当前 publication 入站引用；存在引用时返回 `entry_has_inbound_publication_refs` 409 和引用位置。
- 恢复已发布来源前检查其当前 publication 的出站目标；目标仍归档、未发布或词义已从目标当前 publication 删除时，返回 `entry_has_unavailable_publication_refs` 409。
- `base_revision` 落后返回 `revision_conflict` 409；无效 header/JSON/path 返回稳定 400；语义不合法的批量输入或方言请求返回稳定 422。
- 归档状态禁止保存、校验和发布，直接调用返回 `entry_archived` 409。
- 方言建议 source 与 target 相同、项目为空/超限、重复 client_id 或非法 RichText 返回 422；没有证据不是错误，只返回较少 suggestions。

## 范围

包含：单条归档/恢复、批量归档/恢复、归档筛选、V2 短语全链路、dictionary-region 确定性 provider、前端真实能力开关、OpenAPI/精简快照/测试矩阵。

不包含：物理删除 publication、断链/合并词条、外部大模型或翻译服务、自动改写中文、学习端页面、TTS、审批和搜索引擎。

## 权限、兼容与安全

- 沿用 active admin 鉴权；不扩大角色权限。
- 已发布数据永不由归档命令物理删除；历史 publication 和 publication sense refs 保持不可变。
- 归档词条继续占用唯一 headword keys。
- 默认列表与统计保持只看未归档词条；只有显式 `status=archived` 才读取归档项。
- 未在 OpenAPI 落地的 legacy/TTS 等能力继续 fail-closed。
- 批量命令最多 100 个目标、拒绝重复 ID，并按 UUID 顺序加锁避免死锁。

## 验收标准

- OpenAPI 包含全部新端点、schema、Problem Details 状态和枚举；前端快照同步且契约测试无 PENDING。
- 单词第一阶段流程不回归；matched 与 not_found phrase 均可进入 V2 编辑，完成后发布。
- 归档/恢复保留 revision、current publication、历史 publication 数量和跨词条历史引用；入站当前引用安全检查准确。
- 同 key 重放响应一致；并发 revision 与相反生命周期命令行为可预测；前端 pending 状态阻止双击。
- 方言建议不声称调用外部模型，结果只基于测试可控的 dictionary region evidence。
- 后端 fmt/check/clippy/full cargo test 和前端 OpenAPI contract/test:cov/typecheck/lint/build 全部通过。

## 外部约束

当前没有外部模型、翻译或 TTS 服务。本阶段不把它视为阻塞：以 `dictionary_region_rules` provider 完成可测试能力边界；未来 provider 可替换，但 wire 仍必须暴露真实 provider 身份与版本。
