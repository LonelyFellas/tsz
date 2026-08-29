# Smart Lexicon QA 问题分级修复与 Step 4 视觉重排需求评估

> 状态：已批准、已实现并完成本地自动化与真实浏览器验收。
> 依据：2026-08-28 第一轮精细化测试、2026-08-29 第二轮受控高风险验收。
> 目标端：Admin；P0 依赖 tsz-rust 后端合同与实现修复。

## 背景与目标

Smart Lexicon 的 V3 创建、编辑、发布、历史激活、关系引用和生命周期已经可以在本地真实系统形成闭环。第二轮使用专用普通管理员和两条隔离 V3 词条完成了两次发布、历史激活、入站引用保护与归档恢复，数据和主要业务逻辑没有发现新的 P1 缺陷。

但测试也证实：创建入口仍存在一个可绕过前端的 P0 服务端校验漏洞；第一轮留下 5 个 P1 与 3 个 P2；Step 4“预览并生效”虽然数据正确，但当前信息架构和视觉密度不满足生产级核对/发布场景。

本需求的目标是按严重度分阶段收敛：

1. 先关闭 V3 detect 的服务端 P0，确保非法英文词条不能获得可消费 detection；
2. 再修复错误产品化、步骤门禁、响应式和自动化门等 5 个 P1；
3. 处理 3 个明确 P2，消除状态恢复和升级告警；
4. 保留现有 V3 数据、API、发布、历史和生命周期逻辑，对 Step 4 进行生产级信息架构与视觉重排；
5. 全程不把 UI 修复变成 wire 重构，不动用户既有数据。

## 目标用户与场景

### 管理员创建词条

有效管理员从统一入口输入英文单词或短语。无论通过 Admin 页面还是直接调用 API，非法输入都应在创建任何 detection context 或 entry 前被服务端拒绝；前端校验只是更早的体验反馈，不是安全边界。

### 管理员继续编辑 V3 草稿

管理员只能进入服务端声明已可达的步骤。浏览器直达 URL、顶部 Steps、左侧完成情况和底部下一步按钮遵循同一门禁，不让未完成草稿表现为已经正常进入后续阶段。

### 管理员处理错误

错误信息必须由稳定 code 映射为中文产品文案。后端英文 message、HTTP status、内部 UUID、snapshot/token/policy code 不应直接显示给管理员；确定性 4xx 不应无意义重试。

### 管理员核对并生效

Step 4 的任务不是复刻编辑器，而是帮助管理员快速回答：

- 当前词条处于什么状态；
- 是否可以生效，阻塞项是什么；
- 本次将生效的关键内容是什么；
- 与当前线上版本是否有未发布差异；
- 下一步主要动作是检查、发布、继续编辑还是查看/激活历史版本。

## 功能范围

## P0：V3 detect 服务端录入规则

### 当前问题

真实 authenticated API 中，V3 detection 对 `苹果` 和 `123456` 均返回 200 并生成 detection context。Admin 前端会拦截，但直接 API 可绕过。

### 要求

- V3 detection 必须执行与正式英文词条录入一致的严格规则：NFKC/空白归一化后，只允许批准的拉丁字符、数字和连接标点，且至少包含一个拉丁字母，长度不超过 200 codepoint，不含控制字符。
- 非法请求必须在写入 detection store、surface snapshot 或 consumed-detection 前失败。
- 错误使用稳定产品合同：HTTP 400、`code=invalid_headword`、字段指向 `surface`；detail/message 不作为前端分支依据。
- V3 create 消费 detection 时再次验证服务端保存的规范化 surface，防止历史/伪造 context 绕过 detect 修复。
- 合法输入现有行为不变：全角拉丁字符、弯撇号、Unicode 连字符和允许的英文标点继续按当前 normalization version 归一化。
- `24/7` 是否继续因“不含拉丁字母”拒绝，沿用当前正式规则；本次不另改产品字符集。

## P1-01：V3 validation issue 中文产品化

### 当前问题

`pronunciation_required` 的后端 message `a complete pronunciation requires all fields` 在完成项列表和 Step 2 错误区直接显示。

### 要求

- 前端集中按 `V3ValidationIssueCode` 映射中文文案，不在多个组件各自判断 message 是否含中文。
- 同一 issue 在完成项、Step 2、Step 3、preview 和历史问题导航中使用同一文案。
- 未知 code 使用不含原始 message/UUID 的通用中文兜底，并上报受控 telemetry。
- 后端只保证稳定 code、field、node_location；不要求后端把 wire message 改为中文。

## P1-02：详情错误产品化与 4xx 重试

