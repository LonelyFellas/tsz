# 英美方言偏好化改造（A1）：技术设计

> 配套需求文档：[`requirements.md`](./requirements.md)。本文只讲怎么落地，
> 产品口径一律以需求文档为准。
>
> **实施进度**：评估已于 2026-08-19 评审通过（三层模型 + 五条结论 + PR #134 作废）。
> **阶段 1（方言偏好内核与个人设置入口）已落地**，落地过程中对本文的三处修正
> 已就地改写并标注理由；阶段 2 起未动。
>
> **核对基线**
>
> | 对象       | 版本 / 时间                                                                 |
> | ---------- | --------------------------------------------------------------------------- |
> | 前端       | `tsz` `main` @ `b492dfe`（2026-08-19）                                      |
> | 后端       | `tsz-rust` `main` @ `cc43556`（只读核对源码与 `docs/openapi.json`，未改动） |
> | 本地数据库 | Docker `tsz-rust-db-1` / 库 `tsz_rust`（只读查询，未写入）                  |

## 方案概述

需求文档把「方言」拆成三层：**L1 词条事实**（`centre` / `center` 是同一个词的两种地区拼写）、
**L2 管理员偏好**、**L3 内容行文口径**。技术方案就沿着这三层走：

- **L1 一动不动**。`WordHeadwordsV2` 判别联合、词形槽位的 uk/us 变体、
  后端的 `entry_headword_keys` 双 scope 查重——全部保持现状。
- **L2 新增一个前端内核**。方言偏好放进 `@tsz/shared`，
  过渡期落在按管理员隔离的 `localStorage`，后端提供 profile 字段后切成服务端事实源。
- **L3 收敛为单份**。`EnglishTextV2` 前端**只写 `unified` 分支、读侧兼容 `distinguish`**；
  语法结构 UI 只维护一份。

**关键取舍：不改任何已有 wire 类型。** 收敛通过"写侧只产出 `unified`、读侧仍能解析 `distinguish`"实现，
而不是把 `DialectValueV2` 的 `distinguish` 分支从类型里删掉。理由：

1. `@tsz/types` 是后端 wire 的 1:1 镜像（CLAUDE.md 硬约定）。后端仍会返回 `distinguish`——
   存量数据、AI 内容补全任务（`content_completion` worker 对 `distinguish` 词条生成双份）
   都会产生它。类型里删掉这个分支等于让前端无法表达后端真实返回，
   这正是「前端不做命名/结构转换层」这条约定要避免的事。
2. 不改类型 ⇒ `openapi.snapshot.json` 与 `packages/api-client` 契约测试**零变更**，
   `pnpm --filter @tsz/api-client sync:openapi` 无 diff，整批改造对后端契约是纯前向兼容的。
3. 收敛是**行为**变更不是**契约**变更，回滚成本因此低得多（见「回滚」）。

### 被否决的两条路线

**路线 B「主词一律单侧化」**：第 1 步不再产出 `distinguish`，统一写 `unified`，
主词取管理员输入那一侧。

否决理由有两条，第二条是硬的：

- 丢掉 L1 事实。`centre` 与 `center` 会变成两条独立词条——后端查重键是
  `(language, kind, dialect_scope, normalized_headword)`，`unified` 词条在
  uk / us 两个 scope 里写的是**同一个** normalized headword，
  所以 `centre` 与 `center` 不再互相排斥，可以各自建一条。学员搜 `center` 找不到 `centre`。
  而且这个丢失**不可逆**：对侧拼写没存过就找不回来。
- **技术上做不到"按偏好写主词"**。后端 `create` 会校验
  `compatible_headwords(detected, matched_dialect, submitted)`——
  提交的主词**源侧**必须与检测的源侧归一化后相等。
  管理员偏好英式却输入了 `center`，前端想改写成 `unified { common: "centre" }` 会直接
  `DetectionMismatch`。要真做，必须先用 `centre` 重新调一次检测，
  等于替管理员改写输入（需求明令禁止静默替换），还多一次请求。

**路线 C「偏好即主词 + 二次归一检测」**：输入 `center`、偏好英式时，
显式提示"将以 `centre` 建档"，确认后用 `centre` 重新检测再建草稿。
比 B 诚实，但同样丢 L1，且给每次创建加了一次确认 + 一次请求。同样否决。

## 现行方言模型完整梳理

### 类型层（`packages/types/src/admin-word-v2.ts`）

| 位置    | 类型                                  | 现状                                                                             | 本轮处置                         |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| L28     | `WordHeadwordsV2`                     | `{ mode:"unified", common }` \| `{ mode:"distinguish", uk, us, source_dialect }` | **不动**                         |
| L37     | `TextVariantV2<T>`                    | `{ id, value, origin }`                                                          | 不动                             |
| L44     | `DialectVariantSlotV2<T>`             | `{ state:"missing" }` \| `{ state:"ready", variant }`                            | 不动（读侧仍需）                 |
| L47/L56 | `DialectValueV2<T>` / `EnglishTextV2` | 判别联合，`distinguish` 时含 `source_dialect` + uk/us 两槽                       | **不动类型，前端只写 `unified`** |
| L65     | `WordFormVariantV2`                   | `{ id, dialect, spelling, origin, pronunciations }`                              | 不动                             |
| L93     | `WordPosFormsV2`                      | 含 `dialect_rules.{spelling_mode, phonetic_mode}`                                | 不动                             |
| L108    | `GrammarVariantV2`                    | `{ id, dialect, content }`                                                       | 不动                             |
| L114    | `GrammarStructureV2`                  | `{ id, variants: GrammarVariantV2[] }`                                           | 不动（数组长度由 wire 规则定）   |
| L473    | `DialectVariantSuggestionItemV2`      | `field_kind: "form" \| "definition" \| "example"`                                | **不动**（前端只再构造 `form`）  |

`Dialect = "uk" | "us" | "common"` 定义在 `packages/types/src/admin-word.ts:5`，
被 `surface-match.ts`、`AdminWordListItem.dialects` 等复用，同样不动。

### 组件层（`apps/admin/src/features/dictionary`）

18 个非测试文件命中 `dialect`，密度分布：

