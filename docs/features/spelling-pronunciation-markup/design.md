# 词形拼写与实际发音标注方案

状态：本地实现完成。需求见 [requirements.md](requirements.md)，实际验证与环境限制见 [verification.md](verification.md)。

## 基线与依赖

- 前端工作树 `/Users/darwish/.codex/worktrees/81a3/tsz`，基线 `origin/main` = `7b0f0e53009044e21eccb90851602cddfe3d7982`。
- 后端仓库 `/Users/darwish/Dev/tsz-core/tsz-rust`，评估基线为 fetch 后的 `origin/main` = `3ef1ea9ba6694139abfe40f375c88823444cb1ca`。本地 main 落后 44 个提交，源码和 OpenAPI 通过 `git show origin/main:<path>` 核对，不以旧 checkout 判断缺口。
- 两仓调查前工作区干净。前端复用任务分支 `codex/spelling-pronunciation-assessment`；后端在 `/Users/darwish/.codex/worktrees/spelling-pronunciation/tsz-rust` 的 `codex/spelling-pronunciation-markup` 分支实施，主 checkout 未改。
- 契约变化属于后端重档评估，双文档集中在前端，不重复生成后端 spec。

关键路径：后端可选字段与保存语义 → 生成契约和前端 wire 保留 → 拼写编辑器入口与工具 → 拆合、回显与真实保存验收。

| 部分                           | 分类       | 已有证据与剩余工作                                                     |
| ------------------------------ | ---------- | ---------------------------------------------------------------------- |
| 实际发音保存                   | 已在主线   | `actual_pron_rich`、草稿会话、连读、收起和发布回显已存在               |
| 选区、连读、斜体、清除、阅读器 | 可直接复用 | `@tsz/voice-editor` 与最新后端已支持相关注解；目前模式开关限制拼写能力 |
| 拼写入口及两种模式工具         | 小改动     | 开放现有入口；斜体仅拼写；清除开放至两类字段；调整模式提示与布局       |
| 拼写字段与保存保护             | 新工作     | 三类词形变体新增 `spelling_rich`，保存保留、校验、序列化与方言转换配套 |
| C 端                           | 本次范围外 | 词单独立投影只输出纯文本拼写，保持现状                                 |

仅估剩余实施关键路径：契约与保存语义约 0.5–1 个工作日，后台接入及方言转换约 0.5–1 个工作日，回归与隔离联调约 0.5 个工作日；总计约 1.5–2.5 个工作日，不包含 PR、CI 排队、合并或部署。此为评估估计，不是已执行工作。

## 最小方案与不采用的方案

新增可选 `spelling_rich`，复用现有 `RichTextV2V3` 数据结构和 V2 编辑输出。保留纯文本 `spelling`，两者在同一 forms 保存请求中提交。新字段没有 V1 历史兼容负担，schema 直接声明 V2，不声明为接受 V1/V2 后再拒绝 V1。
实际发音继续用 `actual_pron_rich`，不增加字段、不改变合成输入。

不将 `spelling` 改成对象：它直接被搜索、匹配、引用、合成和公共投影使用，改类型会扩大破坏性契约。
不只开放编辑器：当前调用的 `next.text`、`variantWire` 和方言映射都会丢掉新标注。
不新增富文本框架、通用工具配置系统或单独标注 API；已有编辑核心和 forms 保存机制足够。
不扩展停顿、音色、C 端展示，不调整现有 forms/surface 摘要或确认门禁。

## 交互及前端改动

`packages/voice-editor/src/editor/next/VoiceEditor.tsx`：

- 拼写开放正文、斜体、连读、清除；实际发音开放正文、连读、清除。
- 复用选区、`toggleItalic`、端点草稿、`commitLiaison`、erase 和历史栈。
- 未选区禁用斜体和连读；已选起点但未完成时禁止完成，不保存半条。
- 清除模式只点删连读；斜体仍由选区切换取消。全量清空沿用现有逻辑。

`MarkupPanel.tsx` / `interaction.css`：按现有 mode 调整文本工具、选区提示和清除布局，不为使用相同布局而把拼写伪装成 grammar 模式。
保留词形与音标各自字体。正文编辑按钮始终可用；不将“无选区”与“不能打字”混为一谈。

