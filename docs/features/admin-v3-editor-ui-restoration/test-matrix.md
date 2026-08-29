# Smart Lexicon V3 管理端编辑器 UI 恢复与统一创建入口测试矩阵

## 依据与范围

- 需求：`requirements.md`
- 设计：`design.md`
- 目标端：`apps/admin`（Vite + React Router + antd v6）
- 契约：现有 `@tsz/types`、`@tsz/api-client` 与 OpenAPI snapshot；本功能不改端点或 wire
- 自动化原则：纯分类下沉单元测试；组件状态与路由使用 Vitest；只保留两条关键 Playwright 创建链；V3 稳定身份、冲突、发布和历史能力优先复用并更新现有测试

## 用例矩阵

| #   | 层                | 场景                                | 输入/前置                                                                                                                     | 预期                                                                                                                                    | 自动化落点                                                    | 优先级                          |
| --- | ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| 1   | 单元              | 空白归一化                          | 首尾空格、连续空格、Tab、换行、NBSP                                                                                           | 去除首尾空白；内部空白统一为一个半角空格                                                                                                | `entryClassification.test.ts`                                 | P0                              |
| 2   | 单元              | 单词分类                            | `center`、`can't`、`rock’n’roll`、`state-of-the-art`                                                                          | 均分类为 `word`，拼写不被改写                                                                                                           | `entryClassification.test.ts`                                 | P0                              |
| 3   | 单元              | 短语分类                            | `give up`、`day in, day out`、含 Tab/换行的双 token                                                                           | 归一化后分类为 `phrase`                                                                                                                 | `entryClassification.test.ts`                                 | P0                              |
| 4   | 单元              | 输入校验顺序                        | 空值、纯符号、中文、归一化后超长                                                                                              | 请求前给出字段错误，不产生 detection                                                                                                    | `entryClassification.test.ts` + `CreateEntryStep.test.tsx`    | P0                              |
| 5   | 路由集成          | 列表唯一入口                        | 打开智能词库列表                                                                                                              | 仅显示“创建词条”；点击进入 `/words/new`                                                                                                 | `pages.test.tsx` / `SmartDictionary*.test.tsx`                | P0                              |
| 6   | 路由集成          | canonical 创建路由                  | `/words/new`                                                                                                                  | 渲染统一创建页，不重定向 V3                                                                                                             | `router.test.tsx`                                             | P0                              |
| 7   | 路由集成          | 旧 V3 深链                          | `/words/new/v3`                                                                                                               | 重定向 `/words/new`                                                                                                                     | `router.test.tsx`                                             | P0                              |
| 8   | 路由集成          | 旧 kind query                       | `/words/new?kind=word                                                                                                         | phrase`                                                                                                                                 | 均渲染统一入口，不显示类型选择                                | `router.test.tsx` / wizard test | P0  |
| 9   | 组件集成          | 单词无警告自动创建                  | V3 detection clear                                                                                                            | 一次提交依次 detect/create，导航 V3 basics 核对已应用建议；无检测按钮或第二次点击                                                       | `CreateEntryStep.test.tsx` / `WordCreate.test.tsx`            | P0                              |
| 10  | 组件集成          | 短语无警告自动创建                  | V2 phrase detection clear、dictionary not_found                                                                               | 一次提交依次 detect/create，直接导航 V2 forms                                                                                           | `CreateEntryStep.test.tsx`                                    | P0                              |
| 11  | 组件集成          | V2 matched phrase                   | detection 返回正式 headwords 与已配置 POS                                                                                     | 自动使用返回 headwords 创建，不要求重复输入                                                                                             | `CreateEntryStep.test.tsx`                                    | P0                              |
| 11a | 组件集成          | V2 matched 建议产品化               | matched fixture 含 distinguish headwords、两个 POS、多词形和多发音                                                            | 显示英美主词、中文词性、词形、地区与实际返回的音标/发音；不显示 `matched`、内部 ID 或原始枚举                                           | `UnifiedCreateEntryStep.test.tsx`                             | P0                              |
| 11b | 组件集成          | V3 matched 建议产品化               | `BuiltinDictionaryEvidenceV3` 含两个 `suggested_pos`，其中一个没有对应 form；其余含多个 base/其他 form、uk/us/common 与多发音 | 每个建议词性都独立显示；显示地区“建议拼写”、中文词性/词形/发音；不生成唯一主词或 compatibility，不把 V3 建议转成 V2                     | `UnifiedCreateEntryStep.test.tsx`                             | P0                              |
| 11c | 组件集成          | 建议展示与自动应用时序              | detect 已返回 matched，create promise 受控未完成                                                                              | 建议摘要先进入可感知区域并在 creating/confirming 期间保留；无冲突时无需第二次点击，create 使用同一 `detection_id`                       | `UnifiedCreateEntryStep.test.tsx`                             | P0                              |
| 11d | 组件集成          | not_found / unavailable 分义        | V2/V3 分别返回 `not_found`、`unavailable`                                                                                     | not_found 明确说明空白草稿并按规则自动继续；unavailable 明确阻断和允许重试，绝不发送 create 或伪装成未命中                              | `UnifiedCreateEntryStep.test.tsx`                             | P0                              |
| 11e | 组件集成          | 重复候选详情与归并                  | 同一 entry 命中多类、多个候选、多页 snapshot，部分上下文含词性/释义                                                           | 每个 entry 一张候选卡；详情显示词面、类型、生命周期、中文原因及响应可提供的词性/释义/来源；键盘可开关，无 ID/code/JSON                  | `UnifiedCreateEntryStep.test.tsx` + `surfaceSnapshot.test.ts` | P0                              |
| 11f | 组件集成          | 冲突确认保留建议                    | matched 建议 + smart duplicate/warning 或 V3 acknowledgement                                                                  | 建议区回答“将预填什么”，冲突区回答“为何需要确认”；阻断/确认期间建议不丢失，普通 matched 本身不产生确认门                                | `UnifiedCreateEntryStep.test.tsx`                             | P0                              |
| 11g | 路由集成          | 创建后来源提示与 canonical 核对     | matched/not_found 创建成功并导航 V2/V3 editor                                                                                 | matched 显示“已根据内置词典预填，请核对”，not_found 显示空白来源提示；实际字段只读 create/detail canonical，刷新不依赖 navigation state | `WordCreate.test.tsx` + V2/V3 wizard page tests               | P0                              |
| 12  | 组件集成          | V2 未知建议词性                     | matched detection 引用目录外 POS                                                                                              | fail closed，说明配置不可用，不发送 create                                                                                              | `CreateEntryStep.test.tsx`                                    | P0                              |
| 13  | 组件集成          | V2/V3 分类回显不一致                | 本地 phrase 但 V2 `entry_kind=word`；V3 request echo 漂移                                                                     | 显示安全错误，不切分支、不创建                                                                                                          | `CreateEntryStep.test.tsx`                                    | P0                              |
| 14  | 组件集成          | V3 surface 确认                     | requires acknowledgement，多页 snapshot                                                                                       | 顺序加载完整快照；终页前禁用确认；确认后携 token 创建                                                                                   | `CreateEntryStep.test.tsx`                                    | P0                              |
| 15  | 组件集成          | V2 surface 确认                     | smart_dictionary warning，多页 snapshot                                                                                       | 展示产品化匹配；不显示 token/ID/code；确认后创建                                                                                        | `CreateEntryStep.test.tsx`                                    | P0                              |
| 16  | 组件集成          | snapshot disabled/error/expired     | policy disabled、加载失败、过期                                                                                               | 不可确认；提供返回修改或重新检查；不发送 create                                                                                         | `CreateEntryStep.test.tsx`                                    | P0                              |
| 17  | 组件集成          | policy/匹配变化                     | create 返回 surface changed/policy changed                                                                                    | 旧确认失效，不自动重发 create；更新后要求重新确认                                                                                       | `CreateEntryStep.test.tsx`                                    | P0                              |
| 18  | 组件集成          | 双提交与旧响应                      | 同 tick Enter+点击、输入修改后旧 detection 返回                                                                               | 每代最多一条创建链；旧响应不改变当前 UI                                                                                                 | `CreateEntryStep.test.tsx`                                    | P0                              |
| 19  | 组件集成          | 幂等未知结果                        | create 网络结果未知，若重新 detect 会返回不同 `detection_id`；另有正式 idempotency conflict / 要求新 key                      | 未知结果不重新 detect，原样重放同一 key 与完全相同 create body；只有正式错误要求时才轮换 key，不宣称误成功                              | `CreateEntryStep.test.tsx`                                    | P0                              |
| 20  | 组件集成          | 工程概念隐藏                        | 统一创建页与确认态                                                                                                            | 无 V3、schema、detection ID、snapshot token、policy code                                                                                | `CreateEntryStep.test.tsx`                                    | P0                              |
| 21  | V3 layout 集成    | 产品化页头与侧栏                    | draft/published/archived、dirty/readiness                                                                                     | 中文状态、步骤完成度、未保存提示正确；无 `revision`/V3 文案                                                                             | `V3WordCreationLayout.test.tsx`                               | P0                              |
| 22  | V3 layout 集成    | 问题去重与定位                      | 重复 issue、未知 location                                                                                                     | 只显示一次；点击正确调用导航；未知问题不误定位                                                                                          | layout + `issueNavigation.test.ts`                            | P0                              |
| 23  | V3 forms 集成     | 同类型多词形与多个 base             | 同一 POS 多个 `form_type=base`                                                                                                | 全部独立显示与编辑，不合并；ID 不变                                                                                                     | `V3FormsAndPronunciationStep.test.tsx`                        | P0                              |
| 24  | V3 forms 集成     | 一形多组                            | 一个 form 被两个 member 引用                                                                                                  | 两组均显示“复用”业务提示；任一处编辑更新同一 form                                                                                       | `V3FormsAndPronunciationStep.test.tsx`                        | P0                              |
| 25  | V3 forms 集成     | 最后使用位置保护                    | 移除最后 member                                                                                                               | 普通移除被拒；显式删除影响确认；不留下 orphan                                                                                           | existing operations + forms component tests                   | P0                              |
| 26  | V3 forms 集成     | 地区结构与多发音                    | common ↔ uk/us、每侧多 pronunciation                                                                                          | 数据与稳定 ID 按现有 mapping 保持；中文 label；不显示 UUID                                                                              | forms component tests                                         | P0                              |
| 27  | V3 forms 集成     | 排序可访问名称                      | 多组、多词形、多发音                                                                                                          | 键盘可触发；aria-label 使用业务序号，不含 UUID                                                                                          | forms component tests                                         | P0                              |
| 28  | V3 meanings 集成  | 业务层级与内部 ID 隐藏              | 多 group/sense/definition/sentence/relation                                                                                   | 显示中文序号卡片；可见/aria 文本无 UUID、raw role/code                                                                                  | `V3MeaningsAndExamplesStep.test.tsx`                          | P0                              |
| 29  | V3 meanings 集成  | 排序删除保持身份                    | 移动/删除非首节点                                                                                                             | payload 使用原稳定 ID；序号随视图变化                                                                                                   | meanings component + `meaningsModel.test.ts`                  | P0                              |
| 29a | V3 meanings 集成  | 主关联与上下文关联                  | 新例句、缺主关联旧草稿、已有 `focus/head`，以及 mixed related-search 返回外部 V2/V3 词条                                      | 新例句原子写入锁定主关联，旧草稿可补全；主关联不可改删；上下文可按词条/释义搜索新增、切换、去重和删除，`role` 与内部 ID 不进入 UI       | `V3MeaningsAndExamplesStep.test.tsx` + `api.test.tsx`         | P0                              |
| 29b | V3 meanings 集成  | 关系正式枚举                        | 选择“派生词”及读取已有 `derivative`                                                                                           | 保存 payload 使用正式 `derivative`，Select 能正确回显中文标签                                                                           | `V3MeaningsAndExamplesStep.test.tsx`                          | P0                              |
| 30  | V3 wizard 集成    | dirty/save/complete                 | forms/meanings 分别修改和保存                                                                                                 | dirty 独立；save 清对应项；complete 仍走 impact/validate                                                                                | `V3WordCreationWizard.test.tsx`                               | P0                              |
| 31  | V3 wizard 集成    | revision 冲突                       | save 409 + server canonical                                                                                                   | 本地输入保留；产品文案无 revision 数字；刷新比较流程不变                                                                                | wizard/layout tests                                           | P0                              |
| 32  | V3 wizard 集成    | 校验问题定位                        | 多步骤、多 POS、多祖先 issue                                                                                                  | 切步骤/Tab、展开祖先并聚焦字段                                                                                                          | wizard + issue navigation tests                               | P0                              |
| 33  | V3 preview 集成   | 业务预览                            | 完整 forms/meanings                                                                                                           | 按业务层级完整展示；无 node ID/type、raw enum/JSON                                                                                      | `V3PreviewAndPublishStep.test.tsx`                            | P0                              |
| 34  | V3 publish 集成   | 校验、影响与 surface                | valid/invalid、impact、surface warning                                                                                        | 顺序和 token/revision 语义不变；UI 使用中文摘要                                                                                         | preview/wizard tests                                          | P0                              |
| 35  | V3 publish 集成   | 发布能力阻断                        | shadow/canary blocked code                                                                                                    | 中文可理解原因，不显示原始 code，不发送非法 publish                                                                                     | preview tests                                                 | P0                              |
| 36  | V3 history 集成   | 产品化历史列表/详情                 | 混合 V2/V3 publications                                                                                                       | 显示“第 N 次发布”等业务信息；无 schema/revision/ID/raw JSON                                                                             | `V3PublicationHistory.test.tsx`                               | P0                              |
| 37  | V3 history 集成   | 历史激活保护                        | V3 eligible、dirty、surface、409                                                                                              | dirty 阻断；确认/幂等/刷新恢复保持；V2 不可激活                                                                                         | existing history tests                                        | P0                              |
| 38  | V3 lifecycle 集成 | published edit / archived read-only | 不同 status 与 mode                                                                                                           | 步骤可达性、只读、归档/恢复行为无回归                                                                                                   | `WordWizardV3.test.tsx` + list tests                          | P0                              |
| 39  | e2e               | 单词统一创建主链                    | mock V3 clear                                                                                                                 | 列表唯一入口 → 输入 → 自动创建 → V3 basics 核对建议 → forms                                                                             | `admin-word-v3.spec.ts`                                       | P1                              |
| 40  | e2e               | 短语统一创建主链                    | mock V2 phrase clear                                                                                                          | 同一入口 → 输入短语 → 自动创建 → V2 forms                                                                                               | `admin-word-creation.spec.ts`                                 | P1                              |
| 41  | 手测              | 四档视觉                            | 1440/1024/768/390                                                                                                             | 无页面级横滚、遮挡或截断；侧栏/单列切换正确                                                                                             | Codex 内置浏览器                                              | 必验收                          |
| 42  | 手测              | 键盘主链                            | 不使用鼠标                                                                                                                    | 可创建、切步骤、Tab/折叠、增删排序、确认、保存和发布检查                                                                                | Codex 内置浏览器                                              | 必验收                          |
| 43  | 手测              | 基础无障碍                          | 焦点、错误、loading、Modal                                                                                                    | 标签可感知；错误聚焦；状态不只靠颜色；Modal 焦点返回                                                                                    | Codex 内置浏览器                                              | 必验收                          |
| 44  | 手测              | 真实后端                            | 本地 tsz-rust 与所需依赖可用                                                                                                  | word/phrase detection、create、save/read-back 与真实契约一致                                                                            | 本地环境                                                      | 条件必验收                      |

