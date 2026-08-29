# Smart Lexicon QA 问题分级修复与 Step 4 视觉重排技术设计

> 状态：已批准、已实现并完成本地自动化与真实浏览器验收。
> 前置需求：同目录 `requirements.md`。
> 实施结果：P0、P1/P2 与 Step 4 均已按本方案落地；提交仍按独立主题拆分。

## 方案概述

采用四阶段、可独立回滚的路线：

1. **后端 P0 合同修复**：V3 detect 与 create 共用唯一严格英文录入 parser；非法输入返回既有 `invalid_headword` 400 合同，不产生 detection state。
2. **前端 P1 可靠性修复**：集中错误/issue 中文 presenter、4xx retry 策略、统一步骤门禁、V3 workspace 路由识别、恢复稳定验收测试。
3. **前端 P2 清理**：筛选 URL 单一事实源、Vite ESM import、结合 Step 4 移除 deprecated antd List。
4. **Step 4 视觉信息架构重排**：保留现有 controller、wire、publish/history/activate 行为，只增加面向“核对与生效”的 presentation model 和生产级布局。

不采用一次性大改。P0、P1/P2 与 Step 4 的回归面不同，必须按阶段分别验证和交付。

## 责任矩阵

| 项目               | 后端责任                                                    | 前端责任                                          | 合同变化                                 |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| P0 V3 detect       | strict parse、invalid_headword、create 再校验、无非法 state | 保留即时校验；正确展示 400                        | 行为收紧；复用既有 400 code，无新 schema |
| P1 validation 英文 | 保证稳定 code/field/location                                | 统一中文 presenter，未知 code fail closed         | 无                                       |
| P1 404 英文/重试   | 返回稳定 `word_not_found`                                   | 中文状态、按 status/code 决定 retry               | 无                                       |
| P1 step 门禁       | 继续返回 `max_reachable_step` 并权威拒绝非法保存            | 页面、导航、直达 URL 使用同一 gate                | 无                                       |
| P1 workspace       | 无                                                          | 识别 V3 wizard route                              | 无                                       |
| P1 自动化失败      | 无                                                          | 修测试定位，不改产品标题                          | 无                                       |
| P2 filter URL      | API query 保持现状                                          | URL 解析/序列化成为筛选事实源                     | 无                                       |
| P2 antd List       | 无                                                          | 在 Step 4 结构中移除 deprecated 组件              | 无                                       |
| P2 Vite import     | 无                                                          | 显式 `.ts` ESM import                             | 无                                       |
| Step 4 IA          | 现有 validate/publish/history/activate 合同不变             | 新 review model、状态头、分组内容、历史区、响应式 | 无                                       |

## 后端 P0 设计

## 单一严格 parser

当前 `handler::detect` 和 `service::detect_v3` 都调用宽松 `normalize_headword`。设计调整为：

```text
request JSON decode
  -> NormalizedHeadword::parse(surface)
  -> strict normalized { display, key }
  -> dictionary + surface detection
  -> save detection context
```

`NormalizedHeadword::parse` 已包含当前正式录入字符集和 minimum-letter 规则，不再另写第二份 regex。

推荐由 `LexiconService::detect_v3` 持有最终校验，handler 只负责 decode/auth/capability。理由：service 才是未来 CLI/其他 handler 复用的领域边界；只修 HTTP handler 仍可能被内部调用绕过。

handler 可以保留轻量 decode，但不得在 handler 和 service 各自维护不同校验规则。

## 错误合同

非法 surface 统一返回：

```json
{
  "status": 400,
  "code": "invalid_headword",
  "field_issues": [
    {
      "field": "surface",
      "code": "invalid_headword"
    }
  ]
}
```

具体 ProblemDetails 是否已有 `field_issues` 形状以现有 AppError 能力为准；硬要求是 HTTP 400、顶层稳定 code 和字段 `surface`。前端不依赖英文 detail。

`map_error` 当前只在 field=`headword` 时映射 `InvalidHeadword`。实施时可选择：

- 让 strict parser error 进入一个显式 `InvalidSurface` service variant，再在 handler 映射到 `InvalidHeadword`；或
- 扩展 `InvalidField` 映射，将 `surface` 视为录入 headword 字段。

