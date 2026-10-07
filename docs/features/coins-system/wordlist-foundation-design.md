# COIN-11 前置：词表基础业务技术评估

日期：2026-10-06。档位：重档（新实体/迁移、公开与身份边界、管理员审核权限及跨仓契约）。评估阶段未实施、未改数据库；用户现已要求新聊天开始最小词表闭环及 COIN-11 实施，最新顺序以 tasks.md 为准；需求与已确认规则见 [需求](wordlist-foundation-requirements.md)。

## WL-03 增量设计（2026-10-07）

WL-01/02 与 COIN-11 已合并部署；下文初始评估和实施记录是历史依据，过时状态与复用旧分支要求由本节取代。

- 两仓基线/分支/worktree 见 tasks.md；从已部署 main 开始，无新迁移、权限或写入能力。
- `WordlistItemsQuery` 独立承载 `view=standard|full` 与 `sort=author|label_asc|label_desc`；默认请求不变。仅 `view=full` 输出 `pos.forms` 及配置展示名称，默认与审核接口省略这些键，保护旧严格 runtime schema。
- 安全词形 DTO 只含 ID、form_type、catalog 标签、sense_ids、地区拼写、字典音标与安全富文本。复用 `allowed_form_senses`；不输出合成参数、音频、来源或 actual_pron。多 base/多音标保留发布顺序。
- 查询和排序在服务端 LIMIT/OFFSET 前完成；只使用 active/current V3 label。沿用条目锁、所有权、发布/归档检查，不增加历史内容旁路。
- 标准/完整共享 ReadingEntry、definition 选择与 RichText reader。UI 完整按词性/义项显示对应词形；短语不显示词形行；模式/排序进入查询键，读者上下文在渲染时派生。切换模式不更改学习设置、词表 revision 或审核状态。
- 发布顺序：候选后端 → Web；旧 Web/Admin 默认请求仍可读。新 Web+旧 API 的标准默认仍可读，完整/新排序明确失败；不支持前端先开放。Admin 无功能变更。无迁移，回退 Web 不改数据；不得回退到上一批 coins/注销门禁以前版本。
- 定向验证：后端 wordlists_handler/review/tips/schema；前端 wordlist 组件、阅读纯函数、api-client 契约；旧 runtime 校验候选默认响应。结束统一 fmt/clippy、前端 typecheck/lint/test 与生产构建。真实浏览器补手机、公开/个人、角色/方言、发布更新/归档；复用上一批资金和注销证据。

## 1. 初始评估基线与事实（历史）

| 输入                 | 版本/证据                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端任务 worktree    | `/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，`codex/coins-b1a@9459b845b4f9059837b3f819c47d9cbeb66b299b`                                                                                                                                                                                              |
| 前端任务 worktree    | `/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，`codex/coins-b1a@6f51a89724cf92ba33cb0b8ab4db599eda1ece37`                                                                                                                                                                                                       |
| fetch 后 origin/main | 后端 `035d1dd4fa94c7278a0c9ea65f6799096bb6aa94`；前端 `78efe657c3ee7d2610293d5b989ab249eda5adfe`；均无新增变化                                                                                                                                                                                                |
| 当前 OpenAPI         | `8bf959574542286788f300d31d7f1d53145978a7a2122889990f0eab9dacc5a1`，没有词表 API；未启动任何服务确认线上能力                                                                                                                                                                                                  |
| 产品依据             | 只读 `/Users/darwish/Dev/tsz-core/.worktrees/shared/docs-consolidation/product.md` 第 137 行起：师生词表、公开/私密及后续收藏/班级等；第 89 行的自建词库审批不能直接当成词表条件审核规则。原始流程图未找到；用户随后提供五张添加、标准/完整详情及规则原型，见需求文档“原型补充”及 references/wordlist-*.png。 |

复用同一 coins 任务 worktree 是为了保留未推送的 B1/B2/B4 依赖；本轮文档只维护在本目录。不从缺少这些提交的 main 重建，不改其他 docs worktree。

