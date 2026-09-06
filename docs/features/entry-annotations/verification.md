# 词条标注验收记录

2026-09-06 实施验收时，前端实现和验收完成；当时未提交、推送、开 PR、合并或部署。后续用户授权 ship，交付 SHA 和 PR 由任务交接记录；合并与部署仍未授权。

## 基线及契约

- 唯一 writer：/Users/darwish/Dev/tsz-core/tsz-dev-worktree。
- 分支 codex/dev-worktree-20260906，实施验收基线 HEAD 为 a030f75a2fcfd2cd79a9cf2dc78cc20ed2811563。
- 显式 OPENAPI_SOURCE=/Users/darwish/Dev/tsz-core/tsz-rust-dev-worktree/docs/openapi.json。
- 源 OpenAPI 与生成 runtime snapshot SHA256 一致：c4fe3bcf0f5a594282385900ab6d41eb6ed0705ced03f262ed6cb05e095c2369。
- 真实 create 使用 annotation/annotation_updates，409 meta.annotation_conflict；PATCH /admin/lexicon/entries/{id}/annotation 使用 base_annotation_revision。

## 自动验证

- pnpm --filter @tsz/api-client test：8 文件，413 测试通过。
- 标注弹窗、编辑、UnifiedCreateEntryStep、SmartDictionary、WordCreate 定向集合：5 文件，84 测试通过。
- pnpm typecheck：7 包通过。
- @tsz/admin 与 @tsz/api-client lint：通过。
- pnpm --filter @tsz/admin build：通过。
- pnpm test:cov：退出码 0；174 文件、2906 测试通过。整体 statements 95.14%、branches 90.59%、functions 96.03%、lines 96.46%；未改覆盖率配置、未绕过质量门。
- 独立只读审查发现历史只读邻居空标注会误禁用编辑保存，已修复并补回归；修复复查和最终契约审查均无剩余阻断发现。
- git diff --check 通过。preview 参数、onPreviewCreate、EntryAnnotationPreview、模拟列表与假 forms 页面均已移除。

## 真实浏览器路径

使用独立隐藏 CUA 标签，未操控主协调任务右侧。服务为已有 admin 127.0.0.1:3201，代理 127.0.0.1:8583/api/v1。后端执行任务确认新服务 PID2726、cwd tsz-rust-dev-worktree、隔离库 tsz_dev_worktree_20260906、Redis/2、迁移20260906180000成功；前端任务没有重启服务或直接操作数据库。

主协调任务明确授权独占 center 组、最多创建并保留3条测试词条。所有词条经真实UI创建，无SQL直插。

1. 首次 center 未发现已有原型，无标注弹窗，创建后直接到真实 forms 路由。测试环境内置词典未匹配，通过UI添加名词/base center并保存。
2. 第二条检测到一条已有原型。既有 surface token 流程要求一次最新快照重确认，随后打开真实标注弹窗；填写旧条「中心位置」、新条「篮球中锋」，点击一次保存立即进入第二条forms，无结果弹窗/第二次创建。经UI保存第二条base center，并确认既有词形影响。
3. 第三条完整显示两条已有标注和新条，旧旧相同时显示「同组标注不能相同」且保存禁用。编辑两条旧值后取消，再打开恢复「中心位置 / 篮球中锋」，新条仍空。随后同时改旧值为「地理中心 / 球场中锋」、新值为「机构中心」，一次保存直接进入第三条真实forms。经UI保存第三条base center。
4. /words?keyword=center 完整重载显示3条及「机构中心 / 球场中锋 / 地理中心」，标注在加粗词名下方。首条「标注」入口把「地理中心」改为「中心位置」，成功后列表自动刷新；再次整页刷新仍显示三个真实值。

## 保留数据台账

全部为同一隔离开发库的草稿，名词/base center，未发布；按主协调任务要求保留供用户查看。

