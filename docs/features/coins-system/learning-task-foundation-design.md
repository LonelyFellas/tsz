# 真实学习任务基础：技术设计

日期：2026-10-07。重档评估：涉及新持久事实、鉴权、生命周期、迁移和跨仓 API。LT-01～LT-04 已实现并完成本机隔离验收；未访问生产数据；本轮交付目标为两仓任务分支 PR，尚未合并或部署。产品确认与范围见 [需求](learning-task-foundation-requirements.md)。

## 1. 基线、依赖和关键路径

| 仓库     | 当前输入                                 | 本任务 worktree                                                   |
| -------- | ---------------------------------------- | ----------------------------------------------------------------- |
| tsz-rust | b1bb101565a0d566917b3b48aac8753a63c215b4 | /Users/darwish/.codex/worktrees/learning-task-foundation/tsz-rust |
| tsz      | 5b2c993a4a68eef5f51cd279b2cb80eed4c47599 | /Users/darwish/Dev/tsz-core/tsz-learning-task-foundation          |

两仓分支均为 `codex/learning-task-foundation`；此前 WL-03 已于 2026-10-07 按 backend → Web → Admin 发布，当前文档中的历史“未部署”状态不适用于它。旧任务 worktree 只读保留。

```text
已发布词库/真实词表＋学生设置/鉴权（已有）
  → LT-01 出题资格、规范化与服务端判定
  → LT-02 任务/轮次/首答/完成持久化及生命周期
  → LT-03 Web 创建、恢复、答题、结果与历史
  → LT-04 真实闭环、契约及统一质量门
  → COIN-12 独立评估结算规则后接入（本批不发币）
```

共享文件和生成契约集中修改，不为各层重复执行全仓流程。粗估剩余关键路径 7–10 个专注工程日（含定向测试和联调，不含交付/CI排队/部署）；先交付可验证的单题判定，再串完整闭环。不是对自然日的承诺。

源码依据：后端 `wordlists/service.rs` 的 read_entries_view/lock_user/read_lock/lock_entries、`wordlists/projection.rs` 的字段白名单、`lexicon/service/form_senses.rs::allowed_form_senses`、`lexicon/normalization.rs::normalize_headword`、`user/repository.rs` 的 learning_settings、`account_deletion` 锁后到期检查可复用。`coins/service.rs::credit_in` 留给后续，不在学习事务中提前调用。前端复用 wordlist 请求/身份隔离和 RichText reader；TaskManager/PracticeBoard、旧 Task/PracticeRecord 和 /tasks 占位不构成已实现能力。

## 2. 选定方案与不采用的方案

- 用户已确认每日/长期、学生自建、中文释义拼写、有效作答即完成、04:00 换日、整个任务结束时刻、长期按轮次。
- 服务端固定每轮题目、允许答案、设置和规则版本，再逐题记首答并派生完成；客户端只作输入和呈现。
- 用 PostgreSQL 事务和唯一约束；不用 Redis/浏览器内存作为事实源，不增加消息队列、通用题库或规则引擎。
- 不接受客户端批量上报 completed/correct_count/date 来替代判定，不按停留时长证明学习，也不引入未批准的最低正确率/防猜阈值。
- 不冻结整份 AdminWordV3 并原样下发；只保存判题需要的题面、答案和来源 ID。题面可安全呈现，判定快照仅后端读取。
- 任务参数创建后固定，首期仅重命名/归档；不做任务配置版本排期。正常词库新发布在下一轮生效；在途轮次保留原判定标准。

## 3. 出题资格与纯判定

新增狭义 `src/learning_tasks/question.rs`，内部函数：

```rust
fn build_candidates(publications: &[LearningSource], context: &LearningContext)
    -> Result<CandidatePool, AppError>;
fn grade_spelling(snapshot: &AnswerSnapshot, answer: &str)
    -> Result<(String, bool), AppError>;
fn business_window(at: DateTime<Utc>) -> (NaiveDate, DateTime<Utc>, DateTime<Utc>);
```

这些是内部纯函数，不是 HTTP API。LearningSource 由服务端授权查询构造，客户端不能自行提供。