## P0 落地映射

- 新增分类逻辑：#1–#4。
- 统一入口与路由：#5–#20，并包含新增的 #11a–#11g 建议 parity 与重复候选守护。
- V3 产品外壳与语义保护：#21–#38。
- 已有 V3 测试可作为 P0 守护，但凡断言依赖原始 UUID、英文工程术语或旧入口，必须改为产品行为断言；不能通过删除原有时序/身份断言让测试变绿。
- 本功能不改 API endpoint 或 OpenAPI，因此不新增契约路径测试；仍运行现有 api-client/runtime guard 相关测试，确认没有被入口重构绕过。

## 手测清单

- [ ] 1440px：摘要侧栏 sticky、主内容和操作栏完整，英美双栏与发音行不挤压。
- [ ] 1024px：侧栏与主区均可用，长词面、错误和按钮正常换行。
- [ ] 768px：单列摘要，英美/发音矩阵降为单列，无页面级横向滚动。
- [ ] 390px：所有输入与主操作可达，Tabs 仅自身滚动，底部操作不遮挡内容。
- [ ] 键盘：从列表进入，输入并提交，完成步骤切换、折叠、Select、排序、确认、保存与发布检查。
- [ ] 焦点：无效输入、服务端 issue、冲突和 Modal 关闭后落点正确。
- [ ] 真实后端可用时分别创建一个单词和短语，保存后刷新读回；不可用时记录端口、响应和阻断原因。

## 执行顺序

1. 先写 #1–#4 分类测试并实现纯函数。
2. 先落地 #11a–#11g，再完成 #5–#20 其余统一入口/路由测试；matched fixture 必须含具体建议内容，禁止只断言状态字符串。
3. 按 forms → meanings → layout → preview/history 更新 #21–#38，逐块跑现有测试。
4. 跑 #39–#40 e2e。
5. 跑 targeted → coverage → typecheck → lint → Admin build。
6. 用 Codex 内置浏览器完成 #41–#44。

## 2026-08-26 执行记录

- [x] 1440 / 1024 / 768 / 390 四档检查均无页面级横向滚动；1024/1440 首轮发现的发音操作区溢出已修复并复验。
- [x] 统一入口在真实浏览器中使用 Enter 完成检测、创建并进入词形编辑；步骤按钮、输入、Select、排序/删除按钮具备中文可访问名称。
- [x] forms、meanings、preview、发布历史与历史详情的可见文本未出现 UUID、`V3`、`membership`、`concrete form`、`word_id` 或 `sense_id`；释义组、语法结构和子词性以产品标签呈现。
- [x] 相关 Playwright 场景 15/15 通过，覆盖统一创建、短语兼容、复杂单词保存刷新、422 定位、surface/impact 确认、发布和历史。
- [ ] 本轮真实 tsz-rust 后端未启动，因此未声称完成真实后端联调；浏览器验收使用仅本机本轮生效的鉴权/API stub 与仓库 fixture，结束后已关闭。

## 2026-08-26 第一阶段 UI parity 返工矩阵

本节只覆盖用户在测试环境验收后指出的第一阶段 UI 回归，不改变统一分类、V3 detect/create、surface token、稳定身份或后续编辑步骤。实现必须直接复用 V2 `CreateEntryStep` 已有的结构语言和 `word-creation.css`，不得再做一套相似页面。

| #   | 层       | 场景                      | 输入/前置                                                                | 预期                                                                                                                                                | 自动化落点                               | 优先级 |
| --- | -------- | ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| 45  | 页面集成 | V3 basics 恢复旧版第一步  | V3 草稿进入 `/words/:id/v3/wizard/basics`                                | 显示 `STEP 01`、`创建新词条`、`录入与检测`、`词典检测结果`、结果双区和底部操作；不再出现 `创建信息` 占位卡或 `未命名词条` 占位文案                  | `WordWizardV3.test.tsx`                  | P0     |
| 46  | 组件集成 | V3 canonical 建议完整呈现 | 两个基本词性、多个 base、common 与 uk/us 变体、每侧多发音                | 以旧版卡片/方言面板层级显示中文词性、词形、英式/美式建议拼写、词典音标和实际发音；不合并同类型词形，不显示 UUID、wire code 或 `V3`                  | `WordWizardV3.test.tsx`                  | P0     |
| 47  | 组件集成 | V3 空白草稿第一步         | `forms.pos=[]`，presentation label 为后端空态占位或 matched surface 可用 | 使用可用词面显示“未找到内置词典建议”的产品空态和后续补充说明；不得把 `未命名词条` 当作用户词条标题；仍可进入词形与发音                              | `WordWizardV3.test.tsx`                  | P0     |
| 48  | 组件集成 | 统一创建入口结构 parity   | 编辑中、matched、not_found、重复阻断、surface 确认                       | 入口直接加载旧版响应式样式；标题、录入卡、检测结果卡、重复候选和确认操作使用 V2 已有结构语言；请求仍分别走原生 V3/V2 契约，不增加 V3→V2 wire 转换   | `UnifiedCreateEntryStep.test.tsx`        | P0     |
| 49  | 行为集成 | basics 只读且不改稳定身份 | 点击“进入词形与发音”，以及浏览 basics 中的多 base/多发音                 | 只切换到 forms；不发送 detect/create/save，不修改 canonical form、variant、pronunciation UUID；既有创建入口仍以同一 `detection_id` 调用 V3 `create` | page/component existing + targeted tests | P0     |
| 50  | 手测     | 第一阶段四档响应式与键盘  | 390 / 768 / 1024 / 1440；键盘进入、查看确认区并继续                      | 旧版结果区在宽屏双列、窄屏单列；无页面级横滚或遮挡；重复候选详情、确认操作和“进入词形与发音”均可由键盘访问                                          | Codex 内置浏览器                         | 必验收 |

## 2026-08-26 Step 1 只检测调整

本节覆盖已批准的两阶段时序调整：Step 1 只检测，管理员明确进入 Step 2 时才创建。以下 P0 用例必须在改业务代码前先写成失败回归，并保留既有建议、surface 与幂等守护。

| #   | 层       | 场景                        | 输入/前置                                       | 预期                                                                                                                                     | 自动化落点                        | 优先级 |
| --- | -------- | --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ |
| 51  | 组件集成 | Enter 只执行检测            | clear 的 V3 word / V2 phrase                    | 调用对应 detect；create 为 0 次；路由不变；Step 1 稳定显示建议与“创建并进入词形与发音”                                                   | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 52  | 组件集成 | 明确进入 Step 2 才创建      | #51 检测完成后点击底部主操作                    | 复用同一 detection；create 恰好 1 次；成功后才按 canonical schema 跳转 V3/V2 Step 2                                                      | component + `WordCreate.test.tsx` | P0     |
| 53  | 组件集成 | 检测与创建分别防双提交      | 检测 pending 连按 Enter/点击；创建 pending 连点 | 每阶段最多一条请求链；创建期间保持 Step 1 结果结构和 loading，不清空建议、不重复 create                                                  | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 54  | 组件集成 | 输入变化使检测结果失效      | 检测完成后修改输入；旧 detect 延迟返回          | 立即移除创建资格、建议、确认和旧幂等上下文；旧响应不恢复按钮；新输入必须重新检测                                                         | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 55  | 组件集成 | detection 过期后禁止创建    | 检测完成后时钟越过 `expires_at`                 | 点击进入 Step 2 不发送 create，停在 Step 1 并提示“检查结果已过期，请重新检测”；不会静默重检后直接创建                                    | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 56  | 组件集成 | surface 确认与最终创建合并  | warning / acknowledgement，多页 snapshot        | 完整终页前禁用；最终按钮为“确认并创建，进入词形与发音”；提交当前 detection + terminal token 后才创建                                     | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 57  | 组件集成 | duplicate/blocked 不能进入  | V2 duplicate、策略 disabled/error               | 展示产品化详情；不显示普通创建主操作或保持禁用；create 为 0 次                                                                           | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 58  | 组件集成 | 显式创建的未知结果幂等重试  | 点击创建后网络结果未知，再次点击                | 不重复 detection；原样重放同一 create body 与 idempotency key；只有正式要求新 key 的错误才轮换                                           | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 59  | e2e      | 两阶段单词与短语主链        | mock clear / matched                            | Enter 后仍在 `/words/new` 且服务端无词条；点击进入 Step 2 后才出现 create 请求并到达对应原生 forms 路由                                  | Admin creation Playwright specs   | P1     |
| 60  | 手测     | Step 1 稳定、无自动跳转闪动 | 真浏览器输入单词并按 Enter                      | 建议卡稳定出现，页面不自动切换、不出现全页 spinner；点击进入 Step 2 后仅发生一次有意导航；390/768/1024/1440 无页面级横向滚动且键盘可完成 | Codex 内置浏览器                  | 必验收 |

## 2026-08-26 原形优先展示修订

本节按最新产品口径覆盖前文所有“Step 1 展示详细词典建议卡”的用例。写任何新测试代码前先以本节为准。

| #   | 层级     | 场景                      | 前置/输入                                                            | 预期                                                                                                                | 落地文件                          | 优先级 |
| --- | -------- | ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------ |
| 61  | 纯逻辑   | 提取全部数据库原形候选    | 混合 V2/V3、headword/base/其他 form、多页、重复记录                  | 只保留 `form_type=base`；按 V3 entry+form / V2 word+node 去重并保持 snapshot 首次出现顺序                           | 新 presenter 单测                 | P0     |
| 62  | 组件集成 | 有数据库原形时优先显示    | 两个以上 base 候选；内置词典同时 matched                             | 精确复用 `d707328`：左侧旧版检测卡/全部摘要行；右侧旧版 BrE/AmE 地区面板显示第一项 canonical 英美式；无自创建议矩阵 | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 63  | 组件集成 | 无数据库原形时词典回退    | snapshot 无 base；V2 distinguish/common 与 V3 uk/us/common base 建议 | 左侧保持旧版检测卡；右侧旧版 BrE/AmE 地区面板显示内置词典英美式；common 同时用于两侧；无逐词性/音标详情             | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 64  | 组件集成 | 候选详情失败时禁止伪回退  | 已有 base 候选，详情 404/网络失败或 form id 无法定位                 | 保留候选列表，右侧错误可重试，创建禁用；不显示内置词典英美式，不发送 create                                         | `UnifiedCreateEntryStep.test.tsx` | P0     |
| 65  | 组件集成 | 原形展示不改变创建契约    | clear/warning/unknown-result retry                                   | detail 仅只读；create 仍复用原 detection、token 与 idempotency key；展示模型不进入 V2/V3 create body                | component existing + targeted     | P0     |
| 66  | 手测     | 原形双栏响应式与键盘      | 390/768/1024/1440；多个候选；仅内置词典回退                          | 宽屏左候选/右英美式，窄屏按相同阅读顺序单列；可键盘切换候选/重试/创建；无横向滚动，Enter 仍只检测且不闪动           | Codex 内置浏览器                  | 必验收 |
| 67  | 视觉回归 | 改变前最后提交内容 parity | `d707328` 左右栏 fixture 与当前 unified Step 1                       | 旧版标题、Descriptions 字段、摘要行、BrE/AmE 面板及核心 class 保持一致；不存在“确认英美主词与词形”和详细建议卡      | component DOM assertions          | P0     |

## 2026-08-26 原形与关联词数据边界补充（待后端方案批准）

| #   | 层级          | 场景                          | 前置/输入                                                        | 预期                                                                                                | 落地文件                                  | 优先级 |
| --- | ------------- | ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| 68  | 后端集成      | 草稿及其他词性原形参与检测    | 同 surface 下有草稿原形、已发布原形和多个 POS                    | detection/snapshot 保留全部 base form，带真实状态和词性；不按 published 或输入 POS 过滤             | `tests/lexicon_handler.rs`                | P0     |
| 69  | 后端查询      | 关联词候选只读当前发布快照    | 同名 published、draft、archived、旧 publication                  | related-search 只返回未归档 current publication 中的 sense                                          | repository + handler existing/targeted    | P0     |
| 70  | 后端保存/校验 | 绑定草稿或非当前义项被拒绝    | `target_word_id/target_sense_id` 指向 draft、archived 或旧版义项 | 返回稳定 validation issue，不保存为有效关联，不泄露内部 ID                                          | V2/V3 meanings integration tests          | P0     |
| 71  | 后端发布并发  | 选择后目标撤回/归档/换版      | 保存时有效，发布事务锁前后目标发生变化                           | 发布 fail closed；不产生 draft anchor 或错误 publication ref；重试需重新选择当前已发布义项          | publish transaction integration tests     | P0     |
| 72  | 数据迁移      | 历史 draft publication anchor | 已存在 `target_content_scope='draft'`                            | 迁移先盘点并 fail closed/输出审计处理；零脏数据时才能收紧为 publication-only，down migration 可恢复 | SQL migration tests + preflight inventory | P0     |

### 本次返工执行顺序

1. 先落地 #45 的失败测试并连续运行两次，证明当前占位 UI 与现场属于同一回归。
2. 实现独立的 V3 presenter，只读取 V3 canonical 数据并复用旧版结构/CSS；落地 #46、#47、#49。
3. 收敛统一创建入口的结构和样式加载，落地 #48；保留现有 detect/create/idempotency/surface 测试。
4. 运行第一阶段 targeted tests、Admin typecheck/lint/build，再完成 #50 本地浏览器验收。

### 本次返工执行记录

- [x] #45 连续两次稳定复现旧占位卡，随后恢复 `STEP 01`、录入卡、检测结果卡、建议确认区和底部操作。
- [x] #46–#49 自动化通过；多词性、多词形、英美变体、多发音、空白草稿、只读继续和原生 V3/V2 请求守护均已覆盖。
- [x] targeted 127/127、全量覆盖率 2393/2393、Admin lint、typecheck 与 production build 通过；新增展示分支补测后，Admin 分支覆盖率重新达到质量门。
- [x] #50 使用 Codex 内置浏览器连接现有测试后端完成验收：`/words/new` 与 V3 basics 均复用实际 V2 页面、步骤条、摘要与进度结构，390/768/1024/1440 均无页面级横向滚动；空输入按 Enter 正确聚焦并显示校验。未创建测试数据。本地 tsz-rust 仍因数据库已记录但 checkout 缺少迁移 `20260824140000` 而 fail-closed，未修改迁移或数据库。

