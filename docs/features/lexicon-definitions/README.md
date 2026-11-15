# 双语多维释义与英文配音

## 范围与验收

新版 `/lexicon-next` 每个义项分别维护英文和当前中文媒介语释义；每条独立保存难度（A1–C2，可待评估）、定义/整句方式、正文和语法选择。允许同级多条，支持增删及排序，不强制六级齐全。义项等级变化不改已填释义。语法区分未选、明确不绑定和失效引用。

英文复用共享语音编辑器、definition 板块配音推荐、真实合成和录音资产链路；中文保持文本编辑。完成应用正文与配音后一次回写宿主草稿，取消/失败不覆盖，正式生成只在应用时执行。AI、人工审核、来源记录、发布与测评不在本次范围。

语言遵循现有媒介归属与英美选择，不复制另一口音或简繁内容。保持显式 `en` 既有回退规则。保存后独立 GET、刷新重开及本地/服务端预览一致；保留其他词形、义项、译词、语法、音频及版本冲突行为。

## 依赖与契约

- 已在主线：语言上下文与归属、完整稿 GET/PUT、版本冲突、释义身份/文本/方式、语法候选筛选、配音中心与共享编辑器。
- 可复用：新版语法正文/配音编辑的局部草稿与应用流程、资产归属与引用登记、旧客户端能力协商。
- 新工作：释义独立等级、明确不绑定、英文富文本与音频扩展、排序及对应预览/兼容验证。
- 关键路径：后端契约与保存 → 原生 OpenAPI 同步 → 前端编辑/配音 → 隔离真实回读与质量门。

两仓分支 `codex/lexicon-definitions`；前端 `/Users/darwish/.codex/worktrees/3226/tsz` 基线 `2596d133`；后端 `/Users/darwish/.codex/worktrees/lexicon-definitions-api/tsz-rust` 基线以该 checkout 的 HEAD 为准。跨仓主记录仅本文件。

继续使用现有 entries GET/PUT/view，通过 `x-tsz-next-definitions: v1` 协商 `definition_details` 能力。`NextDefinition` 增加可选 `level`、明确选择 `grammar_unbound`、英文 `content`、`voice_profile` 与 `audio_assets`，全部使用 snake_case；`text` 保留为规范纯文本投影，须与 rich content 一致。旧数据不猜填等级。

内容保存在现有不可变 JSONB revision，现有 definitions 关系投影继续保存正文/顺序，不为未使用的查询重复建立字段。音频复用现有新词库资产归属及引用保护；限制英文、释义配音区域（现有 wire 枚举 `meaning`）和匹配口音，校验真实合成来源。旧客户端响应隐藏扩展；按稳定释义 ID 保留隐藏字段，正文变化时清除旧标注与合成引用。新客户端访问旧 API 不开放新字段写入。

新增字段写入后，旧后端的严格反序列化不能直接读取新快照，因此禁止盲目回退旧二进制；前端回退由响应投影和旧写入保留支持。发布顺序为兼容后端 → Admin；Web 本功能不变。第 4 批已获提交、PR、CI 通过后合并授权，第 5 批负责部署。

## 验证与当前状态

定向证明：同级多条与独立等级、明确不绑定、跨语言保留、排序不换 ID、取消/失败保留、旧读写兼容、非法标注/配音/资产拒绝、真实保存及 GET/重开。最终统一运行 API 契约包、类型/lint、Admin build/UI 检查及后端 fmt/clippy/定向 PostgreSQL 集成。真实音频测试使用唯一批次并先检查 OSS 清理权限，结束自动清理。

当前：第 4 批交付进行中，复用前 3 批实现及验收证据。第 3 批 OSS、私有数据库/Redis、服务及本地音频已清理；浏览器已退出并关闭专用标签页，但站点持久化数据清理被安全策略拒绝，状态未知，整体清理不能标为全部完成。本批终点为两仓 PR 合并、精确 main CI 成功及制品交接，不执行服务器部署。

### 第 1 批定稿契约