1. 本人必须具真实 student 角色、已绑手机和非空 learning_settings；不使用 teacher 阅读视角 C2 或游客 C2 预览。上下文为服务端 CEFR＋EnglishVariant，开轮后固定。
2. 授权读取任务的词表集合，批量获取未归档/current V3 snapshots，校验 publication.entry_id；先按选中词表顺序/作者编排去重 entry，再按发布稿 pos/sense 顺序构造学习单元。
3. 义项 definition 的等级/语言优先级与现有 `reading.ts::selectDefinition` 一致，后端独立实现并用共同案例核对；只保留非上下文依赖且选中 zh_definition 的单元。不修改公共 WordlistEntry 以泄露题目答案或额外后台字段。
4. 通过 allowed_form_senses 得到本义项允许的 base forms；按保存英美偏好选择 common/对应地区真实 spelling。对空拼写、无关联原形、无中文定义或题面按独立拉丁词/完整短语边界直接暴露允许答案的项生成排除计数。不要假造题、静默翻译或拿更高等级补足。
5. 允许答案使用 `normalize_headword` 规范化的 key 去重；不调用管理员录入 parse 的字符集限制来把正常错误答案当正确。空白/控制字符/长度超限为无效提交；非空合法格式但不匹配为有效错误作答。
6. 每题固定 `question_type=spelling_zh_to_en`、`generation_version`、`grading_version=spelling_exact_v1` 及 normalization 版本。未来改规则须新增版本分派或使旧未完成轮次显式失效，不能静默用新版判旧快照；重放始终读取已判结果。
7. 每日从去重候选中按服务端保存的 seed 稳定抽取 N 个；本轮不重复单元，不承诺间隔复习或永不重复。长期取本轮全部候选。抽样后把题目落库，刷新不能重新洗出一套。

已采用的工程上限：每任务最多 5 个词表，去重来源最多 1,000 个 entry；每日 N 为 1–200，长期轮次最多 2,000 道；分页最多 50 道，不一次返回完整答案集。开工前用典型真实 V3 内容确认响应/事务成本；超过边界明确提示拆分任务，不截断或凑题。这些是防止无界请求的工程建议，不是奖励规则，也不新增在线配置系统。

## 4. 数据模型与唯一性

已新增 `20261007010000_learning_tasks.up.sql/.down.sql`，编号已核对。首期六张窄业务表；不是通用事件平台。

| 表                          | 关键数据                                                                                                                                                                                      | 约束与用途                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| learning_tasks              | id、user_id、name、task_type、question_type、ordered wordlist_ids、daily_question_count、ends_at、state、revision、create_key/hash、created_at                                                | user FK CASCADE；(user_id,create_key) 唯一；daily 需要正题量，longterm 题量/null截止约束；只允许 active/archived               |
| learning_runs               | id、task_id/user_id、task_revision、task_type、business_day、window_start/end、expires_at、settings_snapshot、seed、target_count、state、generation/grading_version、started_at               | 外键随任务删除；同 daily task/day 最多一条 active，同 longterm task 最多一条 active；expired 由 expires_at 判定；至少 1 题     |
| learning_questions          | id、run_id、position、source_wordlist_id/revision、entry_id、entry_archive_generation、publication_id、pos/sense/definition/form IDs、unit_key、prompt_snapshot、answer_snapshot、fingerprint | (run_id,position)、(run_id,unit_key) 唯一；允许答案不进入公共 DTO；判定所需数据冻结                                            |
| learning_answers            | id、run_id/question_id、request_key/hash、submitted_answer、normalized_answer、is_correct、accepted_at、grading_version                                                                       | question_id 唯一；(run_id,request_key) 唯一；复合 FK 保证 question 属于该 run；首次有效结果不可覆盖                            |
| learning_completions        | id、run_id、task_id/user_id、task_type、business_day、task_revision、固定题量、answered/correct_count、completed_at、规则版本                                                                 | run_id 唯一；daily 的 (task_id,business_day) 唯一；answered_count=target_count 且 0≤correct≤answered；只在最后有效首答事务生成 |
| learning_run_start_requests | user_id、request_key、task_id、request_hash、run_id、created_at                                                                                                                               | (user_id,request_key) 唯一，FK run CASCADE；记录并发开始请求到同一轮次的映射，确保旧请求跨日重放不新建下一轮                   |

