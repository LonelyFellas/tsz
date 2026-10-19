# 学生创编拼写任务：技术方案

日期：2026-10-18。阶段：已完成本地实施与验收。配套 [需求与验收](requirements.md) 是产品行为依据；API 与 schema 已在本任务工作树实现；2026-10-18 进一步授权按 ship 审查并分别开 PR，不合并或部署。

## 1. 调查基线与依赖

| 仓库     | 核对来源                                                                                                                                                                     | 状态                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| tsz      | 本任务 worktree `/Users/darwish/.codex/worktrees/ecb9/tsz`，分支 `codex/task-spelling-creation`；HEAD / fetch 后 origin/main 均为 `a069cd29b70d7021583dccd756f760c469b1b273` | 保留原文档，基于该版本实施，均未提交 |
| tsz-rust | `/Users/darwish/Dev/tsz-core/tsz-rust`，本地 main HEAD `393cf22f8c9cb7f78f17d8f288fce73859779cc6`；fetch 后 origin/main `99c0a6d6696e4455ddbfb118ee60cf66ef399eb0`           | 原调查来源；实施改用下述独立工作树   |

以上保留原调查基线，不是线上运行版本。实施前已重新 fetch，前端复用 `/Users/darwish/.codex/worktrees/ecb9/tsz`，后端从最新 `origin/main` 创建 `/Users/darwish/.codex/worktrees/task-spelling-creation/tsz-rust`，分支均为 `codex/task-spelling-creation`。后端基线 `99c0a6d6696e4455ddbfb118ee60cf66ef399eb0`；两仓实际输入均为对应 HEAD 加未提交工作区差异。未修改主 checkout 业务代码。

| 分类               | 能力                                                        | 本次处理                                              |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| 已在主线、直接复用 | 每日/长期任务、run、题目快照、首答、完成历史与幂等          | 扩展其上层覆盖轮次，不另建判题系统                    |
| 已在主线、部分调整 | CEFR 中文题资格、英美答案、来源权限、删除宽限与账号生命周期 | 复用权限依据，按模式调整批次失效和归档联动            |
| 已在主线、直接复用 | 我的词表双目录、收藏、公开词表查询、自定义项隔离            | 复用浏览/展示，补文件夹选择展开                       |
| 已在主线、直接复用 | 每日奖励去重、日上限、钱包暂停后同日恢复                    | 继续由每日 completion 驱动                            |
| 小改动             | 创编表单、字段错误、卡片、自动预览、首页与任务摘要          | 按 Web 规范组合已有组件                               |
| 新工作             | 覆盖轮次、跨日未覆盖题分配、尾量、可选日期、内容一致性检查  | 后端数据与事务先行                                    |
| 新工作             | 严格契约下的新旧模式共存、目录子树展开                      | 采用独立新接口，旧响应不扩字段                        |
| 实施环境           | 独立后端 worktree、隔离 Postgres/Redis、测试 fixture        | 已使用独占本地 Postgres/Redis 和临时 fixture 完成验收 |

关键路径已走通：schema 与轮次不变量 → 创建/分配/作答事务 → OpenAPI 与前端严格类型 → 创编及学习状态展示 → 自动化和真实链路验收。原设计预估 3–5 个有效工作日；此次使用既有 task/run/reward 能力完成本地实施，不含 CI、合并和部署。

## 2. 模型：复用 task/run，增加覆盖轮次

保留 `learning_tasks`、`learning_runs`、`learning_questions`、`learning_answers`、`learning_completions` 和既有奖励表。新模式增加 `learning_cycles`、`learning_cycle_units` 及续轮幂等回执 `learning_cycle_requests`，run 继续表示一次可完成的练习批次。

