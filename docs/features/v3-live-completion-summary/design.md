# V3 完成情况实时摘要：技术设计

状态：2026-09-05 完整方案已实现、验证并差量整合到 `/Users/darwish/Dev/tsz-core/tsz` 的本地 `dev` 未提交工作区。源 worktree `/Users/darwish/.codex/worktrees/v3-live-completion-summary/tsz` 保留；整合同时保留了 `dev` 后续完成的 UD 共用拼写与双发音修复。独立 Review 提出的 UD 拼写错误定位和用户修订的例句等级显示规则已实施并通过复核，最终质量门通过。

## 依赖图与关键路径

`现有 word + draftForms/draftMeanings + dirtySteps → 统一摘要派生 → V3ProductProgressList 分组展示 → 四步接入 → 统计/实时/定位与视觉验收`

词性名称旁路：复用页面的词性目录查询与缓存 → 传入摘要派生；不因输入发请求。

| 部分                         | 现状分类             | 本次剩余工作                                                                            |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| 草稿及跨步保留               | 已实现，可直接复用   | `V3WordCreationWizard` 已维护两份本地 draft；不增副本或保存状态机。                     |
| 七项总数、完成标识、问题定位 | 已实现，可复用       | `buildV3ProductProgress` 已存在；保留 key/target/计数口径，增加明细和准确状态呈现。     |
| 词义卡标题摘要               | 已实现，小改复用     | 将局部 `definitionSummary` 提取为纯函数供标题与左栏共用，保留原取首条定义的语义。       |
| 语言/方言标记与词性目录      | 直接复用，加展示映射 | 读取 `word.language`、draft 类型配置、目录名称和现有色点；不新增端点。                  |
| 分组明细与响应式             | 真正新增             | 七组子行、词性小计、编号摘要、等级分桶；局部 CSS。                                      |
| 第一步摘要                   | 需统一的小改         | `V3BasicsStep` 另有八行旧统计，只读 `word`；改成同一 builder，接当前 draft/dirty 状态。 |
| 后端与数据库                 | 无依赖               | 无实现改动、迁移或接口提案。                                                            |

预计剩余：两份文档评审后实现与验证 60–90 分钟。已完成的草稿机制、工具栏样式不重做。主要风险是第一步遗漏实时数据、计数被变体重复放大、窄屏旧七列样式覆盖新明细。若实际超过该区间上限 50%，在安全节点报告原因与最小下一步，不继续静默扩张范围。

## 已核实的真实入口

- `V3WordCreationWizard.tsx` 持有 `draftForms / draftMeanings / dirtySteps`，变更词性时已调用 `ensureV3MeaningsForForms` 同步词义归属；forms/meanings/preview 把 draft 传入 `V3WordCreationLayout`。
- `V3WordCreationLayout.tsx` 使用 `buildV3ProductProgress`，目前只向列表传标题、完成标记和总数；点击使用稳定 UUID target，不需重写。
- 可编辑 basics 在 Wizard 中直接返回 slot，绕过上述 Layout；`WordWizardV3.tsx` 的 `V3BasicsSlot` 目前只把 `context.word` 传入 `V3BasicsStep`，因此要补传现有实时状态。
- 这里的问题是第一步摘要读取服务端旧内容，并非实际输入丢失；Wizard 已保留两份 draft，不限制用户返回第一步。
- `V3ProductProgressList.tsx` 目前每行一个三列按钮，适合扩展为「标题按钮 + 子明细」，不适合直接把全部明细放入按钮。
- 当前契约 `packages/types/src/admin-word-v3.ts` 的 `EnglishLanguageV3 = "en"`，`AdminWordV3.completed_steps` 明确代表服务端完整性校验结果。
- `WordCreationLayout.tsx` 的旧 `word-summary-entry-card` 同时包含「当前词条」、词条标题、静态 `English` 及可选状态标签；V3 隐藏这一整块，让语言信息只在新摘要中展示。返回按钮位于该块之前，面包屑位于外部，分别保留；旧 V2 默认保持原样。

## 派生模型与状态流

扩展现有 `buildV3ProductProgress` 的输入：增加实际 `language`、词性名称查找信息、`dirtySteps`。输出保持原七个稳定 key（`dialect` key 不改，仅 label 改「语言识别」）、index、count/value、completed、target；新增简单分组明细数据。不建立可任意递归的通用树、共享全局 store 或后端 DTO。