- task.wordlist_ids 是有序、非空、去重 UUID 引用，服务端校验来源权限；不对他人词表设置会阻止删除/注销的 RESTRICT FK。Question 的词库来源 UUID 同样是出处，不以 FK 强行永久保留平台内容。
- run/task/user、answer/run/question、completion/run 的归属必须由复合约束或写入查询保证，不允许从请求填充其他学生 ID。创建请求 hash 对原始意图冻结，重命名后原键仍定位原任务。
- 只存必要文本，不存完整后台 snapshot、音频、voice_profile、联系方式或作者备注。个人记录默认保留至删号；归档任务保留学习历史，不提供物理删除完成记录的普通接口。
- 学习表随 user 物理删除级联；已有 coin_operations/coin_entries、注销签署仍独立。未来 COIN-12 的结算审计表不应 FK CASCADE 到这些可删学习表。

## 5. 时间、开始、作答和状态事务

### 日界线与时间来源

`business_day = date((clock_timestamp() AT TIME ZONE 'Asia/Shanghai') - interval '4 hours')`。run 保存该日、窗口起止及 `expires_at=min(day_end, task.ends_at)`；长期 expires_at=null。API 返回服务端时间与时区，浏览器只显示倒计时。

锁后独立读取 clock_timestamp()，不拿事务启动时间 now() 判断过期/注销。提交末尾再检查时间/资格；恰在截止时刻的新提交拒绝。正常跨日不迁移题目或累计数量；已成功的旧请求先查原事实，不能用新的业务日重新执行。

### 固定锁序与来源检查

先在独立只读收据路径校验 learner 当前资格、请求归属及 hash，并探测已提交的开始/首答事实。命中就返回原事实：不要求来源仍存在，只对题面/答案内容按当前权限裁剪；不因跨日或来源删除重执行。该路径的锁不带入新写入事务。

未命中才进入新写入事务：无锁收集 learner＋当前 source wordlist owners 的稳定 UUID，按固定顺序锁现存账号，再按 task → run/start request → wordlists（UUID顺序）→ entries（UUID顺序）取得锁。锁后再查请求事实，处理探测后的并发提交；然后才做首次写入的完整来源资格检查。源词表/作者不存在是明确的 unavailable 结果，不应无限重试收集 owner；保留可用的 learner/task/run 锁将未完成轮次标记 invalidated。只有确实发现集合变化且仍有可用来源时才回滚后有限重取，不倒序追加账号锁。新学习业务不取得钱包锁。

复用 AuthUser 的 security_version、绑定及账号状态语义，事务中核实 learner 身份和所有必要 source owner 可用性，提交末尾重查注销到期。不可在取得 task/run 后调用一个会倒序补锁用户的通用 helper。源词表/词条修改、归档和删除与 FOR SHARE 检查串行，确保完成或失效有确定顺序。

每次读取题面/提交都核对当前来源仍可访问、题目 entry 仍在指定源词表、entry 当前 active/V3。`wordlist_archive_generation` 已在主线，可只读记录/比较它以识别归档后恢复；普通 publication/lifecycle 更新不等于归档，不能用 lifecycle_revision 误杀正常更新。wordlist revision 仅作为出处，不要求与当前值全等：仅重命名或追加与本轮无关的词条继续原轮；移除本轮固定 entry 才属于来源失效。私密 note_revision 变化也不影响轮次。

### 开始与再开

1. 校验本人资格与请求格式，先走上述已提交收据探测，再在必要的新写入事务中重查 run_start_requests。原键同载荷返回原 run（允许它已完成/过期/来源失效），原键异载荷 409，不重新选日/题。
2. daily 取服务端业务日：已完成返回当天结果，已有有效 active 返回原轮并记录请求映射。longterm 未完成则恢复原轮。
3. 用户明确再开时携带 after_run_id；它必须等于该 task 最新已完成/失效轮次。并发不同键最多生成一个后继，迟到前驱返回冲突或当前轮，不能连续自动创建多个轮次。每日 completed 不允许同日再开计入任务的轮次。
4. 来源失效或过期的旧轮标为 invalidated/expired，释放活跃唯一约束；不删除首答、不产生 completion。daily 无完成事实时可显式重开剩余时间内的新轮；longterm 同理。新轮从当前允许的来源重取固定集合。
5. 全量新候选不够题量/为空/超上限则不开轮；持久化所有固定 questions 和开始请求映射后一次提交，不能半轮可见。