| 分类                   | 能力/缺口                                                                                    | 处理                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 已在 main、直接复用    | users 身份与师生角色、AdminAuth、实时权限、audit.admin_actions                               | 无新登录体系，教师认证不当作学生创作权限门槛        |
| 已在 main、可复用      | `lexicon.entries.id/current_publication_id`、不可变 entry_publications、词条 archive/restore | 引用 entry ID，读当前发布稿；不把词条实体当词表     |
| 可复用但需收窄         | lexicon `related_search` / `component_target_entry_matches` 的已发布检索及中文义项提取       | 新 C 端只读投影，固定不读草稿，不直接开放 Admin DTO |
| 本任务已完成、直接复用 | coins 原子转账、业务幂等、账户锁；B1b 到期门禁和签署 worker                                  | 本前置复用生命周期边界；实际记账仍属 COIN-11        |
| 小改动                 | 页面路由、ProfileHub、导航、postAuthPath、请求工厂、类型与生成链                             | 真正区分公共列表和个人管理；不强制学习引导          |
| 全新工作               | wordlists/items/review requests、作者约束、审核/下架路由与权限、C 端发布词搜索               | 本批主要工作，不计入原投币 2–3 天估算               |
| 原型而非能力           | Creator/Browser/useWordLists 的 MOCK_*、owner=demo；Detail 占位；Admin 页面未接路由          | 不迁移 mock；成功/审核状态由服务器返回              |
| 暂不做                 | 自定义词、平台作者、收藏/班级/学习集/任务/评论、音频及动态例句                               | 不借本前置扩建这些业务                              |

## 2. 关键路径与建议拆分

```text
WL-01 真实私密词表：安全词库投影 → 模型/事务 → 创建/个人管理/标准详情
  → WL-02 审核与公开：权限/请求快照/审计 → Admin → 公共浏览
  → WL-01/02 最小闭环质量门与真实验收
  → COIN-11 投币事件 + 原子转账 + 页面
  → WL-03 完整模式等增强
```