- `x-tsz-next-definitions: v1` 协商 `definition_details: true`，用于 capabilities、entries POST/GET/PUT 与语言 view。未协商时不输出新增字段；未经协商携带扩展数据写入返回 422 `capability_unavailable`。
- `NextDefinition.level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"`，省略即未评估，独立于 sense.level，允许同级多条。数组顺序就是保存顺序，ID 不因排序而变化。
- `grammar_unbound?: true`：省略为未选，true 为明确不绑定；false/null 均非法，不能同时带 `grammar_structure_id`。不绑定不产生缺少语法选择的 issue。既有失效的词性匹配引用在新 view 保留 ID 并通过 grammar_issues 提示；旧 view 继续隐藏失效 ID。不存在的语法 ID 仍拒绝写入。
- `content?: RichTextV3`、`voice_profile?: VoiceProfileV3`、`audio_assets?: AudioAssetV3[]` 仅限 `en` / `en-GB` / `en-US`；不得为 null。正文的规范纯文本投影必须与 `text` 完全一致；profile/录音存在时必须有 content。沿用共享标注验证和每条至多 8 个录音的资产约束。
- 释义板块对应共享配音 wire 的 `meaning`（不是新增 `definition` 枚举）；UI 可以使用共享编辑器的 definition 模式，但推荐 area 要传 `meaning`。按内容 locale 校验所有配音版本与录音口音；显式 `en` 可以保留英美版本。语音来源通过共享 `speech::generated::validate_bindings` 逐一验证，正式合成资产禁止放进录音数组绕过来源验证。
- 保存复用现有 JSONB revision、expected_revision、归属/权限/归档锁及统一资产引用登记，不增加迁移或重复关系投影。资产元数据在事务内按真实登记回灌，再核对口音；跨账号、跨词条占用、不可用资产仍由既有保护拒绝。
- 未协商旧写按稳定释义 ID 保留等级、不绑定及未改正文的富文本/配音/录音。旧写修改 text 时清除旧标注、录音与所有生成引用，保留配音参数；有 profile 时重新构造无标注 rich content。locale 改变不复制旧正文与音频。删除释义仍按完整稿语义删除。
- api-client 始终发送协商请求头，但只有同一 endpoints 实例成功获取 `definition_details: true` 后才能保存带扩展的稿件；旧 API 不返回能力时 UI 必须关闭相关编辑。若调用方仍尝试写入扩展，会本地拒绝且不发请求，不静默剥离数据。普通旧稿保存继续可用；请第 2 批确保先加载 capabilities，保留完整稿字段。
- 既有媒介语归属、英美视图和显式 `en` 回退保持原规则，不自动复制另一口音/简繁，不要求中英逐条配对。未协商其他旧能力时，原有 form_editor / grammar / sense_groups 升级保护继续生效，并不放开早期客户端覆盖这些数据。

### 版本与生成输入

- 前端 `/Users/darwish/.codex/worktrees/3226/tsz`，分支 `codex/lexicon-definitions`，HEAD `2596d13343c9a567c0ccc702655b98a966f8a923` + 本地差异。改动：types 的 lexicon-next、api-client 请求/业务测试/endpoint 契约测试及两个原生生成快照；本主记录未跟踪但属于本任务，必须保留。
- 后端 `/Users/darwish/.codex/worktrees/lexicon-definitions-api/tsz-rust`，同名分支，HEAD `c970d13280f5dd2b0b485cee141655f7b3216089` + 本地差异。改动：lexicon_next 的 model/mod/repository/language/grammar/audio/tests、新增 definitions.rs、现有 tests/lexicon_next.rs 与原生 docs/openapi.json。
- 本次 spec SHA-256：`c43e21287a0effec536ded8de9d7305277f483e85d4888e48cbab369cb8b4f0e`。原生 spec 变化仅为 NextDefinition、NextCapabilities 与 5 项操作的释义协商头；runtime `_source_sha256`、endpoint canary 已与该输入一致。快照 `_source` 指向本任务后端路径，路径变化是来源元数据。
- 无 SQL/schema 迁移，无 `.sqlx` 缓存变化。扩展数据写入 JSONB 后，旧后端 `deny_unknown_fields` 无法读取这些新快照；旧客户端兼容响应不等于旧二进制可直接回退。发布顺序必须兼容后端 → 前端；回退旧 API 前须有明确的数据转换/兼容方案。本次未执行发布。

### 第 1 批验证（2026-11-15）

全部命令在以上任务工作区显式执行，退出码 0。Rust 编译复用 `CARGO_TARGET_DIR=/Users/darwish/Dev/tsz-core/tsz-rust/target`，未 clean 或启动主仓服务。