| 对象                         | 已实现增量                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| learning_tasks               | `generation_policy` 区分 `legacy_v1` / `coverage_v1`，历史行默认 legacy；新模式可选 `start_date` / `end_date`，保持原有 active/archived 状态，不把整轮完成当归档 |
| learning_cycles              | task/user 归属、轮序号、状态、固定总数、学习设置、生成/判分版本、创建/完成时间、前驱轮次、最早开始学习日；状态为 active/completed/cancelled；来源阻塞为实时投影  |
| learning_cycle_units         | 稳定轮内单元 ID、cycle、unit_key、固定顺序、来源身份与可用性代次、题面/答案快照、指纹及已覆盖 answer 引用                                                        |
| learning_runs                | 可空 cycle 关联；legacy 为 null。每日目标 `min(N, available_remaining)`，无阻塞时等于 `min(N, remaining)`；长期首批目标为整轮；批次目标创建后固定                |
| learning_questions           | 可空 cycle_unit 关联；新批次复制固定快照，同一未答单元可因旧批次过期再次分配                                                                                     |
| learning_answers/completions | 尽量不改 wire 和原有语义；覆盖引用在首答事务中写入，completion 仍只表示一个 run 全部有效首答                                                                     |
| learning_cycle_requests      | 保存 user、幂等 key、请求摘要、task、前驱 cycle、操作类型和结果 cycle；与续轮或主动重建同事务写入，支持响应丢失后原请求重放                                      |

约束与索引：

- `(task_id, cycle_number)`、`(cycle_id, unit_key)`、`(cycle_id, position)` 唯一；每任务最多一个 active cycle。
- cycle request 的 `(user_id, idempotency_key)` 唯一，外键关联结果 cycle 的 task/user；同键异参返回冲突，不产生新轮。首次创建首轮复用 task 的 create key/摘要，不重复记续轮请求。
- run、cycle、task、user 必须保持相同归属，使用组合外键/约束保证不能跨用户挂接；新模式 run 必须属于该 task 的 cycle。
- 已覆盖 answer 必须属于引用该 cycle_unit 的题目，且同一 cycle_unit 只能登记一次；具体外键组合在迁移实现时落定，不只靠前端或计数缓存保证。
- 保留既有每日 active run 唯一约束及 `(task_id, business_day)` completion 唯一约束，覆盖跨 cycle 的同日重复完成。
- 顺序索引支持按 cycle 查未覆盖项；1000 词条/2000 单元上限使整轮快照体量有界。统计从持久首答关系派生，不引入第二套独立权威计数。
- 用户物理注销时级联删除轮次与单元、题目和首答；奖励独立审计/账本沿用既有保留规则。迁移需验证新增引用不会阻碍级联删除。

`cycle.total_count` 固定；已覆盖内容后续失权不倒扣统计。失权题面的展示仍受实时权限约束，不因数据库保存快照就对用户开放。

## 3. 创建、预览与首轮快照

### 3.1 新预览

新请求只接受 `task_type`、`wordlist_ids`、`daily_question_count` 和可空 `schedule`；`schedule` 为 `{ start_date, end_date }`，两日期均用 ISO 日期。长期的题量和 schedule 必须为 null。名称不影响题目预览。

新响应提供：

- `entry_count`、`eligible_count`、`custom_word_count`、现有排除分类及 `settings`；不同层级的排除数不强行相加为词条总数。
- 每日的 `estimated_learning_days`、可选 `available_learning_days`，以及结构化校验原因；长期相应值为 null。
- `can_create`、`preview_fingerprint`、`server_time`、`business_day`、`timezone`。

`preview_fingerprint` 是服务端对输入、候选单元及其快照指纹、来源可用性身份和学习设置的规范化摘要。只用于检测预览过期，不作为权限凭证，不包含可解码的答案。无需持久化一次性预览表或引入新的签名密钥。

### 3.2 创建事务

1. 校验会话、学生/手机号/学习设置、名称和来源限制；先按账号锁及 create key 查已成功回执。已成功同请求直接返回原任务，不因预览已过期拒绝重放。
2. 对新意图按既有锁序锁账号与来源，重建候选、验证时间及计划容量，重新计算 fingerprint。
3. fingerprint 不一致返回明确 409；前端重新预览、保留草稿，由用户核对后再次点击创建，不自动换内容重试创建。
4. 一次事务写 task、首个 cycle 及全部 cycle units。创建即固定首轮内容，尚不创建每日 run，不自动产生日完成或奖励。
5. 写幂等回执并提交。返回任务详情与首轮摘要，不返回答案快照。

名称不纳入预览 fingerprint，但进入创建幂等摘要。网络结果未知时锁定意图、原 key/原 payload 重试；明确拒绝并修改输入后才使用新 key。

### 3.3 续轮与主动重建的持久幂等

