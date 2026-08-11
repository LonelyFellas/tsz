# 新建单词流程重构：测试矩阵

## 自动化矩阵

| ID  | 层级             | 场景                         | 输入/前置条件                                                     | 预期行为                                                                                                     | 优先级 |
| --- | ---------------- | ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| T01 | contract         | V2 endpoint method/path/body | detect/create/impact/save/validate/publish/dialect suggestion     | 相对 `/admin` 路径、snake_case body 与设计一致；proposal 进入 PENDING                                        | P0     |
| T02 | unit/mock        | `center` 检测成功            | AmE 输入，词典匹配 `centre / center`，查重 clear                  | 返回完整 suggestions、source_dialect=us；检测本身不创建资源                                                  | P0     |
| T03 | unit/mock        | 检测阻断矩阵                 | duplicate、phrase、not_found、builtin/smart unavailable、expired  | 各状态可区分；不可创建；错误与业务状态符合契约                                                               | P0     |
| T04 | integration/mock | 幂等创建 V2 草稿             | 同 detection + 同 idempotency_key 重试                            | 返回同一 ID/revision；完整 detection snapshot；统计只增加一次                                                | P0     |
| T05 | unit/UI          | 共享 base 与多词形组         | `far` 的 farther/further 两组；切换拼写/音标规则                  | base 拼写只读且不分叉；slot ID/顺序稳定；强制联动正确                                                        | P0     |
| T06 | unit/mock        | forms save 与 complete       | 不完整 save、完整 complete、stale revision、重复 operation_id     | save 可存不完整；complete 推进；409 不覆盖；重试返回相同结果                                                 | P0     |
| T07 | integration/UI   | 第 1 步检测与建草稿          | 点击检测、修改输入产生 stale response、重复/短语/失败             | 只在点击时请求；旧响应不显示；阻断态不可继续；错误保留输入                                                   | P0     |
| T08 | integration/UI   | 第 2 步编辑与保存            | 新增/删除 POS、组、slot、读音；save/complete 失败                 | 可编辑结构与 wire 对齐；失败保值；成功后才推进                                                               | P0     |
| T09 | unit/UI          | 文本 variant 状态与手工保护  | ready/missing、生成建议、取消预览、manual 目标值                  | 已有切换不请求；missing 明确；确认后写 converted；不静默覆盖 manual                                          | P0     |
| T10 | unit/mock        | meanings 与 focus/context    | 四种释义、例句、固定 focus、可选 context、关系词                  | 稳定 ID；恰好一个 focus；目标 word/sense 均保存                                                              | P0     |
| T11 | unit/mock        | 发布完整性与幂等             | 缺 grammar/中文释义/方言/发音/focus；完整草稿；响应丢失重试       | issues 可定位；不完整不发布；完整变 published；同 key 不重复副作用                                           | P0     |
| T12 | integration/mock | 列表/统计/详情闭环           | 草稿创建、刷新、发布、删除                                        | 同一数据源立即可读；创建计数一次；publish 不重复计数；ID 不变化                                              | P0     |
| T13 | integration/UI   | V1/V2 路由矩阵               | V1、V2 draft 各 reachable step、V2 published、V2 误入 legacy edit | 分别编辑/继续创建/查看；不可达路由归一；V2 不进入旧整树编辑器                                                | P0     |
| T14 | unit/build       | feature/mock flags           | 默认 dev/test、默认 production、显式 true/false、非法值           | dev/test 默认新向导+mock；显式 test mode 优化构建允许 mock；production mode 默认真实且 mock=true fail closed | P0     |
| T15 | integration/UI   | 草稿恢复与未保存离开         | 保存后硬刷新；未保存时 step/back/刷新/关闭                        | 恢复最后成功 revision；未保存修改触发确认                                                                    | P1     |
| T16 | unit/mock        | storage 隔离与损坏恢复       | schema 不兼容、坏 JSON、不同 admin profile、登出                  | 清理损坏/旧版本；namespace 隔离；不存凭据                                                                    | P1     |
| T17 | integration/UI   | 权限和 HTTP 错误             | 401/403/409/410/413/422/500                                       | 统一鉴权或稳定错误反馈；revision conflict 不覆盖；field issue 可定位                                         | P1     |
| T18 | component/manual | 可访问性与大数据             | 键盘排序、焦点、读屏标签、38 词义/38 例句                         | 控件有可访问名；新增/错误聚焦可预测；折叠内容不造成明显全量重渲染                                            | P1     |
| T19 | e2e              | `center` 四步发布主流程      | admin route mock + contract-shaped words mock                     | 从列表创建，经四步提交，回列表看到 published，查看进入 V2 preview                                            | P0     |
| T20 | e2e              | 阻断与恢复关键支线           | duplicate；中途刷新；保存失败后重试                               | duplicate 不可继续；刷新恢复；失败保值且成功后推进                                                           | P1     |