- `SQLX_OFFLINE=true cargo test --locked --lib lexicon_next`：8 通过。
- 在本任务私有 PostgreSQL `127.0.0.1:55471` 与 Redis `127.0.0.1:56471/0` 下，显式传 `DATABASE_URL` / `TEST_REDIS_URL` 执行 `SQLX_OFFLINE=true cargo test --locked --test lexicon_next -- --test-threads=4`：30 通过，包含新增 3 项释义 handler 用例。
- `SQLX_OFFLINE=true cargo clippy --locked --all-features --lib --test lexicon_next -- -D warnings` 与 `cargo fmt --all -- --check`：通过。
- `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi`：通过。随后 `env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/lexicon-definitions-api/tsz-rust/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi`：生成 276 条路径、457 个最小 schema。
- 本次输入的 `pnpm --filter @tsz/api-client test`：41 文件、740 测试通过。能力失败/未知不发送扩展、旧 wire 可读、新字段严格验证及请求头快照均覆盖。原 endpoint 收集器对 lexiconNext.save 改传合法空稿参数，未增加 PENDING 或绕过测试。
- `pnpm --filter @tsz/types typecheck`、`pnpm --filter @tsz/api-client typecheck`、`pnpm --filter @tsz/admin typecheck`：通过。
- 各包原生 eslint 检查变更 TS 文件、Prettier 检查变更 TS/JSON、两仓 `git diff --check`：通过。
- 未运行本批无关的全仓门、UI build/页面、真实 speech provider 或 OSS；第 3 批负责统一最终门与真实链路。数据库中 ready generation 的正反向绑定测试仅证明源校验，不能视作真实合成完成。

### 资源与清理回执

批次 `batch1-private-pg-redis-20261115`：只新建本机专属 PostgreSQL 集群/Redis 进程；SQLx 每例独立数据库，未连接共享库或 tshb-test。结束独立复查临时数据库为 0、Redis 键为 0；核实 data_directory/Redis PID 属本批后停止进程、删除专属数据与 socket 目录/登记文件，并复查 55471/56471 无监听。没有创建 OSS 对象、远端业务数据、浏览器数据或原始录音。无残留。

### 后续严格串行

第 2 批已实施双语释义表格、独立等级/方式/语法选择/排序，英文共享富文本/配音编辑与预览、取消失败保留及只读回归；未重做契约评估，未提交。复用这两个含未提交修改的工作区，不在 main 修改，不另建任务分支。

第 2 批成功完成后才在新的第 3 批聊天做同一候选真实 UI→API→私有 PostgreSQL/Redis、独立 GET/刷新/英美切换/正式英文配音与旧新组合证据、统一最终门。OSS 创建前必须独占 run-id 前缀并通过清理权限预检，finally 清理全部对象版本、删除标记及专属登记；缺凭据如实标记未验证。各批不并行，不再次询问是否开始下一批。

### 第 2 批实施与验证（2026-11-15）

实际入口 `/lexicon-next` 接入以下行为，沿用任务工作区的 `apps/admin/style.md` 与 `EquivalentRows` / `GrammarStructures` 项目控件样板，未迁移框架或改旧词库业务。

- capabilities 读取成功后才挂载词条编辑；`definition_details === true` 才开放新表格、独立等级与富文本/配音。不支持时沿用旧文本入口；继续受第 1 批 api-client 的同实例能力写入保护约束。
- `DefinitionRows` 分别编辑当前英文和中文媒介语，稳定 ID 增删、鼠标/键盘排序，独立未评估/A1–C2、定义/整句、未选/不绑定/失效语法引用。候选复用基本与细分词性匹配；目录未就绪禁用语法选择。新表格不猜填等级或按义项等级补行/重写内容；同级可多条。显式 `en` 仅在当前口音无记录时回退，保留其原 locale；不复制另一口音或简繁。
- `DefinitionText` 使用共享 `VoiceEditorModal`、`VoiceEditor`、`useSelectedVoiceAudio`、配音推荐与录音适配器。实际共享编辑器没有 `definition` 模式枚举，正文模式使用现有 `grammar`（同语法样板），配音 `recommendationArea` / 默认 profile 区域明确使用 `meaning`，未新增 wire 枚举。
- 正文/标注/profile/录音仅进入局部草稿；编辑器适配器移除正式 `generateAudio`，应用动作才统一生成。完成时从 captureResult 取规范 text/content，生成成功后一次合并到最新宿主草稿的目标释义正文/配音字段，保留当前等级、方式、语法与其他条目。重复应用锁、失败重试请求身份、取消及未完成离开保护均沿用共享流程。宿主保存在内容弹窗未应用时返回且按钮禁用，语言切换锁住，避免宿主 audioTasks 提前处理局部稿。
- 中文继续使用文本框，无英文编辑/音频控件。英文编辑行和本地/已保存/冲突摘要预览显示富文本与已有音频；预览只播放资产，不执行合成。本地投影保留失效 grammar ID 并提示，明确不绑定不产生缺少选择问题，与新协商 view 对齐。
- 保持完整稿 expected_revision、归属/编辑他人权限、归档只读、403/409 保留与冲突处理。