| 文件                                              | 行数 | `dialect` 命中 | 方言在这里做什么                                                          |
| ------------------------------------------------- | ---- | -------------- | ------------------------------------------------------------------------- |
| `mock/adminWordsMock.ts`                          | 4360 | 123            | mock 数据源：检测响应、草稿、方言建议、发布投影                           |
| `word-creation/MeaningsAndExamplesStep.tsx`       | 2738 | 116            | **第 3 步内容方言选择器 + 自动补全 + 双栏渲染**                           |
| `word-creation/FormsAndPronunciationStep.tsx`     | 2657 | 111            | 第 2 步 BrE/AmE 词形矩阵、方言建议按钮                                    |
| `word-creation/word-creation.css`                 | 2023 | 38             | `.dialect-panel` / `.dialect-grid` / `.word-form-matrix-dialect-*` 等样式 |
| `word-creation/model.ts`                          | 748  | 74             | 主词派生、`createEnglishText`、`grammarDialects`、第 3 步方言批处理四件套 |
| `word-creation/readiness.ts`                      | 513  | 6              | 完成情况的「方言识别」行、按 `dialect_rules` 判词形完成                   |
| `mock/fixtures.ts`                                | 537  | 42             | mock 种子词条（含 `distinguish` 样例）                                    |
| `word-creation/meaningsAndExamples/validation.ts` | 396  | 14             | 英文文本双槽校验、语法结构方言形状校验                                    |
| `word-creation/PronunciationPreview.tsx`          | 362  | 11             | **按 dialect 选 TTS 发音人 locale**（`uk→en-GB`、`us→en-US`）             |
| `word-creation/formsValidation.ts`                | 215  | 17             | 词形槽位方言行齐全性、提示文案                                            |
| `word-creation/CreateEntryStep.tsx`               | 968  | 16             | **第 1 步「区分英美词形」开关 + 双主词输入**                              |
| `word-creation/PreviewAndPublishStep.tsx`         | 878  | 7              | 第 4 步只读预览按方言分行                                                 |
| `word-creation/WordCreationLayout.tsx`            | 264  | 10             | 左栏词条摘要双拼写排序（手测 C5 的现场）                                  |
| `word-creation/WordCreationWizard.tsx`            | 591  | 3              | 检测快照 `matched_dialect` 文案、重复项方言标签                           |
| `SmartDictionary.tsx`                             | 850  | 5              | 列表「方言」列                                                            |
| `editorConstants.ts`                              | 95   | 5              | `DIALECT_LABEL` / `DIALECT_SHORT_LABEL` / `shownDialects`                 |
| `dataSource.ts`                                   | 230  | 4              | `suggestDialectVariants` 转发 + `dialectVariantSuggestions` 能力开关      |
| `word-creation/api.ts`                            | 165  | 4              | `useSuggestDialectVariants` mutation                                      |

另有 **20 个测试文件**命中方言相关断言。

### 请求层与契约层

- `packages/api-client/src/admin.ts:186-190` — `suggestDialectVariants`，唯一一处方言端点。
- `packages/api-client/src/admin.test.ts:195` — method/path/body 契约测试。
- `packages/api-client/src/endpoints.contract.test.ts` — 端点覆盖对账。
- `packages/api-client/src/http.ts:169-197,335-382` — surface-match 候选/来源的运行时 shape 守卫，
  其中 `dialect` 字段属 surface 查重，与本轮无关。
- `packages/api-client/src/openapi.snapshot.json` — 含 `/admin/lexicon/dialect-variant-suggestions` 路径。

### e2e

- `e2e/tests/support/mockAdminApi.ts` — `distinguish` fixture（`centre/center`，含双份语法结构
  `grammar-uk` / `grammar-us`）、检测响应 `matched_dialect`、方言建议路由（L1146）。
- `e2e/tests/admin-word-creation.spec.ts` — L23/24 断言「英式主词」「美式主词」输入框，
  L543 断言「英式词形拼写」，L391 断言候选文案含「美式」。
- `e2e/tests/support/mockApi.ts`（web 侧）**零命中**，无需改动。

### 学习端

`apps/web/src` 内 `dialect`、`headword` 命中数均为 **0**。本改造不外溢到学习端。

## 后端现状核对：哪些层耦合了 `headwords.mode`

这一节是整份设计的事实基础，**每条都在 `tsz-rust` 源码里直接核对过**，不是推断。
它决定了哪些收敛前端可以单方面做完、哪些必须等后端。

| 数据                                         | 与 `headwords.mode` 的耦合                                                                                                             | 依据                                                           | 前端能否单方收敛           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| 主词 `headwords`                             | 判别联合本身；DB 有 `headword_shape_check` 约束（`unified ⇒ source_dialect IS NULL`）                                                  | `lexicon.entries` 表约束                                       | —（不改）                  |
| 词形槽位变体（base + 派生）                  | **强耦合**。`validate_slot_variants` 要求变体方言集合与 POS `dialect_rules` **完全一致**；且 base 变体拼写必须逐方言等于主词对应侧     | `src/lexicon/validation/helpers.rs`、`validation/structure.rs` | **否**                     |
| POS `dialect_rules`                          | 被上一条倒逼：`distinguish` 词条的 base 只能配 `spelling_mode="distinguish"`，否则报 `base_spelling_mismatch`                          | 同上                                                           | **否**                     |
| 词形发音 `pronunciations`                    | 每个存在的变体都要求 `dict_phonetic` 与 `actual_pron` 非空（AND）                                                                      | `validation/helpers.rs`                                        | **否**                     |
| **语法结构 `grammar_structures[].variants`** | **强耦合**。`expected_dialects = unified ? [common] : [uk, us]`，变体集合必须精确相等，否则 `grammar_variants_invalid`                 | `src/lexicon/validation/meanings.rs:65,115-137`                | **否**（需镜像或后端放宽） |
| **英文释义 / 例句 `EnglishTextV2`**          | **无耦合**。`valid_english_text` 只按自身分支校验；持久化 `insert_english_text` 对 `Unified` 直接写 `dialect='common'` 一行，不看 mode | `validation/helpers.rs:156`、`repository/projections.rs:593`   | **是** ✅                  |
| 查重键 `entry_headword_keys`                 | `unified` 写 uk/us 两行同值；`distinguish` 写两行不同值                                                                                | `repository/projections.rs:40-90`；本地库实测 28 行            | —（不改）                  |
| 创建时主词校验                               | `compatible_headwords` 只比**源侧**归一化相等；因此"提交 unified、检测 distinguish"是被接受的（现有第 1 步的手动关闭开关就走这条路）   | `src/lexicon/service/helpers.rs:3-27`                          | —                          |
| AI 内容补全（`content_completion`）          | worker 对 `distinguish` 词条生成 uk/us 双份语法结构                                                                                    | `src/lexicon/content_completion/worker.rs:156-180`             | —（见风险）                |