推荐第一种，避免未来所有名为 `surface` 的投影内部错误都被误报成用户输入错误。

## create 纵深校验

`create_v3` 加载 detection 后，在任何 entry transaction 写入前：

1. 对 `detection.request.surface` 再执行 strict parse；
2. 确认 parse 得到的 key 与 `detection.normalized_surface` 相同；
3. 不一致或非法时返回 400 `invalid_headword`，不消费 detection，不写 entry/idempotency/audit。

这样可以拒绝修复前遗留的非法 context，也能防止伪造/损坏 store 内容。

## OpenAPI 与前端同步

- `POST /api/v1/admin/lexicon/detections` 的 400 `invalid_headword` 描述明确覆盖 schema 3 surface。
- 422 只保留 JSON/schema/language 等结构性问题。
- 后端导出 `docs/openapi.json`。
- 前端只通过 `pnpm --filter @tsz/api-client sync:openapi` 同步精简 snapshot/runtime schema；禁止手改生成文件。
- 若结构未变，生成 diff 可能只有 operation response/description；仍须执行契约门。

## 后端影响范围（由 tsz-rust 独立任务实施）

- `src/lexicon/normalization.rs`：复用现有 strict parser，不新增第二套规则。
- `src/lexicon/service/v3.rs`：detect authority 与 create 纵深校验。
- `src/lexicon/handler/commands.rs`：移除/替换宽松 precheck，保持 400 合同。
- `src/lexicon/handler.rs` / `src/error.rs`：只在需要时补 surface 的稳定错误映射。
- `src/openapi.rs`、`docs/openapi.json`：正式合同。
- `tests/lexicon_handler.rs`：authenticated handler 回归及 detection store 零写入断言。

不需要数据库 migration，不修改 normalization version。

## 前端 P1 设计

## 统一 V3 issue/error presenter

新增纯逻辑模块：

`apps/admin/src/features/dictionary/word-creation-v3/presentationErrors.ts`

职责：

```ts
function v3IssueMessage(issue: V3DraftValidationIssue): string;
function v3DetailErrorPresentation(error: unknown): {
  title: string;
  description: string;
  retryable: boolean;
};
```

issue 映射按 `code` 为主，必要时结合 `field`；不得用“message 是否含中文”的启发式。至少覆盖当前 `V3_VALIDATION_ISSUE_CODES` 全集，并提供统一未知兜底“该内容暂时无法完成，请刷新后重试”。未知 code 通过现有 telemetry 上报 code 和页面上下文，不上报内容文本、token 或整个 payload。

接入点：

- `V3WordCreationLayout.tsx` 完成项列表；
- `V3FormsAndPronunciationStep.tsx`；
- `V3MeaningsAndExamplesStep.tsx`；
- `V3PreviewAndPublishStep.tsx`；
- 以后 Step 4 review model 的 blocker summary。

移除以下模式：

```ts
/[\u3400-\u9fff]/u.test(issue.message) ? issue.message : fallback;
```

详情页错误使用同一 presenter。`word_not_found`、unsupported schema、401、403、network/5xx 均由 status+code 分类，`WordWizardV3Page` 不再直接渲染 `detail.error.message`。

## Query retry

为 V3 detail query 提供显式 retry 函数：

```ts
retry(failureCount, error) {
  const problem = classifyV3Problem(error, "get");
  return problem.kind === "network" ||
    problem.kind === "server" ||
    problem.kind === "service_unavailable"
      ? failureCount < 2
      : false;
}
```

人工“重试”始终可重新发起一次请求。401/403 交给既有 auth/session 处理，不由 detail 页循环重试。

## V3 step access

新增纯函数模块：

`apps/admin/src/features/dictionary/word-creation-v3/stepAccess.ts`

```ts
type V3StepAccess = {
  requested: WordCreationStep;
  effective: WordCreationStep;
  reachable: ReadonlySet<WordCreationStep>;
};

function resolveV3StepAccess(word, requested, mode): V3StepAccess;
```

规则：

1. draft：从 basics 到 `max_reachable_step` 可达；更晚的目标 replace 到 max。
2. published clean、非 edit：只读 preview。
3. published dirty、非 edit：仍从列表进入相应只读/产品规则；“继续编辑”显式进入 edit mode。
4. published edit：不晚于 max reachable；preview 只有 meanings 已完成时可达。
5. archived：只读 preview。