### 首答与完成

- 先核对请求属于本人 run。命中原 request_key 时从原 answer 返回稳定判定；内容字段仍受当前来源权限投影，不能借重试绕过撤回。
- 题目已被其他 key 作答则 409 already_answered，提示恢复服务器进度；不覆盖首答。相同 key 不同 answer/question 409。无效输入不占用 key/首答。
- 检查所有固定来源资格，不只检查最后一道题；否则早先题目归档后仍可能被最后一题凑成完成。题面/答案/版本固定，服务端判定并写一行 answer。
- 在 run 锁内从持久 answers 重新计数；等于 target_count 时插入唯一 completion，并将 run 标 completed。最后首答、计数、状态和完成记录同事务；故障全部回滚。
- 返回 answer_id、is_correct、accepted_at、计数及可选 completion_id；只对已答且仍有内容权限的题给答案反馈。不得返回未答题答案。没有独立 POST /complete 或 /check-in 可绕过首答链。

GET 不负责批量刷新/发奖。页面从服务器时间计算当前日；过期轮次投影 expired 并禁止新作答，但已答题在来源仍可访问时可以复盘，未答题答案仍不开放。只有来源失权才隐藏题面及答案并投影 invalidated；后续写入/明确重开持久化该终态。无需 04:00 定时清零任务或内存 timer。

## 6. API 与界面契约（已实现）

统一 `/api/v1`，本人资源都使用 AuthUser。使用专用 snake_case DTO 和严格未知字段拒绝；不继续使用 Partial<Task>。

| method/path                          | 请求/返回要点                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| POST /me/learning-tasks/preview      | wordlist_ids；类型/题量校验，返回可出题数和安全排除计数；不建立轮次或承诺内容预留           |
| POST /me/learning-tasks              | idempotency_key、name、type、wordlist_ids、daily_question_count、ends_at；返回真实 task     |
| GET /me/learning-tasks               | 分页，active/archived；当前业务日完成/进行状态；不发送完整题目                              |
| GET /me/learning-tasks/{id}          | 定义、revision、服务端当前日/时间、当前轮次或最后结果；仅本人                               |
| PATCH /me/learning-tasks/{id}        | expected_revision＋name，禁止用此接口改源词表、题量、类型                                   |
| POST /me/learning-tasks/{id}/archive | expected_revision；归档并取消未完成轮次，已完成事实保持                                     |
| POST /me/learning-tasks/{id}/runs    | idempotency_key、expected_revision、nullable after_run_id；恢复或明确开启下一轮             |
| GET /me/learning-runs/{id}           | effective state、快照规则/设置、target/answered/correct_count、时间、nullable completion_id |
| GET /me/learning-runs/{id}/questions | 分页安全题面及已答状态；未答答案永不出现，失效内容隐藏                                      |
| POST /me/learning-runs/{id}/answers  | idempotency_key、question_id、answer；服务器判定收据、进度及可选完成事实                    |
| GET /me/learning-tasks/{id}/runs     | 分页历史轮次/计数/完成或失效状态；只读结果复用 run/questions，不另造重复历史模型            |

建议状态码：401 无效会话；403 未绑手机或没有 student 资格；404 非本人/不存在；409 版本、请求键/首答冲突、已过期/失效/缺学习设置/可出题数不足；400 非法参数或空白/超长答案；422 不可解析/未知字段的 JSON。最终 ErrorCode 名称按项目现有错误规范落地，OpenAPI 明确可选/nullable、条件字段与 Problem Details，不扩大 PENDING 掩盖契约缺口。

Web `/student/practice` 从占位改为任务/今日进度入口，新增 `/student/tasks/new`、`/student/tasks/[id]`、`/student/practice/[run_id]`，结果和历史在同一任务/轮次链路中呈现。复用学生 RouteGuard＋requireOnboarding，不给纯教师视角使用 C2 做学生任务。未设置跳既有引导，不自动保存默认等级。