请求携带 `operation`（`next` 或 `restart_blocked`）、`after_cycle_id`、`expected_revision`、`preview_fingerprint`、`idempotency_key`。预览展示当前来源、新轮题量、最早开始日；重建额外展示旧轮覆盖和取消影响。

1. 校验身份及 task 归属，按账号锁查询 `learning_cycle_requests`。同 key/同摘要返回原 result cycle；同 key/异摘要冲突。重放不得先因当前轮、预览或日期已变化而失败，也不能生成新的完成/奖励。
2. 新请求锁 task/当前 cycle，重查回执，再检查 revision、前驱、操作允许状态、当前来源、fingerprint、最早开始日及剩余计划容量。
3. `next` 只允许从 completed 前驱续轮；`restart_blocked` 只允许从当前存在不可用待答题的 active cycle 明确重建，不能用此操作任意刷新一个健康轮次。
4. 全部校验通过后，重建先取消旧 active cycle/run，再写后继 cycle/units 和 request receipt；同一事务提交。失败整笔回滚，旧轮及进度保持原状。
5. 不同 key 同时续轮时，只有一个前驱转换成功；另一个明确冲突并重新读取当前轮。同 key 的并发/跨日重试返回相同 cycle ID；响应中的展示内容仍须服从当前权限。

这不改变旧 start 请求回执；续轮创建和练习开批是两个不同的幂等意图。

## 4. 分配、作答与跨日恢复

### 4.1 分配事务

扩展既有 start 逻辑，不复制 legacy 分支的完整实现：

1. 按现有顺序锁相关账号（含来源 owner，按 ID 排序）、task，再锁当前 cycle、相关 run，并通过现有来源函数取得来源行锁。新旧路径必须共用此顺序；不能把来源行锁提前到 task 锁之前。
2. 先查询已成功的幂等回执，按原事实重放；没有回执才校验 revision、task/cycle 状态、当前学习日及日期窗口。已成功请求不会因后来跨日或计划结束被改写为失败。所有时间取数据库时间，锁等待后再次校验边界。
3. 当日有 active run 则按它的原目标和权限上下文恢复，不另开批；有 completed run 则返回结果；旧日 active run 按现有规则过期，保留其首答覆盖关系。长期恢复当前 run，不按日期重开。
4. 对待答单元计算可用性。已开始 run 使用自身的删除宽限判定；新批次不继承旧 run 的宽限，不因整个 cycle 创建得早就扩大授权。
5. 每日按固定顺序从合法未覆盖项取 `min(N, available_remaining)`，写 run 与 questions；没有合法项时返回来源阻塞，不创建零题批次。因阻塞少于 N 时返回明确原因。长期只要存在合法待答项即可创建首个 run，复制本轮已持有的全部固定单元，目标仍为 T；不可用项不对外返回题面/答案并保持未答，不另建部分 run 冒充长期完成。
6. 保存 start 幂等回执，提交前重查时间/资格。跨界则整体回滚，不生成过时窗口批次。

无需每日定时批处理或提前为所有日期建 run。漏学天没有完成记录；下一次真实开始时才进行分配。

### 4.2 首答事务

- 沿用当前答案规范化、归属、时间、首答幂等与版本化判分；来源权限依据复用，批次整体失效逻辑必须按 generation_policy 分支调整，具体见下节。
- 新模式在同一事务中登记该 cycle_unit 的覆盖 answer。合法错误也登记，空白/非法/超时答案不登记。
- 同单元通过不同已过期 run 并发提交时，cycle/unit 锁、首答与覆盖约束共同保证最多一次；过期 run 不得产生新首答。
- 当 run 全部有效首答时，沿用 completion、学习奖励及邀请达标等现有完成消费者；当整轮全部覆盖时，同时将 cycle 标为 completed。末题、run completion、覆盖关系、cycle 状态及所有同事务结算必须一起提交或回滚，不能在新分支遗漏既有完成消费者。
- 故障重放按原请求返回原事实，不重复覆盖，不结算新的业务日。
- 读覆盖进度可以包含过期批次的合法首答；奖励继续只查已完成批次，不把 coverage count 直接传给奖励模块。

例：235/100，首日答 60 后过期，次日 remaining=175、分配 100；再下一日分配 75。首日没有日 completion，也没有该批次奖励贡献，但其 60 个单元不重做。

### 4.3 来源阻塞与现有共享函数的改动边界