## 词性配置追加矩阵（2026-08-08）

| ID  | 层级           | 场景                      | 输入/前置条件                                                       | 预期行为                                                                                 | 优先级 |
| --- | -------------- | ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| T21 | unit           | catalog lookup 与稳定排序 | 基本/细分配置乱序、未知 code、重复当前词性                          | 按 sort_order 稳定排序；中文解析正确；未知回退 code；新增列表排除已用项                  | P0     |
| T22 | unit/mock      | 默认目录种子              | 新管理员首次初始化 Mock                                             | 11 个基本词性、19 个细分词性及所属关系完整，catalog_version 有效                         | P0     |
| T23 | unit/mock      | 基本词性 CRUD 与唯一性    | 新增、改名、排序、重复 code/中英文名、旧 revision                   | 成功结果与 wire 同形；冲突分别返回 409；code 编辑态不可修改                              | P0     |
| T24 | unit/mock      | 细分词性 CRUD 与所属关系  | 在 noun 下增改删细分词性、重复 code、旧 revision                    | catalog 同步更新；细分项只属于指定基本词性；冲突/并发错误稳定                            | P0     |
| T25 | unit/mock      | 引用计数与删除保护        | V1/V2、draft/published、word/phrase、sense 引用；过期 base_revision | 基本/细分 usage_count 实时派生；引用中返回 409；过期删除不落库；未引用基本项级联删除子项 | P0     |
| T26 | unit/mock      | 配置持久化与会话隔离      | 刷新、坏 JSON、schema 变化、不同管理员、登出                        | 修改可恢复；损坏/旧版清理；管理员隔离；不存凭据                                          | P0     |
| T27 | contract       | 词性配置 endpoint 契约    | catalog/list/基本 CRUD/细分 CRUD 共 9 个端点                        | method/path/body 正确；两个 DELETE 必填 base_revision query；契约保持 PENDING            | P0     |
| T28 | integration/UI | 菜单、路由与权限          | super_admin、普通 admin、直达配置 URL                               | 超管看到并可进入；普通 admin 不见入口且直达显示 403                                      | P0     |
| T29 | integration/UI | 配置列表主流程            | 搜索、分页、新增、修改、删除未引用项                                | 表格与反馈正确；提交 loading；成功刷新；删除二次确认                                     | P0     |
| T30 | integration/UI | 配置列表错误路径          | catalog/list 失败、409 in-use、409 revision、in-use 无 meta、500    | 保留当前数据；错误提示不依赖 detail/usage_count；可重试；竞态后刷新引用数量              | P0     |
| T31 | integration/UI | 细分词性页内面板          | 选择 noun、增改删、已有 sense 引用                                  | 仅显示 noun 子项；CRUD 正确；被引用项删除禁用且 409 可恢复                               | P0     |
| T32 | integration/UI | 基本词性动态进入业务页面  | 新增自定义基本词性，再打开列表筛选与 forms 添加器                   | 均使用最新 name_zh；保存 wire 仍是稳定 code；同词条不重复                                | P0     |
| T33 | integration/UI | 细分词性按基本词性过滤    | noun/verb 各自配置不同细分词性                                      | meanings 的 selector 只显示当前 POS 所属细分项                                           | P0     |
| T34 | integration/UI | 未知检测词性与目录失败    | detection 返回未知 code；catalog 请求失败                           | 未知建议阻断建草稿；已有内容回退 code；新增/选择控件禁用并可重试                         | P0     |
| T35 | e2e            | 配置到词条的关键闭环      | 超管新增基本+细分词性 → 创建词条引用 → 返回删除                     | 新配置可选；中文显示；引用后删除被阻断                                                   | P1     |
| T36 | manual         | 视觉与长列表              | 1200/1440/1920px、50 条分页、长中英文名、页内表格滚动               | antd 布局无截断/横向溢出；禁用说明和危险确认清晰                                         | P1     |

## 配置页双 Tab 与创编选择层级矩阵（2026-08-08 修订）