### 当前问题

不存在的 V3 entry 页面显示 `word not found`，且相同 404 自动请求 4 次。

### 要求

- `word_not_found` 显示“词条不存在或已被删除”；unsupported schema、401、403、5xx、网络异常分别使用稳定中文状态。
- 详情 Query 对 400/401/403/404/409/410/422 不自动重试；只对网络错误和明确可恢复 5xx 使用有上限的重试。
- 页面可提供人工“重试”，但确定性 404 不应后台循环请求。
- 页面不得直接渲染 `detail.error.message`。

## P1-03：V3 步骤可达性统一

### 当前问题

只有 basics 完成、`max_reachable_step=forms` 的草稿可通过顶部步骤直接进入 meanings 和 preview。

### 要求

- draft 的合法目标步骤不得晚于 `max_reachable_step`。
- 顶部 Steps、左侧完成情况、底部按钮和直达 URL 共用同一可达性判断。
- 不可达步骤显示禁用态和可理解说明；直达 URL replace 到最大可达步骤。
- archived 和 published clean 继续强制只读 preview；published edit mode 的可达性基于服务端 canonical 状态。
- dirty 本地草稿切换规则保持现有“切步骤不丢输入”，但不能借 dirty 状态越过服务端未完成步骤。
- 后端现有 revision/step conflict 继续为最终权威，不因前端门禁删除。

## P1-04：V3 workspace 响应式断点

### 当前问题

`ConsoleLayout.isWordCreationWorkspacePath()` 未识别 `/words/:id/v3/wizard/:step`。1024px 下 V3 侧栏宽 220px、main 804px，而 `/words/new` 为 72px/952px。

### 要求

- V2/V3 wizard 与 `/words/new` 使用同一“复杂编辑器 workspace”断点策略。
- 390 / 768 / 1024 / 1440 下不出现页面级横向溢出，Step 2/3/4 关键内容不被侧栏非必要压缩。
- 路由 query（如 `?mode=edit`）不影响 workspace 识别。
- 新增路由级自动化覆盖 V3 四个 step。

## P1-05：Admin 验收测试恢复稳定

### 当前问题

`WordWizardV3Page > preserves an unsaved forms draft across steps and gates canonical preview actions` 用全局 `findByText("语义区间")`，同时命中左侧进度项和主区卡片标题，稳定失败。

### 要求

- 测试按可访问角色、区域或测试目标容器定位，不要求合法业务标题在整页全局唯一。
- 不通过删除左侧“语义区间”或主区标题来让测试通过。
- 保留原用例真正要证明的行为：未保存 forms 草稿跨步骤不丢失，preview canonical 动作被 gate。

## P2-01：列表筛选 URL 完整持久化

### 当前问题

只有 keyword/status 写入 URL；gloss、kind、pos、level、日期刷新后丢失。

### 要求

- URL 表达全部筛选字段，空值不写；非法值忽略并回退安全默认。
- 刷新、浏览器前进/后退、复制 URL 后恢复同一筛选结果。
- 日期使用稳定、可读且无时区歧义的日粒度参数，继续映射为 API 半开区间。
- 表单、URL 和请求只保留一个事实源，避免双 state 漂移。

## P2-02：移除 antd `List` deprecated 用法

### 当前问题

Step 4/validation 触发 `[antd: List] The List component is deprecated`。

### 要求

- 使用语义化 `ul/li`、`Flex` 或 Step 4 新信息架构替换 deprecated `List`。
- 保持键盘、读屏和列表计数语义。
- 不单独制造一次临时视觉重排；若 Step 4 方案已批准，在最终结构中一次解决。

## P2-03：Vite native config loader 兼容

### 当前问题

`vite.config.ts` 的 `./src/lib/env-flags`、`./src/lib/dev-proxy` 缺扩展名，定向测试产生 native config loader 告警。

### 要求

- 使用 Node/Vite ESM 可稳定解析的显式文件扩展名。
- 现有 dev proxy、mock gate、test config 行为不变。
- Vite config 加载不再产生这两条告警。

## Step 4：生产级信息架构与视觉重排

### 已确认的数据边界

- V3 forms、meanings、validation、publication、history、activate 和 lifecycle 数据/业务逻辑保持现状。
- 不修改 wire DTO，不把 V3 转成 V2，不重建稳定 UUID。
- Step 4 可以完全改变布局，不必沿用当前线性卡片堆叠。

### 当前布局观察