Query key 带 user_id/task/run；切号取消在途请求，响应迟到不能更新新用户页面。输入意图在发送前固定 key；未知结果先恢复 run/questions 的服务器事实，不能换 key 重答/重开。无需用本地状态拼进度。旧教师 TaskManager 继续明确未开放，不顺手启用教师入口。

## 7. 文件影响、迁移与发布

后端新 `src/learning_tasks/{mod,dto,question,repository,service,handler}.rs`、接入 lib/router 和 openapi；仅在必要时把词表授权/批量发布读取抽成内部复用 helper，不能复制整份词库解释器或扩大 Admin API 权限。迁移与 tests/learning_tasks_schema.rs、learning_tasks_handler.rs、learning_runs_handler.rs 加入原生 CI inventory（ops/ci_test_modules.py 中明确归组）。

前端新增 `packages/types/src/learning-tasks.ts`、`packages/api-client/src/learning-tasks.ts` 及严格 runtime roots；按真实调用整理未使用的 /tasks placeholder 和 PENDING，仅移除被本批替换者，ClassRoom 仍保留其原有范围。改动 feature/task、feature/practice 与上述学生路由，复用 wordlist 来源选择；不改 Admin 页面。

迁移 up 新建学习表/索引，不回填旧 PracticeRecord、定级 mock 或任何币奖励。down 仅在全部本批业务表无数据时逆序删除；存在学习/完成证据即拒绝，不能破坏性删除用户进度。先在独立空库验证 up/down，在带学习证据库验证 down 拒绝；保留此前 coins/签署数据。

| 版本组合             | 设计结论与实施时必须验证的行为                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 旧 Web/Admin＋新 API | 既有响应不变、新增独立 learning 路由；应兼容，实际严格 schema 复验后才算证据                                       |
| 新 Web＋旧 API       | 新学习路由 404；明确“功能尚未就绪”，不回退 mock。不能前端先开放                                                    |
| 新 Web＋新 API       | 创建→开始→首答→结果→刷新/换设备→历史真链通过                                                                       |
| 回退前端/后端        | 保留学习 schema/事实；实测旧二进制会因缺少新迁移拒绝启动。须保留新后端或另构建兼容回退版，禁止删除学习事实绕过门禁 |

选定发布顺序：后端 API/迁移先验收 → Web。Admin 无本批变更；是否随以后整仓发布由该次部署范围决定。此处是方案，不包含提交、PR、合并或部署授权。

## 8. COIN-12 接入边界

当前只产生学习完成事实，不写钱包、不填 coins_earned。未来奖励采用 completion_id 或用户/业务日等经确认的服务端业务键，不能把更换请求键、规则版本、新建短任务当可无限领奖凭据。

学习完成与奖励状态分开：未配置/钱包暂停等不得抹掉已完成学习事实，也不能标成“已领取”。若采用最后一题同事务结算，业务条件不发奖须记录原因，技术错误回滚完整操作；或使用有持久状态和事务保护的后续结算路径，不能提交后裸后台发币。具体选型等金额、每任务/每日汇总、重复学习、上限与注销保留规则确认后再定，不在本批预建 outbox/奖励规则表。

## 9. 验收

以下为本批验收入口，实际结果见第 10 节。测试数据库须为任务专用 Postgres/Redis：先核实实际监听端口，再显式设置 DATABASE_URL、TEST_REDIS_URL、REDIS_URL；SQLx tests 使用独立测试库，禁止在现有带账/签署的准备库做 down。Web 用生产构建＋next start，不用 next dev。

```bash
# 后端，cwd 为本任务 tsz-rust worktree，使用已核实的隔离连接环境
SQLX_OFFLINE=true cargo test --locked --all-features --lib learning_tasks::question
cargo test --locked --all-features --test learning_tasks_schema
cargo test --locked --all-features --test learning_tasks_handler
cargo test --locked --all-features --test learning_runs_handler
python3 ops/ci_test_modules.py list
cargo fmt --all -- --check
cargo sqlx prepare -- --all-targets --all-features
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
cargo clippy --locked --all-targets --all-features -- -D warnings
# 前端，cwd 为本任务 tsz-learning-task-foundation
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/.codex/worktrees/learning-task-foundation/tsz-rust/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/task src/features/practice
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @tsz/web build
```