| 创建顺序 | 词条ID                               | 最终标注 | 验收变更                                                                 |
| -------- | ------------------------------------ | -------- | ------------------------------------------------------------------------ |
| 1        | 01a07679-5017-7183-b985-97f808426110 | 中心位置 | 首次null → 第二条事务补标注 → 第三条事务地理中心 → 独立PATCH改回中心位置 |
| 2        | 01a0767a-1c91-7873-90db-8f13514a487f | 球场中锋 | 创建篮球中锋 → 第三条事务改球场中锋                                      |
| 3        | 01a0767a-f974-7631-9143-41878ee5855b | 机构中心 | 第三条原子创建                                                           |

没有额外失败试验条目，没有清理或修改其他数据。未配置释义/发音；所以测试条目的弹窗仅显示已有词性，试听能力按既有环境提示不可用。

## 既有边界

同步真实后端基线时包含预绑定关系schema差异；主协调任务批准仅收敛契约快照和互斥/只读测试，不扩展关系UI。现有 meaningsModel.ts 序列化不接受合法prebound关系，已单列报告；标注不写meanings，不受此路径影响。该基线关联词功能不应据本次标注验收宣称完成。

网络断线、并发revision变化及其他原型duplicate使用确定性集成测试和HTTP契约验证，真实浏览器没有人为断网或并行篡改数据。

后端最终补齐 PATCH 409 的 application/problem+json 媒体类型后再次显式同步；业务schema不变，仅来源哈希更新，定向API契约回归通过。

## 数字输入规则追加验收（2026-09-06）

仅修改前端共享标注弹窗校验及相关测试：trim 后接受 ASCII 数字，最多 20 位，保留前导 0；原必填/可空及同组字符串判重不变。非法和历史内容不被静默改写，只读邻居不参与格式校验。未修改后端、类型或 API 契约。

定向测试：EntryAnnotationModal、EditEntryAnnotation、UnifiedCreateEntryStep、SmartDictionary、WordCreate 共 5 文件 / 86 项通过；admin lint、typecheck 通过。jsdom 不执行 antd CSS 入场动画，错误提示断言使用 DOM 内容存在并结合按钮禁用及保存回调未调用验证。此前完整覆盖率及真实浏览器记录属于数字约束追加前的历史证据，本轮未重跑完整质量门或另建真实数据。

数据台账更新（主协调任务回报）：用户要求清理原有中文标注测试数据，主任务已通过右侧真实 UI 原子批量将当时仅有的 4 条 center 移入垃圾桶，成功提示 4 条，活动列表与统计均为 0。原记录已归档，未物理删除；未改 schema、代码或后端逻辑。本任务未操作浏览器或数据。

ship 继续暂停：未暂存、提交、推送或创建 PR。

## 空草稿检测与创建冲突：修复前记录

前置条件：前端 a030f75（含未提交标注改动），后端 4a9a3ec（含未提交改动），3201 代理 8583。主任务只读确认当前只有活动空草稿 01a076b8-5735-72a2-8abe-034220257948，initial_headwords.common=center、annotation=null、无活动 surface；此前中文测试数据已由用户继续清理，不恢复。

现场路径：检测 center 显示原形未发现，创建返回 409 duplicate_word，UI 显示“创建失败，请稍后重试”。前端确定性复现采用相同空 matches 检测和 HttpError(409, duplicate_word)，预期准确冲突提示、没有重复创建建议或无权限目标链接。

依赖/关键路径：已有 forms 路由与继续创建按钮直接复用；后端新增权限过滤空草稿契约是依赖；前端检测展示、竞态错误映射属于小改；不重做原型/标注/token 逻辑。先失败回归，再对齐契约实施，最后定向 UI/契约测试、类型、lint 和独立只读审查。预计剩余 20–40 分钟，ship 暂停。测试风险：无匹配仍能创建、可见空草稿可继续且不是已保存原型、409 有/无可见目标均准确提示并避免重复重试、已有原型/数字标注/token 路径不回退。主任务负责真实页面验收。

### 空草稿修复前端结果