本批最终定向结果（退出码均 0）：

- `pnpm --filter @tsz/admin test src/pages/LexiconNext.test.tsx src/features/lexicon-next`：12 文件、110 测试通过。包含新增英文真实共享编辑器组件测试（speech adapter 为测试替身）、双语表格组件测试、页面能力等待/完整稿保存/弹窗保存与语言锁/归档只读、模型不绑定与失效引用回归；既有权限/冲突/语法与词形回归一并通过。
- 可观察行为覆盖：编辑/取消不生成；应用使用最新正文；重复点击一次生成与回写；生成失败保留弹窗/正文/宿主原稿且重试复用 requestId；应用中拒绝离开；继续编辑保留局部稿、明确放弃才丢弃；无合成权限不发正式请求；只读禁用；独立等级与义项等级互不覆盖；排序保留 ID 与隐藏语言；保存完整保留其他义项、译词、词形、语法及已有配音引用，并携带原 revision。
- `pnpm --filter @tsz/admin typecheck`、admin 包 eslint 检查本批 10 个变更 TS/TSX 文件、根 Prettier 检查本批 11 个 TS/TSX/CSS 文件：通过。
- `pnpm check:admin-ui`：46 样式、223 组件检查通过，校验脚本 9 测试通过。`pnpm check:admin-ui:tighten`：0 项下降，无基线变更。两仓 `git diff --check`：通过。
- Vitest 有既有 jsdom `getComputedStyle(..., pseudoElement)` 未实现提示，未屏蔽提示或改变断言；最终无失败、跳过用例。
- 未运行 Admin build、全仓统一最终门、真实浏览器、真实 API/数据库/Redis、真实 speech provider 或 OSS；不把上述组件替身测试当作真实联调。这些是第 3 批剩余工作。

本批精确候选与文件：

- 前端 HEAD 仍为 `2596d13343c9a567c0ccc702655b98a966f8a923`，分支和路径不变。第 1 批全部本地差异保留；新增 `DefinitionRows.tsx` / `DefinitionRows.test.tsx` / `DefinitionText.tsx` / `DefinitionText.test.tsx` / `definitions.css`，修改 `MeaningsStep.tsx`、`Preview.tsx`、`model.ts` / `model.test.ts`、`pages/LexiconNext.tsx` / `.test.tsx` 及本主记录。
- 后端 HEAD 仍为 `c970d13280f5dd2b0b485cee141655f7b3216089`，本批未写入后端，保留第 1 批全部差异及未跟踪 `src/lexicon_next/definitions.rs`。原生 spec SHA-256 仍为 `c43e21287a0effec536ded8de9d7305277f483e85d4888e48cbab369cb8b4f0e`，没有重新导出或改生成快照。
- 未提交候选代码指纹：对 `git ls-files --modified --others --exclude-standard` 去重排序，排除前端本记录目录后，依次 SHA-256 累积 `相对路径 + NUL + 文件内容 + NUL`。前端 `74a0161c67c4a0523fd4021c75d24a224cd4004a1d845af73fb7917d90c72183`；后端 `2ceddd7415a13035e8788e64964093d50b5ec4cb64e6eb09718932dc95805c62`。可据此核对第 3 批起始输入，而不是把未提交稿误认成仅 HEAD。

资源回执：第 2 批仅运行本地 Vitest/静态检查，没有新建服务、私有 PostgreSQL/Redis、业务 fixture、OSS 对象、录音文件或浏览器数据；无本批外部资源与清理残留。第 1 批私有端口已释放的回执仍有效，不应按历史端口接管新进程。