## 2026-08-26 Step 2 V2 UI parity 返工矩阵

本节只恢复 V3 词形与发音步骤的 V2 产品结构和响应式体验。V3 canonical 数据、稳定 UUID、多 base、共享 membership、保存/影响确认与校验定位继续由原生 V3 模型承载，不转换成 V2 wire 或表单状态。

| #   | 层级     | 场景                        | 输入/前置                                     | 预期                                                                                                                          | 落地文件                                    | 优先级 |
| --- | -------- | --------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 73  | 页面集成 | Step 2 页面框架 parity      | V3 草稿进入 `/v3/wizard/forms`                | 使用 V2 步骤条、词条摘要和完成情况侧栏；主区显示 `STEP 02`、`词形与发音`及 V2 操作栏，不出现旧 V3 独立页头                    | `WordWizardV3.test.tsx` / layout tests      | P0     |
| 74  | 组件集成 | 词性页签与新增入口 parity   | 多 POS、空 POS、词性目录可用/失败             | 使用 V2 `word-pos-tabs word-forms-tabs` 层级；新增词性位于页签操作区；空态与目录错误使用产品中文文案                          | `V3FormsAndPronunciationStep.test.tsx`      | P0     |
| 75  | 组件集成 | 变化组与词形矩阵 parity     | 多组、同类型多 base、common 与 uk/us variants | 变化组使用 V2 卡片层级；词形按“词形类型 / 通用”或“词形类型 / 英式 / 美式”矩阵展示，同类型多条不合并                           | forms component tests                       | P0     |
| 76  | 组件集成 | 多发音与共享词形语义保持    | 每侧多 pronunciation；同一 form 多 membership | 发音行使用 V2 紧凑输入/操作层级；共享词形显示产品提示；任一位置编辑同步且 form/variant/pronunciation/membership UUID 均不变化 | forms component + operations existing tests | P0     |
| 77  | 页面集成 | 保存、完成与确认流程 parity | 普通保存、完成、impact/surface 确认、只读     | 底部为“上一步 / 保存草稿 / 完成并进入词义与例句”；确认 Modal 和请求时序仍走 V3，pending/只读时状态正确                        | `WordWizardV3.test.tsx`                     | P0     |
| 78  | 手测     | 四档响应式与键盘            | 390 / 768 / 1024 / 1440；多组、多发音、长拼写 | 宽屏矩阵对齐；窄屏按 V2 规则降级，无页面横滚/遮挡；页签、增删、排序、输入、保存与确认均可键盘完成                             | Codex 内置浏览器                            | 必验收 |

### Step 2 返工执行顺序

1. 先落地 #73–#77 的失败断言，确认当前 V3 独立布局与 V2 结构不一致。
2. 复用 `WordCreationLayout` 的结构/CSS 语言，并在 V3 原生组件中只调整呈现层；不改 operations、wire 或 API。
3. 重跑既有多 base、共享 membership、UUID、影响确认与校验定位测试，证明视觉返工没有损失 V3 语义。
4. 跑 targeted、Admin typecheck/lint，再完成 #78 本地浏览器验收。

## 2026-08-26 Step 2 精确历史基准返工矩阵

用户验收指出 #73–#78 只恢复了相似视觉，仍与旧版存在明显差异。本轮把 `49e3bdc`（引入 Smart Lexicon V3）的唯一父提交 `82203e03af0a3c3eeea766e100f3da5f20d0a167` 定为唯一基准；不再以当前组件或主观相似度作为 parity 依据。

| #   | 层级     | 场景                      | 输入/前置                                 | 精确基准预期                                                                                                                                         | 自动化落点                             | 优先级 |
| --- | -------- | ------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 79  | 组件集成 | 词性 Tab 操作 parity      | 一个或多个 POS；词性目录可用              | 新增词性只有旧版蓝色 Select；不得另放“新增词性”按钮；删除词性入口位于对应 Tab 标签内且仅在多 POS 时出现，不在内容区单独占一行                        | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 80  | 组件集成 | 基准原形独立卡 parity     | POS 下包含一个或多个 `form_type=base`     | 先显示独立深色标题卡“基准原形与发音”，包含词性级英美规则说明/控制和原形矩阵；base 不得作为“变化组中的词形 1”呈现；多个 base 逐条保留且不合并         | forms component tests                  | P0     |
| 81  | 组件集成 | 派生变化组卡 parity       | 一个或多个非 base form、多个 membership   | 每组标题为“第 N 组 词形变化”，整条标题可折叠并显示“展开/收起”；仅多组时显示省略号菜单管理上下移/删除；组内先显示“词形是否规则变化？”再显示矩阵       | forms component tests                  | P0     |
| 82  | 组件集成 | 组内新增与移动操作 parity | 允许的词形类型、多个变化组                | 行内 `＋` 创建全新词形；移动/移除能力收进业务化次级操作；不再显示“复用已有词形”入口，也不在矩阵上方常驻工程工具；用户不可见 membership/concrete/UUID | forms component tests                  | P0     |
| 83  | 页面集成 | 文案与操作栏精确 parity   | 正常、空词性、校验错误、只读、保存确认    | 使用 `82203e0` 的 Step 02 说明、空态、错误 Alert、Modal 与“上一步 / 保存草稿 / 完成并进入词义与例句”；V3 impact/surface token 与保存时序保持原生     | step + wizard tests                    | P0     |
| 84  | 手测     | 历史基准视觉逐项对照      | 390 / 768 / 1024 / 1440；base+派生+多发音 | 与 `82203e0` 的层级、间距、卡头、矩阵、Tab 操作和折叠方式逐项一致；只允许因 V3 原生语义增加次级入口，不允许改变首要信息架构                          | Codex 内置浏览器 + commit 源码对照     | 必验收 |

### 精确历史基准执行顺序

1. 先落地 #79–#83，并在现实现上连续两次得到相同失败，证明用户所见差异可重复。
2. 仅重组 V3 展示组件；保留 V3 operations、稳定 ID、共享 membership、多个 base、方言、多发音及请求契约。
3. 沿同一测试路径跑绿，再运行既有 V3 语义守护、覆盖率、typecheck、lint。
4. 使用真实本地页面按 #84 对照并交用户验收；不自动提交、推送或部署。

## 2026-08-27 Step 2 业务术语修订

| #   | 层级     | 场景                 | 输入/前置                             | 预期                                                                              | 自动化落点                             | 优先级 |
| --- | -------- | -------------------- | ------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 85  | 组件集成 | 词性与词形术语单一化 | 有/无额外词形变化、历史草稿含既有词形 | 只显示“词性 / 词形 / 词形变化 / 词形类型”；不出现“基本词性”“派生词形”或“派生词性” | `V3FormsAndPronunciationStep.test.tsx` | P0     |

## 2026-08-27 实际产品图矩阵排版修订

本节以用户提供的实际产品图覆盖此前“独立基准原形卡”的假设。V3 数据与操作保持原生，不恢复 V2 wire 或不可表达的组级方言规则。

| #   | 层级     | 场景                         | 输入/前置                                        | 预期                                                                                                                    | 自动化落点                             | 优先级 |
| --- | -------- | ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 86  | 组件集成 | 原形与其他词形同组           | 同组含多个 base、复数/比较级等多个 concrete form | 所有词形按 membership 顺序放在同一“第 N 组 词形变化”卡内；不再出现独立“基准原形与发音”卡                                | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 87  | 组件集成 | 连续词形矩阵                 | common、uk/us、多发音、同类型多条                | 同组词形使用连续矩阵/行级卡片层级，类型、拼写和发音纵向对齐；英美双栏仍由每个 V3 form 的 `regional_variants.mode` 决定  | forms component tests                  | P0     |
| 88  | 行为集成 | 全类型与多原形添加           | catalog 向当前 POS 返回现有 7 种非 base 类型     | 词形类型选择同时包含“原形”与 catalog 返回类型；可重复新增 base 或同一非 base 类型，稳定 form/membership UUID 与排序不变 | forms component + operations tests     | P0     |
| 89  | 手测     | 产品图四档排版与真实后端保存 | 390/768/1024/1440；代词下新增并保存复数          | 卡头、规则行、同组词形矩阵与底部添加区接近产品图；无页面横滚；保存刷新后新增词形仍在                                    | Codex 内置浏览器                       | 必验收 |

## 2026-08-27 词性级英美结构统一

| #   | 层级     | 场景                  | 输入/前置                                | 预期                                                                                                                     | 自动化落点                             | 优先级 |
| --- | -------- | --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------ |
| 90  | 组件集成 | 统一英美结构状态      | 同一 POS 下全部 common、全部 uk/us、混合 | 只显示一个词性级“统一区分英式与美式”控制；分别回显“不区分 / 区分 / 待统一”，各词形不再提供独立切换入口                   | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 91  | 组件集成 | common 批量转 uk/us   | 多组、多 form、共享 membership、多发音   | 按唯一 concrete form 逐条打开显式映射；全部确认后同一 POS 均为 uk/us；form UUID 不变，新 variant/pronunciation UUID 稳定 | forms component + operations tests     | P0     |
| 92  | 组件集成 | uk/us 批量合并 common | 多 form、每侧已有多发音                  | 逐条要求通用拼写/音标/实际发音映射；不静默选择英式或美式；取消任一步停止后续转换且保留未转换 form                        | forms component tests                  | P0     |
| 93  | 组件集成 | 混合历史草稿收口      | 同一 POS 同时存在 common 与 uk/us        | 页面显示产品化“待统一”提示并阻止误导性完成；管理员可选择统一目标；已有内容与 UUID 在确认前不变                           | forms + wizard tests                   | P0     |
| 94  | 联调     | 后端权威一致性校验    | mixed payload、全部 common、全部 uk/us   | mixed 返回稳定可定位 issue；两个统一状态均可保存；前端定位到词性级统一控制                                               | 本地 tsz-rust + 浏览器                 | 必验收 |

## 2026-08-27 实际产品图视觉复刻

| #   | 层级     | 场景                     | 输入/前置                         | 预期                                                                                                                             | 自动化落点                             | 优先级 |
| --- | -------- | ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 95  | 组件集成 | 产品图规则区与英美矩阵   | 同一 POS 下为 common 或全部 uk/us | 统一英美控制收进首个变化组的紧凑规则区；common 使用旧版“词形类型 / 英美共用”，uk/us 使用旧版“词形类型 / 英式 BrE / 美式 AmE”三栏 | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 96  | 组件集成 | 产品图发音字段与行级操作 | 多词形、多发音、共享 membership   | 发音方式、字典音标、实际发音使用可见中文标签；词形移动/排序/移除操作留在该词形类型单元内，不再插入矩阵行间造成断裂               | forms component tests                  | P0     |
| 97  | 手测     | 产品图四档视觉对照       | 390/768/1024/1440；common、uk/us  | 深色组标题、紧凑规则行、蓝色 BrE/粉色 AmE 表头、连续词形行与底部添加区均按产品图对齐；无页面级横向滚动                           | Codex 内置浏览器                       | 必验收 |

## 2026-08-27 Step 2 三行规则与三态方言矩阵

本节经用户批准，覆盖 #90–#94 中“单一词性级英美总开关”的旧假设。规则状态必须来自正式 V3 `dialect_rules`，不能按当前文本是否相等临时推导。

| #   | 层级           | 场景                            | 输入/前置                                            | 预期                                                                                                                    | 自动化落点                                              | 优先级 |
| --- | -------------- | ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| 98  | 契约           | V3 POS 正式携带方言规则         | 后端 OpenAPI 已增加 `dialect_rules`                  | `@tsz/types` 1:1 镜像 `spelling_mode/phonetic_mode`；api-client snapshot 与后端 spec 一致；缺字段或未知枚举 fail closed | types/schema + api-client contract tests                | P0     |
| 99  | 组件集成       | 产品图三行规则布局              | 一个 POS、一个或多个变化组                           | 首组显示“词形是否规则变化 / 英美拼写是否有区别 / 英美音标是否有区别”；后续组只显示本组规则；不显示 wire 名称或内部 ID   | `V3FormsAndPronunciationStep.test.tsx`                  | P0     |
| 100 | 单元/组件集成  | 三种有效组合与联动              | UU、UD、DD；尝试 DU                                  | UU/UD/DD 正确回显；选择拼写“是”自动得到 DD 并禁用音标“否”；拼写“否”后音标恢复可选；前端不产生 DU payload                | operations/model + forms component tests                | P0     |
| 101 | 单元/组件集成  | 三态直接转换，无映射弹窗        | 多 base、多组、共享 form、每侧多发音；管理员英美偏好 | UU→UD/DD 自动复制通用内容到两侧；DD→UD 与分栏→UU 按偏好侧收敛；全 POS 原子更新且不出现 Modal；form/membership UUID 稳定 | operations + forms component tests                      | P0     |
| 102 | 集成           | 规则、形状、拼写约束校验定位    | DU、规则与 common/uk_us 不一致、UD 下两侧拼写不同    | 本地安全停止；后端 issue 定位到 POS 规则或具体 form；页面聚焦中文规则行/词形，不显示原始 code；错误修复后可重试         | model/readiness/wizard tests + backend validation tests | P0     |
| 103 | 前后端联调     | create 默认值与 save/read-back  | common 证据、同拼写异音、异拼写证据；三态分别保存    | create 写入正确规则；保存刷新后选择不变；complete/publish 使用同一 authority；前端不按内容重新猜测                      | backend integration + local browser                     | 必验收 |
| 104 | 后端迁移       | 缺字段历史 V3 草稿确定性补齐    | common；uk/us 同拼写；uk/us 异拼写                   | 依次补为 UU、UD、DD；不改 form/variant/pronunciation/group/membership UUID 或顺序；迁移可审计且回滚路径明确             | Rust migration/contract tests                           | P0     |
| 105 | 手测           | 四档响应式、键盘与基础无障碍    | 390/768/1024/1440；三态；多组                        | 三行规则与矩阵不横向溢出；Radio 可键盘操作且切换无 Modal；禁用音标“否”有可理解状态；焦点保持在触发规则                  | Codex 内置浏览器                                        | 必验收 |
| 106 | 单元/集成/联调 | 模式往返复用退役稳定 variant ID | GET 返回 retired common/uk/us；DD→UD→UU→UD→DD        | Wizard 身份账本复用同一 form 的退役 common/uk/us UUID；UU 保存不再触发稳定槽位 ID 冲突；三态分别保存刷新成功            | operations + Wizard tests + 本地后端                    | P0     |
| 107 | 组件/视觉回归  | UD 共享拼写矩阵不使用三列网格   | `uk_us` variants + `spelling_mode=unified`           | DOM 使用“类型 + 共享拼写”两列 `word-form-matrix-unified`；BrE/AmE 发音在共享单元内部对齐，不生成隐式第 3/4 列           | forms component test + 四档浏览器                       | P0     |
| 108 | 组件/联调      | V3 发音恢复播放与获取语音控件   | common/uk/us pronunciation；语音目录有值/为空        | 每条字典音标显示播放与获取按钮；复用 V2 locale/偏好/缓存/过期/错误逻辑；空目录时按钮禁用并显示常驻原因，不阻断文本保存  | V3 forms integration + V2 preview tests + 本地浏览器    | P0     |