现有 `run_view` 及 answer 事务末尾都会检查批次中所有题目的可用性；任意题目失权即可阻止整批继续。这与新规则不一致，不能原样复用。旧 legacy 分支保留原行为；coverage 分支需统一调整读取、恢复、提交及最终复查：

- 已覆盖项失权只隐藏题面/答案，保留覆盖、正确率和历史统计，不使合法待答题失效。
- 当前提交题目必须在提交前后均合法。其他题目失权不回滚这道合法首答；同一事务刚写入的当前答案仍必须接受末尾来源复查，不能因已登记覆盖就跳过授权。
- 不可用待答题保持未覆盖，run 目标不缩小、不补题；coverage run 可保持 active 并读取/作答其他合法题。全部待答不可用时，UI 显示来源阻塞；每日仍按原时限过期，长期保留未完成批次。
- 新模式 `run_view` 不再因任意不可用题直接返回 invalidated；blocked count/reason 在 plans 摘要投影，共享 questions 继续用 `content_available=false` 隐藏单题。旧客户端拿到兼容 run 形状也不能绕过逐题授权。
- 部分阻塞不终止 cycle。总数保持固定，只有覆盖全部 T 才 completed；新每日批次可只包含当前合法剩余项，其 completion 不代表整轮完成。
- “检查来源”重新请求权威可用性，只允许相同来源身份/代次重新满足条件的项恢复；不能改绑新的 membership/public generation 来复活旧快照。正常内容发布仍不改本轮，永久无法恢复的项由用户决定是否放弃整轮。

删除宽限需特别保持：同一 cycle 中未来尚未开批的项没有旧 run 的宽限；其阻塞不得抢先取消仍在宽限内合法继续的当前批次。现有 answer 完成后若触发自动归档，必须与手动归档共用收尾：task archived、未完成 run/cycle cancelled，刚完成的 run/completion 与统计保留；cycle 已全覆盖则保留 completed。不能出现归档 task 下仍有 active cycle，也不能为保护新轮进度延长删除宽限。

### 4.4 最早开始日与状态转换

- 普通续轮，设上轮实际完成学习日为 D，当前学习日为 B，计划开始日为 S（未设置忽略）。每日后继最早开始日为 `max(B, D + 1, S)`；昨天完成今天操作得到今天，今天完成今天操作得到明天。不使用“请求日期加一天”作为统一规则。
- 主动放弃受阻轮并重建，查询本任务在 B 日全部轮次的合法首答及 completion。若有任一首答或完成，最早为 `max(B + 1, S)`；两者都没有则为 `max(B, S)`，原空 run 在重建事务中取消。长期无日限制。
- 最早开始日持久化在新 cycle，开批时再核实 task 当日完成和可用额度。状态转换检查和幂等回执不能只靠前端按钮。
- 普通续轮不取消旧 completed cycle；主动重建取消旧 active cycle/run，新轮从零计覆盖，旧首答不搬移、不重新计奖。不存在可用新候选或日期容量不足时，不能先取消旧轮再报错。
- 用户归档和删除宽限自动归档采用同一收尾规则；终态 cycle 不重新激活。

## 5. 日期计算与状态投影

- 日期 API 接受学习日标签，不接受浏览器本地时区转出的任意时间戳。后端统一映射到 `Asia/Shanghai` 04:00。
- 无 schedule 即无计划上下界，创建后立即可学；有 schedule 时两日期完整校验，计算 `end - start + 1 >= ceil(total/N)`。
- `ends_at` 可作为新模式由 end_date 派生的内部截止值以复用现有过期检查；不是新客户端可单独设置的第三个时间字段。start_date 对应的起点由同一规则派生。
- 新轮计划容量从第 4.4 节的最早开始日计算，含首尾日的容量必须足够整轮。已运行轮不能沿用新轮的整日公式：由服务端计算 `today_available_count=A` 和之后允许学习日数 F，以 `A + F*N` 与 R 比较。
- 无来源阻塞时，`R=0` 的剩余学习日为 0；`A>0` 时为 `1 + ceil(max(R-A,0)/N)`；`A=0` 时为从下一允许学习日起的 `ceil(R/N)`。当前批次 A 是剩余未答数，今日尚未开批且有资格时 A 为 `min(N,R)`；今日已完成或开始日前 A 为 0。计划结束不返回可达成的未来完成日期。
- 有不可用待答题时整轮预计学习日为 null，附来源阻塞原因；如需展示合法内容的计划，只能明确标为局部进度，不能冒充整轮预计完成。
- “尚未开始/可学习/今日已完成/本轮已完成/计划已结束/来源阻塞/已归档”由服务端给出投影；归档和计划截止控制能否新作答，已完成事实保持原义，来源阻塞作为独立数量/原因可与可学习状态并存。
- 新详情摘要至少含 `current_cycle`、`covered_count`、`remaining_count`、`available_remaining_count`、`blocked_count`、`today_run`、`today_available_count`、预计学习日及起算日、`can_start`、`can_start_next_cycle`、`can_restart_blocked_cycle`、禁止原因、服务器时间和下一日边界。长期摘要需覆盖现有 run 中所有合法待答项，不只看当前题目分页。
- 前端仅用 server_time 校准提示，不以设备时间发放题目或决定过期；跨日后在进入页面/恢复焦点/开始学习时重新获取权威状态。