`WordWizardV3Page`、`V3WordCreationWizard.setActiveStep`、`WordCreationLayout` 的 Steps onChange、左侧 progress 和底部动作全部消费这个结果。不可达按钮 `disabled`，并用 Tooltip/辅助文本说明“请先完成词形与发音”。

后端仍保留 step/revision conflict；前端 gate 只减少错误操作。

## V3 workspace route

`ConsoleLayout.isWordCreationWorkspacePath()` 扩展为同时识别：

```text
/words/new
/words/:id/wizard/{basics|forms|meanings|preview}
/words/:id/v3/wizard/{basics|forms|meanings|preview}
```

使用 URL pathname，不受 query 影响。测试参数化 V2/V3 四 step 和 unknown step。

## 自动化修复

只修改失败测试定位：

```ts
const main = screen.getByRole("main");
expect(within(main).getByRole("heading", { name: "语义区间" }))...
```

若页面存在嵌套 main，应以 feature section/test id 或 heading-level 容器为准。断言继续验证草稿跨步骤保留和 preview gate，不测试实现内部 state。

## 前端 P2 设计

## 列表 URL 单一事实源

新增：

`apps/admin/src/features/dictionary/listSearchParams.ts`

```ts
function parseWordFilterSearchParams(params: URLSearchParams): WordFilterValues;
function serializeWordFilterSearchParams(
  values: WordFilterValues
): URLSearchParams;
```

建议参数：

| 表单字段    | URL                       |
| ----------- | ------------------------- |
| keyword     | `keyword`                 |
| gloss       | `gloss`                   |
| kind        | `kind=word                | phrase`   |
| pos         | `pos=<catalog-code>`      |
| level       | `level=A1..C2`            |
| status      | `status=draft             | published | archived` |
| range start | `created_from=YYYY-MM-DD` |
| range end   | `created_to=YYYY-MM-DD`   |

`created_to` 在 API 映射时仍加一天形成半开区间。URL 不存带时区 ISO timestamp，避免分享后跨时区偏移。

SmartDictionary 以 searchParams 解析结果作为唯一 filters source；submit/reset 只更新 URL，query 由解析结果派生。浏览器 back/forward 会自然触发 query。page/page_size 暂不进入本次范围，避免把筛选修复扩大成分页深链设计。

## antd List

不先做临时替换。Step 4 重排时用语义化 section + `ul/li` 或卡片网格一次替换 `V3PreviewAndPublishStep` 的 deprecated `List`。若 Step 4 延后独立交付，则先做无视觉变化的 `ul/li` 小补丁，但不得新增第二套 preview 结构。

## Vite ESM import

仅修改：

```ts
from "./src/lib/env-flags.ts";
from "./src/lib/dev-proxy.ts";
```

运行 Vite config load、Admin unit、dev proxy tests 和 build，证明 `.ts` 扩展不改变 bundler 行为。

## Step 4 presentation architecture

## 设计原则

- 复用数据和 controller，不复刻编辑器 DOM。
- 先状态与决策，再摘要，再详情，再历史。
- 一个状态只突出一个主动作。
- 详情渐进披露；历史是一级能力，不是页面尾注。
- 不显示 wire、UUID、revision 数字或原始 code。

## Review model

新增纯 presentation model：

`apps/admin/src/features/dictionary/word-creation-v3/reviewModel.ts`

```ts
type V3ReviewModel = {
  identity: {
    label: string;
    kindLabel: string;
    languageLabel: string;
  };
  state: {
    status: "draft" | "published" | "published_dirty" | "archived";
    statusLabel: string;
    primaryAction: "edit" | "validate" | "publish" | "none";
  };
  readiness: {
    state: "unchecked" | "checking" | "blocked" | "ready";
    issueCount: number;
    firstIssue?: V3IssueNavigationTarget;
  };
  summary: {
    posCount: number;
    baseCount: number;
    formCount: number;
    pronunciationCount: number;
    senseCount: number;
    sentenceCount: number;
    relationCount: number;
    publicationCount: number;
  };
};
```