`V3VoiceTextField.tsx` / `.css`：开启 spelling 编辑器入口、保留草稿会话及取消机制。
收起态复用阅读器展示拼写斜体与连读，同时保留 textarea 的焦点、错误定位和无障碍语义；不能仅用当前只画弧线的 overlay 显示斜体。
若 `VOICE_EDITOR` 关闭，已有 rich 数据仍可只读回显；正文降级输入沿用 `editRichText` 处理标注。

`V3ConcreteFormRow.tsx`：common、uk/us 独立栏、统一拼写共享栏都从 `spelling_rich` 或纯文本默认值加载，保存完整 RichTextV2，不再只取 `next.text`。
`V3ReviewContent.tsx`：词形正文用 `RichTextReadOnly` 回显，纯文本为空时保留当前占位。搜索候选和其他纯文本标签不扩展。

`operations.ts`：

- 扩展 `VariantMapping`、`variantMappingFrom` 及 common/uk_us 转换，使标注随来源迁移。
- `updateVariantSpelling` 保留普通字符串调用兼容；rich 编辑增加接受完整值的入口或参数，使用同一变体更新路径。普通改字通过现有 `editRichText` 处理标注。
- `unifyUkUsSpelling` 将正文和标注一起应用到两侧；普通纯文本调用不能静默留下不一致的 rich。
- `normalizeGroupDialectRules` 合并前比较规范化后的 rich 内容。无字段等价于同正文空标注；标注不同返回合并原因，由 `V3PosTab.tsx` 提示先统一再切换。
- 默认新建具体词形仍不复制模板标注；只让显式拆合映射携带标注。

`model.ts` / `model.test.ts`：本地变体白名单、字段数量边界、形状校验及 `variantWire` 增加可选字段。`toFormsWire` 显式保留 rich，不放宽未知字段过滤。
草稿恢复和 dirty/fingerprint 比较自然包含新字段，验证原有恢复路径和修订冲突不会丢失格式修改。

## 后端契约、规范化及保存

最新后端 `src/lexicon/dto/v3.rs` 的 common、uk、us 三种 variant 增加：

```rust
pub spelling_rich: Option<RichTextV2V3>
```

缺省为 None，None 不输出；字段可选但不可为 null，不能只靠 `Option` 默认反序列化实现 nonnullable。
复用通用 rich 校验、归一化、注解合并和码点规则，新字段只接受斜体与连读；前端写入 V2。
`src/lexicon/v3_contract.rs` 在草稿保存与完整校验中验证 rich 正文等于保存后拼写。新增 `SpellingRichTextInvalid` / `spelling_rich_text_invalid`，复用现有 validation_failed Problem Details 包装，field=`spelling_rich`、node_id=variant_id，并带变体 location；长度超限沿用 `ContentLimitExceeded`。前端错误文案和字段定位将其映射到拼写编辑入口，不复用“音标错误”文案。
统一拼写、区分发音的 uk/us 校验需比较规范化 rich 内容，缺省等价于空标注；两侧同文本却不同标注不能在单一拼写输入下静默保存。

后端拼写会执行 NFKC 和空白折叠，可能改变码点位置。普通输入在失焦、弹窗编辑在完成前按后端 display 口径规范化；键入过程中保留尾空格，允许输入多词短语。经现有 `editRichText` 逐段迁移变化，未受影响区间保留，受影响标注移除且提示、允许撤销。保留大小写，不使用搜索 key 的小写转换。规范化通过编辑器历史栈提交并显示非阻断提示，检查后可以再次完成。
后端带 rich 的请求严格校验最终规范化正文相等，不自动替换 rich.text 或猜测偏移。具体 Unicode 空白口径通过同一组前后端 fixture 对齐；不一致时保留输入并定位错误。

`src/lexicon/rich_text/core.rs` / `rich_text.rs` 复用当前 canonicalize 入口，不重写注解算法，不顺带重新格式化存量实际发音。
`src/lexicon/service/v3.rs` 的保存、创建、克隆与投影映射须保留新字段；既有 DTO 构造器按新建或迁移语义补 None 或来源值。省略和清除区别如下：