期望所有选定断言通过且新 targets 均被 CI 分类，OpenAPI 无悬空 query refs、runtime 哈希一致。若紧接获授权 ship，由原生 hooks 承接重复检查，不绕过钩子。

- question：真实 V3 general/dedicated、多 base、各 CEFR/中文模式/地区、上下文排除、去重、题面不含答案、normalize 版本及错误拼写判错。题量不足/0/超上限不能伪造题目。
- schema/handler：学生/手机号/设置门禁、私密越权、未知字段拒绝、同键异载荷、跨题/跨 run 伪造；首答并发唯一；全错可完成、缺一题不完成；最后一题事务故障整体回滚。
- run：显式 at 输入只在纯时间函数或受控测试 fixture 使用，生产不暴露改服务器时间；覆盖 03:59:59/04:00、任务结束、等待锁跨截止、原开始/答案请求跨日重放、长期跨日恢复及后继唯一；依赖归档/撤回抢锁顺序、恢复后重开、早先已答题失效时最后题不能完成；普通词表重命名/追加不误失效，来源删除后旧收据仍可读取且隐藏内容。
- lifecycle：停用/安全版本失效/注销到期在锁后拒绝，物理删号清学习明细但不动 coins/签署；个人历史内容受现时权限约束，统计不伪造归零。
- 浏览器：隔离学生 A/B，选择真实已发布 fixture→创建每日/长期→中断恢复→有对有错及全错完成→查结果/历史→切号隔离→来源失效/重开；375px 无溢出；期间 coins 操作数/余额保持不变。受控 SQL fixture 只能证明投影/时间规则，不能冒充完整词库编辑 UI 验收。

## 10. LT-01～LT-04 实施与验收记录（2026-10-07）

- 实现验收使用第 1 节任务 worktree/分支，基线分别为 `b1bb101565a0d566917b3b48aac8753a63c215b4` / `5b2c993a4a68eef5f51cd279b2cb80eed4c47599`。下列实现验收对应 **基线 SHA＋工作区差异**；交付提交的精确 SHA 与独立审查结果见配套 PR。尚未合并或部署。
- LT-01：`src/learning_tasks/question.rs` 复用真实 V3、`allowed_form_senses` 和同版本规范化；冻结中文题面/原形答案/出处/设置/规则。定义选择遵循现有 CEFR 和中文优先顺序，排除上下文、无适配中文、无原形及泄题内容。长定义和 Unicode 标点亦按同规则检测。
- LT-02：六张学习表、11 个本人 API 操作；首答唯一、每日唯一完成、活动轮次唯一、原键 hash、显式前驱、最后首答/完成同事务。账号按 UUID 锁定后再锁任务/轮次/词表/词条；成功收据独立探测，来源失权只裁剪内容。已检测失效的终态在拒绝重开时仍持久化。
- 新轮最多 5 个词表、1,000 个去重 entry、每日 1–200 题/长期最多 2,000 题；已有轮次只重新检查固定题目来源，词表追加无关 entry（包括追加后超过新轮上限）不会中断原轮。超大页码先拓宽整数再计算 OFFSET，不发生 u32 溢出。
- LT-03：`/student/practice`、`/student/tasks/new`、`/student/tasks/[id]`、`/student/practice/[run_id]` 接真实请求；创建预览、每日/长期、恢复、首答反馈、结果、分页历史、重命名/归档。账号 query key＋AbortSignal＋迟到响应身份核对；未知结果保留请求键和输入，确认首答已保存后清空下一题输入，未确认时禁止翻页。教师入口明确未开放。
- LT-04：OpenAPI 已导出，前端按显式后端路径同步；runtime SHA-256 为 `b8fea1b54faa0d73e63df9fbb9901733bcfa920d64bbd3fcb5ca93914cd83124`。新增业务日 `date` 严格校验；查询 enum 已注册，无悬空 refs；移除未用 `/tasks` 和相应 PENDING/旧 Task、PracticeRecord，保留 ClassRoom。新 targets 已加入 `ops/ci_test_modules.py`。

