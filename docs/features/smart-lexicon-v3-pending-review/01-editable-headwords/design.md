# Smart Lexicon V3 Step 1 英美主词可编辑：技术设计

## 现状与复用判定

| 位置                               | 最新 main                                                                | 原始混合 worktree                                                                                | 判定                                             |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `headwordValidation.ts`            | 已有英文字符集、空值和分侧预检及测试                                     | 直接复用                                                                                         | 已合入，无需重写                                 |
| `UnifiedCreateEntryStep.tsx`       | V3 create 不发送最终 `headwords`；同时已包含多维例句 pending target 导航 | 有偏好锁定、模式切换和最终载荷，但旧 hunk 删除了 `initialPendingTarget` 并混入建议词性等无关改动 | 只提取交互和 payload 逻辑，基于 main 手工重落    |
| `CreateAdminWordV3Input` / OpenAPI | `headwords` 不存在                                                       | 直接改成必填                                                                                     | 方向可复用，发布形态需改成兼容阶段后再收紧       |
| V3 create service                  | 从 detection 物化 forms，重复查询仍绑定检测 surface                      | 已能按最终值重建 forms/presentation、锁 surface、绑定 token                                      | 核心算法可复用，需基于最新 main 重放并补兼容分支 |
| `initial_headwords` migrations     | 不存在                                                                   | 两个未跟踪迁移允许成对为空，无历史回填；版本号早于 main 已有 `2026083001...0700`                 | 文件名和迁移内容都需重做                         |
| 后端测试                           | main 无 V3 最终主词合同                                                  | 旧 HTTP/DB/并发用例较完整                                                                        | 用例意图可复用，fixture 必须按最新 main 重建     |

旧 worktree 的全量测试结果只证明旧现场曾自洽，不代表它能直接应用到当前 main。

## 方案概述

采用 expand → backfill → frontend switch → harden 的兼容迁移：

1. 数据库先增加 nullable 的 `initial_headwords` / `initial_headword_keys` 和成对形状约束。
2. 后端兼容旧请求：`headwords` 暂时可选。缺省时严格复用上线前检测物化规则得到最终值；显式提交时使用管理员确认值。无论哪条路径，新 native V3 都写两列。
3. 对既有 native V3 按历史不可编辑规则回填，dry-run 必须给出总数、可回填数、歧义数和 digest；歧义为零才进入 harden。
4. 部署新前端，开始显式发送最终 `headwords`。
5. 观察旧客户端流量归零后，后端/OpenAPI 将 `headwords` 收紧为必填，数据库约束 native V3 两列非空；migrated V2 按规则保持为空。

这样旧前端可以调用新后端，新前端不会调用拒绝未知字段的旧后端，回滚也有明确顺序。

## 数据合同

### 兼容阶段请求

```ts
interface CreateAdminWordV3Input {
  schema_version: 3;
  detection_id: string;
  kind: WordEntryKindV3;
  headwords?: WordHeadwordsV2;
  confirmed_surface_match_token?: string;
}
```

- 缺少 `headwords`：只服务旧前端；后端从 detection 使用旧创建规则推导并记录兼容指标。
- 带 `headwords`：新前端路径；规范化后的最终值进入完整请求摘要和事务。
- harden 阶段：删除兼容缺省分支，OpenAPI 和 TypeScript 改为必填。

响应形状不新增 `headwords`。Admin 当前展示继续来自 V3 forms/presentation；原始确认值是后端审计和重复保护事实。

### 数据库

`lexicon.v3_entry_state` 增加：

- `initial_headwords JSONB NULL`
- `initial_headword_keys TEXT[] NULL`

约束分两阶段：

- expand：两列必须同时为 NULL 或同时非 NULL；非 NULL 时 JSON 严格匹配 unified/distinguish 形状，keys 为规范化的 `uk:` / `us:` 两项。
- JSON discriminator、主词和 `source_dialect` 分支必须显式 `IS TRUE`，避免 PostgreSQL `CHECK` 对 JSON `null` 结果 fail-open。
- harden：`origin='native'` 必须两列非 NULL；`origin='migrated_v2'` 允许两列同时 NULL。