| ID  | 层级           | 场景                           | 输入/前置条件                               | 预期行为                                                               | 优先级 |
| --- | -------------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| T37 | integration/UI | 配置页 Tab 位置与命名          | 超管进入“系统设置 → 词性配置”               | 标题下方显示“基本词性 / 细分词性”；默认激活基本词性                    | P0     |
| T38 | integration/UI | 基本词性配置视图               | 激活“基本词性”                              | 显示基本词性搜索、分页、新增、修改、删除；不展示页内细分列表           | P0     |
| T39 | integration/UI | 细分词性配置视图               | 激活“细分词性”，目录含 noun/verb            | 显示所属基本词性筛选与细分列表；默认首项；可切换 parent                | P0     |
| T40 | integration/UI | 细分词性页内 CRUD              | noun 下新增、修改、删除未引用细分项         | 操作都携带 noun id；成功刷新目录；引用项删除禁用                       | P0     |
| T41 | integration/UI | 词形步骤只使用基本词性         | 进入第 2 步，catalog 含基本和细分项         | 仅显示/添加基本词性；页面无配置层级“细分词性”Tab，不保存 forms.sub_pos | P0     |
| T42 | integration/UI | 词义步骤选择细分词性           | noun 与 verb 分组分别进入第 3 步            | 每个词义显示细分词性选择器；noun 只列 noun 子项，verb 只列 verb 子项   | P0     |
| T43 | unit/mock      | 细分词性归属校验               | noun 词义提交 verb 的细分 code              | 返回 422 `invalid_sub_part_of_speech`，草稿不被错误覆盖                | P0     |
| T44 | integration/UI | 中文展示与未知编码回退         | 正常 catalog、catalog 失败、历史未知 code   | 正常显示中文；失败时已有内容回退稳定 code；新增/选择被禁用并提供重试   | P0     |
| T45 | regression     | 单词/短语入口不受配置 Tab 影响 | 点击创建单词/创建短语                       | 单词继续进入 V2 单词向导；短语保持既有流程；不以配置 Tab 改写 kind     | P0     |
| T46 | manual         | 配置页长列表视觉               | 1200/1440/1920px、长名称、多项基本/细分词性 | Tab、筛选、表格、Modal 无截断或页面级横向溢出                          | P1     |

## 语义区间中英文双名矩阵（2026-08-09 修订）

| ID  | 层级           | 场景                     | 输入/前置条件                                | 预期行为                                                                   | 优先级 |
| --- | -------------- | ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| T47 | type/contract  | V2 双语语义区间 wire     | meanings 含 `name_zh` / `name_en`            | V2 原样 snake_case 透传；legacy V1 `name` 类型与保存不变                   | P0     |
| T48 | integration/UI | 默认与编辑双语名称       | 首次进入第 3 步，分别填写中文和英文          | 默认已有首行且无红星；左侧用圆圈数字排序且头部无醒目“必填”；保存刷新可恢复 | P0     |
| T49 | unit/mock      | save/complete 校验       | 缺中文、缺英文、空白、超 200 字符、双侧有效  | save 可保留半成品；complete/validate/publish 拒绝无效值并精确定位字段      | P0     |
| T50 | integration/UI | 删除被词义引用的双语区间 | 被引用区间之外仍有另一区间                   | 显示影响确认；确认后删除并改绑到第一个剩余区间，词义内容保留               | P0     |
| T51 | regression     | V1 编辑器兼容            | 打开并保存只含 `{ id, name }` 的 legacy 词条 | 旧语义区间单名交互与 wire 不变，不要求或伪造中英文双名                     | P0     |
| T52 | manual         | 双输入响应式与长名称     | 1200/1440/1920px、接近 200 字符的中英文名称  | 输入、删除按钮和下拉无页面级溢出；窄内容区可换行且标签仍清晰               | P1     |
| T53 | unit/UI/mock   | 区间与引用必选           | 空草稿、新增词义、缺失/悬空 `sense_group_id` | 自动创建首区间并默认绑定；Select 不可清空；complete 拒绝缺失/悬空引用      | P0     |
| T54 | integration/UI | 至少保留一个区间         | 当前仅有一个区间                             | 删除按钮禁用并提示至少保留一个，不产生空区间列表                           | P0     |
| T55 | integration/UI | 左侧完成情况统计         | 无 word、空旧草稿、一个或多个语义区间        | 分别显示“语义区间 0/1/N”，位置在词形变化与语法结构之间                     | P0     |
| T56 | integration/UI | 语法结构简洁排序         | 一个或多个语法结构，拖动第 2 条到第 1 条     | 左侧仅显示圆圈数字；无“结构 N”、头部说明和上下箭头；拖动后保存顺序已更新   | P0     |
| T57 | integration/UI | 语法结构语音操作         | 英式/美式或默认语法结构，编辑态与只读态      | 每个输入显示播放、获取、上传图标；编辑态可操作获取/上传，只读态全部禁用    | P0     |