### 第 2 批交接终点与剩余工作

用户后续明确变更串行协调方式：由原监督聊天核验本批结果并创建第 3 批。本批聊天更新本记录后停止两个工作区写入，不自行创建第 3 批，不实施第 3 批；没有提交、push、PR、合并或部署。

第 3 批继续复用相同两个任务工作区及所有未提交内容，必须显式指定 shell workdir，不在主目录 main 操作或新建 worktree。首先核对候选与现有依赖，不重做第 1 批同输入生成。剩余为真实应用 UI→API→专属 PostgreSQL/Redis、独立 GET/刷新重开、英美切换和正式英文配音、本地/服务端预览及旧新混合版本证据、1440px/窄窗口和键盘/加载/空/失败页面检查、统一最终门与脱敏清理回执。使用 Codex 内置浏览器；web 只用 `pnpm build` + `next start`，Admin 依实际模式。

创建 OSS 前运行 `scripts/cleanup-test-oss.py --run-id <唯一批次> --check-permissions`，验证列举、版本读取和永久删除权限；对象限定 `tshb-test-assets/temporary-tests/<run-id>/`。正常/失败/中断均 finally 清理全部版本、删除标记及专属登记，独立复查。缺凭据应明确未验证，不能用 mock 冒充真实合成。没有已知实施阻塞；真实服务/凭据与 OSS 前缀可用性尚待第 3 批核实。

### 第 3 批真实联调与最终门（2026-11-15）

本批仅复用两个指定工作区，是唯一写入者，没有新建分支/worktree、重新生成同输入契约或修改产品代码。起止代码指纹一致，全部第 1/2 批未提交/未跟踪内容保留。新增内容均在本记录目录内，为脱敏证据与回执。

**实际运行组合。** 前端 HEAD `2596d13343c9a567c0ccc702655b98a966f8a923` + 指纹 `74a0161c67c4a0523fd4021c75d24a224cd4004a1d845af73fb7917d90c72183`；后端 HEAD `c970d13280f5dd2b0b485cee141655f7b3216089` + 指纹 `2ceddd7415a13035e8788e64964093d50b5ec4cb64e6eb09718932dc95805c62`。分支均为 `codex/lexicon-definitions`。后端从本任务源码执行 `SQLX_OFFLINE=true CARGO_TARGET_DIR=/Users/darwish/Dev/tsz-core/tsz-rust/target cargo build --locked --all-features --bin tsz-rust`，成功后二进制 SHA-256 `3a053382e1388f1bbf9dd3136ec9e88c308ee97b755990956b0fe89f3727e646`；核实实际进程 cwd、txt 与哈希。spec 仍为本任务后端 `docs/openapi.json`，SHA-256 `c43e21287a0effec536ded8de9d7305277f483e85d4888e48cbab369cb8b4f0e`，未增加迁移或 `.sqlx` 改动。

私有 PostgreSQL `127.0.0.1:55593/lexdef3`、Redis `127.0.0.1:56593/0` 均新建于本批专属目录；启动 API 前已确认空库归属和启动迁移。API `127.0.0.1:18593`；Admin 以 Vite development mode 在 `127.0.0.1:31593` 启动，显式 `BACKEND_API_URL=http://127.0.0.1:18593/api/v1`。词库/词性/TTS/local speech mock 均设 false，未安装 API 拦截器，观察到的 141 个浏览器响应没有 `fromServiceWorker: true`。同一次词条 GET 通过代理和直连 API 的响应 SHA-256 完全一致。只读取必要 Azure Speech/speech 存储配置，数据库、Redis、JWT 与账号均为本批私有值；没有输出或保留真实密钥。

**浏览器来源与限制。** 按 built-in-browser 技能首先调用 `cua.getBrowser({id:"iab"})`，工具明确返回 `Browser is not available: iab`；清单只有 Chrome 扩展。依用户允许的后备路径，主代理使用 Chrome 独占标签页验收本地 HTTP 应用。没有打开原型、绕过 `file://` 拒绝、改变扩展文件权限或接管用户已有标签页。此处是实际 Chrome 页面验收，不能记成内置浏览器验收。

**真实 UI → API → 私有持久化。**