### 三行规则执行记录

- [x] #98 后端正式 OpenAPI 已同步；api-client 373/373 通过，V3 POS 必填 `dialect_rules` 与 issue code 已冻结。
- [x] #99–#102 组件、operations、model、Wizard/saveFlow 相关回归通过；规则切换按 V2 自动转换且不显示 Modal。
- [x] #103 最新本地后端已执行迁移并通过 healthz/readyz；DD 草稿经 impact 确认保存、刷新后仍回显 DD。
- [x] #104 后端迁移、contract、projection、storage schema 已由后端任务实现；定向 dialect rules contract test 通过。
- [x] #105 390/768/1024/1440 均无页面级横向溢出，三行规则完整；键盘 Space 切换无 Modal。
- [x] #106 复现 UU 保存因 common variant 新 UUID 被后端拒绝；接入 retired identity ledger 后，DD→UD→UU→UD→DD 均真实保存并刷新成功。
- [x] #107 复现 UD DOM 为两列但误用 distinguish 三列 class；修复后 390/768/1024/1440 均无横向溢出且类型/共享区域逐列对齐。
- [x] #108 V3 4 条发音均显示播放/获取控件；V2 preview 24 条与 V3 forms 28 条测试通过。本地 voices API 200 返回空目录，控件正确禁用并显示“暂无可用发音人”。

## 2026-08-27 V2 最后稳定版行为深度对照

本节以 `82203e03af0a3c3eeea766e100f3da5f20d0a167` 的 `FormsAndPronunciationStep` 为交互基线；只复用展示与操作行为，V3 concrete form、membership、重复 `form_type` 和稳定 UUID 仍保持原生。

| #   | 层级      | 场景                         | 输入/前置                                    | 预期                                                                                                                                             | 自动化落点                             | 优先级 |
| --- | --------- | ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------ |
| 109 | 组件集成  | 发音顺序只读且不提供拖动入口 | 同一方言一条或多条发音                       | 不显示拖动图标，不支持鼠标拖放或方向键排序；按 wire 顺序稳定显示；编辑、新增、删除仍保留 pronunciation UUID 与其余行顺序                         | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 110 | 单元/集成 | 词形类型就地编辑 parity      | catalog 允许多个类型；词形被一个或多个组共享 | 类型单元使用 V2 同类下拉控件；修改只更新目标 concrete form 的 `form_type`，保留 form/variant/pronunciation/membership UUID、内容、顺序和共享关系 | operations + forms component tests     | P0     |
| 111 | 组件集成  | V3 重复类型与目录边界        | 同组已有相同类型；catalog 不含某历史类型     | V3 允许多条相同 `form_type`，下拉不因重复禁用；候选仅来自 `base + allowed_form_types`，但当前历史值仍可见且不会被静默改写                        | forms component tests                  | P0     |
| 112 | 手测      | 发音操作区完整性复核         | 真实本地草稿、多发音、多词形、共享词形       | 发音行只保留删除、新增、类型、音标、实际发音及播放/获取能力；页面无拖动图标；保存刷新后 wire 顺序和 UUID 不变                                    | Codex 内置浏览器                       | 必验收 |

### V2 最后稳定版行为对照执行记录

- [x] #109 后续产品口径明确不再支持发音手动拖动；组件回归改为要求不渲染拖动图标，并验证多发音继续按 wire 顺序显示，编辑、新增与删除不重建其余 pronunciation UUID。
- [x] #110 operations 与组件回归证明类型就地修改只变 `form_type`，共享 form 的 form/variant/pronunciation/membership UUID、内容、引用和顺序均不变。
- [x] #111 同类型重复时下拉保持可用；历史类型不在当前 catalog 时仍以中文标签回显，候选仅为“当前历史值 + 原形 + 当前 allowed_form_types”。
- [ ] #112 本地真实页面需确认单条与多条发音均不显示拖动图标，删除、新增、类型、播放/获取和保存刷新继续可用。
- [x] 最终工作树全量覆盖率 161 files / 2432 tests 通过（Statements 95.32%、Branches 91.23%、Functions 95.82%、Lines 96.49%）；根级 typecheck、lint 与 `git diff --check` 通过。

## 2026-08-27 新增词形继承词性方言规则

| #   | 层级     | 场景                       | 输入/前置                          | 预期                                                                                                                | 自动化落点                             | 优先级 |
| --- | -------- | -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 113 | 单元     | 新增词形按 UU/UD/DD 建节点 | 当前 POS 分别为 UU、UD、DD         | UU 创建 `common`；UD/DD 创建完整 `uk_us`；form/variant/membership UUID 唯一稳定，且不产生规则与节点形状不一致的草稿 | `operations.test.ts`                   | P0     |
| 114 | 组件集成 | DD/UD 下新增词形矩阵不退化 | 已有变化组，选择一种允许的词形类型 | DD 立即显示英式/美式拼写与双方言发音；UD 显示英美共用拼写与双方言发音；不得插入绿色 `common` 行或触发“待统一”       | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 115 | 手测     | 真实页面新增与保存刷新     | 本地后端、DD 或 UD 词性            | 新增词形形状与三行规则一致；保存并刷新后形状、规则及 UUID 均保持                                                    | Codex 内置浏览器                       | 必验收 |

### 新增词形方言继承执行记录

- [x] #113–#114 连续两次复现 UD/DD 新增词形被固定写成 `common`；修复后 operations 与组件回归 52/52 通过，UU 既有行为保持不变。
- [x] 本地真实 DD 页面新增同类型词形后立即生成 `word-form-matrix-distinguish`，同时出现英式/美式拼写；临时词形已删除且未保存。
- [ ] #115 修复前已创建的绿色 `common` 行不做静默转换；由用户删除后重新新增，再执行保存刷新验收。
- [x] 最终工作树全量覆盖率 161 files / 2436 tests 通过（Statements 95.32%、Branches 91.23%、Functions 95.82%、Lines 96.49%）。

## 2026-08-27 新建词形默认发音行

| #   | 层级     | 场景                     | 输入/前置                     | 预期                                                                                                            | 自动化落点                             | 优先级 |
| --- | -------- | ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 116 | 单元     | 新建词形初始化一条发音   | UU、UD、DD                    | UU 的 common 一条；UD/DD 的 uk/us 各一条；发音为 `normal` 且音标/实际发音为空，所有 pronunciation UUID 唯一稳定 | `operations.test.ts`                   | P0     |
| 117 | 组件集成 | 新词形直接显示发音编辑行 | 新增任意允许的词形类型        | 每侧直接显示发音方式、字典音标、实际发音及行内 `+`；不得进入“暂无发音 / 新增发音”空态                           | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 118 | 回归     | 历史零发音数据仍可恢复   | 已保存的 variant 发音数组为空 | 仍显示兜底“新增发音”，可创建第一条；本修复不静默重写历史 UUID 或已有草稿                                        | 既有 pronunciation empty-state test    | P0     |
| 119 | 手测     | 本地新增词形并保存刷新   | DD/UD 真实页面                | 新增后英美各默认一条发音，保存刷新后发音 UUID 与方言归属不变                                                    | Codex 内置浏览器                       | 必验收 |

### 新建词形默认发音行执行记录

- [x] #116–#117 连续两次复现新建 UU/UD/DD 发音数组为空；修复后 common 默认一条、uk/us 各默认一条，相关 operations 与组件回归 52/52 通过。
- [x] #118 既有历史零发音空态测试保留，仍可通过兜底按钮创建第一条发音；不迁移或重建历史节点。
- [x] 本地真实 DD 页面新增词形后得到 2 条发音编辑行、2 个行内 `+`，且“暂无发音”数量为 0；临时词形已删除且未保存。
- [ ] #119 留待用户删除修复前创建的旧空发音词形、重新新增后执行保存刷新验收。
- [x] 最终工作树全量覆盖率 161 files / 2436 tests 通过（Statements 95.32%、Branches 91.24%、Functions 95.82%、Lines 96.49%）。

## 2026-08-27 新增词性默认原形

| #   | 层级     | 场景                         | 输入/前置                          | 预期                                                                                                                                   | 自动化落点                             | 优先级 |
| --- | -------- | ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 120 | 单元     | 新增词性创建最小完整结构     | 已有 UU、UD 或 DD 的首个 base form | 新 POS 复制其方言规则与拼写，创建一个变化组和一个 `form_type=base`；所有 POS/group/form/variant/membership/pronunciation UUID 均为新值 | `operations.test.ts`                   | P0     |
| 121 | 单元     | 新增第一个词性时无原形模板   | `content.pos=[]`                   | 回退为 UU：一个空 common 原形、一个变化组、一个 membership 和一条空发音，不读取 V2 wire 或兼容字段                                     | `operations.test.ts`                   | P0     |
| 122 | 组件集成 | 新词性立即进入可编辑原形矩阵 | 从“添加基本词性”选择尚未使用的词性 | 自动切换到新 Tab；直接显示第 1 组与原形矩阵，不再先显示空态或要求管理员额外点“添加变化组/添加原形”；不自动添加第三人称、复数等其他词形 | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 123 | 手测     | 本地新增词性并保存刷新       | 真实 DD/UD 草稿                    | 新词性的原形继承当前词条英美拼写，英美各默认一条空发音；保存刷新后 UUID、方言规则、拼写保持                                            | Codex 内置浏览器                       | 必验收 |

### 新增词性默认原形执行记录

- [x] #120–#122 连续两次复现新增词性只创建空 POS；修复后 UU/UD/DD 与空草稿回退覆盖，相关 operations/组件回归 54/54 通过。
- [x] 本地真实 DD 页面临时新增“动词”后自动得到 1 个变化组、1 个原形、英美拼写 `centre/center` 和双方各 1 条空发音；临时词性已确认删除且未保存。
- [ ] #123 保存刷新留待用户使用最终目标词性验收。
- [x] 最终工作树全量覆盖率 161 files / 2438 tests 通过（Statements 95.33%、Branches 91.26%、Functions 95.83%、Lines 96.50%）。

## 2026-08-27 最后一项不可删除约束

| #   | 层级     | 场景                           | 输入/前置                                       | 预期                                                                                                                      | 自动化落点                             | 优先级 |
| --- | -------- | ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 124 | 单元     | 最后一个词性不可删除           | `content.pos.length=1`                          | `deletePartOfSpeech` 返回稳定 `last_pos_required`，内容不变；存在两个及以上词性时仍可删除目标                             | `operations.test.ts`                   | P0     |
| 125 | 单元     | 每个词性的最后一个词形不可删除 | POS 仅有一个 form；直接删 form 或删组并清理孤儿 | 返回稳定 `last_form_required`，form/group/membership 均不变；有多个 form 时仍允许删除目标                                 | `operations.test.ts`                   | P0     |
| 126 | 组件集成 | 删除入口与硬约束一致           | 单 POS；单 form/单 membership；单组             | 最后词性不显示删除入口；最后词形的移除按钮禁用并说明“每个词性至少保留一个词形”；会删掉最后词形的组删除菜单禁用            | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 127 | 手测     | 本地键盘与鼠标不可绕过         | 最后词性、最后词形、最后组；再新增第二项        | 最后一项鼠标/键盘均不可删；新增第二词性或第二词形后，相应删除入口恢复；共享 form 的非最后 membership 仍可从某一组正常移除 | Codex 内置浏览器                       | 必验收 |

### 最后一项不可删除执行记录

- [x] #124–#126 连续两次复现 operations 可清空最后 POS/form/group 且 UI 最后 form 删除可用；修复后相关 operations/组件回归 54/54 通过。
- [x] 本地临时“动词”作为第二词性时保留词性删除入口，但唯一原形的移除按钮禁用并显示“每个词性至少保留一个词形”，唯一组的删除菜单为禁用态。
- [x] 删除临时“动词”并确认后只剩“代词”，最后词性删除按钮数量为 0；临时数据未保存。
- [x] 最终工作树全量覆盖率 161 files / 2438 tests 通过（Statements 95.33%、Branches 91.25%、Functions 95.83%、Lines 96.50%）。

## 2026-08-27 真实发布验收阻塞：音标输入回空

| #   | 层级     | 场景                         | 输入/前置                          | 预期                                                                                                                 | 自动化落点                             | 优先级 |
| --- | -------- | ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 128 | 组件集成 | 受控向导中编辑音标后立即回显 | Harness 持有 canonical forms state | 输入 `dict_phonetic` 后 canonical state 与输入框同步保留；连续编辑英美/多词形互不覆盖，不被 `Form.List` 内部状态重置 | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 129 | 手测     | 刷新后真实键盘输入与保存草稿 | 本地浏览器、真实后端               | 刷新页面后逐项输入仍保持；保存草稿成功并刷新回显                                                                     | Codex 内置浏览器                       | 必验收 |

### 音标输入与真实发布执行记录

- [x] #128 真实页面复现 canonical `dict_phonetic` 已更新但 antd `Form.List` 仍渲染旧空值；改为 V3 canonical 控制发音字段后，受控输入回归通过。
- [x] #129 刷新后 4 个音标均可直接输入；Step 2 草稿保存并刷新回显 `ˈsentə / ˈsentər / ˈsentəz / ˈsentərz`。
- [x] Step 3 保存并刷新回显：释义组、语法结构、细分词性、中文释义和英中例句完整持久化。
- [x] 发布条件检查返回“影响预览：0 项”；发布成功，词条状态为“已发布”，发布历史出现“第 1 次发布 / 当前”。
- [ ] 非阻塞 UI 回归：Step 2/3 完成后没有按按钮文案自动跳转下一步；发布后侧栏仍显示“发布检查待核对”。
- [x] 最终工作树全量覆盖率 161 files / 2439 tests 通过（Statements 95.33%、Branches 91.26%、Functions 95.83%、Lines 96.50%）。

## 2026-08-27 重复确认创建的建议与预填真实性