迁移编号必须排在最新 main 的 `20260830070000` 之后，不能使用原始 worktree 的 `20260829120000` / `20260829130000`。

## 创建数据流

1. Admin 检测并保留 `DetectLexiconSurfaceResponseV3` 作为建议证据。
2. Admin 根据个人方言偏好初始化确认表单；管理员编辑后提交。
3. 后端先规范化显式值；兼容请求则按旧规则从 detection 推导。
4. 规范化后的最终值进入 `request_hash`，因此同一幂等键更改最终值稳定冲突。
5. 在事务内生成 entry ID、从 detection 物化建议 forms，再用最终值重绑每个 POS 的 base form 和 dialect rules。
6. 由最终 forms + `initial_headword_keys` 生成 surface keys，按现有全局 writer barrier / key locks 加锁。
   兼容旧请求必须锁 detection surface 与派生 initial keys 的并集；forms→hidden 先进入 writer barrier 再读取持久化 keys。
7. 事务内重新查询 active V3 surfaces、legacy-only exact keys 和无 surface native 空壳；确认 token 的 digest 包含 detection ID、最终 headwords 和 canonical keys。
8. 重复策略通过后写 entry、V3 state、nodes、editor projection、presentation/surface 和 basics progress。
9. `entries.detection_snapshot` 保持原 detection；`v3_entry_state.initial_*` 保存最终确认值。

## 重复保护

- 所有重复判断基于规范化后的最终值，不使用检测时 surface 作为替代。
- 查询和锁范围包含 `kind`，避免 word/phrase 误互相阻断。
- 有 projection 的 V3 走既有 surface material；legacy-only 继续走现有 fallback。
- 没有任何 active surface 的 native V3 空壳使用 `initial_headword_keys` 防漏。
- 两个不同幂等键并发时必须先锁相同 canonical keys，再查询/写入，避免“同时查不到、同时插入”。
- restore 单条/批量与 create 使用同一 initial-key 锁；隐藏空壳恢复前同时检查 active incumbent 与批内重复。
- `intent=save` 把 forms 清为空投影时同样锁 initial keys，并排除自身后复查 hidden 冲突；create/clear 并发最多只能产生一个 active hidden owner。
- confirmation token 绑定最终值；管理员在确认页继续改值后必须重新取得确认，不能复用旧 token。
- 创建请求发出后若网络、5xx 或响应解析/契约校验导致结果未知，前端冻结完整 payload 与幂等键；即使 detection 本地过期也允许原样送达服务端回放。修改主词必须显式重新检测并开始新 attempt。

## 历史回填

建议增加可 dry-run 的后端回填函数/命令，并由迁移控制记录结果，而不是在 SQL 中复制复杂的 detection 物化算法：

1. 只扫描 `v3_entry_state.origin='native' AND initial_headwords IS NULL`。
2. 读取 `entries.detection_snapshot`，按功能上线前“不可编辑建议即最终值”的精确版本规则重建 unified/distinguish。
3. 使用与 create 相同的 `NormalizedHeadword` 生成 keys。
4. 不读取当前 editor forms 作为初始值，因为它可能已经被 Step 2 修改。
5. 对 snapshot 缺字段、多 base 候选无法唯一还原等情况输出阻断项；不静默选第一个。
6. 同 kind 的 active hidden 空壳若推导出重叠 keys，或既有非 NULL hidden 行之间已经重叠，所有冲突 owner 都列入阻断项，不把历史重复标成 ready。
7. dry-run 输出 manifest digest；apply 必须通过 `MIGRATION_MANIFEST_DIGEST` 回传该 digest。apply 在独占 surface writer barrier 后重新扫描并核对 manifest，防止旧二进制在两次命令之间写入新的 NULL 行。
8. apply 的加锁、扫描、逐候选单行更新断言和 native NULL 后置断言位于同一事务；delete 也加入 writer barrier。manifest 漂移、候选消失、歧义/重复阻断或仍有 NULL 均整体回滚。重复运行保持幂等。
9. 回填后再运行 SQL 计数/形状/重复检查，只有阻断数为零才执行 harden migration。