复现命令：`pnpm exec vitest run apps/admin/src/features/dictionary/word-creation/UnifiedCreateEntryStep.test.tsx -t 'duplicate_word 不显示'`。修复前确定性失败输出明确含 DOM `创建失败，请稍后重试。`，记录于 `/tmp/empty-draft-repro.log`。根因是前端未映射 duplicate_word，后端此前检测只搜索 surface，漏掉创建防重检查识别的 initial_headwords 空草稿。

后端最小兼容字段：DetectLexiconSurfaceResponseV3.existing_draft_id 是可选、非 null UUID，只返回自己可续编的活动 V3 无 surface 草稿；创建 409 duplicate_word 仅可续编时复用 meta.word_id。前端类型和生成解码已同步，空草稿独立提示“已有未完成草稿”并复用“继续创建”到 V3 forms，不伪装为保存原形；与真实原形共存时保留真实结果但停止新建。无可见目标只显示“已有同名词条，无法重复创建。”；竞态后清除 pending，允许更改输入，取消重复创建按钮。续编不依赖新建的词典/词性准备状态。

显式从 tsz-rust-dev-worktree/docs/openapi.json 同步，源 SHA256 `852d0db8e521dae56576a6d1bfc54c683c94f646385478c8f7952d0d3bb55a33`；更新对应 hash 断言，未降低契约校验。decoder 验证省略字段兼容、合法 UUID 保留、null/非 UUID 拒绝。

最终 10 文件 / 394 测试通过（5 个相关 UI 文件及 admin-word-schema/http/runtime-schema/endpoints.contract/entry-annotation.contract），包括原型/token/数字标注旧路径；admin、api-client、types 类型检查与 admin/api-client lint 通过，git diff --check 通过。日志 `/tmp/empty-draft-final-tests.log`、`/tmp/empty-draft-typecheck.log`、`/tmp/empty-draft-lint.log`。首次最终 UI 运行遇到独立工作区 Vite 缓存写入权限，授权重跑通过；不是业务失败。契约首轮旧 hash 断言按已冻结源更新后通过。

独立只读审查发现“续编误受新建词典状态阻断”，修正后补 unavailable/unknown-pos 两个回归，复核通过、无新增阻断。未操作浏览器、用户草稿或后端实现；未暂存、提交、推送、开 PR、切基线。前端 HEAD 仍 a030f75。真实右侧页面由主任务验收；截至前端交接，后端任务通知运行中的 8583 PID15866 仍待更新，不能把 mock/契约测试称为最终真实页面验收。

服务状态更新：后端任务随后确认 8583 已重启为 PID37278 并 ready，运行 existing_draft_id / duplicate_word meta.word_id 新协议，OpenAPI 源 hash 不变。主任务已获通知执行右侧真实页面验收；本任务未操作现场。

## 数字上标与表单视觉调整（2026-09-06）

用户最新视觉要求替代原“词名下方标注”展示：SmartDictionary 用同色语义 sup 紧贴词名右上角，原始 annotation 字符串直接渲染，保留前导0，不转 Number、不自动编号。超宽单行省略，原 tooltip 保留完整词名、标注及方言。共享 EntryAnnotationModal 保留两列原生 antd 表格，固定列布局、顶端对齐；词名15px，释义12px，输入14px等宽数字、最大240px宽，输入与错误提示保持同一起点。所有数字/长度/必填/组内重复逻辑未改。

验证：4个既有相关 UI 文件91测试通过，随后既有上标测试补充完整 tooltip 断言并定向通过；admin typecheck/lint通过。未为纯CSS新增持久化测试，只调整原展示用例。用临时内存fixture渲染实际SmartDictionary/EntryAnnotationModal（复制生产ConfigProvider字体及品牌token），输出HTML后独立无头Chromium截图；没有访问真实列表API、创建数据或产品preview。临时测试已删除。jsdom捕获的是antd动画准备态，截图仅固定动画结束状态；窄列溢出图将最后一行容器限定118px验证省略，原字符串滚动宽172px，数据未截断。表单20位输入clientWidth与scrollWidth均238px，完整可见，错误态保存禁用。