| #   | 层级     | 场景                         | 输入/前置                                                      | 预期                                                                                                                                 | 自动化落点                       | 优先级 |
| --- | -------- | ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------ |
| 130 | 组件集成 | matched 创建响应实际已预填   | 检测 `matched`；create 返回 `forms.pos` 含 POS/form/group 结构 | 导航来源为 `dictionary`，编辑器显示“已根据内置词典预填，请核对”                                                                      | Unified create + notice tests    | P0     |
| 131 | 组件集成 | matched 创建响应异常为空     | 检测 `matched`；create 返回 `forms.pos=[]`                     | 不得谎报已预填；导航来源为独立安全状态，提示“词性建议尚未写入”，明确当前草稿为空并引导从右上角添加词性                               | Unified create + notice tests    | P0     |
| 132 | 组件集成 | 重复确认后按创建响应判断预填 | surface acknowledgement token；create 分别返回非空/空 forms    | 两种响应沿同一确认路径分别进入 #130/#131；不能因检测 matched 或已确认重复项而覆盖真实创建结果                                        | UnifiedCreateEntryStep.test.tsx  | P0     |
| 133 | 组件集成 | 合并词性建议去重展示         | 顶层 `suggested_pos` 含内置词典 + 已有词条词性并已去重         | 仅消费顶层权威合并结果；已有词条来源 POS 可显示但不得伪装成 `builtin_dictionary` 内容，也不从 surface 文案、旧词形、释义或 UUID 推断 | UnifiedCreateEntryStep.test.tsx  | P0     |
| 134 | 回归     | not_found / unavailable 边界 | 词典未找到或暂不可用                                           | not_found 仍进入真实空白草稿提示；unavailable 继续阻止创建；不得误显示“词性建议尚未写入”或“已预填”                                   | UnifiedCreateEntryStep.test.tsx  | P0     |
| 135 | 手测     | 真实重复 center 前后端联调   | 后端修复 create_v3 后重复确认创建                              | 检测页显示内置词典 + 已有同表面词条词性的去重建议；Step 2 收到空内容 POS 骨架且不复制旧数据；实际有结构时才显示成功预填              | 本地浏览器 + tsz-rust            | 必验收 |
| 136 | 契约     | 顶层合并词性建议为必填字段   | 后端 OpenAPI 含 `DetectLexiconSurfaceResponseV3.suggested_pos` | `@tsz/types` 与 runtime schema 1:1 镜像；缺字段、非数组或非字符串元素 fail closed；OpenAPI snapshot 只从后端权威 spec 同步           | api-client schema/contract tests | P0     |

### 重复确认创建建议执行记录

- [x] #130–#134 创建来源改为以 `response.word.forms` 实际结构为准；matched 空 forms 使用“词性建议尚未写入，请手动补充”，not_found/unavailable 既有边界保持。
- [x] #133 Step 1 仅消费顶层 `suggested_pos`；每个 POS 只显示一次，并以“内置词典 / 已有词条”区分来源，不从 surface 或旧内容在前端推断。
- [x] #136 从后端权威 `docs/openapi.json` 同步；spec `hash-object=fd2cb25eb1195bb581c00c24a4041b5d15ce76ed`，runtime `_source_sha256=1a315737240d5218da6b6bb1f5a45d7359202bf0dc4556078c84cab28bc40cbd`；api-client 377/377 通过。
- [x] 前端创建/提示/路由定向回归 79 项通过；最终工作树全量覆盖率 161 files / 2447 tests 通过（Statements 95.34%、Branches 91.28%、Functions 95.84%、Lines 96.50%），typecheck、lint、Prettier、`git diff --check` 通过。
- [x] #135 使用本地前端对接最新 8383 后端完成真实重复 `center` 的 detect → 确认 → create → Step 2 → 刷新回读：Step 1 去重显示“形容词 / 名词 / 动词 · 内置词典”和“代词 · 已有词条”；创建草稿 `01a0431a-3452-7a03-a800-1a5dfed64627` 后，Step 2 持久显示四个词性。内置词典词性带建议原形，existing-only 的“代词”仅生成一个空 base、一个空默认发音，不复制旧词形、音标、释义、关系或 UUID；刷新后结构保持，成功提示与实际非空 forms 一致。
- [x] #135 继续执行保存草稿：页面加载同形影响 2/2 后确认保存，数据库 revision 从 1 升至 2；刷新仍显示形容词/名词/动词/代词。DB read-back 为 4 POS / 4 forms / 4 groups / 4 memberships / 4 pronunciations；builtin 三个 base 拼写均为 `center`，existing-only `pronoun` base 拼写为空；与已发布来源词条的 `lexicon.nodes.id` 交集为 0。

## 2026-08-27 Step 2 无校验导航

| #   | 层级     | 场景                         | 输入/前置                              | 预期                                                                                                                   | 自动化落点              | 优先级 |
| --- | -------- | ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------ |
| 136 | 页面集成 | 不完整 Step 2 直接进入下一步 | 拼写/音标/实际发音存在未完成项         | 点击“进入词义与例句”只调用 `setActiveStep("meanings")`；不调用 impact、validate、saveForms，不显示完成校验问题         | `WordWizardV3.test.tsx` | P0     |
| 137 | 页面集成 | 未保存内存草稿跨步骤保持     | Step 2 已编辑但未保存                  | 导航到 Step 3 后返回 Step 2，canonical 本地草稿保持；刷新前仍显示未保存提醒，发布时完整校验继续阻断不完整内容          | Wizard + page tests     | P0     |
| 138 | 文案回归 | 词义步骤术语统一             | Step 2 操作栏与 Step 3 页面/侧栏       | 主按钮为“进入词义与例句”；不再使用“完成并进入”；同一步骤统一使用“词义与例句 / 词义编辑”，不混用“释义与例句 / 释义编辑” | page/layout tests       | P0     |
| 139 | 手测     | 真实不完整表单无校验导航     | existing-only 空原形、空发音的重复草稿 | 点击主按钮立即进入 `/v3/wizard/meanings`，没有英文 validation；返回后数据仍在；“保存草稿”与发布校验行为保持独立        | Codex 内置浏览器        | 必验收 |

### Step 2 无校验导航执行记录

- [x] #136–#138 页面/Wizard/Layout/Preview/Meanings 定向回归 118/118 通过：主按钮不调用 impact/save，未保存词形跨步骤返回后保持；V3 步骤术语统一为“词义与例句 / 词义编辑”。
- [x] #139 干净重启最新前后端后，在 existing-only 空拼写/空发音草稿上点击“进入词义与例句”，直接进入 `/v3/wizard/meanings`，英文完成校验数量为 0；返回 Step 2 后形容词/名词/动词/代词四个词性仍完整保留。
- [x] 最终工作树全量覆盖率 161 files / 2448 tests 通过（Statements 95.34%、Branches 91.28%、Functions 95.84%、Lines 96.50%）。

## 2026-08-27 Step 3 V2 精确 UI 恢复

本轮以引入 V3 的提交 `49e3bdc` 的唯一父提交
`82203e03af0a3c3eeea766e100f3da5f20d0a167` 为唯一产品基准。只恢复 Step 3
的 V2 结构、排版、文案和交互语言；V3 canonical 数据、稳定 UUID、原生保存契约与
关联语义保持不变，不转换成 V2 wire 或表单状态。

| #   | 层级          | 场景                            | 输入/前置                                                        | 预期                                                                                                                                                                                     | 自动化落点                             | 优先级 |
| --- | ------------- | ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 140 | 页面集成      | Step 3 页面框架 parity          | V3 草稿进入 `/v3/wizard/meanings`                                | 显示旧版 `STEP 03 / 词义与例句` 标题、说明、V2 步骤条/摘要和底部操作栏；不出现通用小卡片堆叠或工程文案                                                                                   | `WordWizardV3.test.tsx`                | P0     |
| 141 | 组件集成      | 语义区间总卡 parity             | 0/1/多个 sense group                                             | 使用 `word-sense-groups-card`、编号、中文/英文两列和头部“添加语义区间”；最后一个不可删除；删除被引用项时保持 V3 sense 引用处理                                                           | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 142 | 组件集成      | 词性页签与空态 parity           | 多 POS、forms 有但 meanings 未建、目录异常                       | 使用 `word-pos-tabs`；中文词性标签；可从当前 forms POS 建立词义；空态明确引导，不展示“删除当前词性释义”大按钮                                                                            | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 143 | 组件集成      | 语法结构卡 parity               | 0/1/多条 grammar structure；common/uk/us variants                | 使用“语法结构”总卡、编号和占满绿色面板宽度的单栏 TextArea；公共 CSS 与 V3 override 均不得保留旧 104px+内容两列；“添加语法结构”位于右上角；V3 UUID/dialect/content 与 definition 引用保持 | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 144 | 组件集成      | 彩色可折叠词义卡 parity         | A1-C2 sense、细分词性、语义区间、词频、依赖语境                  | 使用 `word-sense-editor-*` 彩色 Collapse；标题为等级 + 当前第一条释义摘要；元信息按旧版五列层级展示；管理操作收进省略号，不常驻上移/下移/删除文字按钮                                    | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 145 | 组件集成      | 多维释义区 parity               | 中/英文定义、grammar binding、方言 EnglishText、多条定义         | 使用“多维释义”分区、条数 Tag 和 V2 四列紧凑行：编号｜等级+方式｜内容+绑定语法结构｜纵向操作；底部虚线“添加释义”；方言 variant、definition/content UUID 原样更新                          | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 146 | 组件集成      | 多维例句区 parity               | unified/distinguish 英文、中文、主关联、上下文关联、多例句       | 使用“多维例句”分区和双语卡片；主关联锁定提示清楚；上下文关联可搜索/切换/去重/删除；新增、排序、删除不改既有 sentence/text UUID                                                           | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |
| 147 | 单元/组件集成 | 关联词分区与 Step 1 校验 parity | 三类 relation；合法单词/短语；空值、中文、纯数字、超长、异常空白 | 固定三张完整分类卡；关联词复用 Step 1 的归一化、word/phrase 分类、英文字符集/字母/200 字符校验；非法值不搜索、不写 pending，合法值按 kind 搜索；每卡最多一条 pending 汇总                | entry classification + meanings tests  | P0     |
| 148 | 回归          | 原生 V3 身份与保存不降级        | 编辑、排序、删除、新增后保存                                     | `onChange/onSave` 仍提交 V3 writable content；既有节点 UUID、方言结构、focus/context role、issue locator 和关联搜索行为保持                                                              | meanings existing tests + wizard tests | P0     |
| 149 | 手测          | Step 3 四档视觉与键盘验收       | 390/768/1024/1440；完整词义 fixture；空态                        | 与 `82203e0` 的标题、总卡、词性 Tab、语法卡、彩色词义卡、三大内容分区和操作栏逐项一致；无页面级横滚/遮挡，键盘可完成增删改排与步骤切换                                                   | Codex 内置浏览器                       | 必验收 |
| 150 | 组件集成      | 依赖语境开关键盘操作            | 词义卡已展开；开关聚焦                                           | Enter 与 Space 均切换 `depends_on_context`，不会提交表单或丢失其他 V3 节点身份                                                                                                           | `V3MeaningsAndExamplesStep.test.tsx`   | P0     |

### Step 3 精确恢复执行顺序

1. 先落地 #140–#147 的 DOM/行为断言并连续运行两次，证明当前通用 Card 堆叠与历史基准差异可重复。
2. 只重组 V3 meanings 展示组件并复用旧版 CSS class；不修改 V3 wire、API、model 或后端。
3. 跑绿 #140–#148，并重跑现有 stable ID、方言文本、主/上下文关联、保存和问题定位回归。
4. 启动最新本地前后端，按 #149 使用真实页面完成四档与键盘验收；不自动提交、推送或部署。

### Step 3 精确恢复执行记录

- [x] #140–#148 已落地：Step 3 使用 `82203e0` 的 `STEP 03`、语义区间总卡、词性 Tab、语法结构卡、彩色可折叠词义卡、多维释义/例句/关联词三分区和 V2 操作栏；V3 writable content、稳定 UUID、方言文本、主/上下文关联与 issue locator 保持原生。
- [x] “完成并进入预览”仅在 `save_meanings(intent=complete)` 成功后进入预览；保存失败留在 Step 3 并保留本地输入。页面/组件定向回归 55/55 通过。
- [x] #145 四类释义方式可切换；definition UUID 保持，只有 wire 形状要求新增的 rich-text 节点生成新 UUID。
- [x] #147 真实页面显示近义词、反义词、派生词三类卡片；不显示 raw role 或内部 ID。
- [x] #149 本地前端 `localhost:3001` 对接后端 `localhost:8383`，在 390/768/1024/1440 下均无页面级横向滚动；窄屏关联词单列、宽屏三列，词义卡键盘折叠正常。
- [x] #150 先在真实浏览器复现开关聚焦后 Enter/Space 不切换，失败测试连续两次稳定；修复后组件回归与真实浏览器 Enter 切换均通过。
- [x] 全量覆盖率使用仓库原生命令单 worker 稳定模式通过：161 files / 2456 tests；Statements 95.28%、Branches 91.19%、Functions 95.75%、Lines 96.45%。根级 typecheck、lint、Admin production build 与 `git diff --check` 均通过。

## 2026-08-28 Step 3 左栏七项完成情况

最新产品决定在“词形变化”和“语法结构”之间单列“语义区间”，左栏调整为七项产品结构。所有数量直接从当前 V3
原生 draft 计算；`base` 原形及其发音不计入“词形变化”，同一 canonical form 被多个
group 复用时只计一个业务节点；不读取或转换 V2 wire。