该 model 只从 `AdminWordV3`、validation/controller state 和 publication summary 派生，不更改 wire，不缓存第二份 canonical。

## 推荐桌面信息架构

```text
┌ 状态头 ────────────────────────────────────────────────┐
│ 词条名  类型/语言     已发布·当前第 2 版     [继续编辑] │
│ 当前无未发布修改 / 上次发布时间（本地化）              │
└────────────────────────────────────────────────────────┘

┌ 发布就绪 ─────────────────────┐ ┌ 内容摘要 ────────────┐
│ 可发布 / 待完成 N 项           │ │ POS / 词形 / 词义     │
│ 首个阻塞项 + [前往修复]        │ │ 例句 / 关系 / 历史    │
│ [检查发布条件] 或 [发布]       │ │                      │
└────────────────────────────────┘ └──────────────────────┘

┌ 内容核对 Tabs/Anchor ──────────────────────────────────┐
│ 词形与发音 | 词义结构 | 例句与关系 | 发布历史            │
│ 当前分组的只读、可折叠业务卡片                          │
└────────────────────────────────────────────────────────┘
```

“已发布”从当前“所属语言 → English → 已发布”的元数据列中移出，进入状态头。所属语言保留为 identity metadata。

## 状态与动作

| 状态                   | 主动作       | 次动作/说明                |
| ---------------------- | ------------ | -------------------------- |
| draft 未检查           | 检查发布条件 | 继续编辑                   |
| draft blocked          | 前往首个问题 | 重新检查、继续编辑         |
| draft ready            | 发布         | 继续编辑                   |
| published clean        | 继续编辑     | 查看历史                   |
| published dirty        | 检查发布条件 | 继续编辑、当前线上版本提示 |
| archived               | 无写主动作   | 查看历史、返回列表         |
| history snapshot modal | 激活此版本   | 关闭；正文只读             |

现有 `V3PreviewAndPublishStep` controller 的 validate/publish/impact/surface 状态机原样复用。布局组件不自行调用 API。

## 内容分组

- **词形与发音**：按 POS 折叠；默认显示 base/方言/发音摘要，展开看其他 forms。
- **词义结构**：sense group 与 grammar 先摘要，再按 POS 展开 definitions。
- **例句与关系**：sentence、focus link、relation target 放在同一业务区；不可用目标使用现有产品状态。
- **发布历史**：列表显示本地化时间、当前/历史标记、版本摘要；详情 modal 继续使用 immutable snapshot。

不将完整 Step 2/3 编辑表单以 disabled 控件形式搬入 Step 4。

## 响应式

| 宽度          | 布局                                                                |
| ------------- | ------------------------------------------------------------------- |
| ≥ 1200 内容宽 | 状态头；readiness + summary 双栏；内容 tabs；动作右对齐/sticky      |
| 768–1199      | 单列状态头；readiness 在 summary 前；横向可滚 tabs 或 anchor select |
| < 768         | 单列；状态/主动作首屏；内容 Accordion；底部 sticky 单主动作         |

四档验收固定为 390 / 768 / 1024 / 1440。V3 workspace 断点 P1-04 必须先修，否则 Step 4 宽度验收无效。

## 时间与可访问性

- publication timestamp 使用 dayjs 本地化 `YYYY-MM-DD HH:mm`，可补相对时间但不能只显示相对时间。
- 状态同时有文本、图标和颜色。
- Tabs/Accordion/Modal 使用 antd v6 现有可访问语义；heading 顺序 h2→h3→h4。
- issue 点击后复用现有 `navigateToV3Issue`，焦点落到编辑页具体字段。

## 前端代码影响范围

### 新增

- `apps/admin/src/features/dictionary/word-creation-v3/presentationErrors.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/presentationErrors.test.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/stepAccess.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/stepAccess.test.ts`
- `apps/admin/src/features/dictionary/listSearchParams.ts`
- `apps/admin/src/features/dictionary/listSearchParams.test.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/reviewModel.ts`
- `apps/admin/src/features/dictionary/word-creation-v3/reviewModel.test.ts`
- Step 4 review components 与 `v3-preview.css`（组件名在视觉方案批准后冻结）

### 修改