- 总数与小计在同一派生过程生成；用 `pos_id` 把 meanings 与 forms 对齐，组的顺序跟随 forms 的编辑顺序。没有可匹配词性的数据不得静默丢失：保留内容并显示未识别词性，不把该组误标成已完成。
- 使用实际 `pos.code → catalog.name_zh/name_en`；目录未就绪时复用现有 `partOfSpeechLabel` 的已知名称，未识别 code 保留可辨认兜底。`usePartOfSpeechCatalog` 现有 query key 和 5 分钟缓存不变，可上移到页面一次获取并传入各处，不增加另一个目录请求入口。
- 语言名称从当前 code 通过平台语言名称格式化能力得到中文与英文展示名；未知 code 兜底原 code/未识别语言，不兜底英语。wire 类型不因此放宽。
- 英美判断从当前 `draftForms.pos[].dialect_rules` 的 spelling/phonetic 模式得出。任一明确区分时显示 uk/us，两者都统一或尚无配置时不制造子行；不借用管理员偏好或拼写相等来判断类型。
- 词义摘要复用提取后的首条定义摘要函数；语义区间用 `name_zh.trim() || name_en.trim()`；两类都保留待填写提示。富文本只读 `.text`，不渲染 HTML 或回写截断内容。
- 例句按各 `sense.sentences` 节点计数，用已有 CEFR 选项顺序分桶后过滤数量为 0 的等级；非标准/空等级仅在实际存在时进入末尾的未分级桶。英文变体和 `zh_translations` 不参与数量累加。
- completed 以当前 `completed_steps` 为依据，forms 相关行在 forms dirty 时、meanings 相关行在 meanings dirty 时暂不展示完成勾；不由 count > 0 推断完成。原 issue target 仍用于点击定位；不清除或改写 publication issues。
- 派生只读取输入，不排序或修改原数组。可按 draft/目录/完成状态引用 `useMemo`；不 debounce 输入、不 deep-clone 全词条、不维护第二份摘要状态。

## 接入与文件影响