| #   | 层级        | 场景                                   | 输入/前置                                                     | 预期                                                                                                                                                                        | 自动化落点                      | 优先级 |
| --- | ----------- | -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| 151 | 单元        | 空草稿七项结构                         | `forms.pos=[]`、`meanings.pos=[]`                             | 固定顺序为方言识别、基本词性、词形变化、语义区间、语法结构、多维词义、多维例句；后六项数量均为 0；不生成原形发音独立行                                                      | `readiness.test.ts`             | P0     |
| 152 | 单元        | 多 POS 与部分/完整词形计数             | 多 POS；每个 POS 含 base 与多个派生 concrete form             | 基本词性按 POS 数；词形变化只计非 base canonical form；空、部分、完整 draft 均返回当前实际数量，不显示完成数/总数                                                           | `readiness.test.ts`             | P0     |
| 153 | 单元        | 多 group 共享词形不重复计数            | 一个派生 concrete form 被两个 group membership 复用           | 词形变化仍计 1；不按 group 数或 membership 数膨胀；导航目标保留 V3 form/group/pos 稳定 UUID                                                                                 | `readiness.test.ts`             | P0     |
| 154 | 单元        | 多 POS 的 group/grammar/sense/sentence | 多 sense group、grammar、sense；每个 sense 含 0/1/多 sentence | 语义区间、语法结构、多维词义、多维例句分别按原生节点求和；definition、relation 不混入七项数量                                                                               | `readiness.test.ts`             | P0     |
| 155 | Wizard 集成 | 未保存 draft 实时更新                  | `setDraftForms` / `setDraftMeanings` 后不执行 save            | 左栏数量立即使用内存 draft 更新；切换七项不会触发保存、重铸 UUID 或改变 dirty；保存/发布仍沿用既有 V3 语义                                                                  | `V3WordCreationWizard.test.tsx` | P0     |
| 156 | 布局集成    | 已完成勾与当前/未完成序号              | 不同 `completed_steps` 与 active step                         | 已完成项为深色实心圆勾；当前和未完成项为对应全局序号 1–7 的空心圆；方言识别右侧仅显示“完成”，其余只显示实际数量                                                             | `V3WordCreationLayout.test.tsx` | P0     |
| 157 | 布局回归    | 删除四步工程状态与额外行               | 任意空/部分/完整草稿及 dirty/issues                           | 完成情况 DOM 不含基础信息、词形编辑、词义编辑、发布检查、原形发音，也不含 `x/y`、待完成、未保存、待核对                                                                     | `V3WordCreationLayout.test.tsx` | P0     |
| 158 | Wizard 集成 | 七行 V3 导航映射                       | 七项均可点击；对应类别有/无校验 issue                         | 方言识别进 basics；基本词性/词形变化进 forms；语义区间/语法结构/多维词义/多维例句进 meanings；优先使用对应 issue 的稳定定位，否则定位原生 group/grammar/sense/sentence 节点 | Wizard + layout tests           | P0     |
| 159 | 手测        | 七项完成情况真实验收                   | 真实后端；未保存 forms/meanings                               | 七项顺序、深色勾/序号圆、数量和点击定位实时正确；无页面级横滚/遮挡；最终页面保留在用户可继续操作的状态                                                                      | Codex 内置浏览器                | 必验收 |

### Step 3 七项完成情况执行顺序

1. 先落地 #151–#158 并证明当前四步工程状态、额外行和非实时数量回归稳定失败。
2. 只新增 V3 原生完成情况投影并接入当前 Wizard draft；不修改后端、OpenAPI、V2 wire、保存流或稳定身份操作。
3. 跑绿 #151–#158，并重跑现有 issue navigation、dirty、save、publish 与 Step 2/3 页面回归。
4. 按 #159 启动或复用最新本地前后端，使用 Codex 内置浏览器完成四档真实验收；不提交、推送、开 PR 或部署。

## 2026-08-27 Step 3 V3 原生默认词义模板

本轮同时恢复 V2 `ensureMeaningsForForms()` 已验证的产品默认，但实现为独立 V3
initializer。初始化只发生在 session/canonical 首次装载或 forms 新增尚无 meanings 的
POS 时；已有 sense group、POS meanings、管理员内容和稳定 UUID 原样保留，不在 render
期间补写或重建。

| #   | 层级        | 场景                              | 输入/前置                                            | 预期                                                                                                                                                                                          | 自动化落点                           | 优先级 |
| --- | ----------- | --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| 160 | 单元        | 空 canonical + 多 POS 初始化      | 空 `sense_groups/pos`；forms 有多个 POS              | 一次创建 1 个空 sense group；每个 POS 创建 1 个 common 空 grammar、1 个绑定默认 group 的 A1 sense、1 条空 `zh_definition`、1 条 unified 英中空例句；focus 指向当前 word/sense；relations 为空 | `meaningsModel.test.ts`              | P0     |
| 161 | 单元        | 部分 POS 只补缺失节点             | 已有 group 和一个 POS meanings；forms 新增另一 POS   | 已有 group/POS/grammar/sense/definition/sentence/文本 UUID、内容和顺序均保持；只为缺失 POS 追加完整默认模板；不删除、重排或合并任何已有 meanings                                              | `meaningsModel.test.ts`              | P0     |
| 162 | 单元        | initializer 幂等与稳定 UUID       | 同一 initialized draft 连续调用两次                  | 第二次返回同一 draft 引用或结构完全不变；ID factory 不再被调用；不新增 group/POS/grammar/sense/definition/sentence/link/relation                                                              | `meaningsModel.test.ts`              | P0     |
| 163 | Wizard 集成 | session/rerender/切步骤只生成一次 | 空 canonical；多次 rerender；forms ↔ meanings 切换   | 首次 session 初始化后数量立即为 grammar/sense/sentence 各 POS 1；全部生成 UUID 在 rerender 和切步骤后稳定；不得因 React render 重复生成；初始化 meanings 记为未保存并阻止直接发布             | `V3WordCreationWizard.test.tsx`      | P0     |
| 164 | Wizard 集成 | forms 新增缺失 POS 实时补模板     | session 已有一个 POS 模板；未保存 forms 新增第二 POS | 只为新增 POS 生成一次完整 V3 模板；六项数量实时增长；forms/meanings dirty 独立保持；删除/编辑已有 POS 不重建其 meanings 或 UUID                                                               | `V3WordCreationWizard.test.tsx`      | P0     |
| 165 | 组件回归    | Step 3 不显示手动开场空态         | canonical meanings 空或某 forms POS 缺 meanings      | 进入 Step 3 即显示空白语义区间、语法结构、A1 词义、空释义和空例句编辑器；DOM 不含“暂无语义区间”“当前词性还没有词义内容”“开始录入词义”                                                         | Wizard + meanings component tests    | P0     |
| 166 | 真实联调    | 默认模板保存与刷新 read-back      | 真实后端；空 meanings 多 POS 草稿                    | 保存草稿后 canonical read-back 保留所有生成 UUID、默认 group/POS/grammar/sense/definition/sentence/focus；relations 仍为空；空字段允许草稿保存，complete/发布继续由 V3 校验阻断               | Codex 内置浏览器 + save request 断言 | 必验收 |

### V3 默认词义模板执行顺序

1. 先落地 #160–#165，连续证明当前空态、手动“开始录入”和缺失 POS 不补模板的回归成立。
2. 在 V3 meanings model 新增纯 initializer，并只从 Wizard session/canonical 初始化与 forms 缺失 POS 接线；不修改 V2、后端、OpenAPI 或 wire。
3. 跑绿 #160–#165，并验证初始化模板触发 meanings dirty、保存后 canonical 替换、完整校验/发布仍以后端为权威。
4. 与 #159 同一次真实浏览器四档验收中完成 #166，并把最终 Step 3 页面留给用户。

### Step 3 完成情况与默认模板执行记录

- [x] #151–#158、#160–#165 先建立联合失败回归：新增用例在旧四步状态、空 meanings 和缺失 initializer 下 18 项稳定失败；实现后核心 readiness/model/layout/wizard 99/99 通过，页面、forms、meanings、preview、navigation、save 与 operations 相邻回归通过。
- [x] 最新七项固定为方言识别、基本词性、词形变化、语义区间、语法结构、多维词义、多维例句；V3 concrete form 仅统计非 `base`，同一 form 跨 group 复用不重复计数；右侧无 `x/y`、待完成、未保存、待核对。
- [x] 空 canonical 多 POS 在 session 初始化生成 1 个默认 sense group，并为每个缺失 POS 生成 common grammar、A1 sense、空 `zh_definition`、unified 英中空例句和唯一 focus 主关联；relations 保持空数组。部分 POS、重复调用、rerender、切步骤与更新 canonical 的 UUID/内容保护均有自动回归。
- [x] localhost:3001 + backend:8383 真实页面七行 DOM 顺序、深色完成勾、序号空心圆、实时数量、Step/节点导航与禁用文案均通过；点击“语义区间”准确聚焦第一条中文输入，控制台无 error/warning，未保存或修改草稿。
- [x] #166 真实保存并刷新 read-back：默认 group/grammar/sense/sentence 四类 UUID 全部保持，dirty 清除，focus 主关联仍在，relation 节点为 0，页面无三类手动开场空态，控制台无 error；最终 Step 3 页面已留在 Codex 内置浏览器。
- [x] 最终 `pnpm test:cov`：161 files / 2486 tests；Statements 95.27%、Branches 91.17%、Functions 95.82%、Lines 96.47%。根级 typecheck、lint、Admin production build 与 `git diff --check` 均通过。

## 2026-08-27 Step 2 英美方言独立面板 parity

本轮以权威产品截图为最终视觉事实，以
`82203e03af0a3c3eeea766e100f3da5f20d0a167` 的 V2 DOM、字段层级、排序操作与窄屏
堆叠规则为行为基准。截图明确覆盖旧版连续三列表格：宽屏的“词形类型”是独立窄列，
BrE 与 AmE 是两张分别具有表头、背景、边界和圆角的完整面板，中间保留可见间距。
本节同时覆盖 #107 中“UD 使用共享拼写单面板”的旧视觉假设；UD 仍原子维护相同拼写，
但英美发音和各自可见拼写行归属两张方言面板。

| #   | 层级          | 场景                                | 输入/前置                                                            | 预期                                                                                                                                                                                                           | 自动化落点                             | 优先级    |
| --- | ------------- | ----------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 167 | 组件集成      | DD 多词形独立类型列与双面板         | DD；原形 + 同组多条词形；每侧一条或多条发音                          | DOM 只有一列独立 `词形类型`；BrE/AmE 各有独立 panel、表头和逐 form 行；每个类型/排序/删除单元与对应英美行保持同一矩阵行，不再渲染一张连续三列表格                                                              | `V3FormsAndPronunciationStep.test.tsx` | P0        |
| 168 | 组件集成      | UD 同拼写、双发音仍分属两面板       | `spelling_mode=unified`、`phonetic_mode=distinguish`；UK/US 拼写相同 | 仍显示独立 BrE/AmE 面板和两侧发音列表；两侧拼写输入可见且编辑任一侧会原子更新两侧相同值；variant/pronunciation UUID、各自发音数量和顺序不合并                                                                  | forms component + operations tests     | P0        |
| 169 | 组件回归      | UU 不错误显示双面板                 | `unified/unified` + common variant                                   | 继续只显示“英美共用”结构；DOM 不出现 BrE/AmE 独立 panel class，不复制 common variant 或 pronunciation                                                                                                          | `V3FormsAndPronunciationStep.test.tsx` | P0        |
| 170 | 组件回归      | 多 base、同类型多条、共享关系不合并 | 同组多个 base、相同 `form_type` 多条、一个 form 被多个 group 复用    | 按 membership 顺序逐条渲染独立类型行与双方言行；不按 `form_type`/拼写去重；form/group/membership/variant/pronunciation UUID、共享引用和排序/删除/TTS/save 回调保持 V3 原生                                     | forms component + existing regressions | P0        |
| 171 | DOM/CSS       | 面板间距、边界与圆角契约            | 宽屏 DD/UD                                                           | 使用稳定的 separated-matrix/type-column/dialect-panel DOM class；类型列不落入 BrE 边界；BrE/AmE panel 之间至少 24px 留白，双方言分别拥有四角圆角和边界，表头/内容背景不跨越间距                                | component DOM + `v3-forms.css?raw`     | P0        |
| 172 | 响应式        | V2 窄屏规则安全堆叠                 | 390/768；DD/UD 多行                                                  | 类型表头/类型单元按既有 V2 规则跨对应的英美两行，BrE/AmE 上下堆叠；矩阵使用 `minmax(0, 1fr)` 且不设置内部横向滚动，页面 `scrollWidth <= clientWidth`                                                           | CSS contract + Codex 内置浏览器        | P0/必验收 |
| 173 | 手测          | 四档真实页面视觉与无横滚验收        | localhost:3001 + 8383；390/768/1024/1440；DD、UD、UU                 | DD/UD 宽屏为独立类型列 + BrE 面板 + 留白 + AmE 面板；窄屏安全堆叠；UU 单面板；四档均无页面横滚，排序/删除/TTS/保存入口可用，最终页面留给用户继续操作                                                           | Codex 内置浏览器                       | 必验收    |
| 174 | 单元/组件集成 | base/non-base 行内同类型新增        | 当前行为 base 或任意 non-base；同类型已存在多条                      | 类型单元操作顺序为上移/下移/`＋`/删除；点击 `＋` 后在当前行正下方创建同 `form_type` 的新 V3 concrete form 与当前 group membership；多个 base、同类型多条均允许；按钮有指名当前行的中文 aria-label 且可键盘触发 | operations + forms component tests     | P0        |
| 175 | 单元          | 行内新增继承 UU/UD/DD 与默认发音    | 三种合法 POS 规则分别点击 `＋`                                       | UU 新 form 创建 common variant；UD/DD 创建 uk/us variants；每个 variant 默认一条 `normal` 空发音；variant/pronunciation UUID 全部唯一稳定，UD 两侧初始拼写相同                                                 | `operations.test.ts`                   | P0        |
| 176 | 单元/组件集成 | 插入顺序、所属组与共享 form 边界    | 当前 form 位于组中间或被多个 group 共享                              | 新 form 只加入触发按钮所在 group，membership 紧跟当前 membership；原 group 顺序之外不变；原 form/membership/所有 UUID 不变；新 canonical form 不复用原 form UUID，也不自动加入其他共享 group                   | operations + forms component tests     | P0        |
| 177 | 组件回归      | 删除约束与底部入口收口              | 最后一项、两项及新增后状态                                           | 最后一项删除仍禁用；新增第二项后恢复可删除；卡片底部不显示旧入口，但展开内容结束后保留 16px 内边距；收起时不产生空白条；已有共享词形继续按原生 V3 数据显示和编辑                                               | `V3FormsAndPronunciationStep.test.tsx` | P0        |
| 178 | 响应式/手测   | 行内操作区四档不溢出                | 390/768/1024/1440；类型标签较长；四个图标按钮                        | 上移/下移/删除/新增保持在类型单元内并可换行或紧凑排列，不覆盖 BrE/AmE 内容、不撑出页面；四档 `scrollWidth <= clientWidth`，键盘聚焦 `＋` 后 Enter/Space 均可触发一次新增                                       | CSS contract + Codex 内置浏览器        | P0/必验收 |

### Step 2 英美方言独立面板执行顺序

1. 先落地 #167–#172、#174–#178 的 DOM、联动、插入与 CSS 契约断言，并连续运行两次，证明当前连续表格、UD 共享单元和底部新增入口回归稳定失败。
2. 重组 `V3ConcreteFormRow` / `V3FormGroupCard` 的呈现 DOM 与 `v3-forms.css`，并在 `operations.ts` 增加最小的“同类型向下新增”原生 V3 操作；不修改 wire、后端或 OpenAPI。
3. 跑绿 #167–#172、#174–#178，并重跑多个 base、重复类型、共享 membership、多发音、排序/删除/TTS/save 与稳定 UUID 的既有回归。
4. 复用 localhost:3001 + 8383，按 #173/#178 完成四档真实页面验收；只做未保存临时状态，不提交、推送、开 PR、部署或删除数据。

### Step 2 英美方言独立面板执行记录