## 代码影响范围

### 前端 `tsz`

- `apps/admin/src/features/dictionary/word-creation/UnifiedCreateEntryStep.tsx`
- `apps/admin/src/features/dictionary/word-creation/UnifiedCreateEntryStep.test.tsx`
- `apps/admin/src/features/dictionary/word-creation/word-creation.css`
- `apps/admin/src/pages/WordCreate.tsx` / `WordCreate.test.tsx`（只在需要保持 pending target props 时调整）
- `apps/admin/src/features/dictionary/word-creation-v3/api.test.tsx`
- `apps/admin/src/features/dictionary/mock/adminWordsMock.ts` / `.test.ts`
- `packages/types/src/admin-word-v3.ts`
- `packages/api-client/src/admin.test.ts`
- `packages/api-client/src/endpoints.contract.test.ts`
- `packages/api-client/src/admin-word-v3.runtime-schema.json`
- `packages/api-client/src/openapi.snapshot.json`

`headwordValidation.ts`、`useDialectPreference` 和多维例句 pending target 导航优先复用，不做无关重构。

### 后端 `tsz-rust`

- `src/lexicon/dto/v3.rs`
- `src/lexicon/service/v3.rs`
- `src/lexicon/service/v3_surface.rs`
- `src/lexicon/service/helpers.rs`（仅复用/补齐统一规范化函数时）
- `src/lexicon/v3_migration.rs` 或现有迁移控制模块（dry-run/apply 回填）
- 新的 expand/harden `.up.sql` / `.down.sql`
- `src/openapi.rs`、生成的 `docs/openapi.json`
- `tests/lexicon_handler.rs`
- `tests/lexicon_v3_storage_schema.rs`
- 迁移/回填相关测试文件

## 兼容发布顺序

1. 后端 DB expand migration：只加 nullable 列和配对形状约束。
2. 后端兼容版本：接受缺省/显式 `headwords`，新建 native 行一律写 `initial_*`；记录缺省分支指标。
3. 既有 native 数据 dry-run → 评审结果 → apply → 校验；存在歧义则停止，不进入 harden。
4. 前端版本：显式发送最终 `headwords`，同步 runtime schema/OpenAPI snapshot。
5. 观察兼容缺省分支归零并完成真实创建验收。
6. 后端 harden：请求字段必填、native DB 行两列必填，重新生成 OpenAPI。
7. 前端再次同步最终必填合同；移除临时兼容测试。

回滚顺序相反：先回滚前端到不发送字段的版本，后端兼容分支继续承接；不要在回滚窗口内 drop 数据列。列删除是独立 contraction，不属于本切片首发。

## 风险

| 风险                                                    | 处置                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- |
| 新前端先于后端，旧后端因 `deny_unknown_fields` 返回 422 | 强制后端兼容版本先上线                                  |
| 新后端直接要求字段，旧前端返回 422                      | 首阶段字段可选，指标确认旧流量归零后再收紧              |
| 原始迁移版本落在已部署迁移之前                          | 重新编号到最新序列之后，不复用旧文件名                  |
| 历史 native 空壳没有 keys，重复保护有盲区               | 在线兼容 fallback + 回填 + 阻断清单 + harden            |
| dry-run 后旧二进制继续写入 NULL                         | apply 独占 writer barrier、重算 manifest 并做 NULL 断言 |
| 旧前端 hunk覆盖多维例句 props/导航                      | 以 main 为底逐行重落，并加 pending target 回归          |
| token 仍绑定检测值                                      | digest 显式包含最终 headwords 和 canonical keys         |
| 模式切换或刷新覆盖管理员编辑值                          | 本地状态独立于重新拉取的建议；只在主动重新检测时重置    |

## 回滚

- 前端可独立回滚，因为兼容后端仍接受缺省字段。
- 后端业务版本回滚前必须先回滚前端；数据库 expand 列保留，不执行 destructive down。
- 回填不回写 detection snapshot、forms 或 publication，只补审计/重复键；如需逻辑回滚，停用读取即可，数据列留待独立 contraction。