| 输入                                         | 保存规则                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| 新 variant 无 rich                           | 沿用纯文本                                              |
| 已有 variant 缺 rich，语义身份及最终拼写未变 | 保留已存 rich，普通整表保存不丢标注                     |
| 缺 rich，但拼写改变                          | 清除已不再适用的旧 rich；新前端通常提供重定位后的显式值 |
| 显式 rich，annotations 为空                  | 应用无标注值，明确清除旧标注                            |
| 显式 rich 有值                               | 校验并整体替换，不和旧注解隐式合并                      |
| null、正文不一致或非法注解                   | 拒绝，不静默丢字段                                      |

保留规则以稳定 variant ID、方言和最终规范化拼写匹配现有记录；拆合有显式映射时以新映射为准。不得绕过其他引用、版本和权限校验。
最小插入点沿用 `preserve_missing_component_usages`：impact preview 和 save 都在 proposed canonicalize、读取 current 后，validate 与摘要生成前应用缺省保留。两条路径须一致，避免预览和实际保存摘要不同。

编辑投影和 publication 保存完整 JSON，复用现有存储，不为关系表 variant 增加 rich 列。实现时核对迁移守卫及完整反序列化路径。
本方案无需数据库 migration，没有 up/down 或历史回填；如实现发现实际存储不满足此结论，先修订设计，不直接改共享数据库。

发布后草稿、历史读取和 rollback 操作需保留字段。`src/wordlists/projection.rs` 的公共输出仍按现有字段白名单，不加入 rich。
纯标注不改变拼写索引或引用目标；full forms digest 与修订会改变，可能要求再次确认表面匹配，按现有规则执行。

## 契约同步与发布兼容

字段影响 `PUT /api/v1/admin/lexicon/entries/{id}/steps/forms` 请求与返回，以及包含 forms 的词条读取、创建、保存、发布和历史快照读取响应；不是新增端点。
更新 `packages/types/src/admin-word-v3.ts` 的三类变体共享镜像、相关错误码/文案及契约测试。后端导出 OpenAPI 后由现有脚本生成前端 endpoint snapshot 和 strict runtime bundle，不能手改生成物或放宽额外字段校验。

| 版本组合                       | 依据与限制                                                |
| ------------------------------ | --------------------------------------------------------- |
| 旧前端 + 新 API，尚未产生 rich | None 省略可维持旧响应形状；需验证                         |
| 旧前端 + 新 API，含 rich 数据  | 缺头获得旧视图，存储标注保留，不使旧页面报错              |
| 新前端 + 旧 API                | 能力头被忽略，可读无字段数据；新写入仍须等待后端支持      |
| 新前端 + 新 API                | 目标组合，须证明保存、读回、发布及清除                    |
| 旧 API + 新快照/编辑投影       | strict DTO 可能反序列化失败；首笔写入后禁止直接回退旧 API |

### 2026-10-10：自动兼容过渡

不以“所有录入用户已手工刷新或关闭旧页面”为发布门禁。旧标签页无法被操作人员可靠枚举，应通过接口表示协商保证可用。

- 新 api-client 对完整词条的 13 个读取/命令接口发送 `X-TSZ-Spelling-Markup: v1`。旧后端忽略该头，现有可选字段 reader 仍可正常工作。
- 后端在 service 返回后、JSON 序列化前处理响应副本：缺头或未知值省略 common/uk/us 的 `spelling_rich`；`v1` 保留完整标注。响应带 `Vary: X-TSZ-Spelling-Markup`。
- 创建、词形/词义保存、发布/批量发布、草稿/历史读取、回滚、单条/批量归档恢复均使用相同表示规则；列表/候选/错误不包含完整词形，不增加协议头。
- 能力头仅控制响应表示，不进入幂等 request hash，不改变输入校验，也不静默丢弃请求中的标注。数据库、publication、command response cache 保留完整字段。旧客户端省略字段且拼写未变时沿用现有保留规则；主动改字按位置标注失效语义处理。
- 不增加 migration 或放宽严格 runtime schema；C 端词单保持既有白名单投影。

发布顺序：兼容后端 → 带能力声明的前端 → 开启拼写编辑。旧标签页继续收旧格式，无需保证它们都已更新。现网旧客户端仍可工作，新客户端完整回显标注。

