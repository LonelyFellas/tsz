# 词条内容联动生成与真实完成度技术设计

## 方案概述

采用“共享 readiness 纯函数 + 当前步骤草稿上报 + 服务端幂等 enrich 命令”的方案。

前端把 forms/meanings 现有完成校验抽成可复用、可定位的结构化规则，`WordCreationWizard` 同时持有服务端 canonical word 和当前步骤上报的未保存草稿，`WordCreationLayout` 基于两者计算七项实时状态。状态不再以数组长度决定，而是输出完成数、总数、阻断项和首个定位目标。

内容联动分两条路径：新词条继续由 detection 的 `suggested_meanings` 在 create 事务中落入草稿；当建议缺失或处理历史空白草稿时，前端在 forms 完成后调用新的幂等 enrich 命令。服务端按可靠 provider 链生成并只填空位，原子保存后返回新 revision 与 generation summary。前端不生成业务正文，也不把现有 `/dialect-variant-suggestions` 错当成完整内容生成接口。

不选择“前端初始化时直接填模板”的方案：语法、释义和例句不能从 POS 可靠推断，前端硬编码会制造不可追踪内容并与后端权威校验漂移。

## 现状证据

- `WordCreationLayout.tsx` 对语义区间使用 `Math.max(1, length)`，其余项目统计节点数组长度，并以 `value > 0` 显示绿色勾。
- `model.ts#createPosMeanings` 为每个 POS 创建一个空 grammar、一个空 sense、一个空 definition 和一个空 sentence，所以空草稿天然显示 `1/3/3/3`。
- `meaningsAndExamples/validation.ts` 已正确要求语义区间双语名称、完整 grammar、sub POS、frequency、中文释义、英文例句、汉语译文和唯一 focus link；摘要没有复用这些规则。
- forms 完成校验仍内嵌在 `FormsAndPronunciationStep.tsx`，无法供摘要实时复用。
- Rust 权威 OpenAPI 的 `BuiltinDictionaryResultV2.matched` 已包含 `suggested_meanings`、`suggested_frequency`、`coverage`、`provenance`。
- Rust `frontend-integration.md` 明确当前 Kaikki 只持久化词头、基本词性和地区证据；meanings/examples/frequency 为 `missing`。
- 当前完整内容生成端点不存在；`POST /admin/lexicon/dialect-variant-suggestions` 只做 evidence-backed 方言变体建议。

## 代码影响范围

### 前端 `tsz`

新增：

- `apps/admin/src/features/dictionary/word-creation/readiness.ts`
  - 定义 `ReadinessState`、`ReadinessIssue`、`ReadinessRow`。
  - 计算 basics、POS、forms、sense group、grammar、sense、sentence 的有效完成数与首个定位目标。
  - 复用 `englishTextComplete`，并保持与服务端字段语义一致。
- `apps/admin/src/features/dictionary/word-creation/formsValidation.ts`
  - 从组件中抽出 forms 完成校验，返回带 `pos_id/node_id/field` 的结构化问题；组件与摘要共同消费。
- `apps/admin/src/features/dictionary/word-creation/generation.ts`
  - 判断草稿是否仍为系统空白骨架、是否允许自动 enrich，以及 generation 状态映射；不得包含正文生成算法。

修改：

- `packages/types/src/admin-word-v2.ts`
  - 先与最新 OpenAPI 对齐 `BuiltinDictionaryMatchedV2` 的 provider、suggested_meanings、suggested_frequency、coverage、provenance。
  - 后端 enrich 契约落地后镜像 request/response/generation summary 类型。
- `packages/api-client/src/openapi.snapshot.json`
  - 只由 Rust OpenAPI 同步生成。
- `packages/api-client/src/admin.ts`、`admin.test.ts`、`endpoints.contract.test.ts`
  - 接入 enrich 命令和错误契约。
- `apps/admin/src/features/dictionary/dataSource.ts` 与 mock
  - 增加 `enrichMeanings` facade/capability；生产能力只以后端契约存在为准。
- `apps/admin/src/features/dictionary/word-creation/api.ts`
  - 增加 `useEnrichMeanings`，成功后原子更新 detail cache。
- `WordCreationWizard.tsx`
  - 保存当前 forms/meanings 草稿快照与 generation 状态。
  - 跨 `word.id`、revision 和步骤重置临时快照。
  - forms 完成响应后启动一次 enrich；恢复空白草稿时允许一次自动尝试。
- `FormsAndPronunciationStep.tsx`
  - 使用共享 forms 校验；通过 `onDraftChange` 上报当前内容。
  - 完成保存后把精确新 revision 交给 generation 编排。
- `MeaningsAndExamplesStep.tsx`
  - 使用共享 meanings readiness；通过 `onDraftChange` 上报当前内容。
  - 展示生成中、partial、失败、重试状态；生成期间允许读取，不允许旧响应覆盖本地 dirty 内容。
- `WordCreationLayout.tsx`
  - 使用 readiness rows；显示完成数/总数和完成、待完善、未开始、生成中/失败图标。
  - 未完成行支持导航到 `step + pos_id + node_id + field`。
- `word-creation.css`
  - 增加 pending/error/generating/neutral 状态样式和可点击行状态。
- 对应 `*.test.ts(x)` 与 `e2e` 用例。

### 后端 `tsz-rust` 对接建议（本前端 feature 分支不实现）

当前 OpenAPI 虽支持 `suggested_meanings`，但真实 provider 数据不足。后端需完成两层能力：