## 6. API 与新旧兼容

现有客户端对 `LearningTask`、`LearningTaskDetail`、`LearningPreview`、run 等进行严格 runtime 验证。直接给旧响应增加字段并不兼容。实现采用新增 `/api/v1/me/learning-plans` 接口族，内部仍使用同一 task/run 服务及 ID；不是新建第二套业务系统。

独立路径的代价是增加请求入口和 DTO；好处是新后端可完整保留旧响应，旧后端也会明确拒绝新创建，不依赖旧服务是否识别能力头。handler 共用底层服务，不复制鉴权、判分或历史存储。

| 接口                                          | 用途                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| POST `/me/learning-plans/preview`             | 新规则候选、题量、日期校验与 fingerprint                                     |
| POST `/me/learning-plans`                     | 幂等创建 task + 首轮                                                         |
| GET `/me/learning-plans`                      | 新版列表；同时投影 legacy 与 coverage 任务，显式 mode                        |
| GET `/me/learning-plans/{id}`                 | 新版详情、来源卡片及覆盖摘要；失权来源不泄漏名称                             |
| PATCH `/me/learning-plans/{id}`               | 复用 revision 重命名；新任务 50 字，旧任务保留原 100 字规则                  |
| POST `/me/learning-plans/{id}/archive`        | 复用归档，必要时取消 cycle                                                   |
| POST `/me/learning-plans/{id}/runs`           | 幂等开始/恢复当前练习，返回原有 LearningRun 形状                             |
| POST `/me/learning-plans/{id}/cycles/preview` | 按 next/restart_blocked 预览题量、最早开始日和放弃旧轮的影响，不写数据       |
| POST `/me/learning-plans/{id}/cycles`         | 携带 operation、前驱 cycle、revision、fingerprint 和 key，持久幂等创建下一轮 |
| GET `/me/learning-plans/{id}/cycles`          | 分页查看整轮历史                                                             |
| GET `/me/learning-plans/{id}/runs`            | 复用原 run 历史，新摘要关联所属 cycle                                        |
| POST `/me/wordlist-library/{space}/selection` | 输入 node_ids/expected_version，事务内展开正常子树并返回去重词表，供用户确认 |

上述路径省略共同 `/api/v1`。新响应使用独立 OpenAPI schema roots；共用 `/me/learning-runs/{id}`、questions、answers、奖励端点及其原 DTO 形状保持不变。新版作答后按需失效详情摘要 Query，获取整轮进度，不给旧 answer receipt 添字段。

兼容约束：