- [x] #167–#172、#174–#178 先更新矩阵，再连续两次建立失败回归：旧 DOM 缺少 separated matrix、UD 仍使用共享单元、没有行内新增 operation/按钮且 CSS 契约缺失；实现后 operations + forms 定向 64/64、V3 目录 331/331 通过。
- [x] DD/UD 使用独立类型列与 BrE/AmE 完整面板；宽屏实测面板间距 28px、双方言圆角 14px。UU 继续使用单一“英美共用”结构；UD 编辑任一侧拼写会原子同步两侧，但 variant/pronunciation UUID、数量和顺序保持独立。
- [x] 行内操作顺序为上移/下移/`＋`/删除，中文 aria-label 指名同类型序号；UU/UD/DD 均创建符合规则的新 concrete form、regional variants、默认 `normal` 发音和当前 group membership，并紧跟当前行。共享 form 场景创建新 canonical form，不复用原 UUID；底部类型选择、“添加词形”和“复用已有词形”入口已移除，最后一项删除约束保持。
- [x] localhost:3001 + backend:8383 的 `harbor` 真实页面只构造未保存临时状态；390/768/1024/1440 均满足 `document.scrollWidth === clientWidth`，窄屏操作区在类型单元内安全换行，1440px 为独立类型列 + BrE + 28px 留白 + AmE。未调用保存、未删除数据，最终 DD 双原形页面已留在 Codex 内置浏览器。
- [x] 最终 `pnpm test:cov`：161 files / 2486 tests；Statements 95.27%、Branches 91.17%、Functions 95.82%、Lines 96.47%。根级 typecheck、lint、Admin production build 与 `git diff --check` 均通过。

## 2026-08-28 Step 3 CEFR Select parity

本轮继续以 `82203e03af0a3c3eeea766e100f3da5f20d0a167` 的 V2 Step 3 为产品基准，
把词义、释义和例句等级从自由文本输入恢复为 antd `Select`。三个控件只复用共享
`CEFR_OPTIONS` 提供 A1/A2/B1/B2/C1/C2；V3 wire 仍保留 `string`，不修改后端、
OpenAPI、运行时 schema 或 `@tsz/types`。

| #   | 层级          | 场景                         | 输入/前置                                 | 预期                                                                                                                             | 自动化落点                           | 优先级 |
| --- | ------------- | ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| 179 | 组件集成      | 三类等级控件恢复 V2 Select   | Step 3 含一个 sense、definition、sentence | 词义等级、释义等级、例句等级均为 antd `Select`，不再是自由文本 `Input`；下拉可选值严格为共享 `CEFR_OPTIONS` 的 A1/A2/B1/B2/C1/C2 | `V3MeaningsAndExamplesStep.test.tsx` | P0     |
| 180 | 组件回归      | 已有合法等级完整回显         | 三个节点分别已有 A2/B1/C1                 | 初次渲染三个 Select 分别显示原 wire 字符串，不触发 `onChange`，不重建或归一化任何节点                                            | meanings component test              | P0     |
| 181 | 状态/身份回归 | 切换只更新目标 level         | 依次切换 sense、definition、sentence 等级 | 每次只替换目标节点的 `level: string`；该节点 UUID、其他字段、同级节点、focus/context links 与整个草稿其余结构逐项不变            | meanings component test              | P0     |
| 182 | 兼容回归      | 未知历史字符串安全回显与收敛 | 三个 level 均为不在六档中的历史字符串     | 渲染不崩溃、不静默改写原值；下拉仍只提供六个合法 CEFR；管理员选择合法值后仅把对应 level 收敛为该字符串，其他字段与 UUID 不变     | meanings component test              | P0     |
| 183 | 真实浏览器    | harbor Step 3 CEFR 操作验收  | localhost:3001；现有 harbor 进入 Step 3   | 三类等级均呈现六档 Select；已有值回显，实际切换可见且不影响同卡其他字段；页面无控制台 error，最终 Step 3 页面保留给用户          | Codex 内置浏览器                     | 必验收 |

### Step 3 CEFR Select 执行顺序

1. 先落地 #179–#182 的组件失败回归并连续运行两次，证明当前三个等级仍为自由文本 Input，且没有固定 CEFR 选项契约。
2. 仅在 V3 Step 3 组件引入共享 `CEFR_OPTIONS`，把三个 Input 替换为 antd Select；保持现有 V3 `string` wire 和 mutation 路径。
3. 跑绿 #179–#182，并重跑 Step 3/V3 相邻回归、全覆盖率、typecheck、lint、Admin build 与 `git diff --check`。
4. 在 localhost:3001 的 harbor Step 3 完成 #183 真实浏览器验收；不提交、推送、开 PR、部署或清理测试数据。

### Step 3 CEFR Select 执行记录

- [x] #179–#182 先连续两次建立失败回归：旧实现的三类等级控件均无 `combobox` 角色，仍是自由文本 Input；实现后 Step 3 定向 25/25、根级覆盖率 161 files / 2493 tests 全绿。
- [x] 三处统一复用共享 `CEFR_OPTIONS`，合法 A1/A2/B1/B2/C1/C2 原值直接回显；选择新等级只替换目标 `level: string`，完整草稿深比较证明 UUID、其他字段、同级节点和 links 不变。未知历史字符串在选择前保持原样且不触发改写，选择合法项后仅收敛该 level。
- [x] localhost:3001 + backend:8383 的 `harbor` Step 3 真实验收通过：三类下拉各自只有六档；A1 初始回显后依次切换为 B2/C1/C2，25 个 `data-v3-node-id` 和语义区间、语法结构、词频、释义正文、双语例句逐项不变，控制台 error 为 0。验收后已恢复三项 A1，未保存，并保留最终 Step 3 页面。
- [x] 最终根级 typecheck、lint、Admin production build 与 `git diff --check` 均通过；没有提交、推送、开 PR 或部署。

## 2026-08-28 `/words` presentation strategy 兼容修复

后端 `v3_projection.rs` 已把 `short_uuid_v1` 定义为 V3 草稿没有可展示 surface
时的正式 presentation strategy；前端只能显式识别这项既有正式策略，不能把任意
未知非空 strategy 静默当成成功。OpenAPI 和 `@tsz/types` 继续保留 `string` 前向
兼容边界：正式已知值不产生日志，真正未知值仍展示服务端 label 并进入可诊断错误
观测；未知 schema、缺失或非法 presentation shape 继续 fail closed。

| #   | 层级       | 场景                           | 输入/前置                                                              | 预期                                                                                                                                                                                                                        | 自动化落点                   | 优先级 |
| --- | ---------- | ------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| 184 | 单元       | 识别后端正式空 surface 策略    | V3 presentation 为 label + 空 matched surfaces + `short_uuid_v1`       | 忠实返回服务端 label；strategy 判为已知，不调用错误 reporter；不从 form、entry ID 或 strategy code 重建展示名                                                                                                               | `presentation.test.ts`       | P0     |
| 185 | 单元       | 真正未知 strategy 保持可诊断   | V3 presentation 为 `future_strategy_9`；另含已知/空 strategy 与 V2     | 真正未知值只上报一次 entry/strategy 诊断且不静默成功；已知值、空值与 V2 不误报；未知 schema 或非法 presentation 继续由 runtime schema fail closed                                                                           | presentation + runtime tests | P0     |
| 186 | 列表集成   | 五条 V2/V3 混合列表与统计/路由 | 5 条真实 wire 形状，含 V2、V3 `surface_summary_v1`、V3 `short_uuid_v1` | 表格显示 5 行和服务端 labels，统计 total/today/month 正确；V2 进入 `/wizard`，V3 进入 `/v3/wizard`；除服务端 label 自带内容外，可见文本、tooltip、确认文案与可访问名称不额外暴露 entry UUID、独立短 ID 或原始 strategy code | `SmartDictionary.test.tsx`   | P0     |
| 187 | 页面接线   | 正式页未知策略错误观测边界     | `WordsPage` 收到真正未知 strategy observation                          | 接到浏览器标准错误观测入口，错误名/信息可定位 strategy；`short_uuid_v1` 不会走该入口                                                                                                                                        | `Words.test.tsx`             | P0     |
| 188 | 真实浏览器 | 旧异常草稿 `/words` 控制台复验 | localhost:3001 + 8383；保留草稿 `01a042f8-6c7d-7401-beca-ac149624e7b1` | 列表仍为 5 条且统计/labels/V2-V3 路由正常；服务端 label 原样显示，页面不额外暴露 entry UUID、独立短 ID 或原始 code；刷新与路由操作不再出现 `UnknownPresentationStrategyError`；不修改、删除或重建任何数据                   | Codex 内置浏览器             | 必验收 |

### `/words` presentation strategy 执行顺序

1. 先落地 #184–#187 并连续运行两次，证明 `short_uuid_v1` 在当前前端稳定触发未知策略失败，同时保留真正未知策略的诊断断言。
2. 只把后端已存在的 `short_uuid_v1` 加入显式正式策略集合，并移除列表 UI 中既有内部 ID 展示；不改后端、数据库、OpenAPI、wire 或任意草稿数据。
3. 跑绿定向测试，再运行根覆盖率、typecheck、lint、Admin build 与 `git diff --check`。
4. 按 #188 复用真实本地服务完成 `/words` 控制台与路由复验；只读页面和请求，不执行任何数据写入。

### `/words` presentation strategy 执行记录

- [x] #184–#187 先连续两次建立相同失败基线：`short_uuid_v1` 每次都被误报为未知 strategy，5 条混合列表 reporter 收到同一 observation，列表仍显示独立短 ID；最小实现后 presentation/list/page 定向 25/25 通过。
- [x] 后端当前 `v3_projection.rs` 明确定义 `short_uuid_v1` 为无 surface 草稿的正式策略；前端只把该精确值加入已知集合。`future_strategy_9` 仍进入 `UnknownPresentationStrategyError` 诊断，未知 schema/非法 presentation shape 的 runtime fail-closed 边界未修改。
- [x] 混合集成覆盖 5 行、total/today/month、服务端 label、V2 `/wizard` 与 V3 `/v3/wizard` 路由；entry ID 继续只用于 row key、请求与路由，不进入可见文本、tooltip、确认文案或可访问名称，原始 strategy code 也不显示。
- [x] localhost:3001 + backend:8383 真实 `/words` 为 5 条，统计 5/0/5；旧草稿显示服务端 label `未命名词条 · 01a042f8`。刷新、进入该草稿 V3 forms、进入已发布 V3 preview、返回列表后浏览器 error 与 `UnknownPresentationStrategyError` 均为 0。当前 5 条真实数据均走 V3，未为补 V2 现场而修改数据库；V2/V3 路由边界由混合集成覆盖。
- [x] 最终根 `pnpm test:cov` 为 161 files / 2493 tests；Statements 95.27%、Branches 91.18%、Functions 95.82%、Lines 96.47%。typecheck、lint、Admin production build 与 `git diff --check` 均通过；未修改后端、数据库或 OpenAPI，未 commit/push/PR/deploy。

## 2026-08-28 Step 2/3 完成时序修复

Step 2 的“进入词义与例句”继续是纯导航：不校验、不保存、不阻断。真正进入预览时，
前端必须按服务端 V3 步骤状态完成缺失的 forms，再用返回的 canonical revision 完成
meanings。两个请求仍分别经过原生 `intent=complete` 校验、稳定 UUID、revision 锁和
既有 409/422 问题处理；不新增聚合接口，不修改 wire、后端或 OpenAPI。

| #   | 层级        | 场景                                | 输入/前置                                                                 | 预期                                                                                                                                                                                                             | 自动化落点                         | 优先级 |
| --- | ----------- | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------ |
| 189 | 页面集成    | Step 2 继续纯导航                   | forms 未完成、无效或有未保存草稿；点击“进入词义与例句”                    | 只切到 Step 3；impact/forms/meanings 请求均为 0；不显示校验错误、不阻断，当前 forms 草稿与全部稳定 UUID 原样保留                                                                                                 | `WordWizardV3.test.tsx` existing   | P0     |
| 190 | Wizard 集成 | 预览边界顺序补全两步                | canonical `completed_steps=[basics]`；forms 与 meanings 均有效            | 先且仅先发送 forms `intent=complete` + revision N；接受 canonical N+1 后再发送 meanings `intent=complete` + revision N+1；最终 canonical 为 N+2、两步 dirty 清除并进入 preview                                   | `V3WordCreationWizard.test.tsx`    | P0     |
| 191 | Wizard 集成 | forms 422 定位并中止 meanings       | forms complete 返回带稳定 `node_location` 的 422                          | meanings 请求为 0；页面回到 Step 2 对应 POS/form/variant/pronunciation 字段；本地 forms/meanings 草稿、UUID 与 dirty 保留，失败请求不替换 canonical                                                              | Wizard issue-navigation regression | P0     |
| 192 | Wizard 集成 | forms 409 与并发锁保持              | forms complete 返回 `revision_conflict`；或同 tick 双击预览               | 409 沿现有刷新比较路径处理且不发送 meanings；同 tick 最多一条 forms 请求，成功后最多一条 meanings 请求；不轮换稳定 UUID、不绕过 revision 锁                                                                      | Wizard concurrency regression      | P0     |
| 193 | Wizard 集成 | forms 成功、meanings 失败的分步状态 | forms complete 接受 N+1；meanings complete 返回 422/409                   | 保留 N+1 forms canonical 与已清 forms dirty；meanings 本地草稿/dirty 保留并沿现有问题处理定位或比较；停在对应步骤，不伪造 preview；重试使用当前 canonical revision                                               | Wizard canonical/dirty regression  | P0     |
| 194 | Wizard 集成 | 已完成 forms 不重复写               | canonical 已含 `forms`，直接从 Step 3 进入预览                            | 跳过 forms 请求，只发送 meanings `intent=complete`；既有 422、409、重试和预览导航语义不变                                                                                                                        | existing + targeted wizard tests   | P0     |
| 195 | 身份回归    | 跨两次 complete 保持 V3 原生内容    | 多 POS、共享 membership、多 base、英美 variant、多发音、meanings links    | 两个请求逐项等于当前 writable draft；form/group/member/variant/pronunciation/grammar/sense/definition/sentence/link/relation UUID 不重铸、不转换成 V2，不增加客户端校验或契约字段                                | Wizard request-body assertions     | P0     |
| 196 | 真实浏览器  | harbor 预览主链复验                 | localhost:3001 + 8383；`01a0437d-c32a-7b91-843c-c15a1caabab4` 当前 Step 3 | 首次点击依次得到 forms complete 200、meanings complete 200 并进入 preview；网络顺序与 base revision 连续；不再出现 `step_not_reachable`，无控制台 error；真实 422 定位由自动化守护，不为复验故意破坏 harbor 数据 | Codex 内置浏览器                   | 必验收 |

### Step 2/3 完成时序执行顺序