- 本批专属账号经真实登录流程进入页面；后端现有 OTP sender 是固定码测试通道，未将短信发送当作本任务验收。词库、词性、保存、语音均为真实服务。私有库没有词典数据，创建页实际返回 503 并显示“内置词典暂时不可用，请稍后重试”；通过真实 entries POST 创建 fixture，再从实际编辑入口操作，不伪造词典检测成功。
- 页面填写两条 B1 英式释义，分别为定义与整句，及一条独立未评估中文解释；英文和中文不逐条配对。键盘 ArrowUp 排序后，独立 GET 确认顺序与方式正确；后续保存与旧协议写入仍保留相同 ID，排序不换 ID 的细粒度回归证据沿用第 2 批组件测试。把义项等级改为 C2，已有两条释义仍为 B1，正文未被覆盖。
- 页面设置一条明确“不绑定”，另一条选择匹配基本/细分词性的真实语法结构；未选择状态也保留。完整草稿仍保有另一义项、词形、译词、语义区间、两种语法正文和已生成配音。用于保留验证的已有字段由专属 fixture 通过真实 PUT 设置，随后经 UI 保存并独立回读逐项比较。
- 英美切换时当前义项的美式区域初始为 0 条，没有复制两条英式正文；新增美式释义后切回英式仍保留原两条及顺序/语法/音频。中文随媒介归属保留。刷新后重新打开编辑器，标注、音色参数、录音引用和正式音频仍在。
- 查看当前草稿预览、服务端已保存语言预览及冲突摘要，等级、方式、不绑定/关联语法、对应口音正文及中文一致；故意未完善的其他义项/中文语法选择继续显示提示，不把它们补成假完成状态。
- 真实旧客户端协议验证：保留其他既有能力头，仅移除 `x-tsz-next-definitions`；GET 隐藏释义扩展，旧 PUT 保存同一完整稿后，新 GET 的 draft 与保存前逐项完全相同。UI 原 revision 8 随后保存时真实返回 409，服务器保持版本 9，本地中文输入仍在；“比较服务器版本”和“保留本地草稿”均不覆盖输入，最终显式放弃并重载才取服务器稿。没有自动合并或绕过 expected_revision。
- 实际观察首次加载/共享编辑器加载、空释义、503 创建错误、正式合成配置失败和 409 冲突。1440×1000 与 1024×900 检查未出现整页横向溢出；1024 下 document.scrollWidth=1024，释义内滚动区 clientWidth=867、scrollWidth=880。264 字符英文及长中文在表格内换行，操作可达；键盘排序和焦点可见。权限/归档只读沿用第 1/2 批有效 handler/页面组件证据，未额外改动账号权限或归档状态。

**正式英文配音。**

- 独占批次 `20261115-lexdef3-d82e71`，创建对象前清理权限探测通过；API 配置测试资源白名单仅本批账号，并装配 speech/audio 两空间。实际页面请求头及数据库对象 key 证实测试路由生效，全部新对象均在 `tshb-test-assets/temporary-tests/20261115-lexdef3-d82e71/`。
- 编辑后取消没有 `/speech/audio` 或试听合成调用，宿主正文不变；弹窗打开时宿主保存和语言切换锁住。正式请求由“应用正文与配音”触发，wire `dubbing.area=meaning`。首个请求因本地 audio 空间漏配返回 501，正文/斜体标注/参数仍在局部稿；补齐隔离服务配置后同 request_id 重试成功。本批未因此修改产品代码。
- 4 次成功正式合成各得到一条 ready generation：初始英式池 Annette 两条、明确选择的 `en-GB-RyanNeural` 一条、`en-US-GuyNeural` 一条。原音色池按已有逻辑保留，选择 Ryan 后不会把旧版本复制到另一口音。本批没有用 preview 合成或 fixture 代替正式音频。
- 独立 GET → 资产 URL → 下载 → `afconvert` 解码为 PCM 验证：Ryan 23,904 bytes / 1.992s / PCM 峰值 14,764；Guy 29,664 bytes / 2.472s / 峰值 22,276，均非空且非静音。SHA-256 及对应资产 ID 见 `audio-checks.json`。刷新重开后选择 Ryan/Guy，实际播放状态分别显示 en-GB/en-US；Ryan 的 URL/content 请求均 200，Guy 显示播放中和约 2.47s，没有跨口音回退。播放和预览未再合成。
- 斜体标注、rate_percent=5、volume_percent=95、area=meaning 及生成引用已持久化并重开确认。录音引用用 0.5s 本地正弦测试音，经真实 upload-url → OSS PUT → confirm 登记，显式 is_default=false；独立 GET 和后续 UI 保存确认引用不丢，重开设置显示已用 1/8 和文件名。它只验证上传资产引用，不声称是真人说话或正式 TTS。
- 文件选择控件曾实际尝试，但 Chrome 扩展拒绝 `setFiles`，要求开启“Allow access to file URLs”。没有扩大浏览器权限；上传控件自身的端到端动作未验证，上传/确认/引用链路已由真实 HTTP 和重开 UI 验证。