截图保存在 `/Users/darwish/.codex/visualizations/2026/09/06/01a07669-7089-7772-8176-f1e46ca7be29/`：`annotation-superscript-list.png`、`annotation-superscript-overflow.png`、`annotation-annotation-form.png`、`annotation-annotation-form-error.png`。本轮不改后端/API/类型/真实数据；ship仍暂停，无暂存、提交、推送或PR。

## 单一有效词条隐藏圆标：实施前测试设计

用户已批准小范围补充：后端列表 V2/V3 返回必填 annotation_visible:boolean，全局按有效同原型其他独立entry计算，不取当前分页/过滤数量。前端仅 annotation && annotation_visible 显示既有黑底白字sup；false时tooltip也不显示annotation，存储值和编辑入口保持。

关键路径：后端权威字段/快照 → 列表wire类型与fixture → SmartDictionary展示 → 定向契约/UI/缓存回归。已有归档/恢复的wordKeys.all失效、删除的wordKeys.lists与stats失效直接复用，不新增刷新逻辑。风险检查：单页仅一行且true仍显示；false保留annotation但圆标/tooltip隐藏；服务端false→true刷新恢复；编辑隐藏标注仍读原始值；单条/批量归档恢复及删除仍实际重取列表；缺字段/非boolean在decoder拒绝。保留当前三条center真实数据、上标与表单样式，ship暂停。

### 单一有效词条隐藏圆标：前端结果

仅以列表服务端 annotation_visible 选择展示用 annotation；false 时黑底白字 sup 和词名 tooltip 中的标注均隐藏，传给编辑弹窗的原始 record 不变。沿用已有列表失效机制。新增字段同步到两种列表 wire 类型、生成解码和列表 fixtures；详情/标注PATCH请求响应没有增加该字段。既有本地词库 mock 的未标注列表补 false，不增加模拟入口或复刻后端分组算法。

显式从指定后端工作区 OpenAPI 同步，冻结 SHA256 `f8352c91a0165506a80034273645a339e0e0cbb25ec1ee7e77d95aa0a24c172c`；V2/V3列表字段均必填boolean。11文件/275项定向测试全绿，覆盖隐藏时tooltip无标注、编辑保留007、服务端刷新恢复上标、单条/批量归档恢复删除后实际重取列表、V2/V3 missing/null/string/number显示标志解码拒绝；既有数字校验和标注PATCH回归通过。admin/API/types typecheck与admin/API lint、diff check通过。日志 `/tmp/annotation-visible-final-tests.log`、`/tmp/annotation-visible-typecheck.log`、`/tmp/annotation-visible-lint.log`。

前端代码已交接，后端服务更新/真实归档恢复页面由主任务验收。本任务未操作用户现有3条center、浏览器或后端；保留当前黑底白字上标与表单样式，未暂存、提交、推送、PR或切换基线。

### 主任务真实 UI 验收回报

主任务在 3201 页面、8583 新版服务（后端回报 PID49628，readyz200，契约 f8352c91…c172c）完成本次显示需求验收：原有3条center标注1/2/3；批量归档标注2、3的两条后，活动列表仅剩center一条，圆标隐藏。打开剩余词条标注弹窗，保存值仍为1，取消退出未修改。随后单条依次恢复标注3、2的词条，两次同名确认均为2/2且可确认；最终真实列表恢复3条，圆标3/2/1重现并保留。以上操作和观察由主任务完成，本任务仅记录。

独立未解决问题：尝试批量同时恢复两条时，确认范围显示“已加载3/4”，确认按钮持续disabled；退出后重新进入垃圾桶，改为单条恢复能够完成。本次未定位该问题，未判定其由新改动引入或既有；不能据此声称全部流程全绿。用户要求先完成当前显示需求，此项仅记录，不扩大修复。