- 旧列表不能静默过滤 coverage。该账号存在 coverage 任务时，旧列表请求在分页前返回现有 Problem Details 形状的 409，message 为“任务功能已更新，请刷新页面后继续”；不能返回空页或部分列表。账号只有 legacy 时原响应不变。旧详情、开始、改名/归档路径访问 coverage ID 同样明确提示升级。
- 新版页面提供安全刷新入口，答题有未提交内容时先提示保留/处理草稿，不强制跳转清空输入。当前旧任务列表会展示服务端 message；旧首页只展示通用读取失败，须保留“查看全部任务”入口，让用户进入任务列表获得明确刷新提示，不能声称所有旧 bundle 都能直接显示新提示。验证旧首页不会降为空态或继续显示过时缓存；刷新后的新版 plans 接口返回完整数据。
- 既有通用 run 读取/作答仍可处理新 run，wire 形状保持兼容；其来源阻塞行为按第 4.3 节分支，不假设所有服务端语义完全未变。旧客户端不能通过旧 start 入口绕过计划或开启第二轮。
- 新客户端可展示两种任务；legacy 分支继续调用原语义，不将旧任务自动转 coverage。新周期操作不支持 legacy，需在服务端拒绝。
- 新客户端连接旧 API 时，新接口返回 404，显示功能尚未就绪并保留创编草稿；不得自动回退旧创建接口而生成含义不同的每日抽题任务。
- 新页面保留旧任务使用能力：若新列表/详情端点 404，可使用旧接口继续查看、开始/恢复和管理 legacy 任务，并明确旧模式；新建覆盖计划及新轮次接口保持关闭。回退只针对明确的功能缺失，不吞掉鉴权、权限或其他服务器错误；详情单项 404 先核实接口支持情况，不能将资源不存在误判为整个 API 未升级。
- learning-plans Query key 包含 user、接口模式和筛选；旧缓存不能被新摘要误用，切号取消请求。HTTP 层仍纯 parse，不做 snake_case/camelCase 转换。
- 目录展开接口校验 owned/favorites、节点归属、回收站、目录版本、子树和来源权限；超限返回结构化错误，不返回“前五个”。确认后以词表 ID 作为任务输入，不保持目录订阅。

## 7. 前端范围与交互状态

主要影响：

- `packages/types/src/learning-tasks.ts`：新 schema wire 镜像，legacy 类型保持原义；目录展开类型放在 wordlist-library 模块。
- `packages/api-client`：新增 plans/selection 请求、严格 schema root 注册与生成链支持，保留原 learning 客户端；契约测试覆盖新旧组合。
- `apps/web/src/features/task/components/LearningTasks.tsx`：把创编及必要计划展示拆为同功能内组件，复用首答输入与鉴权薄壳；练习页补来源阻塞、可答题分页、重查来源及安全刷新状态。当前页无合法待答题不等于整批无题，需使用批次摘要并允许定位其他有合法待答项的页面。
- `StudentHome.tsx` 和任务列表/详情：按服务端状态选择可学任务，不把未来任务展示为“立即继续”，区分今日与整轮进度；同时兼容旧任务。
- 词表选择器：组合已有目录数据与卡片/弹层交互；不修改现有移动目标 FolderPicker 的行为来兼任批量选词表。

创编状态包含草稿、弹窗临时选择、preview pending/success/error、field errors、create intent/unknown result。已有自动预览结果只在输入 fingerprint 对应时可提交；搜索/预览请求取消并校验序列，账号变化时旧结果不能回填。字段错误关联真实控件并聚焦首错；服务失败与字段无效分开表达。

日期计划关闭时不发送草稿中的旧日期；切换长期同理。API 创建未确认时锁定原意图，不因自动预览刷新改掉重试 payload。服务器明确冲突后才能解锁并重新核对。

## 8. 迁移、契约生成与发布准备

- 增量迁移 up/down 成对。历史行标记 legacy，不回填覆盖轮次、不重写旧答案与奖励。
- down 仅在无新模式 task/cycle/关联数据时允许；存在覆盖数据必须明确拒绝有损回退，不删除学习事实来完成 down。
- 新模式数据写入后，不能直接运行未识别 generation_policy 的旧后端：其旧列表/开始逻辑可能误读新任务。回退候选必须至少包含模式过滤/拒绝保护；关闭新建不能代替数据兼容。
- 后端原生导出 OpenAPI，前端显式 `OPENAPI_SOURCE` 同步 endpoints/runtime，按新 roots 更新生成器注册。禁止手改生成 JSON 或扩大 PENDING 掩盖差异。
- 新接口隔离使“旧 Web + 新 API”具备设计上的兼容路径；“新 Web + 旧 API”保留 legacy 任务使用能力，新覆盖创编关闭。两者均需实际验证，不能将设计推断写成通过。
- 推荐未来顺序：兼容后端及迁移 → Web。Admin 无本次业务消费者，不为凑配套发布改动 Admin。发布前按 [配套清单](../../../.agents/skills/contract-sync/references/paired-release.md) 验证真实候选组合及回退版本。
- 已生成并同步 OpenAPI，在独占数据库验证迁移；未创建发布开关或部署。线上现有版本未知，不以本地验收版本替代部署 manifest。