## 第 3 步全局方言选择与自动补全矩阵（2026-08-09）

| ID  | 层级           | 场景                           | 输入/前置条件                                                     | 预期行为                                                                                                          | 优先级 |
| --- | -------------- | ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| T58 | unit/model     | 收集缺失目标方言项目           | 跨 POS 的英文释义/例句含 missing、ready、空源、中文内容和 grammar | 只返回目标 missing 且源侧 ready 非空的 definition/example；稳定 `client_id + field_kind`；无 grammar              | P0     |
| T59 | unit/model     | 安全写回批量建议               | 完整、部分、重复、未知 ID、错误 field_kind、请求后目标已手填      | 只写类型匹配且当前仍 missing 的目标并标记 converted；其余跳过；原对象不变                                         | P0     |
| T60 | integration/UI | 选择器显示、默认值与单方言视图 | distinguish 源为 us；unified；跨基本词性 Tab；只读页              | 选择器位于语义区间上方；区分模式默认美式且每字段只显示当前方言；跨 Tab 共用；unified 无选择器；只读可切换但不生成 | P0     |
| T61 | integration/UI | 完整目标零请求与缺失目标单批次 | 目标已完整；多个英文释义和例句缺失；存在语法结构                  | 完整目标纯切换零请求；缺失目标仅一次请求且 items 覆盖 definition/example，不包含 grammar/ready/中文               | P0     |
| T62 | integration/UI | 自动补全成功、部分成功与失败   | 批量响应完整/缺项/错误类型；请求 reject；再次重试                 | 合法项回填并提示数量；未命中项保留 missing；失败不改内容且可重试；补全写入后 dirty 可保存                         | P0     |
| T63 | integration/UI | 手工保护与响应竞态             | 请求期间目标被手填；已有 manual/converted/dictionary；重复切换    | 选择器请求期间禁用；ready 目标不入请求且旧响应不覆盖；不产生第二个并发批次                                        | P0     |
| T64 | manual         | 多词义长页面与慢请求视觉       | 1200/1440/1920px、多个 POS/词义、长文本、慢响应                   | 工具条不跳动；当前方言清晰；切换不改变语法结构双栏；加载和部分成功提示不遮挡底部操作                              | P1     |

## 执行约束

- 所有 P0 均自动化；视觉细节和真实浏览器缩放补手工检查。
- API client 先跑 contract/unit；admin 先跑纯模型与 mock，再跑组件/路由，最后跑 admin E2E。
- 覆盖率按仓库现有阈值执行，不降低阈值、不把新增逻辑加入排除项。

## 实施验证（2026-08-02）

- T01–T18 已由 contract、unit、component、integration 与 build 测试覆盖；全仓 `pnpm test:cov` 通过 91 个测试文件、939 个用例。
- 全仓覆盖率为 Statements 97.91%、Branches 93.36%、Functions 97.66%、Lines 99.31%，未调整阈值或排除新增逻辑。
- T19–T20 已落地 admin Playwright 场景；实现阶段运行 3/3 通过，最终合并门禁交由 CI 执行。
- 已在 1280px 真实浏览器视口手工检查主流程、保存后刷新恢复、方言双栏和长表单布局；页面宽度与视口一致，无横向溢出。

## 词性配置手测清单

- [ ] 1200px、1440px、1920px 下检查列表列宽、分页、Modal 与细分词性页内面板，无页面级横向溢出。
- [ ] 使用超长中文名、英文名和缩写验证省略/Tooltip，不挤压操作列。
- [ ] 新增一个未被词典建议覆盖的基本词性，确认第 2 步可选择且其他业务页面只显示中文名。
- [ ] 修改已被多个词条引用的中文名，确认词条内容 revision 不变化而展示更新。
- [ ] 模拟两个标签页同时编辑同一配置，确认旧 revision 提交被阻断且可刷新恢复。

## 语义区间中英文双名实施验证（2026-08-09）