- `apps/admin/src/pages/WordWizardV3.tsx`
- `apps/admin/src/pages/WordWizardV3.test.tsx`
- `apps/admin/src/layouts/ConsoleLayout.tsx` / test
- `apps/admin/src/features/dictionary/SmartDictionary.tsx` / test
- `apps/admin/src/features/dictionary/listQuery.ts` / test（仅日期映射复用）
- `V3WordCreationLayout.tsx`
- `V3FormsAndPronunciationStep.tsx`
- `V3MeaningsAndExamplesStep.tsx`
- `V3PreviewAndPublishStep.tsx`
- `V3MeaningsPreview.tsx`
- `V3PublicationHistory.tsx`
- 对应现有 test files
- `apps/admin/vite.config.ts`
- 后端 OpenAPI 同步生成的 api-client snapshot/runtime schema（只有 P0 正式 spec 有 diff 时）

不修改 `@tsz/types` 业务 DTO，除非后端正式 OpenAPI 的 ProblemDetails 结构新增了当前类型未表达的字段；若只是既有 code/status 行为收紧，不新增类型。

## 最小实施顺序

1. **P0 后端红测**：authenticated Chinese/numeric/emoji/control detect；create 消费非法 context。
2. **P0 后端实现 + OpenAPI**：strict parser、create 防线、spec 导出；真实普通管理员 API 回归。
3. **前端同步 OpenAPI**：生成文件、api-client 377+ 契约门。
4. **P1 error presenter + retry**：先解决英文泄漏和 404 重试。
5. **P1 step access**：纯函数→页面/导航接入→真实草稿回归。
6. **P1 workspace + 自动化用例修复**：恢复 Admin 定向全绿。
7. **P2 Vite import + filter URL**：独立低风险提交。
8. **Step 4 视觉方案与实现**：低保真 IA 与 390/768/1024/1440 方案已获批准，组件重排和本地
   视觉验收均已完成。
9. **Step 4 实现**：review model→状态头/readiness/summary→内容分组→history→移除 deprecated List。
10. **完整回归**：自动化、真实 API、真实浏览器、控制台/网络、现有 QA 数据。

P0 未通过时不进入 Step 4 实现；Step 4 不阻塞 P0/P1 发布。

## 回归用例

| ID      | 层                  | 场景                               | 预期                                         |
| ------- | ------------------- | ---------------------------------- | -------------------------------------------- |
| B-P0-01 | Rust unit           | strict parse 合法英文/标点         | 保持当前 normalization                       |
| B-P0-02 | handler integration | 中文/emoji/纯数字/24/7             | 400 invalid_headword；无 detection key       |
| B-P0-03 | handler integration | 空/201 codepoint/control           | 400；无 side effect                          |
| B-P0-04 | service             | create 消费历史非法 context        | 400；无 entry/idempotency/audit              |
| B-P0-05 | real API            | 专用普通 admin 正常 detect         | 200；not_found/matched 按真实数据            |
| F-P1-01 | unit                | 所有 V3 issue code                 | 稳定中文；unknown code 通用兜底              |
| F-P1-02 | integration         | 404/401/403/422/500/network        | 正确中文与 retry 策略                        |
| F-P1-03 | unit                | draft 各 max_reachable             | later step clamp/disabled                    |
| F-P1-04 | router integration  | URL/top/progress/footer            | 四入口门禁一致                               |
| F-P1-05 | layout              | V2/V3 四 step 路径                 | workspace path 均命中                        |
| F-P1-06 | wizard regression   | unsaved forms 跨 step              | 内容保留，preview gate 正确，测试无歧义      |
| F-P2-01 | unit                | filter parse/serialize roundtrip   | 所有筛选稳定、非法值忽略                     |
| F-P2-02 | browser             | filter + reload/back/forward       | 表单、URL、API 一致                          |
| F-P2-03 | config              | Vite config load/build             | 无 native import warning                     |
| F-S4-01 | model               | 五状态与动作                       | 每状态唯一主动作                             |
| F-S4-02 | component           | blocked/ready/published dirty      | readiness/summary/动作层级正确               |
| F-S4-03 | history             | 两个 V3 publications               | 当前/历史、详情、激活不变                    |
| F-S4-04 | relation            | 已发布 target / unavailable        | 正确业务摘要，不泄露 ID                      |
| F-S4-05 | visual              | 390/768/1024/1440                  | 无横溢出，首屏状态/动作可达                  |
| F-S4-06 | a11y                | keyboard/heading/focus             | tabs/accordion/modal/issue navigation 可操作 |
| E2E-01  | real                | normal admin detect→create→publish | 全链路 V3，console/network 无产品错误        |
| E2E-02  | real                | publication #1/#2 激活             | UI/API 当前标记与 canonical 状态一致         |

