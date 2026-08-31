# Smart Lexicon V3 草稿跨步骤编辑：技术设计

## 现状与复用判定

### 已合入或已被替代

- `WordCreationLayout.tsx` 已只按 `completed_steps` 渲染完成状态，不再用当前位置推断前序步骤完成。
- 同一布局已通过 `reachableSteps` 统一控制 V3 可点击步骤；不需要重写通用 Steps。
- `V3MeaningsAndExamplesStep.tsx` 已有零词性 Empty 状态，不需要按旧设计再加一套 Alert。
- preview 已能对空/不完整草稿安全降级。
- 后端 main 的 `save_meanings_v3` 已仅在 `intent=complete` 且 forms 未完成时返回 `StepNotReachable`；`intent=save` 可落库。
- 后端 main 已有 `v3_meanings_draft_saves_before_forms_complete_but_complete_is_blocked` 一类 HTTP 回归，并在 publish 路径独立执行 forms/meanings 完整校验。

### 可复用

- 原始 worktree 的 `stepAccess.ts` 修改：draft 直接返回四步 reachable，归档/已发布只读规则不变。
- 原始 15 行矩阵中的直接 URL、保存草稿、complete/publish 回归场景。
- 已有 `WordWizardV3` 页面/会话测试基座。

### 需重做或删除的旧假设

- 旧 `word-wizard-step-gate-removal/design.md` 主要描述 V2 通用 `WordCreationWizard.tsx` 的四处门禁；当前 V3 已收敛到 `resolveV3StepAccess`，不应再改 V2 导航文件。
- 旧文档把后端放宽列为待实现；最新 main 已实现，后续不应重复修改后端业务逻辑。

## 方案概述

只修改 V3 专用访问解析：

```ts
if (readOnly) return previewOnly;
if (word.status === "draft") return allStepsReachable(requested);
return currentPublishedEditBehavior;
```

`WordWizardV3` 页面和 `V3WordCreationWizard` 会话已经共同调用该函数，因此这一个规则会同时覆盖：

- 直接 URL / 刷新时的合法步骤归一；
- 顶部步骤 `reachableSteps`；
- 按钮/完成情况调用 `setActiveStep`；
- complete 后尝试进入下一步。

不删除 `max_reachable_step` 字段；它继续用于列表默认续做落点和非 draft 现有规则。

## 前后端边界

### 前端负责

- 不把 draft 的 `max_reachable_step` 当访问控制。
- 纯导航不触发保存或验证。
- 本地 dirty draft 在会话内跨步骤保留。
- 自动为 forms POS 生成的 meanings 模板只用于编辑体验，不算用户未保存改动；会话维护该派生模板的 clean baseline，编辑后完全还原可恢复 clean，preview 直接检查服务端 canonical 草稿。
- forms 删除 POS 时同步裁剪本地 meanings 中对应 POS、独占语义区间，以及保留 POS 中指向被删 sense 的 sentence links/relations；若 meanings 已有真实编辑则保留 dirty，并在 forms 接受后按新 revision 保存。
- Step 3 的删除入口只提交一次 forms 转换，由 Wizard 原子派生 meanings，避免组件基于旧 value 二次覆盖；问题导航先展开目标词形组、sense 和子区块，再确认真实 DOM focus。
- 继续显示服务端返回的完成事实和续做落点。

### 后端负责（当前 main 已具备）

- `intent=save` 允许不完整但结构安全的 forms/meanings。
- `intent=complete` 执行步骤完整性，并保留 forms → meanings 完成顺序。
- validate/publish 对 canonical 聚合独立重跑完整校验。
- revision、稳定 ID、引用、下游影响和存储安全不放宽。

本切片无需数据库迁移、请求/响应字段变化或后端先行部署。

## 数据流

1. GET 返回 draft，`completed_steps=["basics"]`、`max_reachable_step="forms"`。
2. 请求 URL 为 meanings；`resolveV3StepAccess` 对 draft 返回 requested=effective=meanings、四步 reachable。
3. 页面渲染 meanings；零词性走既有空态，有词性则可编辑。
4. 普通导航只切 local active step，forms/meanings state 保留，不发请求。
5. 用户保存 meanings，发送 `intent="save"`；后端返回新 canonical revision，但 completed/max 不伪造。
6. 用户进入 preview 并点“检查发布条件”；后端返回完整 issues，发布继续不可用。

## 代码影响范围

### 预计修改

- `apps/admin/src/features/dictionary/word-creation-v3/stepAccess.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/stepAccess.test.ts`
- `apps/admin/src/pages/WordWizardV3.test.tsx`
- `apps/admin/src/features/dictionary/word-creation-v3/V3WordCreationWizard.test.tsx`（只补共同解析链回归时）

### 预计不改

- `WordCreationLayout.tsx`：main 已具备正确完成态和 reachableSteps 接口。
- `V3MeaningsAndExamplesStep.tsx`：已有零词性空态。
- `@tsz/types` / `@tsz/api-client`：wire 不变。
- `tsz-rust` 业务代码/数据库：行为已满足。

可选的 Rust/TypeScript 注释更新仅用于澄清 `completed_steps` / `max_reachable_step` 语义，不应与功能完成绑定；若修改 OpenAPI 描述，必须由后端生成后再同步前端。

## 兼容与发布顺序

该切片是前端兼容放宽：当前后端 main 已支持 `intent=save`，因此可以独立发布前端。

1. 先跑现有后端聚焦回归，确认测试环境版本确实包含 save/complete 分层。
2. 发布前端改动。
3. 真实浏览器用隔离测试草稿验证直接 URL、保存和发布守门。

如果目标环境后端版本早于当前 main、实际仍在 `intent=save` 返回 409，则停止前端部署，先纠正环境版本；不要在前端吞掉 409。

## 风险与回滚

| 风险                            | 处置                                                     |
| ------------------------------- | -------------------------------------------------------- |
| 提前进入 preview 被误认为可发布 | 发布按钮仍依赖服务端 validate/impact；矩阵覆盖不完整草稿 |
| 越步出现假完成                  | 通用布局已只认 `completed_steps`；保留回归               |
| published/archived 被意外放开   | draft 分支必须位于 readOnly 分支之后；专门测试           |
| 前端与旧环境后端行为不一致      | 部署前核对后端 commit/HTTP 聚焦用例，不做错误兼容吞咽    |
| 导航隐式保存或覆盖本地输入      | 断言纯导航请求为零、往返 state 保留                      |

回滚只需恢复 draft 的 max clamp；无数据迁移。后端的宽松 save 可继续保留，不会因前端回滚产生脏数据。