- T47–T57 已由 V2 类型检查、组件集成测试、mock 校验/发布测试和 V1 回归测试覆盖；全仓 `pnpm test:cov` 通过 97 个测试文件、1051 个用例。
- 全仓覆盖率为 Statements 94.68%、Branches 90.87%、Functions 93.78%、Lines 96.03%；admin 分支覆盖率通过 90% 门槛，未降低阈值或新增 coverage exclude。
- `pnpm typecheck`、`pnpm lint`、`pnpm build` 全部通过；admin 与 web 生产构建均成功。
- 已在 1520px 本地真实页面验证：头部无醒目必填标签、每行左侧使用圆圈数字、中英文输入同排且各 348px、最后一项删除禁用，页面宽度与视口一致且无横向溢出。

## 基本/细分词性配置 Tab 手测清单

- [ ] 在 1200px、1440px、1920px 下检查词性配置页“基本词性 / 细分词性”Tab、筛选器和表格间距。
- [ ] 切换所属基本词性，确认细分列表、空状态和新增弹窗的所属关系正确。
- [ ] 在第 2 步确认只能添加基本词性；在第 3 步确认每个词义只能选择所属基本词性下的细分词性。
- [ ] 使用超长基本/细分词性中文名检查 Select、表格省略和 Tooltip。

## 第 3 步全局方言选择手测清单

- [ ] 在 1200px、1440px、1920px 下检查“英式 / 美式”工具条、单方言释义/例句输入和语法结构双栏，无横向溢出或切换跳动。
- [ ] 使用多个基本词性和多个词义切换方言，确认选择跨 Tab 共用且只发一个批量请求。
- [ ] 模拟慢请求时反复点击选择器和重试，确认控件禁用、无重复请求、响应只写目标方言。
- [ ] 模拟部分建议与服务失败，确认合法项保留、缺失项可手填/重试，保存草稿后刷新恢复。

## 真实 lexicon 对接（2026-08-11）

| 优先级 | 场景                                                                                                                                                                                             | 自动化文件                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0     | 10 个 lexicon method/path、请求 body、`Idempotency-Key` header 与最终 OpenAPI；`has_unpublished_changes` 必填 boolean、`published_revision` 可省略但不可 null                                    | `packages/api-client/src/admin.test.ts`、`packages/api-client/src/http.test.ts`、`packages/api-client/src/endpoints.contract.test.ts`、`packages/api-client/src/openapi.snapshot.json`                                                                                                                                                     |
| P0     | 文本节点稳定 ID：保留已有 `TextVariantV2.id`、`content_id`、`zh_text_id`，新增时生成；forms/meanings draft → wire 剥离音频与 relation 只读快照，过滤不完整 relation/context；缺省确认 token 省略 | `apps/admin/src/features/dictionary/word-creation/model.test.ts`、`apps/admin/src/features/dictionary/word-creation/FormsAndPronunciationStep.test.tsx`、`apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.test.tsx`                                                                                               |
| P0     | token refresh retry 后仍保留同一 `Idempotency-Key`；创建与发布命令不把幂等键混入 JSON body                                                                                                       | `packages/api-client/src/http.test.ts`、`packages/api-client/src/admin.test.ts`、`apps/admin/src/features/dictionary/word-creation/api.test.tsx`                                                                                                                                                                                           |
| P0     | 已发布词条默认只读；显式“继续编辑”恢复未发布修改并再次发布；真实 related search 只能选取完整 `word_id + sense_id`                                                                                | `apps/admin/src/features/dictionary/SmartDictionary.routing.test.tsx`、`apps/admin/src/features/dictionary/word-creation/WordCreationWizard.test.tsx`、`apps/admin/src/features/dictionary/word-creation/PreviewAndPublishStep.test.tsx`、`apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.test.tsx`              |
| P1     | 真实模式隐藏 archive、batch archive、phrase、dialect suggestion，并阻断 legacy create/saveContent/publish/delete 的列表动作与直达编辑路由；mock 模式保留开发能力                                 | `apps/admin/src/features/dictionary/dataSource.test.ts`、`apps/admin/src/features/dictionary/SmartDictionary.routing.test.tsx`、`apps/admin/src/pages/pages.test.tsx`                                                                                                                                                                      |
| P1     | 422 字段定位、409 revision conflict、410 detection expired 均有稳定反馈；连续双击提交只发起一次发布请求                                                                                          | `apps/admin/src/features/dictionary/word-creation/FormsAndPronunciationStep.test.tsx`、`apps/admin/src/features/dictionary/word-creation/MeaningsAndExamplesStep.test.tsx`、`apps/admin/src/features/dictionary/word-creation/PreviewAndPublishStep.test.tsx`、`apps/admin/src/features/dictionary/word-creation/CreateEntryStep.test.tsx` |