### 实际检查结果

| 检查                    | 结果与证据                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust `--lib`            | 327 通过；新增泄题/04:00/规范化定向复验通过                                                                                                                                                                                              |
| 学习 schema/handler/run | 最终 12 个数据库场景通过（schema 2、task 3、run 7）；涵盖唯一首答/完成、全错、未知字段/越权、跨日重放、来源删除/归档、失效重开、末尾插入延迟跨截止/作者注销、故障原子回滚、删号级联、大型追加和大页码                                    |
| 受影响词表回归          | `wordlists_handler` 5 通过；普通发布/私密备注等既有行为保持                                                                                                                                                                              |
| 迁移/SQLx/质量          | 空库 up/down/up 与有事实拒绝 down 通过；`cargo sqlx prepare -- --all-targets --all-features` 完成，`.sqlx` 无净差异（新查询使用运行时绑定）；fmt、clippy `-D warnings`、CI inventory 与 diff whitespace 检查通过                         |
| 前端契约/交互           | api-client 490 通过；学习 UI 最终 6 通过；包含原键重试、丢响应后服务器确认已答、切号 abort、0% 正确率完成、旧 API 404 不回退 mock                                                                                                        |
| 前端统一门              | 全仓 typecheck、lint、生产 build 通过；lint 只有两个既有警告。全仓普通测试首跑 3419 通过、2 项既有 Admin 用例 5 秒超时、2 跳过；保持原超时/断言单独复跑两文件后 119 通过、2 跳过。后续变更的学习 UI、Web typecheck/lint/build 已定向复验 |
| 真浏览器                | Chromium 无 API mock，生产 build＋next start → 同源代理 → 真实隔离 API。每日全错完成/刷新恢复、同日禁止再开、长期混合答题/主动后继、来源归档恢复、学生 A/B 隔离、同浏览器切号六条通过；375px 无横向溢出，截图人工查看通过                |

### 环境、兼容与交付边界

- 独立容器 `tsz-learning-task-pg`（127.0.0.1:55498，`learning_prepare` / `learning_compat_old`）与 `tsz-learning-task-redis`（127.0.0.1:6398）；服务端口 8398 / Web 3098，旧 API 对比临时 8399。真实 fixture 通过受控发布快照和真实注册/词表/学习 API 建立；不把它当后台词库编辑 UI 验收。
- 原始证据在 `/tmp/learning-task-runtime/{provenance.json,browser-result.json,compatibility.json,practice-mobile.png,task-desktop.png}`；脚本 `browser.cjs` 可复查链路。重复浏览器验收共留下 8 个 run、8 个首答、4 个 completion，coins 操作数始终为 0，最终钱包数和总余额也为 0。fixture 全部属于本任务独立数据库，无真实充值、投币或注销。
- 构建时发现其他聊天同时使用全局 Cargo target，出现错误库链接；已改为 `/tmp/learning-task-runtime/cargo-target` 独立构建并清除该副本本项目缓存后重验。受污染那次结果作废，最终证据均来自独立构建；未终止其他聊天的进程。
- 旧 Web/Admin＋新 API：既有 paths 和响应 schemas 均未改，只有 ErrorCode 增加学习专用值；既有消费者契约和回归通过。新 Web＋旧 API：旧验收二进制实测新路由 404，页面测试明确提示尚未就绪，无 mock fallback。因此仍为 **后端 → Web**；Admin 无功能改动。
- 回退实测：旧二进制对新 schema 启动报缺少 `20261007010000` 迁移并退出，不能直接靠保留表后替换旧二进制回退。已有学习事实时 down 会拒绝；保留当前后端、回退 Web，或另制兼容回退构建。没有降低迁移门禁。
- 本批不产生奖励、不调用 coins 写账；COIN-12 的金额、单位、上限和重复学习政策仍另批确认。

- 验收收尾已停止 API/Web/旧 API，删除本任务两个容器及其隔离 fixture 数据，清理独立 Cargo 缓存；保留脱敏证据、截图、脚本和验收二进制。复验需重建独立容器/fixture。未改动其他任务服务，未触碰测试站数据。