1. 扩展离线 dictionary 数据管线，持久化有许可的 senses/examples/frequency 并在 detection/create 中落地真实建议。
2. 为 grammar 和词典缺失项接入可审计的生成 provider，并提供历史空草稿 enrich 命令。

建议新增：

```http
POST /api/v1/admin/lexicon/entries/{id}/steps/meanings/enrich
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "base_revision": 12,
  "fill_policy": "empty_only"
}
```

建议响应：

```jsonc
{
  "word": { "schema_version": 2, "revision": 13 },
  "generation": {
    "status": "complete", // complete | partial
    "provider": [{ "kind": "...", "version": "..." }],
    "coverage": {
      "meanings": "complete",
      "examples": "complete",
      "grammar": "complete",
      "frequency": "partial"
    },
    "generated_node_ids": ["..."],
    "remaining_issues": []
  }
}
```

错误约定：

- `409 revision_conflict`：返回 current revision，不应用旧结果。
- `409 meanings_generation_conflict`：检测到不可安全合并的人工/并发内容。
- `422 meanings_generation_not_applicable`：forms 未完成、POS 为空或数据结构非法。
- `429 generation_rate_limited`：携带可安全展示的 retry 信息。
- `503 meanings_generation_unavailable`：provider 暂不可用；不修改 revision。

服务端要求：

- 命令按 actor/entry/idempotency key 幂等；同 key 同 hash 重放同一响应。
- 只填空字段，不覆盖 origin=manual 或非空 RichText，不删除、不重排人工节点。
- 合并时保证 `pos_id`、sense group、grammar reference、sub POS 和 sentence focus link 全部有效。
- partial 结果可以原子保存，但必须返回 remaining issues；完全无可靠结果不递增 revision。
- provider/version、覆盖率和生成审计留在服务端；密钥、内部提示词和原始供应商响应不下发。
- create 路径继续优先消费 detection snapshot 内已有的 `suggested_meanings`，避免对已有可靠词典数据重复调用生成服务。

## 数据流 / 时序

### 新词条

1. detect 返回 headwords/forms/suggested_meanings/coverage/provenance。
2. create 在事务中消费检测快照，持久化可靠建议与稳定节点 ID。
3. 管理员完成 forms；前端收到新 revision。
4. 若 meanings readiness 已完成或已有可靠内容，不调用 enrich。
5. 若仍为空白骨架，调用 enrich(`empty_only`)；页面显示生成中。
6. 成功后用返回 word 更新 query cache 和向导状态；partial 保留内容并展示剩余问题。
7. 用户编辑后，本地草稿实时驱动左侧 readiness；保存后切回 canonical word。

### 历史空白草稿

1. GET 读到 forms 已完成且 meanings 是可证明的系统空白骨架。
2. 当前 `word.id + revision` 尚未尝试过时，自动发起一次 enrich。
3. 自动失败后不循环重试，只展示显式重试入口。
4. 若检测到任何本地 dirty 或人工内容，不自动发起；用户可继续手工填写。

### readiness

1. Wizard 选择当前来源：当前步骤未保存草稿优先，否则 canonical word。
2. 纯函数生成七行状态、完成数/总数和结构化 issues。
3. Layout 渲染状态；点击 issue 使用现有 `nodeId/field` 路由 state，并补充 `pos_id` 定位。
4. 服务端 validate 返回问题时合并展示；相同 node/field/code 去重，服务端问题优先。

## 复用与约定

- 复用 `validateMeanings` / `englishTextComplete` 语义，但把字符串-only 结果升级为结构化 issues，避免组件、摘要和最终校验三套规则。
- 复用 TanStack Query detail cache、现有 revision 冲突处理、`useWordValidationIssue` 和定位属性。
- 类型与请求放 `@tsz/types` / `@tsz/api-client`；admin UI 仅使用 antd v6。
- 不手改 OpenAPI snapshot；后端实现并导出权威 spec 后执行 `pnpm --filter @tsz/api-client sync:openapi`。

## 测试策略（概览）

- 单元：七类 readiness 的空、partial、complete、optional；多 POS；双方言；无派生词形 POS；人工内容识别；generation eligibility。
- 组件：摘要实时更新、状态图标/数值、点击定位；生成中/partial/失败/重试；跨词条清理；dirty 时拒绝应用旧响应。
- API/契约：enrich path、Idempotency-Key、snake_case、响应解析、OpenAPI 快照。
- 集成：forms complete → 单次 enrich → cache/revision 更新 → meanings 编辑 → 保存。
- E2E：多词性新词条、历史空白草稿、partial、409、503；mock 与真实环境证据分开。
- 真实验收：使用 Codex 内置浏览器，在已登录测试环境验证，不再默认使用系统 Chrome。

## 风险与回滚

- 最大风险是生成来源未就绪：前端可先交付真实 readiness，但“自动生成实际内容”不能在无 provider 时宣称完成。
- provider 质量风险：所有生成内容仍需管理员确认，发布校验不能因来源是模型而放宽。
- 竞态风险：生成响应晚于人工编辑；以 `word.id + base_revision + dirty guard` 拒绝陈旧应用。
- 规则漂移风险：客户端 readiness 可能落后服务端；服务端 issues 始终优先，契约测试固定关键 code/field。
- 回滚前端 generation 编排不会破坏已生成内容；它们仍是合法 canonical draft。readiness 可独立回滚，但不应恢复“节点存在即完成”的误导逻辑。