**统一最终门。** 全部在指定工作区执行，Node `v24.19.0`、pnpm `10.33.0`。精确命令、退出码与日志摘要哈希见 `quality-checks.json`，日志位于本目录。

| 命令                                                                                                                                               | 结果                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm typecheck`                                                                                                                                   | 退出 0，7/7 task，0 缓存                                     |
| `pnpm lint`                                                                                                                                        | 退出 0，7/7 task；web 既有两条整页导航 lint warning，0 error |
| `pnpm --filter @tsz/admin build`                                                                                                                   | 退出 0，tsc 与 Vite production build 成功                    |
| `pnpm check:admin-ui`                                                                                                                              | 退出 0，46 样式、223 组件；校验脚本 9 测试通过               |
| `pnpm check:admin-ui:tighten`                                                                                                                      | 退出 0，0 项下降，无基线变化                                 |
| `SQLX_OFFLINE=true CARGO_TARGET_DIR=/Users/darwish/Dev/tsz-core/tsz-rust/target cargo clippy --locked --all-targets --all-features -- -D warnings` | 退出 0                                                       |
| `cargo fmt --all -- --check`                                                                                                                       | 退出 0                                                       |
| 两仓 `git diff --check`                                                                                                                            | 退出 0                                                       |

同输入复用第 1 批 API 41 文件/740 测试、Rust lib 8 与私有 PostgreSQL/Redis handler 30 测试，第 2 批 Admin 12 文件/110 测试及类型/静态验证。本批没有产品代码修复，未重复这些有效测试。未手动运行全仓普通测试、覆盖率或远端 CI，未提交/推送/开 PR/合并/部署；Admin production build 成功不等于生产代理或已部署开关验收。

**兼容与回退。** 候选前端 + 候选 API 的核心链路通过；真实旧客户端协议 + 候选 API 的隐藏字段保留通过。候选前端 + 不返回新能力的旧 API 沿用第 1 批 api-client/第 2 批 UI 能力关闭证据，未另起旧二进制或检查线上已部署版本。新 JSONB 扩展仍不能由旧后端严格结构直接读取，不允许盲退旧 API；安全方向仍为兼容后端 → 前端，回退旧后端须先提供数据转换/兼容方案。发布/回退演练不在本次授权内。

**清理与仍未完成的收尾。**

- 停止本批 API/Vite 写入后，清理脚本 `--apply` 精确永久删除 7 项（6 个对象版本与 1 个删除标记），独立分页复查 `remaining=[]`、errors 为空；第二次只读独立列举 `planned=[]`。见 `oss-cleanup.json`、`oss-independent-recheck.json`，权限预检另见 `oss-precheck.json`。
- 归属复核：1 个专属账号、1 个词条、10 个修订、5 个音频资产、4 个 generation 全属本批，Redis 仅 1 个键。OSS 确认清空后才移除该专属数据库及所有引用/会话/审计等依赖、删除私有 Redis 精确键并独立确认 0。随后停止 PG/Redis、删除专属数据目录、原始 MP3/WAV、测试音、完整 fixture、私有配置和 token；端口 55593/56593/18593/31593 独立复查无监听。没有连接或删除远端业务库/缓存、正常 OSS 目录、共享账号或其他用户标签页。见 `cleanup.json`。
- 浏览器已真实退出账号、回到登录页、恢复视口并关闭本批标签页；sessionStorage/内存音频随独占标签页关闭。工具对 `Storage.clearDataForOrigin` 返回 “This method is not supported through raw CDP.”，未尝试绕过。该本地 origin 的持久化偏好/缓存是否残留未知，不能宣称站点数据全部清空；见 `browser-cleanup.json`。音频内容 API 的 Cache-Control 为 no-store，但这不替代全站点清理证明。
- 因上述浏览器清理限制，状态为“功能核心验收与质量门通过；后端/OSS/本地资源清理完成；浏览器持久化数据清理未证明”，不标记整体全部完成。下一步由原监督聊天核验本记录和回执并统一报告；若需补齐完整环境收尾，应在可用的浏览器站点数据清理能力下仅处理 `http://127.0.0.1:31593`，无需重新创建词条或合成。文件上传控件实测缺项也需明确保留。