实施前按 test skill 把以上策略展开为正式 test matrix；每个 P0/P1 都必须有失败断言后再修。

## 质量门

前端：

```bash
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/admin test
pnpm --filter @tsz/admin typecheck
pnpm --filter @tsz/admin lint
pnpm --filter @tsz/admin build
```

最终执行根 `pnpm test:cov`，不降低覆盖率、不绕过 hooks。真实浏览器复用保留的 `QA-R2` 普通管理员与两条 publication 数据。

后端由独立 tsz-rust 任务运行定向 handler/service tests、完整 fast suite、OpenAPI export 与真实 API smoke；本前端文档不实现后端代码。

## 风险

| 风险                                  | 缓解                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| strict parser 误伤当前允许词条        | 完全复用现有 `NormalizedHeadword::parse` 与单测，不新定义字符集                         |
| 422→400 影响客户端                    | OpenAPI 已声明非法 headword 400；同步 snapshot，并让前端按 code 兼容                    |
| create 二次校验拒绝遗留非法 detection | 这是预期安全收紧；返回可重新检测的中文提示，不消费 context                              |
| step gate 使异常历史草稿无法访问内容  | 以服务端 max_reachable 为事实源；只限制后续步骤，不阻止当前/更早步骤和只读 preview 状态 |
| filter URL 与日期时区漂移             | URL 存本地日字符串，API 映射时统一 startOf/addDay                                       |
| Step 4 重排破坏 publish 状态机        | controller/actions 不下沉到新展示组件；review model 纯派生；复用现有 API hooks          |
| 历史请求竞态                          | 保留 V3PublicationHistory generation/abort/identity guard，不在视觉组件重写请求层       |
| 一次大 diff 难审查                    | 按 P0、P1、P2、Step 4 独立提交/PR 或至少独立 commit，逐阶段全绿                         |
| dirty 工作树混入他人修改              | 实施前重新确认 owner；本次评估只新增文档，后续每阶段只触及设计清单文件                  |

## 回滚

- P0 后端：若合法词条出现误拒，回滚具体 strict parser 调用提交并保留新增测试定位；不得通过再次允许中文/纯数字作为长期降级。
- P1/P2：每项独立提交，可单独 revert；错误 presenter 与 step gate 不依赖 Step 4。
- Step 4：新 presentation components 与 CSS 单独提交；回滚可恢复旧布局，controller、wire、publication 数据不变。
- OpenAPI：只能回滚到与目标后端 commit 对应的生成快照，禁止前后端 spec 混搭。
- 数据：不需要 migration；保留 `QA-R2` 账号和词条作为回归数据，不做自动清理。

## 不采用方案

- 只修前端校验：不能挡直接 API，是 P0 未关闭。
- 把后端 message 全改中文：wire message 不是本地化合同，仍会在新 code 上重复泄漏。
- 用隐藏 Steps 代替 route gate：直达 URL 仍可绕过。
- 为 Step 4 新建第二套 API/state：增加竞态并破坏已验证逻辑。
- 直接微调现有 Step 4 间距：用户明确允许且要求生产级重排，必须先做 IA，而不是继续修补线性堆叠。
- 在当前 dirty worktree顺带重构相邻模块：违反手术式修改边界。

## 评审门

用户需一次性确认：

1. P0 使用 strict parser + create 二次校验，错误合同为 400 `invalid_headword`；
2. 5 个 P1 与 3 个 P2 的前端责任和实施顺序；
3. Step 4 使用新 review model 和“状态/就绪/摘要/内容/历史”信息架构，不保留当前布局；
4. Step 4 视觉方案在代码实现前还有一次只读低保真评审；
5. 后端 P0 由独立 tsz-rust 任务实施，本前端工作树只同步正式 OpenAPI。

评审通过前不进入代码动工。