首笔标注写入后，后端回退必须保留标注读取/保存能力；不能换回拒绝该字段的旧二进制或删库字段。前端可回退关闭编辑入口，由兼容后端向无头客户端返回旧视图。完整数据仍存储在服务器。

验收重点：缺头/未知头与 v1 的实际 HTTP 响应差异；三地区兼容字段；旧客户端整步保存后新客户端读回；发布/历史/回滚与 lifecycle/batch；同一幂等键跨客户端重试取同一 canonical 结果；GET 实际请求透传、13 方法声明与既有幂等键保持。

## 验收

以下是验收命令与预期，实际执行结果及未完成项见 verification.md。
后端实施须先 fetch 并在新任务 worktree 进行，不修改落后主 checkout。需数据库的测试使用隔离 Postgres/Redis 和独立验收词条，不连接共享业务库。

前端定向验证（从本任务前端根目录执行）：

```bash
pnpm --filter @tsz/voice-editor test
pnpm --filter @tsz/admin test -- src/features/dictionary/word-creation-v3/operations.test.ts src/features/dictionary/word-creation-v3/model.test.ts src/features/dictionary/word-creation-v3/components/V3VoiceTextField.test.tsx src/features/dictionary/word-creation-v3/V3ReviewContent.test.tsx src/features/dictionary/word-creation-v3/saveFlow.test.ts
pnpm --filter @tsz/api-client test
pnpm typecheck
```

预期：选区启用、两种连读、多字符端点、部分斜体取消、清除和撤销、取消会话、各拼写调用分支、方言转换、格式 dirty、普通保存保留、非法契约均通过。既有语法、音标及合成功能不回归。
契约生成使用选定后端任务 worktree 的绝对路径：

```bash
# 在后端任务 worktree 执行
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
# 在前端根目录执行；tsz_backend_root 指向上述任务 worktree
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE="$tsz_backend_root/docs/openapi.json" pnpm --filter @tsz/api-client sync:openapi
```

核对两个生成物的来源和 SHA256 与所选 OpenAPI 一致，字段可选/nonnullable、错误码、输入输出形状准确。
后端定向验证（从后端任务 worktree 根目录执行）：

```bash
SQLX_OFFLINE=true cargo test --locked --all-features --lib lexicon::v3_contract
SQLX_OFFLINE=true cargo test --locked --all-features --lib lexicon::rich_text
SQLX_OFFLINE=true cargo test --locked --all-features --lib lexicon::service::v3::tests
```

handler 回归新增使用 `v3_spelling_rich_` 前缀。先确认 `DATABASE_URL` 指向可创建临时测试数据库的隔离 Postgres，`TEST_REDIS_URL` 指向隔离 Redis，再执行：

```bash
SQLX_OFFLINE=true cargo test --locked --all-features --test lexicon_handler v3_spelling_rich_
SQLX_OFFLINE=true cargo test --locked --all-features --test wordlists_handler full_reading_is_opt_in_and_sorting_precedes_pagination_without_editing
```

预期：过滤后的新 handler 测试实际有用例执行，不能把 0 tests 视为通过；覆盖 common/uk/us 保存读回、完整发布/历史/回滚、缺字段保留/改字清空、显式空标注、null/V1/非法注解/范围拒绝、规范化不发生偏移错位。公共词单仍只输出原有投影。

真实浏览器验收：以生产 admin 构建连接隔离后端，使用实际 API 新建验收草稿；编辑 `boiled potatoes` 的斜体和连读及一条实际发音连读 → 完成 → 保存 → 刷新重开 → 发布 → 独立读取历史版本。每一步检查显示和服务器返回 rich 完整一致。
继续验证取消、清除后重存、拆合与统一拼写、Unicode 规范化、只读、修订冲突和失败输入保留；公共词单响应无新字段。
混合版本用固定的新旧契约/DTO fixture 验证上表，覆盖旧客户端省略字段与显式清空两条保存路径。

实现收尾按项目要求统一运行 `pnpm lint`、`pnpm test` 及受影响构建；定向已通过的证据不重复堆叠。浏览器 mock 不能代替真实保存和发布读回。