## 9. 验证计划与实际证据

下表保留风险验收范围。其后的实际证据区分自动化、真实链路和未运行项，不能将计划范围全部视为实机通过。

| 层                  | 核心证据                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust 数据库/handler | 235/100 尾量、部分跨日、漏日、稳定顺序、全错完成；并发首答/开批/续轮；各持久关系和归属约束                                                              |
| 时间与事务          | 日内部分作答与跨日后的不同估算；昨日完成今日续轮；零作答重建当天可开始；锁等待跨界；续轮成功丢响应后同键返回同一轮、异参拒绝；末题各事实原子一致        |
| 来源与目录          | 已答失权后下一合法题仍可提交；当前提交题在最终复查失权必须回滚；待答失权保留分母并允许其他合法题；长短批次和全阻塞；来源恢复代次、跨页与子树权限        |
| 奖励与生命周期      | 尾量不足奖励门槛、部分旧日覆盖不挪奖；来源阻塞短批次按真实完成数计奖；删除宽限完成后同步归档/取消剩余 cycle；邀请等完成消费者、暂停恢复和注销级联不回归 |
| 迁移                | 空库 up/down、带 legacy 数据往返；coverage 数据存在时拒绝 down；回退兼容后端可安全读取/拒绝                                                             |
| 前端组件            | 自动预览竞态、草稿保留、日期可选/恰好足够、不同模式提交字段、文件夹/跨页选择、错误定位、未知创建原键重试、切号隔离                                      |
| 契约                | 只有 legacy 时旧响应不变；存在 coverage 时旧列表明确升级提示，旧首页不伪装空态；新接口缺失降级、共享 run/answer 不增字段                                |
| 真实链路            | 内置浏览器 → production Web → 真实 Rust → 独占 Postgres/Redis，保存后刷新与独立 GET，完成至少一轮及尾量路径                                             |

按实际 Cargo targets 执行学习 task/run/reward/schema 和目录 handler 测试；时间边界在独占数据库中受控模拟，不修改共享环境时钟。前端迭代执行受影响组件及契约测试，接近完成统一安排仓库要求的 typecheck/lint/普通测试与生产构建；不按测试数或覆盖率配额堆用例。

真实链路按 [真实后端验收](../../../.agents/skills/test/references/real-backend-acceptance.md) 核实制品来源、代理、无 API mock 及隔离。235 题行为优先由数据库集成测试证明，浏览器用较小但能触发完整批次和尾量的真实 fixture 验证页面；不得用 mock 冒充联调。跨日需要受控测试时钟，独立记录方法和复原证据。

本次题型无语音或图片上传，不需要 OSS 测试资源。后续测试新建独占 fixture、账号/会话和进程，结束清理并独立复查；若改用 tshb-test，先遵守临时数据归属与彻底清理规则。

### 本次实际证据（2026-10-18）