证据索引：`runtime-checks.json`（实际来源与 API 状态）、`audio-checks.json`（非空可解码音频）、`persistence-checks.json`（独立回读/旧协议保留）、`browser-network.json`（后半程脱敏网络，缓冲早期已截断，不能据此单文件统计全部合成）、上述 cleanup/quality 文件。截图：`definitions-1440.jpg`、`definitions-1024.jpg`、`long-text-1024.jpg`、`conflict-1440.jpg` 与配音重开截图。本批停止后不再修改两个工作区。

### 第 3 批浏览器精确清理补充调查（2026-11-15）

按原监督聊天追加要求，仅调查官方浏览器 UI 是否能精确处理 `http://127.0.0.1:31593`，没有重新创建账号/词条/服务/音频，没有重跑质量门，也没有重试文件上传或修改浏览器权限。

读取 computer-use 与 Chrome 技能后，核实 Chrome 可用并只读获取其原生界面。为避免复用或改变用户已有标签页，尝试先创建专用 `chrome://newtab` 调查标签页；工具随即明确返回 **browser security policy** 拒绝：仅允许 `http:` / `https:`，并明确禁止 workaround、indirect execution、raw CDP、browser commands 或 alternate browser surfaces。请求未返回新标签页 ID。该拒绝是策略边界，与之前 `Storage.clearDataForOrigin` 方法不支持的能力缺口不同；依用户要求立即停止，没有改用原生地址栏、快捷键或其他浏览器界面绕过。

因此未能进入官方设置页，不能判断或证明官方 UI 的删除范围能精确到本批 origin/端口。没有执行任何浏览器数据删除，没有清所有 `127.0.0.1` 或全局浏览数据，用户原有站点/标签页未被修改。最终状态继续为：OSS、私有库/Redis、服务及本地测试文件已清理；浏览器已退出并关闭原验收标签页，但本批 origin 的持久化数据残留仍未知，整体清理不声明全部完成。更新详情见 `browser-cleanup.json` 的 `followup_investigation`。

本次追加仅更新本主记录及 `browser-cleanup.json`；两个工作区产品代码、既有检查和候选指纹均保持不变。调查到此结束并停止写入，由原监督聊天只读核验与统一报告。

### 第 4 批交付准备（2026-11-15）

- 起始实现指纹与第 3 批一致。前端保护全部 tracked/untracked 差异后，无冲突快进到最新 `origin/main` `50cfb9b0953b9488921ad73f4ddde438a42c7340` 并恢复差异；后端基线仍为 `c970d13280f5dd2b0b485cee141655f7b3216089`。
- main 新增共享语音编辑器“应用时生成”与固定 API 契约预检，已核对实际调用链。合入后重新执行 Admin 12 文件/110 测试及 production build 均成功；其余同输入有效结果复用。原生提交/推送 hooks 与 PR/main CI 仍正常执行。
- 前端 `deploy/api-target.json` 将随后端 PR 合并更新至该精确 main SHA，避免新增能力与旧固定契约不一致；使用相同原生生成输入，不手改快照。后端无新迁移，正常 pre-commit 在本批专属本地 PostgreSQL/Redis 执行 SQLx/Clippy，完成后清理。
- 每仓正常提交后固定 base/head，安排独立只读 pre-push 审查；结果、轮次、精确 CI 与制品身份放在两仓 PR 和最终交接，避免为记录状态反复改变被审 SHA。
- 仍保留真实验收边界：内置浏览器不可用后按授权 fallback Chrome；上传控件 setFiles 未获权限，真实 HTTP 上传/确认/保存链通过；私有库无内置词典创建检测返回 503；浏览器精确 origin 持久化数据清理未知且禁止绕过。没有为本批重新创建 OSS、真实录音或浏览器环境。