具体任务、退出标准和首个动作包见 [tasks.md 的执行安排](tasks.md#词表基础执行安排2026-10-06)。身份、隐私和注销门禁从 WL-01 实现；不能留到 WL-03 才补。标准和完整模式共享安全发布投影，统一处理 CEFR/方言选择，分步完成界面。

剩余粗估更新为词表基础 **8–12 个专注工程工作日**（WL-01 3–4、WL-02 2–3、WL-03 3–5），COIN-11 另计 2–3 天；不含遗留数据迁移、第三方服务或部署等待。相对上一版 7–10 天增加的部分是明确排入完整模式与 CEFR/词形/音标组合验收。共享 DTO/权限集中处理，定向检查伴随实施，收尾一次统一全量门，不为每个接口重复完整流程。

## 3. 最小数据与状态

拟新增 `20261006040000_wordlists.up.sql/.down.sql`（实际实施先核对迁移号空闲）。

| 表                         | 主要字段与约束                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wordlists`                | UUID、`owner_user_id`、name、state、正 revision、创建/更新时间、创建幂等键/请求摘要。`owner_user_id` 指向 users，禁止改作者；同作者创建请求键唯一。                                                          |
| `wordlist_items`           | wordlist_id、entry_id、position；词表内 entry 唯一、position 唯一且非负；词条 FK 到 lexicon.entries，禁止伪造词条；private_note（仅作者）、note_revision（独立备注版本）。不保存 publication_id 或词义副本。 |
| `wordlist_review_requests` | UUID、wordlist_id、submitted_revision、提交的 name/有序 entry IDs 快照、pending/approved/rejected/cancelled、提交键/摘要、审核人 UUID/时间/原因。每表至多一份 pending；决定只针对这份请求，不审可变草稿。    |

建议 wordlist.state 使用 `draft/pending/published/rejected/withdrawn`，以 published 唯一表达对外公开，避免 visibility 与多套状态相互矛盾。原前端 WordList 只是 mock 类型，本批改专用真实 wire；保留无关 Word/Comment 类型。

状态流：新建 draft → submit 后 pending；审核通过 published、驳回 rejected。pending 可由作者 cancel 回 draft；published 须先显式 withdraw 为私密再编辑。draft/rejected/withdrawn 可以编辑，编辑后为 draft；每次状态/内容变化增加 revision。平台下架 published → withdrawn，必填原因并同事务管理审计；作者修改后可再次提交审核，不自行恢复公开。词条发布更新不改变词表编排 revision。私密备注仅改变该行 note_revision，不增加编排 revision、不改变 state，也不使 pending 审核失效；修改 published 的私密备注不要求先 withdraw。

为减少首批模型：不同时维护公开旧版和可编辑新版、不新增词表 publication 引擎。审核快照只保存名称/选词顺序及其版本，不复制完整词义或作者私密备注；管理员动作写已有 `audit.admin_actions`，不再建通用审核平台或重复审计表。

注销建议：wordlists 的 owner FK `ON DELETE CASCADE`，items/review requests 随词表删除，避免把用户内容永久挂在无主记录上。owner 的逻辑到期必须让公共查询立即失效，不等物理清理。审计仅记必要 ID/动作，不存完整内容。未来 `wordlist_tips` 保存稳定 list/author/payer UUID，不 FK cascade 到实时词表；删除后显示“词表已删除”，历史账本/投币事实保留。该选择随最小闭环实施授权落地；它不会影响已实现邀请历史的独立保留规则。

## 4. 词库投影与查询

- 现有 `/admin/lexicon` 全部使用 AdminAuth/words.access；其 entries 列表包含草稿 editor projection，不能改成游客可读。
- 新增 C 端 `GET /wordlists/catalog?q=...&page=...&page_size=...` 供登录创作者选词，固定 `archived_at IS NULL` 且 current_publication_id 存在。不是开放整个词库管理接口。公开词表条目仅通过公开词表的授权投影读取。
- 内部可复用 `src/lexicon/service/queries.rs` 的发布稿解析/身份核对及 `publishing::published_sense_gloss`；`AdminWordV3` 仅作内部解码模型，不原样序列化。必要时抽取一个狭义 `read_published_summaries` 方法，避免复制 V3 内容解释器。
- 兼容性核对：数据库历史约束仍允许 publication schema 2，而当前 `publication_from_record/related_search` 服务只解码 schema 3。新 V3 投影查询必须显式选择 schema 3，不能把遗留快照盲目解析或让一条遗留记录导致整页 500。实施前需只读核对目标环境是否仍有 active/current V2；若存在，单列兼容投影或受控迁移方案后再确定开放范围，不能声称本轮已证明无遗留数据。该存量迁移不包含在 8–12 天估算中。
- 搜索/录词预览 DTO：entry_id、数据库给出的 current publication_id、word.presentation.label、最多两条中文释义。候选可复用现有摘要提取，但不能把一个摘要当成第三张图的标准详情。
- 共用详情投影：`entry_id/publication_id/label/kind`，`pos[]` 按 pos_id 对齐；`senses[]` 保留 sense_id/sub_pos/sense.level；`definitions[]` 保留 definition_id/mode/definition.level/安全内容/可选 grammar_structure_id。必须同时支持 zh_definition/zh_sentence/en_definition/en_sentence；`*_sentence` 是释义表达，不等于动态共享例句。语法带结构 ID 及各 variant 的 id/dialect/安全内容，按发布稿顺序返回。
- 前端每个 sense 只选择一条 definition：等级顺序 A1<A2<B1<B2<C1<C2；先精确等级，否则不高于读者等级的最高等级；在选中等级内先中文、否则英文，同语言按发布数组顺序取首条。不能为优先中文而跳过同级英文、取更低级中文；不能用 sense.level 代替 definition.level。没有候选时保留词义位置，显示已确认的未适配提示，不自动抬高等级，也不串用其他 definition 的语法。
- 阅读等级来自当前角色：teacher 视角为 C2，student 视角用真实 learning_settings.cefr_level；游客或 settings=null 为 C2 预览。此解析是展示行为，不调用保存学习设置接口，不更改不可逆的学生初始难度。兼有师生角色的账号以实际查看角色为准。
- 中文 content 为 RichTextV3，英文 content 为 EnglishTextV3 的 common 或 uk/us ready/missing 槽，不能一律 `.text()`。优先当前英/美偏好；无偏好则保留带地区标识的可用内容，缺失不补假文本，也不修改用户偏好。客户端最终阅读投影必须区分 viewer/active_role/effective_level/english_variant；若服务端未来做个性化筛选，相应响应不得进入无身份或无阅读上下文的共享缓存。当前建议公共 API 返回公开、未个性化的安全结构，客户端按读取时的真实上下文选择；作者备注始终在独立私密响应中。
- `published_sense_gloss` 只取第一条中文释义，不能单独用于标准/完整详情。复用 V3 严格解码与 publication 身份核对，新增狭义 `read_published_details` 投影；保留允许的 RichText 标记，使用 `@tsz/voice-editor/reader` 的 RichTextReadOnly（只读子入口）呈现粗体、蓝色强调等，不加载编辑器或使用 dangerouslySetInnerHTML。不附草稿、审计、capabilities、动态例句、音频资产/合成参数；公共和管理员审核 DTO 均不含作者私密备注。
- 完整模式的数据映射按真实 V3：原形为 forms.pos[].forms[].form_type=base；各 concrete form 有 common 或 uk/us regional_variants，含 spelling/pronunciations。音标取 dict_phonetic/可选 dict_phonetic_rich，不取 synthesis.ipa/ups 或 actual_pron。顶端可按首个 pos、首个 base 的发布顺序确定词形，但同一地区的多发音仍须保留可区分信息，不能声称模型只有一条音标；具体音标折叠方式可在页面实现时收口。
- 完整模式词义与词形的连接复用 `form_senses::allowed_form_senses(pos,meanings,form_id)`：general 组可关联同词性全部 senses，dedicated 组只关联绑定词义；不能按每个 sense 只属于一个 form 设计。词形展示标签批量取 catalog.form_types，而非硬编码 form_type code；字典标签更改与词库内容更新均应使相关展示重新读取。短语词形空栏是原型的呈现约定，不据此删除平台存储字段。
- 标准、完整、简洁是同一词表的显示模式，不生成多份内容或多次计数。WL-01/02 先交付标准模式，WL-03 展开完整模式；简洁模式尚缺具体字段规则，单独补齐后再开放。不能把未开放模式做成无效切换按钮。
- 选词检索可复用 current_publication 的 surface_sources 查询思路；related_search 的完整 token 语义不能冒充普通前缀搜索。首批明确整词优先、其次包含匹配、稳定排序、分页，禁止 include_drafts。
- 详情元数据与条目分页分开。个人编辑初始化另用单个一致快照返回 `{revision,name,state,entry_ids}`（最多 10,000 个轻量 UUID，无词义），通过同条 SQL 或一致性事务取得完整有序 ID；不得从当前显示页拼出整表替换请求。批量读取一页关联的 current publications 并解码，不能每条开一次 SQL；条目最多 100 个，列表不展开全部词义。作者总数和公开统计不包含未授权对象。
- 词条归档时不因词表引用无限阻止运营下架：items 保留 UUID/顺序，C 端返回 unavailable 占位且不带旧词面/义项。历史 publication ID 不能单独作为 C 端授权凭证。restore 后自动恢复当前发布内容。

## 5. 事务、鉴权及生命周期

1. 创建/编辑/提交先锁作者 user，再锁词表；锁后检查 active/security_version 及 B1b 的 `clock_timestamp()` 到期门禁。客户端不得指定 owner。
2. 管理员审核/下架先构造 actor(admin)+owner(user) 全部主体，只复用现有 Owner 的 owner_type/UUID 固定排序，按序锁现存主体，再 `permissions::lock`，再词表/请求锁。不能先锁管理员后追加作者，也不能直接复用会拒绝失效作者的 `coins::lock_accounts_in`：approve 要求作者 active、未到期；reject/平台 withdraw 只需稳定锁住现存作者与词表并校验管理员权限，不以作者停用/到期阻止收紧可见性。已物理删除的作者随词表级联消失，返回 404。
3. 修改/审核携带 expected_revision；受理后在词表行锁内核对 state/revision。创建采用用户域 UUID 幂等键；提交请求按词表＋键去重并检查载荷摘要，重放不能新建第二份待审。
4. 创建/编辑/提交/通过时一次性排序锁引用的 lexicon.entries `FOR SHARE` 并检查 active/current publication；批量查询避免 N+1。本读取路径不调用词库写服务、不在取得 entry 行锁后反向追加 surface-context 锁。若复用的具体 helper 会获取 context，必须改为现有 context → entry 顺序。
5. 词条发布/归档更新 entry 行，与上述共享锁互斥。投币未来也先锁全部账号、再词表、必要的 entry 行，最后一次 transfer_in；词表下架锁同一行，不能形成“下架同时成功投币”的旁路。
6. 作者写入和管理员 approve 在锁/唯一键等待结束、提交前再次核对作者到期；reject/平台 withdraw 不加这道作者资格阻断，否则停用期间无法下架、恢复后会意外重新公开。管理员自身资格与实时权限仍必须有效。既有 B4 唯一键等待回归是应复用的风险模式。技术失败回滚内容/状态/审核/审计，不能留下“已公开但审核记录失败”。
7. user 删除按既有锁后到期流程进行，词表级联清理必须随同事务回滚；新增表不得用 RESTRICT 阻塞已经签署的账号注销。词库引用的 FK 只约束词条，不冒充归档状态检查。

建议后台权限新增 `wordlists.access`、`wordlists.review`、`wordlists.withdraw`，后两者依赖 access；当前后端没有这些 keys。复用 catalog、authorization、grant/revoke 与 audit，不复用 teacherapply.review 或比较 admin-owner 的 `require_owned_action`。不要求审核员拥有读取词库草稿的 words.access。

## 6. 拟定契约和文件影响

统一前缀 `/api/v1`，最终以实现时原生 OpenAPI 为准：

| 接口                                                                            | 职责                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/wordlists`                                                                | 游客可读的已公开列表，搜索/分页，不混入本人私密                                                                                                                                                                                            |
| GET `/wordlists/{id}`、`/{id}/items`                                            | 公共元数据与分页内容，仅公开对象；未公开一律 404，作者从 /me/wordlists 读取                                                                                                                                                                |
| GET `/me/wordlists`、`/{id}`、`/{id}/items`                                     | 作者各状态的管理列表/详情/条目；审核原因仅作者可读                                                                                                                                                                                         |
| GET `/me/wordlists/{id}/edit`                                                   | 作者可编辑状态的一致版本快照：revision/name/state/完整有序 entry_ids；词义另分页读取                                                                                                                                                       |
| GET `/wordlists/catalog`                                                        | 登录后的已发布词库选词，静态路径需避免与 `{id}` 路由歧义                                                                                                                                                                                   |
| POST `/wordlists`、PATCH `/me/wordlists/{id}`                                   | 专用 DTO：Create 为 name、ordered items（entry_id/可选 private_note）及请求键；Update 为 expected_revision、可选 content（name/完整 entry_ids）、显式 note_updates（entry_id/private_note/expected_note_revision），不用 Partial<WordList> |
| POST `/me/wordlists/{id}/review-requests`                                       | 提交不可变的待审编排                                                                                                                                                                                                                       |
| POST `/me/wordlists/{id}/review-requests/{request_id}/cancel`                   | 作者撤回待审                                                                                                                                                                                                                               |
| POST `/me/wordlists/{id}/withdraw`                                              | 作者先撤公开再编辑                                                                                                                                                                                                                         |
| GET `/admin/wordlists`、`/{id}`                                                 | 具 wordlists.access 的管理查询/详情，支持 pending 和 published 筛选                                                                                                                                                                        |
| GET `/admin/wordlists/{id}/review-requests/{request_id}`、`/{request_id}/items` | wordlists.access 下读取指定审核请求及分页条目；按保存的 submitted_revision/entry_ids 排序读取当前词库发布稿，不能走公共或作者接口读取 pending                                                                                              |
| POST `/admin/wordlists/{id}/review-requests/{request_id}/decision`              | 当前待审请求的 approve/reject，独立权限/版本/原因/审计                                                                                                                                                                                     |
| POST `/admin/wordlists/{id}/withdraw`                                           | 平台下架，独立权限及原因/审计                                                                                                                                                                                                              |

代码预计位置：后端新 `src/wordlists/{dto,model,repository,service,handler}.rs`、狭义 lexicon 发布投影、迁移、权限目录/路由、OpenAPI 与测试 inventory。前端将原 mock 三步创建向导改为原型的单页逐行编辑，更新 wordlist 三组件/hooks、wordlists 路由、ProfileHub、postAuthPath、专用 types/api-client/runtime schemas；Admin 启用单一词表管理页及待审筛选，不额外启用通用 Reviews 占位页。

前端公共列表/详情保持 `/wordlists`、`/wordlists/[id]`；个人管理使用 `/account/wordlists`、`/account/wordlists/[id]`，创建仍为 `/wordlists/new`。公共与个人详情可复用展示组件，但 route 明确传入读取模式，不先拿私密结果填公共缓存。

原型交互补充：

- 编辑器固定返回/名称/保存及工具栏，主体按行录词；每行有稳定 client_row_id，不使用数组索引绑定异步联想或备注。输入改变立即清除旧 entry_id/释义；取消旧请求并核对 row_id/查询串，乱序响应不得串入另一行。展示最多 3 个候选；选中规范词条后显示释义预览，未匹配行不能保存为平台词条。
- 创建阶段的新增/删除确认/排序/私密备注在本地草稿中维护，保存时原子落库。大词表编辑先取完整轻量 ID 快照，词义及备注分页加载；Update 仅提交显式变动的 note_updates，并核对独立 note_revision，不因只加载一页就覆盖其余备注。content 与 notes 同次保存时在一个事务校验/写入；notes-only 在 published/pending 也可保存，服务端不能借此接受名称/选词改动。
- 个人条目 DTO 才返回 private_note/note_revision；公共投影、审核快照、后台管理 DTO 和审计不包含备注字段。对变更备注、公开后读者访问、审核员查看各补一条有意义的隐私回归。备注不出现在标准公共详情；作者可在个人页面查看/编辑。
- 详情顶部展示真实名称/作者/状态/词汇数，标准内容区按每个词义的等级/语言选择展示一条释义及其关联语法，完整模式再展开真实词形层次。关键词检索可覆盖词面；图中“词类类型”菜单未展开，具体枚举仍待补充，不擅自将它等同于词性或自定义来源。导入/导出、音频、评论、收藏/点赞、总题量和付费生成在本批不伪造可用状态。

个人详情缓存含 realm/user/id；公共数据使用独立 query family，不将作者响应存入公共缓存。切号清私密查询，状态变化失效公共与个人相关列表/详情。编辑失败留输入，结果未知保留键并用持久状态恢复；成功页只信服务端 state。原“再建一个”显式 reset，不依赖 router.refresh 清 state。

## 7. 迁移、混合版本、发布及回退

- 迁移只新增表/约束/索引，不从 mock 构造历史词表；上下行成对。down 锁相关表后，有词表/审核/关联审计证据则拒绝丢弃，不自动抹掉待审或已公开内容。
- 新后端保持已实现 auth/coins/lexicon DTO；新权限字符串不破坏旧管理员 profile 结构。新增词表 DTO 由原生 OpenAPI 导出并用明确 OPENAPI_SOURCE 同步；移除 api-client 已真正实现端点的 PENDING，不扩大白名单。
- 旧前端＋新后端：旧页面仍只操作本地 mock，不能算真实上线；但已有真实接口应保持兼容。后台先接新端点不会让旧 mock 变成服务端数据。
- 新前端＋旧后端：404 必须显示不可用/失败，不能回退 mock 或宣称已保存。故推荐先后端、再 web/admin；旧页面继续假创建的过渡窗口需尽量短，首次开放真实入口须明确版本组合。
- 新前端＋新后端：隔离生产构建完成私密→审核→公开→新词条版本→下架，以及两账号/游客边界。同步 B1b 的到期与物理注销回归。
- 有真实词表/审核数据后保留 schema；回退前端不能回到可宣称 mock 创建成功的原型。旧后端不认识新词表的逻辑隐藏规则时不得作为已验证安全回退版本。回退方案需在实现后按真实混合版本验证，当前不声称已演练。

## 8. 可执行验收计划（实施后执行）

本轮没有运行测试，也不把既有 coins 测试当作词表通过。拟新增 target 在实现时创建并登记 `ops/ci_test_modules.py` 的 lexicon 分区（`wordlists_*`），同步固定 inventory。以下命令以两任务 worktree 为 cwd；数据库须复用/新建明确隔离资源并重新读取端口，显式设置 DATABASE_URL、TEST_REDIS_URL、REDIS_URL。

```bash
# 后端：新 target 落地后执行；预期全部通过且对账无变化。
SQLX_OFFLINE=true cargo test --locked --all-features --test wordlists_schema --test wordlists_catalog_handler
SQLX_OFFLINE=true cargo test --locked --all-features --test wordlists_handler --test wordlists_review
SQLX_OFFLINE=true cargo test --locked --all-features --test account_deletion_handler --test account_deletion_worker --test account_deletion_gate
python3 -m unittest ops/test_ci_test_modules.py ops/test_ci_workflow.py
cargo sqlx prepare -- --all-targets --all-features
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
# 前端：显式指向本次后端任务工作区。
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/wordlist
pnpm --filter @tsz/admin test src/pages/WordLists.test.tsx
pnpm typecheck
pnpm lint
# 批末按项目统一全量门；不为每个切片重复执行。
SQLX_OFFLINE=true cargo test --locked --all-features
pnpm test --maxWorkers=4
```

迁移真库断言：空 up/down；有内容/审核证据 down 拒绝；entry 归属/重复/排序约束；用户注销级联仅清内容且 coins/签署保留。handler 断言：游客/非作者 404、草稿/归档不可选、遗留 schema 不触发整页解析失败、同键同请求并发唯一、旧 revision 409、审核撤权/撤回/下架互斥、故障原子回滚、作者写/approve 等待锁跨注销截止拒绝、停用或到期作者的 reject/平台 withdraw 仍可完成。词库更新后动态变化及归档内容不泄露需独立验证；标准详情须覆盖逐义项精确/向下等级回退、同级英文优先于低级中文、同级中文优先、全部高于等级的空匹配、teacher/student/guest/settings-null 切换、definition 级语法关联及多方言变体；完整模式另覆盖多 base/多发音、general/dedicated 组词义映射与真实词形标签；私密备注须覆盖越权不可见、版本冲突、published/pending 仅改备注不触发重审。

浏览器人工/脚本判据：Web 用 build + next start、Admin 用生产 dist 并证明实际代理；新建隔离学生 A、学生 B 与获权审核员，不注册 API mock。A 私密创建→B/游客读不到→A 提审→审核员通过→B/游客可读→词库新发布映射更新→词条归档该项不可读→管理员下架整个词表→游客 404→作者失效/到期同样不可公开。记录真实请求及持久状态，最后确认没有 coins 收支，停止本任务服务并保留证据。

## WL-01 实施收口（2026-10-06）

已在原两工作区开工，保留 B1/B2/B4 依赖；本阶段没有提交或发布授权。标准阅读先提供允许字段投影：definition 的 id/mode/level/grammar ID 与按地区组织的安全 RichText，不输出 voice_profile、text_links、audio_assets、annotation 或管理员字段。完整模式的词形数据随 WL-03 增量扩展，避免当前接口夹带未使用的管理员结构。

隔离准备库已只读检查，目前没有 active/current publication；不能据此推断共享或生产环境不存在 V2。新查询显式限制 content_schema_version=3；遗留版本作为不可用占位，不能导致整页解析失败。本批不迁移共享词库。

COIN-11 两项产品规则已由用户确认：手动输入正整数、明确确认作者和数量，不设生产预置档位；包含不可用词条时暂不允许投币，修复并重新审核后恢复。

## COIN-11 实施约束（2026-10-06）

- POST `/wordlists/{id}/tips` 使用独立 `event_id` 和 `idempotency_key`，正整数数量是规范十进制字符串。付款方从会话取、作者从词表取；同一请求换金额/目标/事件冲突，同一事件换请求键也冲突。
- 两方主体一次排序锁定 → 普通读取钱包资格 → 词表行锁 → 有序词条共享锁 → 请求/事件锁 → 一次 `transfer_in` 与不可变事实同事务。最终复核双方注销到期。
- 正常发布也会改变词库 `lifecycle_revision`，因此新增独立归档 generation，由数据库 trigger 在未归档→归档时递增；审核通过记录这一 generation。恢复词条不会自动恢复投币资格。
- `wordlist_tips` 只保留稳定双方/词表 UUID 和 operation；不级联删除、不保存词表内容或联系方式。本人记录接口不给付款方泄露后来改成私密的词表名称。
- 页面确认作者/ID/数量，发送前将本次事件存入按 user/list 隔离的 sessionStorage。结果未知后刷新可先 GET `/me/wordlist-tips/{event_id}` 核对原收据，不发起新事件。暂停收支时仍可读取既有收据。
- 本任务首次发布应同时包含 `040000_wordlists` 与 `050000_wordlist_tips`，以目标没有真实词表历史数据为前提，部署前仍须核实；本批未读取生产。050000 对已存在的隔离词表只在生命周期完全未变时保留投币审核基线；其他历史项保守要求重审。若未来拆开部署并积累 WL-02 历史数据，须先补归档证据回填，不能宣称当前回填能区分历史普通发布。
- 两端发布顺序为后端含两项迁移和全部新路由先就绪，再发布 Web/Admin；新前端遇旧接口缺失明确失败，不回退 mock。财务事件存在后不可 down；关闭入口可停止新操作但不能删账。