- **后端**：`SQLX_OFFLINE=true cargo fmt --all -- --check` 与 `cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。显式使用独占数据库和 Redis 运行 `cargo test --locked --lib --test learning_tasks_handler --test learning_runs_handler --test learning_tasks_schema --test learning_rewards_handler --test learning_rewards_schema --test wordlists_handler -- --test-threads=4`，448 项通过；收尾新增的来源阻塞短批次回归另行通过，并完成该 target 的增量 clippy。共 449 项不同用例通过。新增用例归入既有 `learning_runs_handler` / `learning_tasks_schema` target，沿用现有 CI 分区。新增 SQL 使用动态 query / query_as，不涉及编译期 SQLx 宏，`.sqlx` 无需生成变更。
- **关键后端结果**：235/100 得到 100、100、35；首日只答 60 后继续分配 100、75；35/100 首日结束整轮；已答失权保留覆盖、待答失权保留分母且其余可答；当前题最终权限失效回滚；删除宽限完成同步归档/取消剩余轮次；零答重建当天可开始，有作答或完成须次日；续轮原键重放、并发同键、同键异参；用户物理删除级联；计划开始/结束与末题跨界回滚；迁移空库及 legacy 往返、coverage 数据拒绝有损 down。
- **奖励**：受控学习日下，前日部分作答不计完成奖励；次日 9 题尾量完成整轮但仅贡献当日 9 个单元、仍未获奖；另一完整批次补足 10 个去重单元后按既有政策结算 5 币。未改奖励配置或完成消费者。
- **前端**：全仓 `pnpm typecheck`、`pnpm lint`、`pnpm test` 通过（全量测试当次 4034 项通过、2 项既有跳过；lint 仅 3 条既有警告）。随后对创编/进度/首页的增量变更执行受影响 24 项测试、Web 类型检查和 eslint，均通过；当前生产构建通过。新增证据覆盖迟到预览、未知创建原键重试、长期提交清除每日字段、错误聚焦、404 能力探测、首页区分日完成与轮完成及跨日无 run 的已完成轮。
- **契约**：后端使用 `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi`；前端显式 `OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/task-spelling-creation/tsz-rust/docs/openapi.json` 同步。原始 spec SHA-256 为 `a01a783198925c08b54bf05331933e7a17e61eef68c79cbd642079447f00585c`，runtime `_source_sha256` 一致。`@tsz/api-client` 570 项通过；未扩大 PENDING，旧 task/run/answer DTO 没有增加字段。
- **真实链路**：Codex 内置浏览器 → `http://127.0.0.1:57483`（`pnpm build` + `next start`）→ `/api/v1` 代理 → 本任务 Rust `127.0.0.1:58483` → 独占 UTF-8 Postgres `127.0.0.1:55483/spelling_test` 与独占 Redis `127.0.0.1:56483/0`。后端按本任务源码重新构建启动，未使用前端 API mock、route 拦截或共享库。真实创建每日 3/2，整页刷新保持；首批全错后 2/3，当日批次完成；仅把本任务 fixture 的批次、答案和完成时间回移一天模拟跨日，下一批只有未答的第 3 个单元，完成 3/3；当天续轮持久化为明日开始。长期任务真实创建、首答后刷新恢复、完成 3/3；进度和轮次历史一致。
- **独立读取与页面**：额外通过同源代理独立登录/GET，确认 daily 第 2 轮尚未开始、longterm 第 1 轮已完成；旧 `/me/learning-tasks` 返回 409 和“任务功能已更新，请刷新页面后继续”。浏览器检查 390×844 手机深色与 1280×900 桌面浅色，`scrollWidth` 等于视口宽度；字段定位、弹层选择和刷新恢复通过。截图保存在当前任务的本地可视化目录。
- **隔离与清理**：本地 HTTP 验收进程使用独立端口，`COOKIE_SECURE=false` 只用于本地纯 HTTP；未修改生产配置。本次无 OSS/语音资源。测试结束清理状态见第 10 节。
- **实施验收阶段的未运行项/限制**：未启动真实旧后端候选做混合版本实机验收；缺失 plans API 的回退与旧响应保护由组件/契约/handler 测试证明，不能写成旧服务实机通过。未运行独立 Playwright e2e 套件、GitHub CI 或发布/回退演练；未提交、推送、创建 PR、合并或部署。未测试浏览器断网注入的实机重放，已用持久数据库与前端请求测试验证对应协议。

## 10. 当前交付与下一步

本地实施与验收已完成，当前按用户后续授权进行两仓 ship 审查、修复、提交、推送和 PR。精确提交、独立审查、hooks 与 CI 状态记录在对应 PR 和交付回复中；不合并或部署。主记录仍只有本目录的需求与技术方案，不在后端另建台账。

隔离环境已清理：本任务 Web/Rust/Postgres/Redis 均停止，55483/56483/57483/58483 无监听；独占 Postgres 数据目录（含早期非 UTF-8 失败库）、Redis 临时文件、fixture、会话、种子程序及其专属编译产物、临时原始日志均删除，独立复查目录不存在、专属编译产物残留为零。浏览器已正常退出测试账号（后端 204）、关闭实际验收页面并恢复视口/外观；内置浏览器不支持额外的 CDP 存储清除，未声称强制清空通用 HTTP 缓存。只保留源码、非敏感验收记录与截图。

本次从这两个工作树继续 ship，正常执行原生 hooks 和 CI。后续发布须另行授权；配套后端先发布，再发布 Web。已有 coverage 数据时，禁止直接回退至不识别 generation_policy 的旧后端；down 会拒绝删除新模式学习事实。