- 当前词条摘要顺序为：`当前词条 → 词条名 → 所属语言 → English 英语 → 已发布 → 完成情况 → 实时 → 完成项`。
- “所属语言”标签、语言值与“已发布”位于同一纵向列；“已发布”紧接在语言值下方，没有独立状态分组。
- 页面同时存在顶部 Steps、左侧摘要/完成情况、全宽“继续编辑”、只读提示、完整 forms、完整 meanings、关系词和发布历史，主次不够明确。
- 1440×1000 下完整页面约 1927px 高，发布历史在首屏以下；390px 下约 2600px。
- 发布历史时间使用 ISO UTC 原始字符串；历史、当前状态与主要动作距离较远。

### 信息架构要求

- **状态与动作区**：状态从“所属语言”下方移出，成为独立视觉层级；统一呈现 draft/published clean/published dirty/archived/history snapshot、当前 publication 和主要动作。
- **发布就绪区**：优先显示是否可发布、issue 数、首个阻塞项和检查时间；未检查、检查中、可发布、被阻断分别有清晰状态。
- **内容摘要区**：先给出 POS、base/forms、sense、sentence、relation 的摘要计数，再按业务分组查看详情。
- **内容详情区**：词形与发音、词义结构、例句与关系使用可扫描分组；支持折叠或 tab/anchor，避免把完整编辑器结构无差别平铺。
- **发布历史区**：当前版本、历史版本、发布时间和激活动作成为一级信息区；历史详情继续只读，不暴露 wire 元数据。
- **动作优先级**：同一状态只突出一个主动作；“继续编辑、检查发布条件、发布、查看/激活历史”按状态切换，不同时抢占主视觉。
- **响应式**：桌面允许摘要/动作与内容双区布局；平板收为单列但保留 sticky 主要动作；移动端先状态和动作，再内容与历史。
- **本地化与可访问性**：时间本地化；状态不只依赖颜色；标题层级、landmark、折叠按钮和焦点顺序可读。

## 范围外

- 恢复可撤销 `words.access` RBAC；当前产品 Q10 为普通管理员全量权限。
- 修改词条 schema、发布事务、关系/生命周期规则或现有隔离 QA 数据。
- 重做 Step 1/2/3 的产品结构（仅修本需求列出的门禁、错误和 workspace 断点）。
- 删除用户或 QA 测试数据。
- 在评审前实现任何代码、测试、OpenAPI 或数据库 migration。

## 验收标准

### P0

- [ ] authenticated V3 detect 对中文、emoji、纯数字、`24/7`、控制字符返回 400 `invalid_headword`，且无 detection/snapshot 可消费状态。
- [ ] 合法英文、全角拉丁、允许的撇号/连字符/逗号短语保持当前归一化与 detection 行为。
- [ ] 伪造或历史非法 detection 不能通过 create 落库。

### P1

- [ ] 所有 V3 issue/error 只显示中文产品文案，不显示原始英文、UUID 或状态码。
- [ ] 不存在词条只发一次确定性 GET，显示中文 404 状态。
- [ ] draft 不能进入晚于 `max_reachable_step` 的步骤，四类入口一致。
- [ ] V3 wizard 在 390/768/1024/1440 使用与创建页一致的 workspace 断点。
- [ ] 本轮 246 项定向 Admin 测试恢复全绿，且未删合法业务标题。

### P2

- [ ] 全部列表筛选可通过 URL 刷新/前进/后退恢复。
- [ ] Step 4 不再产生 antd `List` deprecated warning。
- [ ] Vite config 不再产生两个无扩展名 import 告警。

### Step 4

- [ ] 五种状态的信息层级和主动作清晰、互斥。
- [ ] “已发布”不再作为“所属语言”下面的普通元数据，而位于独立状态区。
- [ ] 关键发布信息在 1440/1024 首屏可见；390/768 可通过短滚动到达，主动作保持可用。
- [ ] 长词、多 POS、多 sense、多 relation、多 publication 下仍可扫描，无页面级横向溢出。
- [ ] 发布/激活/历史/关系的现有请求与数据行为不变。
- [ ] 视觉方案经用户单独评审通过后才进入实现。

## 开放问题

1. Step 4 桌面端最终采用“摘要 + 内容双栏”还是“状态头 + 内容 tab”，需在视觉方案阶段给出两套低保真对比后确定。
2. published dirty 状态下，首要动作是“继续编辑”还是“检查发布条件”，需要设计方案结合 issue/dirty 状态明确。
3. publication history 是常驻一级区、右侧抽屉还是独立 tab，需要以多版本数据量和移动端体验评审。

除以上视觉决策外，P0/P1/P2 的修复口径已具备实施条件。两份评估文档批准前，工作停留在纯文档阶段。