| 文件（均在 `apps/admin/src` 下）                                                          | 计划改动                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/dictionary/word-creation-v3/readiness.ts`                                       | 扩展已有进度 builder、明细类型与计数分组；保留导航语义。                                                                                        |
| `features/dictionary/word-creation-v3/presentation.ts`、`meaningsModel.ts`                | 按实际归属放语言名称映射、共用词义摘要纯函数，避免复制标题逻辑。                                                                                |
| `features/dictionary/word-creation-v3/components/V3ProductProgressList.tsx`               | 标题按钮及分组明细，未完成状态说明、文本省略。                                                                                                  |
| `features/dictionary/word-creation-v3/V3WordCreationLayout.tsx`                           | 传实际 language/draft/dirty/目录，消费完整行；原导航保留。                                                                                      |
| `features/dictionary/word-creation-v3/V3BasicsStep.tsx`                                   | 删除重复旧统计，改用共同派生与列表；接实时输入。                                                                                                |
| `features/dictionary/word-creation-v3/V3WordCreationWizard.tsx`、`pages/WordWizardV3.tsx` | 仅补目录/摘要所需 props 与 basics slot 状态传递，复用现有 context，保存与冲突流程不改。                                                         |
| `features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep.tsx`                      | 仅把现有局部词义摘要改用共用纯函数，保持卡片标题含义。                                                                                          |
| `features/dictionary/word-creation/WordCreationLayout.tsx`                                | 给 presentation 增加可选的旧词条摘要显示开关，默认保留；V3 传 false，仅移除 `word-summary-entry-card`，返回入口、页面面包屑及 V2 默认界面不变。 |
| `features/dictionary/word-creation-v3/v3-layout.css`                                      | 仅详细摘要的明细缩进/列布局/溢出，保留已确认的样式改动。                                                                                        |
| 相关现有 `.test.tsx/.test.ts`                                                             | 更新名称与展示预期；补有回归价值的统计和跨步实时验证。                                                                                          |

`@tsz/types / @tsz/api-client / @tsz/shared / @tsz/voice-editor` 本功能无需改动。当前 `packages/voice-editor` 未提交修改属于之前已确认的工具栏任务，保留但不扩展。

## 展示与响应式

每组使用固定结构：图标/标题/右侧数值的现有按钮，下面明细对齐标题左边缘。数量小计右对齐；词义下按词性再缩进一层。明细不变成嵌套按钮，标题仍响应原 onSelect，readOnly 禁用逻辑保留。

V3 左栏只渲染「返回智能词库」与「完成情况」摘要。`V3WordCreationLayout`、`V3BasicsStep` 同时关闭旧词条信息卡；不再传入无用途的 summaryHeadword JSX，删除因此孤立的 V3 左栏标题组件。用于面包屑/正文的词条名派生保留。返回按钮仍使用原导航函数，不新建未保存拦截逻辑或绕过已有保护。

V3 专用类覆盖现有窄屏七列摘要规则：有详细明细时中等宽度两列、小屏单列。桌面沿用现有侧栏宽度，文案使用 `min-width:0` 和单行省略，完整文字通过原生 title 或 antd Tooltip 提供。不添加默认折叠、虚拟列表、筛选、导出或新计数接口；所有明细均可随页面滚动到达。

## 请求、契约与安全

没有新接口、新权限、后端提案、snake_case wire 变更或数据库操作。沿用已有详情/目录读取和保存端点；输入只派生展示，不触发 get/validate/save。未知或不支持的后端响应继续按现有契约失败处理，不能为展示多语言放宽解析器。

不使用参考图数值补缺。不因派生明细而设置编辑数据、dirty 状态或完成状态；不写 localStorage、不发埋点、不暴露额外敏感数据。

## 最小验证策略

| 证据层                      | 必须证明的风险                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯函数定向测试              | 多词性分组；base 排除；共享 form 不重复；英美 grammar 按结构计；词义/定义区别；例句按自身等级且多译文不膨胀；总数等于小计；空/长/未知名称兜底；不改输入数据。 |
| 现有 Layout/Wizard 集成测试 | 未保存输入/增删/重排立即更新；跨回 basics 不丢明细；完成勾不提前确认；七组现有定位和只读状态不回归。复用已有草稿保留/失败用例，不复制保存状态机测试。         |
| 浏览器隔离验收              | 构造真实 wire 形状的完整参考层级，核对通用/英美、空态、长文本、省略、桌面/两列/单列，无 API 增量请求。使用隔离页/测试数据，不修改用户正在编辑的词条。         |
| 合规检查                    | 受影响测试先跑；完成时一次 Admin typecheck/lint/build 与仓库要求质量门，不绕过 hooks 或降低门槛。无新接口故不新增契约/e2e配额。                               |

用户当前页只读查看热更新效果，不主动刷新、切词条类型或保存。涉及 Wizard 热更新可能重挂载时先保全现场并用隔离页验证，再安排用户可安全看到结果的时机。

## 取舍、风险与回退

- 选择「本地实时明细 + 权威完成状态」；不在输入时请求后端校验，也不把已有 POS 未填计数当作完整发布校验。
- 统一四步的数据派生，避免只修改当前 meanings 页面而留下 basics 的旧八项统计。
- 不建设多语言后端能力；当前实际支持英语的限制直接写明。新语种的正式接入是独立功能。
- 最大布局风险是明细变长与旧窄屏规则冲突；优先用真实长内容验证，出现实际性能问题再调整，不预建复杂抽象。
- 以本功能 diff 为回退单位；保留本任务此前七个文件的未提交样式改动。用户最终要求独立 worktree；所有实现只在上述功能工作区，验收使用独立端口，不提交/推送/部署。

## 已确认的评审结论

用户已确认按「统一派生与口径 → 分组列表/四步接入 → 定向验证与视觉验收」完成完整范围，包括七组规则、脏步骤完成状态、语言契约边界、已创建 V3 向导范围与上述影响文件；没有后端阻断项。

## 实施结果

- 七组摘要由 `buildV3ProductProgress` 对当前 `draftForms / draftMeanings` 单向派生，四步复用同一份结果；未增加摘要状态、保存或校验请求。
- 词性目录查询提升到页面入口，向导摘要与词义编辑器共享同一查询结果和缓存，不再为摘要增加请求入口。
- V3 左栏保留原返回入口，删除旧词条/语言信息卡；面包屑与页面标题继续展示词条名。
- 已在独立 `3002` 服务的真实登录词条和无后端隔离样例中验证桌面、平板双列、手机单列、长文省略、实时输入、英美类型及返回第一步。
- 源功能聚焦 5 个测试文件 152 项通过；整合后实时摘要与 UD 修复的测试并集 7 个文件、232 项通过。
- 最终本地 `dev` 整合状态已通过根 typecheck、lint、Admin production build，以及 171 个文件、2870 项测试的 `test:cov` 完整门。
- `3001` 真实登录词条已验证实时摘要，隔离 fixture 已验证摘要与 UD 共用拼写、英美双发音同屏；未修改真实词条数据。
- 未暂存、提交、推送或部署；源 worktree 保留。