1. 复用真实 harbor 连续两次捕获当前 meanings complete 409，保留原始响应体；不先改业务代码。
2. 先落地 #190–#195 的失败回归，保留 #189 既有纯导航守护；连续运行两次确认旧实现稳定漏发 forms complete。
3. 只在 V3 Wizard 的预览边界补最小顺序控制；继续调用既有 forms/meanings 请求、canonical flow、问题分类、issue navigation 与并发锁。
4. 跑绿定向、V3 相邻回归、根覆盖率、typecheck、lint、Admin build 和 `git diff --check`，最后按 #196 用真实浏览器复验。

## 2026-08-28 Step 3 语义区间与语法结构拖拽 parity

`82203e0` 的 V2 语法结构使用 `≡` 拖拽手柄，支持原生拖放与键盘上下键；当前
V3 错误地换成了上移/下移按钮。V2 历史语义区间本身没有拖拽，但用户明确要求
语义区间也采用同一交互，因此本节把相同的可访问拖拽模式扩展到语义区间。排序
只移动现有数组项，不重建任何 V3 节点、不改变引用或请求契约。

| #   | 层级       | 场景                          | 输入/前置                                           | 预期                                                                                                                                                       | 自动化落点                              | 优先级 |
| --- | ---------- | ----------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| 197 | 组件回归   | 当前箭头降级稳定复现          | 两个语义区间、两个语法结构                          | 修复前没有“拖动语义区间/拖动语法结构”手柄，仍显示上下箭头；失败基线连续两次一致                                                                            | `V3MeaningsAndExamplesStep.test.tsx`    | P0     |
| 198 | 组件集成   | 语义区间原生拖放排序          | 两个以上语义区间；从第 2 项拖到第 1 项              | 使用独立 `application/x-tsz-v3-sense-group` scope；拖放后只改变 `sense_groups` 顺序，group UUID、名称和所有 sense `sense_group_id` 引用逐项不变            | meanings component test                 | P0     |
| 199 | V2 parity  | 语法结构原生拖放排序          | 同一 POS 两个以上 grammar；从第 2 项拖到第 1 项     | 恢复 `≡` 手柄、grab/grabbing、dragging/drag-over 状态；只移动当前 POS 的 `grammar_structures`，grammar/variant/content UUID 与 definition binding 原样保留 | meanings component + DOM/CSS assertions | P0     |
| 200 | 可访问性   | 键盘上下键与单项禁用          | 1 项、2 项；手柄聚焦后 ArrowUp/ArrowDown            | 单项手柄禁用并说明至少需要两项；多项上下键排序并阻止越界；Enter/Space 不误触排序；删除仍是独立危险操作                                                     | meanings component test                 | P0     |
| 201 | 错误边界   | 外部、跨类型、跨 POS 数据拒绝 | 缺失/非法 JSON、错误 MIME、其他 POS grammar payload | 不排序、不抛错；语义区间 payload 不能拖进 grammar，grammar 不能跨 POS；drag leave/end 清理视觉状态                                                         | meanings component test                 | P0     |
| 202 | 身份与保存 | 拖拽后保存 V3 writable draft  | 多 POS、共享语义引用、definition grammar binding    | `onChange/onSave` 保持原 V3 writable 形状；只改变目标数组顺序，不重铸 group/grammar/variant/sense/definition UUID，不改 wire、后端或 OpenAPI               | component + wizard existing regressions | P0     |
| 203 | 真实浏览器 | harbor 拖拽与响应式复验       | localhost:3001 + 8383；390/768/1024/1440            | 语义区间与语法结构均显示拖拽手柄；鼠标/键盘排序可见、无页面横滚或遮挡；未保存状态正确，最终恢复原顺序后再做预览时序验收                                    | Codex 内置浏览器                        | 必验收 |

### Step 3 拖拽 parity 执行顺序

1. 先落地 #197–#202 的 DOM、拖放、键盘、scope 与稳定 UUID 失败回归，并连续运行两次。
2. 复用 V2 的原生 HTML5 drag payload、键盘方向键和现有 CSS 语言；语义区间使用独立 MIME，语法结构按 POS 隔离 scope。
3. 删除这两类列表的上下箭头，只保留拖拽手柄与删除；其他 meanings 列表不在本轮顺手改造。
4. 跑绿定向与全部质量门，再按 #203 做真实浏览器复验。

## 2026-08-28 语义区间降级为词性内词义结构

语义区间不是 Step 3 顶级功能。它必须位于具体词性 Tab 内、语法结构之前、词义卡
之前，并且只管理该词性的词义。现有 V3 wire 继续保留顶层 `sense_groups`，词性归属
由该 POS 的 `sense.sense_group_id` 唯一推导；前端必须保证一个 group 不跨 POS 共享，
从而在不改后端/OpenAPI 的情况下得到可持久化的独立语义区间。

| #   | 层级       | 场景                             | 输入/前置                                             | 预期                                                                                                                                                                         | 自动化落点                            | 优先级 |
| --- | ---------- | -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| 204 | 组件结构   | 语义区间不再是顶级卡片           | 多 POS meanings                                       | Tabs 之前不存在 `word-sense-groups-card`；每个词性 Tab 内顺序为语义区间 → 语法结构 → 词义列表；切换 Tab 只显示当前 POS 的区间                                                | `V3MeaningsAndExamplesStep.test.tsx`  | P0     |
| 205 | 初始化     | 空 canonical 为每个 POS 独立建组 | 两个 forms POS，meanings 全空                         | 生成两个不同 group UUID；每个 POS 默认 sense 只引用自己的 group；grammar/sense/definition/sentence/link 仍各自唯一                                                           | `meaningsModel.test.ts`               | P0     |
| 206 | 兼容收敛   | 历史跨 POS 共享 group 安全拆分   | 两个 POS 的 senses 引用同一 group                     | 第一 POS 保留原 group UUID/名称；后续 POS 克隆新 group UUID 并只改自身 `sense_group_id`；所有既有 POS/sense/definition/sentence/grammar UUID、内容和顺序不变；重复初始化幂等 | meanings model tests                  | P0     |
| 207 | 兼容收敛   | 丢失 group 节点与未归属组        | sense 引用缺失 group；另有未被任何 sense 引用的 group | 缺失 group 以原引用 UUID 补回，避免重铸；未归属组保留并只在第一 POS 的兼容区显示，不丢数据、不跨所有 Tab 复制                                                                | meanings model + component tests      | P0     |
| 208 | 组件行为   | 当前 POS 新增语义区间            | 有未归组 sense / 所有 sense 已归组                    | 优先把未归组 sense 绑定到新 group；否则新增一个空 sense 并绑定；新 group/sense UUID 唯一，其他 POS、既有节点和引用不变                                                       | meanings component test               | P0     |
| 209 | 组件行为   | 当前 POS 排序与下拉隔离          | 两 POS 各两组；拖拽/键盘排序、编辑 sense 归属         | 只重排当前 POS group 在顶层数组中的对应槽位；其他 POS 顺序不变；sense 的区间 Select 只列当前 POS group，不允许跨 POS 绑定；拖拽 payload 按 POS scope 隔离                    | meanings component drag tests         | P0     |
| 210 | 删除回归   | 删除当前 POS 语义区间            | 当前组被一个或多个当前 POS senses 引用                | 只删除该 group 并清理对它的引用；其他 POS group/sense 不变；最后一个当前 POS group 禁止删除                                                                                  | meanings component test               | P0     |
| 211 | 身份与请求 | 保存仍使用原生 V3 wire           | 经过拆分、新增、排序、删除后保存                      | body 仍为顶层 `sense_groups` + `pos[].senses[].sense_group_id`；不增加 `pos_id` 字段，不改后端/OpenAPI；已有 UUID 不重铸，新增节点仅使用 `newWordNodeId()`                   | component + wizard request assertions | P0     |
| 212 | 真实浏览器 | harbor 名词/动词层级与独立性验收 | localhost:3001 + 8383；现有共享区间 harbor            | 顶部全局卡消失；名词/动词 Tab 各自在语法结构上方显示自己的语义区间；历史共享组在本地草稿安全拆分，切换、编辑、拖拽不联动；不保存测试改动，控制台 error 为 0                  | Codex 内置浏览器                      | 必验收 |

### 语义区间层级修复执行顺序

1. 先落地 #204–#211 的结构、初始化、兼容拆分、隔离、稳定 UUID 与请求体失败回归。
2. 在纯 meanings model 中建立“一个 group 只归属一个 POS”的幂等 invariant；不修改 wire 类型、API client、后端或 OpenAPI。
3. 把语义区间卡移入 POS editor，列表、Select、新增/删除/拖拽全部只消费当前 POS 视图。
4. 重跑 Step 3、Wizard、409/422、dirty/canonical 与全部质量门，再按 #212 真实浏览器复验。

### Step 3 拖拽与语义区间层级执行记录

- [x] 当前箭头实现与缺少手柄连续两次稳定红；恢复后语义区间/语法结构原生拖放、键盘方向键、跨 MIME/跨 POS 拒绝、单项禁用和 UUID/引用保持均有回归。
- [x] 真实 DOM 发现拖拽手柄 32px、删除按钮 24px 共用左边缘，中心线连续两次相差 4px；统一 32px 操作轨道后，两类卡片 `centerDelta` 均为 0。
- [x] 顶部全局语义区间卡已移除；后续产品口径将词性内顺序调整为语义区间 → 语法结构 → 词义。名词保留原 group UUID，动词使用独立新 group UUID，切换不共享编辑状态。
- [x] 空 canonical 每 POS 独立初始化；历史跨 POS 共享 group 仅为后续 POS 克隆一次，第一 POS 与全部既有 grammar/sense/definition/sentence UUID 不变；缺失 group 以原引用 UUID 补回，重复初始化不再消费 UUID。
- [x] 真实预览边界请求顺序为 forms complete 200（canonical revision 5、`completed_steps=[basics,forms]`）→ meanings complete 422。422 来自动词空语义区间/语法/词义内容及名词子词性，不再出现 `step_not_reachable` 409；页面按原生 meanings issue 定位留在 Step 3。
- [x] 最终定向：model 13/13、component 30/30、Wizard 71/71、page 35/35；根覆盖率 161 files / 2504 tests 全绿，Statements 95.26%、Branches 91.15%、Functions 95.77%、Lines 96.45%。根 typecheck、lint、Admin production build 与 `git diff --check` 通过。
- [x] 未修改 wire、后端或 OpenAPI；未 commit/push/PR/deploy。真实复验只推进了 harbor 的 forms completion 与 revision，meanings 422 未写入。

## 2026-08-28 Step 2 最后使用组提示文案与取消交互

本轮只把最后一个变化组中的移除保护改成产品可理解的确认提示。普通移除、危险删除、
稳定 UUID、共享词形引用、dirty/save 与影响确认继续复用现有 V3 operation 和回调；
不修改 wire、后端或 OpenAPI。

| #   | 层级       | 场景                          | 输入/前置                                            | 预期                                                                                                                                                                            | 自动化落点                             | 优先级 |
| --- | ---------- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 213 | 组件集成   | 最后使用组显示产品化提示      | 同一 canonical form 仅被当前变化组使用；点击普通移除 | 标题为“此词形仅在当前变化组中使用”；说明为“不能只从当前组移除。若不再需要此词形，可将它及相关发音一并删除。”；危险按钮为“删除词形”；不显示“孤立词形”、`membership` 或“使用位置” | `V3FormsAndPronunciationStep.test.tsx` | P0     |
| 214 | 组件回归   | 共享词形仍可只从当前组移除    | 同一 form 被两个变化组共享；从其中一组普通移除       | 直接只移除当前组引用，不打开提示、不删除 canonical form；另一组及 form/variant/pronunciation UUID、内容和顺序保持                                                               | forms component test                   | P0     |
| 215 | 组件回归   | 危险删除仍删除词形全部引用    | 最后使用组提示已打开；点击“删除词形”                 | 继续调用原生 `deleteConcreteForm`：canonical form、全部相关发音及所有组引用一并删除；其他 form/group/member/variant/pronunciation UUID、内容和顺序不变                          | forms component + operations tests     | P0     |
| 216 | 可访问性   | 关闭取消并完整保留 draft      | 打开提示后用关闭 X；再用键盘聚焦危险按钮与关闭入口   | 关闭入口有明确“取消删除词形并保留” aria-label，Enter/Space 可操作；关闭只收起提示，`onChange` 不调用，draft、dirty/save 状态及全部 UUID 原样保留；危险按钮 aria-label 明确      | forms component test                   | P0     |
| 217 | 真实浏览器 | 当前 forms 页面提示与取消验收 | localhost:3001 当前 forms 页面；最后使用组与共享词形 | 鼠标/键盘均可打开并关闭产品化提示；关闭后表单内容和未保存状态不变；共享词形普通移除路径与危险删除入口可辨识；控制台 error 为 0，不执行真实危险删除或保存                        | Codex 内置浏览器                       | 必验收 |

### Step 2 最后使用组提示执行顺序

1. 先落地 #213–#216 的失败回归并连续运行两次，证明旧标题、说明、按钮和关闭入口稳定暴露工程术语或缺少明确可访问名称。
2. 仅替换现有 `Alert` 的产品文案与两个 aria-label；不改 `removeMembership`、`deleteConcreteForm`、dirty/save 或影响确认调用链。
3. 跑绿定向与全部质量门，再按 #217 在当前 forms 页面真实验收；关闭保留草稿，不执行保存、危险删除、提交、推送、PR 或部署。

### Step 2 最后使用组提示执行记录

- [x] #213–#216 先连续两次得到相同失败基线：operations 语义护栏通过，组件测试稳定 4 项失败于旧标题/说明与缺少危险、取消 aria-label；最小实现后 forms + operations 定向 67/67 通过。
- [x] 提示只显示指定标题、说明与“删除词形”；警告区域不含“孤立词形”、`membership` 或“使用位置”。危险按钮 aria-label 为“删除词形及相关发音”，关闭 X aria-label 为“取消删除词形并保留”，两者均为可聚焦、启用的原生 `BUTTON`（`tabIndex=0`）。
- [x] 删除语义回归证明 `deleteConcreteForm` 仍删除 canonical form、相关 variant/pronunciation 和全部组引用；共享 form 从第二组普通移除时第一组 canonical form 与原 membership 保持，且不弹危险提示。
- [x] localhost:3001 当前 harbor forms 页面只构造未保存临时状态：关闭提示前后 23 个 V3 节点标识、18 个输入状态、2 个词形行与 dirty 提示逐项一致；共享移除前后第一组 form/membership 不变，浏览器 console error 为 0。最终保留干净的 1 组/1 form 页面，未保存或执行危险删除。
- [x] 最终根 `pnpm test:cov` 为 161 files / 2507 tests，Statements 95.26%、Branches 91.15%、Functions 95.77%、Lines 96.45%；typecheck、lint、Admin production build 与 `git diff --check` 通过。未 commit/push/PR/deploy。