**一句话结论**：第 3 步的**释义与例句**可以由前端单方面收敛到单份并立刻上线；
**语法结构**受后端校验硬约束，要么前端写"两条同值镜像"，要么等后端放宽；
**第 1、2 步**只能做呈现层收敛，wire 必须保持双份。

## 目标模型

### L2：方言偏好内核

放在 `packages/shared`（web/admin 共用的逻辑落点，符合复用优先级），
不放 `@tsz/types`——**它在过渡期不是 wire 数据**，`@tsz/types` 只镜像后端 wire。
后端落地 profile 字段后，再在 `@tsz/types` 增加对应 wire 类型，`@tsz/shared` 消费它。

```ts
// packages/shared/src/dialect-preference.ts（新增）
export type AdminDialectPreference = "uk" | "us";
export const DEFAULT_DIALECT_PREFERENCE: AdminDialectPreference = "uk";

export interface DialectPreferenceStore {
  read(adminProfileId: string): AdminDialectPreference;
  write(adminProfileId: string, value: AdminDialectPreference): void;
}
```

- 存储键：`tsz:admin:dialect-preference:v1:<encodeURIComponent(adminProfileId)>`，
  沿用 `apps/admin/src/features/dictionary/mock/storage.ts` 的
  「schema version + admin 命名空间」隔离模式（不复制代码，只取同形约定）。
- **没有 `clear`，登出不清理**。评估初稿照搬了 mock storage 的「登出清理」，
  落地时发现那是错的：mock 清理是为了防草稿串号，而偏好的键已按身份隔离，
  换账号本就读不到别人的值；清理只会让偏好每次登出丢失，与用户故事 1 矛盾。
- 读失败（存储不可用、值不在枚举内）→ 返回默认 `uk`，dev 下 warn，不抛。
- 写失败 → 抛给调用方，由 UI 提示；显示值因未更新而自动停在原值。
- admin 侧薄壳：`apps/admin/src/features/settings/useDialectPreference.ts`
  （**不叫 `dialectPreference.ts`**——它与同目录的 `DialectPreference.tsx`
  只差大小写，在 macOS / Windows 的大小写不敏感文件系统上会被解析成同一个模块，
  实测导致组件 import 到错误的文件），从 `useAuthStore(s => s.profile?.id)` 取身份。
  偏好要被创建向导四步、只读预览、语音发音人**跨屏读取**，因此做成
  `useSyncExternalStore` 驱动的共享状态而非各组件 `useState`，避免两处读到不同的值。
  逻辑在 `@tsz/shared`，壳里不散落判断——与鉴权内核同一套约定。

### L3：内容收敛规则

**写侧（唯一构造点）**：`model.ts` 的 `createEnglishText(headwords, text)`
去掉 `headwords` 入参，恒定返回 `{ mode: "unified", common: {...} }`。

**读侧（兼容）**：新增一个纯函数，把任意 `EnglishTextV2` 归约成"当前要显示/编辑的那一份"：

```ts
// 读兼容：unified 直接取 common；distinguish 取偏好侧，偏好侧 missing 则视为空
export function resolveEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference
):
  | { id: string; value: RichText; origin: TextVariantV2<RichText>["origin"] }
  | undefined;

// 收敛：把 distinguish 折成 unified，返回被丢弃的条数供确认框展示
export function collapseEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference
): { value: EnglishTextV2; discarded: number };
```

**明确不做**：偏好侧为空、对侧有内容时**不搬运**。搬运等于把美式文本冒充成英式的，
是静默的数据污染。需求「异常与边界」已定此口径。

> **【已作废 · 2026-08-20】** 后端提案 P1 已落地（tsz-rust #35），`distinguish` 词条现在
> 同时接受 `[common]` 与 `[uk, us]`。**下面整段镜像 shim 方案不再需要**：阶段 3 直接写单条
> `common` 即可，也不存在「阶段 6 删除 shim」这一步。保留原文以便追溯当时的权衡。
> 收敛时的节点 ID 要求见上文「后端答复」一节——**必须给 `common` 变体换新节点 ID**，
> 与下面第 2 条纪律「稳定复用已有节点 ID」恰好相反，照旧写会 422。

~~**语法结构**：UI 只维护一份 `RichText`；wire 形状仍由 `headwords.mode` 派生——
`unified` 写一条 `common`（现状即如此，12/14 存量词条都走这条），
`distinguish` 写 uk/us **两条同值镜像**。镜像是**过渡 shim**，
后端放宽校验后删掉（阶段 6）。shim 的三条纪律：~~

1. ~~只在 `headwords.mode === "distinguish"` 时产生，绝大多数词条不受影响；~~
2. ~~两条 variant 的 `id` 稳定复用已有节点 ID，不每次保存重新生成（否则节点漂移）；~~
3. ~~代码里写明 `// TODO(dialect-preference-migration 阶段 6)`，删除条件是后端 P1 落地。~~

## 逐文件改动影响清单

改动性质：**重写** = 结构性改动；**适配** = 局部调整；**删除** = 整段移除；**新增**。

### `packages/shared`

| 文件                             | 性质 | 内容                                                                                               | 风险                                      |
| -------------------------------- | ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `src/dialect-preference.ts`      | 新增 | 偏好内核：枚举、默认值、存储读写、命名空间与清理                                                   | 覆盖率门槛 **100%**，分支要写全（含降级） |
| `src/dialect-preference.test.ts` | 新增 | 单测                                                                                               | —                                         |
| `src/index.ts`                   | 适配 | 从主入口 `.` 导出（`package.json` 的 `exports` 现有 `.` 与 `./auth` 两个子路径，本轮不新增子路径） | 低                                        |