另有短暂列表加载失败，未取得错误记录且随后恢复；用户明确暂不追查。当前三条center与原标注均保留。此次追加只更新验收文档，未修改业务代码、数据或执行ship。

本地整合前独立审查风险补充：创建成功可原子修改旧标注，保存原型可改变同组annotation_visible，但页面回调未失效仍在60秒staleTime内的列表。先在WordCreatePage和WordWizardV3保存原型既有用例预热fresh列表/统计缓存，断言成功后失效，再以最小页面回调修复；不扩大批量恢复另项。

## 仅本地 dev 整合授权与保全

用户明确要求不使用ship，只进行必要本地commit和合回dev，不push/PR/部署。本feature基线a030f75；原dev已到47232aad6cd05750742db7d6b14143697b5cc23c，包含标注基础类型及音频资产/语音编辑器独立能力，整合须完整保留。

原dev的另一套未提交annotation UI共25文件，经逐文件评估，涉及重复创建弹窗、自由文字校验、下行标注、额外STEP01编辑卡和支撑API/mock；用户裁决以右侧已验收版本为主，可恢复撤下重复实现，不恢复旧UI。未发现这批脏文件中有非标注独立功能。核对其Claude会话最后时间2026-09-06T14:34:18.214Z无更新，25文件内容hash与备份一致后，执行stash -u保全，stash为a07479258d9ff7566a383c05e6da68a13a82530f，保留不pop/drop。完整备份 /tmp/tsz-original-dev-backup-20260906：manifest SHA256 aea7254ba56878373c5703b0447d5e3ca996a97834ad8f66e688f1b16d2227bf；tar SHA256 0c6ab3e1d9357ffc57f1d6f79030775b8b6320b635d3f55c134051d47fad6dc5。原dev现clean。

独立审查缓存P2已修：创建成功失效wordKeys.all，原型成功保存更新当前canonical后仅失效lists/stats。fresh60秒缓存复现前3失败，修复后WordCreate/WordWizardV3共42测试通过；不改变当前向导编辑状态，不修另项批量恢复3/4。最终质量门在吸收dev和新OpenAPI后统一执行。

## 最终本地合并质量门（2026-09-06）

功能checkpoint为c3f4a09b7211a358661146baadfb2f7d60692f59，正常pre-commit/commit-msg hooks通过。随后吸收dev 47232aad6cd05750742db7d6b14143697b5cc23c，逐项解冲突并保留已提交的语音编辑器、音频上传及标注基础类型；相对dev的语音/音频实现无差异。另一套未提交旧UI继续保留在上述stash，不重新应用。

后端已合并的dev/feature为fac0a06ce8b4c4558b6d08c4cef656c47c8c593a。最终显式同步其docs/openapi.json，SHA256为c3f6a18ac3dba0dfb790cdf68c29d8638e83cfc037a582d1d8273d366c55006f；保留dev去预绑定后的两分支关系契约、音频端点及其既有PENDING白名单，仅追加本次显示标志/空草稿字段及标注解码根。

最终合并树7包typecheck、admin生产build通过。首轮test:cov为2997/2998通过，唯一失败是创建页新增useQueryClient后页面烟雾测试缺QueryClientProvider；只补该测试装配，定向8项通过。随后以相同原生命令和默认2 workers完整重跑pnpm test:cov：180文件/2998测试全部通过，覆盖率门通过，未降低门槛或绕过hooks。日志分别为/tmp/annotation-merged-typecheck.log、/tmp/annotation-merged-build.log、/tmp/annotation-merged-smoke.log、/tmp/annotation-merged-coverage-final.log；原失败保留于/tmp/annotation-merged-coverage.log。

提交前独立只读审查复核合并冲突处理、dev能力保留、最终契约及缓存修复，无新增阻断；精确合并SHA在提交后另行独立复核。此次本地整合未操作浏览器、业务数据、服务进程或远程仓库，既有批量恢复3/4另项仍仅记录。