### `packages/types` / `packages/api-client`

| 文件                                   | 性质     | 内容                                                                   |
| -------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `types/src/admin-word-v2.ts`           | **不改** | 见「方案概述」                                                         |
| `api-client/src/admin.ts`              | **不改** | `suggestDialectVariants` 保留                                          |
| `api-client/src/openapi.snapshot.json` | **不改** | 本轮无 wire 变更                                                       |
| （阶段 7）`types` + `api-client`       | 新增     | 后端 P2 落地后：profile `preferences.dialect` wire 类型 + 写入端点封装 |

### `apps/admin` — 偏好与设置

| 文件                                            | 性质 | 内容                                                                                                                | 风险                                                     |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/features/settings/DialectPreference.tsx`   | 新增 | antd `Radio.Group` 两态选择 + 一句说明                                                                              | jsdom 需 matchMedia 垫片                                 |
| `src/features/settings/useDialectPreference.ts` | 新增 | 薄壳 hook，绑定当前 `profile.id`，`useSyncExternalStore` 共享快照                                                   | 文件名不能与组件只差大小写（见上）；会话失效时不写无主键 |
| `src/pages/ProfileSettings.tsx`                 | 新增 | 个人设置页外壳（`pages/**` 不纳入单测门槛，由 e2e/冒烟保底）                                                        | 低                                                       |
| `src/router.tsx`                                | 适配 | 加 `settings/profile` 路由（懒加载，落在 `ConsoleLayout` 门禁内）                                                   | 低                                                       |
| `src/features/auth/AdminHeader.tsx`             | 适配 | Popover 里加「个人设置」入口——**只在顶栏，不进侧栏**：侧栏可见性由后端下发的菜单权限 key 驱动，个人设置不该占权限位 | 该 Popover 有过收口历史，改动需重跑其单测                |

### `apps/admin` — 第 1 步

| 文件                                   | 性质     | 内容                                                                                     | 风险                                                                                                         |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `word-creation/CreateEntryStep.tsx`    | **重写** | 删 L526-620 的「区分英美词形」开关与双主词可写输入；改为只读事实说明卡片；主次按偏好排序 | 该段同时承载"创建草稿时提交哪个 headwords"，删开关后**必须**原样提交检测返回的 headwords，不能退化成 unified |
| `word-creation/WordCreationLayout.tsx` | 适配     | 左栏摘要按偏好排序、偏好侧加粗（顺带闭合手测 C5）                                        | 低                                                                                                           |
| `word-creation/WordCreationWizard.tsx` | 适配     | `matched_dialect` 文案改为事实陈述口径                                                   | 低                                                                                                           |

### `apps/admin` — 第 2 步

| 文件                                          | 性质 | 内容                                                                 | 风险                                                                                                           |
| --------------------------------------------- | ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `word-creation/FormsAndPronunciationStep.tsx` | 适配 | 词形矩阵默认只展开偏好侧、对侧折叠 + 已填/待填计数；保留方言建议按钮 | 2657 行大组件，折叠态与 `data-word-node-id` 定位、readiness 跳转联动，**易漏**：折叠时点"待完善项"要能自动展开 |
| `word-creation/formsValidation.ts`            | 适配 | 提示文案指明方言侧与字段（C4）                                       | 与第 1 批修 B2（"或"实为"且"）**同一函数**，两批必须串行，不可并行                                             |
| `word-creation/PronunciationPreview.tsx`      | 适配 | `dialect === "common"` 时按偏好取 locale                             | 无可用发音人时仍走既有禁用+说明，不静默降级                                                                    |
| `word-creation/word-creation.css`             | 适配 | 折叠态样式；删第 3 步方言栅格相关规则                                | 低                                                                                                             |

### `apps/admin` — 第 3 步（改动最重）

| 文件                                              | 性质     | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 风险                                                                                                   |
| ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `word-creation/MeaningsAndExamplesStep.tsx`       | **重写** | 删方言 toolbar（L2559-2608）、`fillMissingDialect`、`changeActiveDialect`、`activeDialect` 状态、双栏渲染；释义/例句/语法结构改单输入；加存量收敛说明条与保存确认框                                                                                                                                                                                                                                                                                                                          | 2738 行，方言状态渗透到渲染、保存、校验三条路径；确认框要与既有 `save(intent)` 的 dirty / 导航守卫协调 |
| `word-creation/model.ts`                          | **重写** | `createEnglishText` 恒 unified；新增 `resolveEnglishText` / `collapseEnglishText`；`toWireEnglishText` 加收敛；`createGrammar` / `grammarDialects` 改镜像；**删** `countIncompleteMeaningDialectSlots` / `collectMissingMeaningDialectItems` / `chunkMeaningDialectSuggestionRequest` / `applyMeaningDialectSuggestions` / `requestMeaningDialectSuggestionBatches` / `oppositeMeaningDialect` / `sourceForMissingMeaningDialect` / `meaningSuggestionKey` / `DIALECT_SUGGESTION_BATCH_SIZE` | 删除后要确认没有孤儿引用（只清自己制造的）                                                             |
| `word-creation/meaningsAndExamples/validation.ts` | 适配     | 英文文本只校验单份；语法结构校验按镜像规则                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 校验与后端 `expected_dialects` 必须同口径，否则前端放行、后端 422                                      |
| `word-creation/readiness.ts`                      | 适配     | 「方言识别」行的口径随第 1 步改（建议保留但改为"词条基本信息"类）；英文内容完成判定改单份                                                                                                                                                                                                                                                                                                                                                                                                    | 与第 2 批 readiness 收口（C2/C3）**同文件**，需串行                                                    |
| `word-creation/PreviewAndPublishStep.tsx`         | 适配     | 单份内容按一行渲染；存量双份在只读态仍显示两份并标注                                                                                                                                                                                                                                                                                                                                                                                                                                         | 只读态不做收敛（需求口径）                                                                             |
| `word-creation/api.ts`                            | 保留     | `useSuggestDialectVariants` 保留（第 2 步仍用）                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                      |

### `apps/admin` — mock 与列表

| 文件                     | 性质 | 内容                                                                                                 | 风险                                                |
| ------------------------ | ---- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `mock/adminWordsMock.ts` | 适配 | 保存 meanings 时接受单份英文内容；语法结构镜像规则与真实后端一致；`suggestDialectVariants` mock 保留 | mock 必须与真实后端**同形**，否则 mock 绿、真机 422 |
| `mock/fixtures.ts`       | 适配 | 保留一条 `distinguish` 双份内容的种子（用于验证读兼容与收敛确认）                                    | 不能全改成单份，否则存量路径失去测试载体            |
| `SmartDictionary.tsx`    | 不改 | 方言列是 L1 事实展示                                                                                 | —                                                   |
| `editorConstants.ts`     | 不改 | 标签常量继续复用                                                                                     | —                                                   |
| `dataSource.ts`          | 不改 | 能力开关保留，语义收窄（注释更新）                                                                   | —                                                   |

### e2e

| 文件                                    | 性质 | 内容                                                                                                      |
| --------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `e2e/tests/admin-word-creation.spec.ts` | 适配 | L23/24 改为断言只读事实说明；L543 改为断言偏好侧词形拼写；新增"第 3 步无方言选择器"与"存量收敛确认框"两条 |
| `e2e/tests/support/mockAdminApi.ts`     | 适配 | 保留 `distinguish` fixture；语法结构双份保留（正是存量场景）；方言建议路由保留                            |
| `e2e/tests/support/mockApi.ts`          | 不改 | web 侧零命中                                                                                              |

### 测试文件

20 个 admin 测试文件需同步。改动最重的三处：
`MeaningsAndExamplesStep.test.tsx`、`FormsAndPronunciationStep.test.tsx`、`model.test.ts`。
`CreateEntryStep.test.tsx` 需删掉"切换区分开关"相关用例。

## 类型契约变更方案

**本轮 `@tsz/types` 零变更、`openapi.snapshot.json` 零变更、契约测试零变更。**
收敛全部在前端行为层完成（读兼容 / 写收敛），因此：

- 不需要 `mode` 判别联合的任何修改；
- 不需要与 `tsz-rust` 的 OpenAPI 重新对齐；
- `pnpm --filter @tsz/api-client sync:openapi` 跑出来应当无 diff——这本身就是一条验收项。

需要后端配合的部分**全部是新增能力**，不破坏现有契约。以下三条提案请转达后端，
落点建议是 `tsz-rust/docs/frontend-integration.md`（**本 PR 不修改 tsz-rust 仓库任何内容**）。

> ## 后端答复（2026-08-20）：P1 / P2 / P3 均已实现
>
> 后端 `tsz-rust` PR **#35**「英美方言偏好化的后端改造（提案 P1 / P2 / P3）」已合入 main。
> 落点见 `tsz-rust/docs/frontend-integration.md` §10（P1）、§11（P2）、§12（P3）。
>
> ### 对本文的直接影响：**阶段 3 不必再写「两条同值镜像」shim**
>
> P1 已落地——`distinguish` 词条的语法结构变体集合现在**同时接受** `[common]` 与 `[uk, us]`；
> `unified` 维持只接受 `[common]`。缺一侧、多一侧、方言重复仍照旧报 `grammar_variants_invalid`。
>
> 因此下文 §「语法结构：镜像 shim」的三条纪律与「阶段 6 删除 shim」**双双失效**：
> 阶段 3 可以**直接写单条 `common`**，不需要先背 shim 再在阶段 6 拆掉。
> 分支上已写好的阶段 3 提交（`ab3e56f`）是按「后端未放宽」的旧假设实现的，**需要按新口径重写**。
>
> 前端校验口径同步放宽为：`unified ⇒ [common]`，`distinguish ⇒ [common]` 或 `[uk, us]`。
>
> ### 收敛时的节点 ID 陷阱（后端明确点名，务必遵守）
>
> 节点角色里编了方言（`meanings.content:en:<dialect>`），因此：
>
> - **收敛**（双条 → 单条 `common`）时必须给 `common` 变体**换新节点 ID**；
>   沿用旧 uk 变体的 ID 只改 `dialect` 会被判 `node_binding_changed`（422）。
> - **反向**（已收敛 → 改回 uk/us 双条）必须**沿用最初那两个变体的节点 ID**；
>   用新 UUID 会被判 `stable_node_id_changed`（422）。
>
> mock 必须与真实后端同口径，否则 mock 绿、真机 422。
>
> ### P1-b（AI 内容补全的收敛）· 后端有意押后
>
> `content_completion` 对 `distinguish` 词条**仍生成 uk / us 两份同值镜像**，暂未跟着收敛。
>
> **押后理由**：现网前端对 `distinguish` 硬性要求 `[uk, us]`，后端若抢先产单份，
> AI 补全的结果会在第 3 步被判为「未填写」。
>
> **交接动作**：**阶段 3 发布后须主动告知后端**，后端随即把补全改成单份 `common`（另开小 PR）。
> 这一步不能忘——否则收敛完成后，AI 补全仍会持续产出冗余的双条镜像数据。
>
> ### P2 / P3 已落地，契约有变
>
> 与本文「不需要与 tsz-rust 的 OpenAPI 重新对齐」「`sync:openapi` 跑出来应当无 diff」的
> 原始判断**不同**——那是基于「后端不动」的前提，P2/P3 落地后前提已不成立：
>
> - **P2**：新增 `PATCH /admin/profile/preferences`（端点路径与存储选型与提案略有出入，见 §11.2）；
> - **P3**：列表行新增 `headword_variants`（每侧拼写，与 `dialects` 同序，`headword` 即其按序拼接）。
>
> `sync:openapi` 已重跑并纳入本次改动（45 → 46 条路径），api-client 契约测试 268 项通过。

### 提案 P1（阻塞阶段 6）· 放宽语法结构的方言形状校验

**现状**：`src/lexicon/validation/meanings.rs` 里
`expected_dialects = matches!(headwords, Unified) ? [common] : [uk, us]`，
语法结构的 variants 集合必须与之精确相等。

**问题**：A1 之后语法结构只维护一份，但 `distinguish` 词条被强制要求存两条。
前端只能写"两条同值镜像"，wire 里出现冗余数据，且学习端将来读到会显示成
"英式：a centre / 美式：a centre"这种没有信息量的两行。

**提案**：对 `distinguish` 词条同时接受 `[common]` 与 `[uk, us]` 两种形状
（`unified` 词条维持只接受 `[common]`）。即把精确相等放宽为"是允许集合之一"。

**兼容性**：纯放宽，存量数据与旧前端一律不受影响。

**可选后续**：提供一次性收敛命令，把已存在的同值镜像双条合并为单条 `common`；
不合并也不影响正确性。

### 提案 P2（阻塞阶段 7）· 管理员个人偏好持久化

**现状**：`AdminProfileResponse` 只有 `id / phone / display_name / role / permissions`；
`admins` 表没有偏好列。偏好只能存在浏览器里。

**提案**：

```jsonc
// GET /api/v1/admin/profile 响应新增（字段恒在，缺省即默认值）
{
  "id": "...",
  "display_name": "...",
  "phone": "...",
  "role": "admin",
  "permissions": ["..."],
  "preferences": { "dialect": "uk" } // 新增；枚举 "uk" | "us"，默认 "uk"
}
```

```jsonc
// 新增 PATCH /api/v1/admin/settings/preferences
// 请求
{ "dialect": "us" }
// 200 响应
{ "preferences": { "dialect": "us" } }
// 422：dialect 不在枚举内（application/problem+json，沿用 RFC 9457 既有约定）
```

- 存储建议：`admins.preferences jsonb NOT NULL DEFAULT '{}'`，读时缺省填 `uk`，
  避免为一个两态开关新建一张表。
- 权限：任何已登录管理员都能读写**自己的**；不提供改他人偏好的能力。
- 默认值以**后端为准**，前端不再持有第二处默认——这是提案的重点，
  否则两边默认漂移会产生"我明明没改过它怎么变了"的困惑。

### 提案 P3（可选，取决于需求开放问题 5）· 列表 headword 结构化

**现状**：`GET /admin/lexicon/entries` 的行 `headword` 由后端
`string_agg(headword, ' / ' ORDER BY dialect)` 拼成 `"colour / color"`
（`src/lexicon/repository/query.rs:141`），前端拿不到两侧的结构，
因此**无法按管理员偏好决定哪一侧在前**（PR #135 已记录同一限制）。

**提案**：额外返回结构化字段（保留 `headword` 不动以免破坏现有前端）：

```jsonc
{
  "headword": "colour / color", // 保留
  "headwords": {
    "mode": "distinguish",
    "uk": "colour",
    "us": "color",
    "source_dialect": "us"
  }
}
```

优先级低：不做只是列表里的排序不跟随偏好，不影响录入。

### 不提案的事

- **不**提议下线 `POST /admin/lexicon/dialect-variant-suggestions`（需求 Q5）。
- **不**提议改 `entry_headword_keys` 的双 scope 查重（需求 Q2 结论 6 依赖它）。
- **不**提议改 `WordHeadwordsV2` 或 DB 的 `headword_shape_check`。

## 存量数据迁移方案与回滚

### 迁移方式：懒收敛，不写脚本

规模已实测：全平台（= 本地开发库）14 条词条，`distinguish` 仅 **2** 条，
`text_variants` 里 uk/us 合计 21 行 vs `common` 104 行。
测试服前端栈已拆除、无生产环境。**为个位数数据写迁移脚本、承担脚本本身的风险，不划算。**

收敛在"管理员下次编辑该词条的第 3 步并保存"时发生：

1. 加载时 `resolveEnglishText(value, preference)` 取偏好侧那一份进编辑器；
2. 检测到该词条存在 `mode === "distinguish"` 的英文内容 → 顶部渲染一次性说明条；
3. 保存（`save("save")` 与 `save("complete")` 都算）前，用 `collapseEnglishText` 统计
   将被丢弃的条数，**弹确认框**列明数量与方言侧；取消则整个保存中止；
4. 确认后 `toMeaningsWireContent` 输出全 `unified`，后端把对侧 `text_variants` 行随节点删除。

**语法结构不参与丢弃**：它在收敛后仍写两条同值镜像（阶段 6 前），内容不丢。
确认框文案要说清"语法结构不受影响"，避免管理员以为语法也会被删。

### 回滚

| 阶段                   | 回滚方式                                                                                                            | 数据影响                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 阶段 1（偏好）         | revert 该 PR                                                                                                        | 无。偏好只在 localStorage，不写业务数据                                                                         |
| 阶段 2-5（UI 收敛）    | revert 对应 PR，代码回到双栏                                                                                        | **已经被确认收敛过的词条不会自动变回双份**——被丢弃的对侧内容确实删了                                            |
| ~~阶段 6（语法单份）~~ | **已并入阶段 3**（P1 已落地，不再有独立的「删 shim」阶段）。阶段 3 的回滚代价见上一行：已收敛的词条不会自动变回双份 | 回滚阶段 3 时注意节点 ID：改回 uk/us 双条必须沿用最初那两个变体的 ID，用新 UUID 会被判 `stable_node_id_changed` |
| 阶段 7（后端偏好）     | 前端回落 localStorage 分支                                                                                          | 无                                                                                                              |

**不可逆点只有一个**：存量词条被确认收敛后，对侧英文内容不可恢复。
这正是需求把它设计成"显式确认 + 说明条数"的原因。
真要保底，可在收敛确认前让管理员先手动复制——不做自动备份，避免引入一套影子存储。

## 分阶段实施计划

每个阶段一个 PR，都能独立合入且合入后 `main` 保持绿（typecheck / lint / test:cov / e2e 全过）。
顺序有依赖：阶段 1 是所有 UI 阶段的前置；阶段 2、3 改同一批文件，必须串行。

| 阶段  | PR 主题                             | 内容                                                                                                                                                                | 依赖                            | main 绿的保证                                                            |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| **1** | 方言偏好内核 + 设置入口             | `@tsz/shared` 偏好内核（100% 覆盖）、admin 薄壳、顶栏「个人设置」                                                                                                   | —                               | 纯新增，现有行为零变化                                                   |
| **2** | 第 3 步释义/例句收敛                | 删方言 toolbar / 自动补全 / 批处理；`EnglishTextV2` 写侧恒 unified、读侧兼容；存量说明条 + 收敛确认框                                                               | 阶段 1                          | 后端已验证接受 unified 英文内容，**无需等后端**                          |
| **3** | 第 3 步语法结构收敛（**直接单份**） | 语法结构 UI 单份；`distinguish` 词条**直接写单条 `common`**（P1 已落地，无需镜像 shim）；校验放宽为 `[common]` 或 `[uk, us]`；收敛时给 `common` 变体**换新节点 ID** | 阶段 2（同文件）                | 后端 P1 已放宽（tsz-rust #35）；**发布后须告知后端收敛 P1-b 的 AI 补全** |
| **4** | 第 1 步去决策                       | 删「区分英美词形」开关与双主词输入；只读事实说明；摘要按偏好排序（闭合 C5）                                                                                         | 阶段 1                          | 提交的 headwords 仍为检测原值，后端行为不变                              |
| **5** | 第 2 步偏好侧主导                   | 词形矩阵折叠对侧；校验提示指明方言侧（闭合 C4）；TTS locale 按偏好                                                                                                  | 阶段 1；**第 1 批 B2 修完之后** | wire 不变                                                                |
| **6** | 语法结构单份 wire（可选）           | 后端 P1 落地后：删镜像 shim，`distinguish` 词条写单条 `common`                                                                                                      | 后端 P1                         | 先后端放宽（纯兼容）再前端切换                                           |
| **7** | 偏好后端持久化（可选）              | 后端 P2 落地后：`@tsz/types` 加 wire、api-client 封装、事实源切服务端，localStorage 降为缓存                                                                        | 后端 P2                         | 契约测试与 snapshot 同步更新                                             |

**与其他批次的排期冲突（必须协调，否则撞车）**：

- 第 1 批修 **B2**（`formsValidation.ts` 提示文案与 AND 判定不符）与本批阶段 5 同函数；
- 第 2 批 readiness 收口（**C2/C3**）与本批阶段 2/3 同文件 `readiness.ts`；
- 手测 **C5**（左栏排序）：第 1 批若尚未做，可由本批阶段 4 顺带闭合（排序规则从"源方言优先"改成"偏好侧优先"，是同一处代码的最终形态）；第 1 批若已做，本批阶段 4 只需保证不回归。两批都做等于改两次同一行，**要在排期时确认归属**。

建议顺序：第 1 批 → 第 2 批 → 本批阶段 1-5 → 第 4/5 批。

## 测试策略

按 `test` skill 的分层落地，这里只定策略边界。

### 单元测试（vitest）

| 对象                                | 覆盖点                                                                                                                                                                                                                    | 门槛                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@tsz/shared` 偏好内核              | 默认值、读写往返、非法值降级、存储读写抛错降级、admin 命名空间隔离与键转义                                                                                                                                                | **100%**（packages） |
| `model.ts`                          | `createEnglishText` 恒 unified；`resolveEnglishText` 三态（unified / distinguish 偏好侧 ready / 偏好侧 missing）；`collapseEnglishText` 的丢弃计数；`createGrammar` 在 unified/distinguish 下的 variants 形状与 ID 稳定性 | 90%（apps）          |
| `meaningsAndExamples/validation.ts` | 单份英文内容的空/非空判定；语法结构镜像形状与后端 `expected_dialects` 同口径                                                                                                                                              | 90%                  |
| `formsValidation.ts`                | 提示文案含方言侧 + 字段名；AND 判定（与第 1 批 B2 修复对齐）                                                                                                                                                              | 90%                  |
| `readiness.ts`                      | 英文内容完成判定改单份后的计数                                                                                                                                                                                            | 90%                  |

### 组件 / 集成测试（jsdom + antd v6）

- `CreateEntryStep`：**不存在**「区分英美词形」开关；检测 `distinguish` 后主词两侧只读；
  创建请求体的 `headwords` 与检测响应逐字段相等（防止退化成 unified）。
- `MeaningsAndExamplesStep`：无方言选择器 / 无自动补全按钮；存量 `distinguish` 词条打开取偏好侧；
  首次保存弹确认框且取消时 `saveMeanings` **未被调用**；确认后请求体英文内容为 `unified`。
- `FormsAndPronunciationStep`：默认只展开偏好侧；点"待完善项"能自动展开折叠的对侧并聚焦；
  方言建议按钮仍在且行为不变。
- `PronunciationPreview`：`common` 内容按偏好取 `en-GB` / `en-US`；无发音人时禁用并说明。
- `DialectPreference`：切换后写入、写入失败回退。

antd v6 既有坑照旧：`matchMedia` / `ResizeObserver` 垫片；
`Select` 根节点是 `.ant-select`（无 `.ant-select-selector`）、选项用 `.ant-select-item-option`；
Button loading 退场动画在 jsdom 不结束，测提交后禁用态用 `container.querySelector("button.ant-btn-primary")`；
大表格避免 `getByRole`。

### 契约测试

本轮**无新增/变更端点**，因此契约测试的验收点是"**不需要改也能过**"：

- `packages/api-client/src/endpoints.contract.test.ts` 与 `admin.test.ts` 保持不变通过；
- `pnpm --filter @tsz/api-client sync:openapi` 后 `openapi.snapshot.json` 无 diff。

阶段 7 才新增 profile preferences 的 method/path/body 契约测试。

### E2E（Playwright）

- 改写：`admin-word-creation.spec.ts` 中断言「英式主词 / 美式主词」输入框、「英式词形拼写」的用例。
- 新增：
  1. 偏好为英式时走完四步，第 3 步全程无方言选择器，发布成功；
  2. 切换偏好为美式后重进同一词条，摘要主次互换、内容不变；
  3. 存量 `distinguish` 双份内容词条 → 说明条 → 保存确认框 → 取消不落库 → 确认后落单份。
- mock 侧保留 `distinguish` fixture 作为存量场景载体。

### 手测（真实 `tsz-rust` + 本地库）

本地库现成有 `centre / center`（已发布 + 有未发布修改）与 `colour / color`（草稿）
两条 `distinguish` 词条，正好覆盖存量的两种状态：

1. 偏好切换后打开同一词条，确认展示口径变化、数据不变；
2. `colour / color` 走完收敛确认，用只读查询核对 `text_variants` 的 uk/us 行确实被删、`common` 行写入；
3. `centre / center`（已发布）继续编辑 → 收敛 → 再次发布，确认发布态与统计口径不受影响；
4. 新建一条无地区差异的词（如 `banana`）确认全程零方言字样；
5. 第 2 步方言建议按钮对真实后端仍返回 200 并写入建议。

**手测纪律**：只读查询数据库，不写入；不碰测试服与生产。

## 风险与缓解

| 风险                                                                                        | 影响                               | 缓解                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 第 1 步删开关时误把提交的 `headwords` 退化成 `unified`                                      | **不可逆丢 L1 事实**，查重退化     | 集成测试断言创建请求体与检测响应逐字段相等；code review 重点项                                                               |
| 前端校验与后端 `expected_dialects` 口径不一致                                               | 前端放行、后端 422，管理员卡在保存 | 校验规则与后端同一张表（本文「后端现状核对」）；mock 必须与真实后端同形                                                      |
| 语法结构镜像 shim 长期滞留                                                                  | wire 冗余；学习端将来显示两行同值  | 代码里 `TODO(阶段 6)` + 删除条件写死为"后端 P1 落地"；本文档「分阶段」里留位                                                 |
| AI 内容补全（`content_completion` worker）对 `distinguish` 词条仍生成双份语法结构与英文内容 | 补全结果与收敛后的编辑器口径不一致 | 该能力当前由 `VITE_WORD_CONTENT_COMPLETION` 默认关闭；合并补全结果时统一过一遍 `resolveEnglishText`；纳入阶段 2 的读兼容测试 |
| 大组件（2700 行 × 2）重写引入回归                                                           | 第 2、3 步不可用                   | 阶段拆分 + 每阶段独立 PR；先补齐现有行为的测试再改（test skill 承接）                                                        |
| 与第 1、2 批改同文件撞车                                                                    | 冲突、互相覆盖修复                 | 排期串行，见「分阶段实施计划」末尾                                                                                           |
| 偏好只在本地，多设备不一致                                                                  | 管理员困惑                         | 过渡期不做任何依赖跨设备一致的能力；提案 P2 尽早排期                                                                         |
| 存量收敛的确认框被管理员习惯性点掉                                                          | 内容丢失                           | 文案写明具体条数与方言侧，不用"确定/取消"这种无信息按钮；只在真正保存时出现一次                                              |

## PR #134 的处置结论

[PR #134](https://github.com/LonelyFellas/tsz/pull/134) —— `feat(web): 词表详情页词条多维展示`，
分支 `backup/web-wordlist-detail-multidim`，8 文件 / +1652 −8，草稿状态，CI 恒红。

**结论：整体作废——关闭 PR、删除分支，不做迁移、不纳入本批。**

四条理由：

1. **它实现的正是 A1 要拿掉的东西**。它在学习端做了一套「显示密度 × 英美切换」。
   A1 之后内容只有一份，学员端没有可切换的两份英文内容，
   这个控件在新模型下无对象可切。留着并迁移，等于把刚废弃的产品模型带进 C 端。
2. **类型基础已被删除，迁移是重做不是重命名**。它依赖的 `AdminWord` / `GrammarStructure` /
   `WordForm` 在 #102（remove-legacy-v1-api）已从 `@tsz/types` 移除；
   V1→V2 的词形、语法结构、释义数据形状本身变了。
   `wordDisplay.ts`(256 行) 与 `mockDictWords.ts`(464 行 fixture) 都要按 V2 重写，
   PR 自己的描述也是这么判断的（本地合入 main 后 22 个 typecheck 错）。
3. **它 100% 基于 mock 假数据，而学习端至今没有消费词条的真实链路**
   （`apps/web/src` 内 `dialect`、`headword` 命中均为 0）。
   真要做词表详情页多维展示，正确起点是 V2 wire + 真实接口 + A1 之后的方言模型，
   而不是在一份落后 190 个提交的实现上打补丁。
4. **保留有成本**：CI 恒红占位，且一个长期红的 open PR 会稀释"CI 全绿才部署"这条纪律。
   commit `8e415dc` 在 PR 历史里永久可查，作为交互构思的参照足够。

**关闭时请一并记录这条**：PR #134 里与方言无关、仍有价值的构思是
**显示密度（简洁 / 标准 / 详细）分级**。它是纯展示层的信息密度控制，与 A1 不冲突，
建议写进将来「词表详情页」需求文档的参考项，不要随分支一起消失。

**本阶段不动它的代码，也不由本 PR 关闭它**——关闭动作由用户在评审拍板后执行。

## 复用与项目约定

- 逻辑 → `@tsz/shared`（偏好内核）；类型 → `@tsz/types`（本轮零变更）；
  请求 → `@tsz/api-client`（本轮零变更）；UI → admin 用 antd v6 自带组件。
- admin **禁止**引入 tailwind / `@tsz/ui`。
- 偏好薄壳只做绑定，判断逻辑一律在 `@tsz/shared`，与鉴权内核同一套约定。
- 覆盖率：`packages/**` 100%、`apps/admin/src` 90%；纯装配/静态展示文件按既有约定
  加 coverage exclude 并附 TODO 说明补测条件，有逻辑分支的必须补测。
- 分支走 PR 合 `main`，绝不直接推 `main`，绝不绕过 lefthook。

## 仍需拍板的开放问题（与需求文档同步）

| #   | 问题                                 | 落点                              |
| --- | ------------------------------------ | --------------------------------- |
| 1   | 偏好持久化提案 P2 是否接受、何时排期 | 后端；决定阶段 7                  |
| 2   | 语法结构校验放宽提案 P1 是否接受     | 后端；决定阶段 6 与镜像 shim 存续 |
| 3   | 非偏好侧音标是否放宽为选填           | 产品 + 后端；本轮不做             |
| 4   | 第 1 步是否开放"修正对侧拼写"        | 产品；本轮不做                    |
| 5   | 列表 headword 结构化提案 P3 是否需要 | 后端；优先级低                    |
| 6   | 偏好是否跨标签页同步                 | 产品；本轮不做                    |
