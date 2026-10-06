# WL-01 / WL-02 / COIN-11 验收记录

日期：2026-10-06。最小词表闭环及真实投币已实现并验收；完整阅读模式等增强继续留在 WL-03。本阶段未提交、推送、创建 PR、合并或部署。

## 输入与范围

- 后端：`/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，`codex/coins-b1a@9459b845b4f9059837b3f819c47d9cbeb66b299b` + 本批工作区差异。
- 前端：`/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，`codex/coins-b1a@6f51a89724cf92ba33cb0b8ab4db599eda1ece37` + 本批工作区差异。
- 原 B1/B2/B4 本地提交及用户已有方案、五张原型均保留。早期两个聊天交错写入已统一为本聊天单一写入者；现场备份在 `/tmp/wordlists-concurrent-write-snapshot/` 与 `/tmp/wl01-overlap-20261006/`。
- 数量规则已确认：用户输入正整数并核对作者和数量，无预置生产档位。不可用词条禁止投币，恢复后仍须重审。
- 不包含平台/Admin 作者、自定义词、完整/简洁模式、导入、音频、点赞/收藏、评论、总题量及每日任务。没有迁移 mock 数据或制造这些能力的假成功入口。

## 已实现与证据

| 行为               | 实现及验证                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 私密创建与个人管理 | 真实 UUID、不可变 user 作者、创建请求幂等、完整有序 ID 快照与分页内容；逐行 3 候选、增删排序、私密备注；私密保存无需引导或审核。并发同键创建、越权、刷新回读通过。                                     |
| 版本和备注         | 编排 revision 与 note_revision 分开；备注不改变审核状态。保存同时核对编辑基线，删除重加不能复用旧备注版本覆盖新内容；前端冻结本次编辑快照，不跟后台刷新推进提交版本。                                  |
| 安全词库读取       | 仅 active/current V3 发布稿，按允许字段映射，不返回后台 annotation、来源/音频/编辑器配置。新 publication 动态生效；归档与遗留 V2 返回 unavailable，不泄露旧词义，不拖垮整页。                          |
| 标准阅读           | 每 sense 先同级/最近较低 CEFR，再同级中文优先；不向上取。语法只来自选中 definition；安全 RichText reader 保留标记。教师当前视角 C2，学生真实设置，游客/未设置 C2 预览；不写学习设置。                  |
| 身份缓存           | 公共与个人 API、查询族分离；个人缓存带 user ID，切号清理。公有接口不会因作者身份返回私密内容。编辑和投币组件随身份重挂载。                                                                             |
| 人工审核与下架     | `wordlists.access/review/withdraw` 独立权限及依赖；待审快照只含名称/ID 编排，无备注。公开先撤回再改内容；旧请求/旧版本不能通过；审核与审计同事务。管理列表不发现尚未提交的私密草稿；作者能读下架原因。 |
| 生命周期与锁       | user → admin/权限 → wordlist → 有序 entry 共享锁；写入末尾复核到期。等待词表锁跨注销截止回滚；审核员等待期间撤权后拒绝。失效作者仍可驳回/下架；最终注销级联内容及审核记录，账本/签署/投币事实保留。    |
| 投币原子性         | 独立 event UUID 与请求 UUID 两层去重，一次 transfer + 业务事实 + 双边流水同事务。自投、余额不足、暂停钱包及非法数量拒绝。事实写入故障回滚双方余额；跨词表并发不死锁，下架与投币按同一行锁互斥。        |
| 归档后的投币资格   | 独立数据库归档 generation，在未归档→归档时递增；正常 publication/lifecycle 更新不影响投币。恢复仍不可投，重新审核后恢复；数据库 trigger 同样覆盖旧代码的归档写入。                                     |
| 未知投币结果       | 请求发送前按 user/list 保存原意图，刷新后先按 event 查本人收据，再决定是否原键重试。切号/卸载取消请求，迟到 404 不会向新身份发起 POST；HTTP 会话 generation 继续保护取 token/刷新窗口。                |
| 收支页面与历史     | 双方钱包显示实际余额/流水，专页显示投出与收到记录。下架或删除后原收据仍可核对；付款方看不到转私密后的词表新名称。数量全程 BIGINT 十进制字符串。                                                        |

## 自动验证

- WL 最小闭环全量后端回归：85 个集成 target 加单元/二进制测试，共 1201 项通过，1 项既有真实 OSS 测试忽略。后续仅对新增范围和修复定向复验，不重复不变部分。
- 共享 Cargo target 后来出现与源码不符的旧模块产物；未清共享缓存，改用 `/tmp/wordlists-runtime/cargo-target` 独立重建。最终独立目录下，词表/投币/coins schema/注销 gate 与 worker 共 22 项通过；补齐 V2、下架等待和备注 ABA 后的词表与 schema 定向 15 项通过；部署迁移相关 11 项通过。
- 后端 fmt、all-targets/all-features clippy（`-D warnings`）、SQLx prepare、diff 检查通过；`.sqlx` 无增量。CI inventory 为 86 targets，18 项 CI 检查通过。
- 前端最小闭环全仓普通测试：230 文件，3362 项通过、2 项既有跳过。随后新增投币及修复定向复验通过；当前 api-client 479 项通过，wordlist/coins/auth 相关回归通过，最终投币身份切换/卸载测试 4 项通过。
- 全仓 typecheck/lint 通过（保留既有 warning）；最后异步保护增量通过 Web typecheck/eslint。前端 CI 模块/工作流检查通过。Web 与 Admin 生产构建通过。
- 后端与前端只读审查发现的备注 ABA、作者下架原因、编辑基线刷新、提审旧键、重新选词备注版本、切号异步扣款问题均已修复并定向验证；最后增量审查无未解决 P0–P2。

## 真实浏览器与财务验收

全部使用实际隔离 API，没有注册 API route/mock；OTP 为项目本地 Mock sender，不代表真实短信/邮件送达。

- WL 六条流程：私密创建及刷新回读 → 他人/游客拒绝 → 管理员查看与通过（无备注） → 游客标准释义/关联语法 → published 私密备注编辑 → 平台下架、游客 404、作者原因可见。该阶段 coins 操作数未变。
- COIN-11 八条流程：输入 7 并确认作者 UUID → 付款方 100→93、作者 0→7 与双边流水 → 同请求重放不多扣 → 自投禁用 → 归档与恢复均禁投 → 重审后新事件投 3 → 收支记录及 375px 页面 → 下架保留原收据并隐藏付款方不可访问的词表名称。
- 最终成功批次为两笔 tip、合计 10，付款方余额 90、作者 10。全库钱包/流水差异与 tip 事实/转账主体金额差异均为 0。
- 浏览器脚本定位失败及身份保护修复前复验留下的隔离入账/投币事实保留，未删账、未直接改余额；它们与最终成功批次按 wordlist UUID 区分。fixture 用户全部通过正式注册接口建立，资金全部经正式人工入账 API 创建。
- 两条平台词条为明确标记的隔离 V3 publication fixture，通过 SQL 准备；归档/恢复也只修改这两条 fixture，验证真实读取和数据库归档 trigger。没有将此证据冒充完整管理员词库编辑/发布 UI 的验收，也没有访问共享/生产词库。
- 375px 标准详情与投币记录截图已目视检查，无横向溢出。

证据集中在 `/tmp/wordlists-runtime/`：`real-browser-result.json`、`coin-browser-result.json`、`financial-reconciliation.txt`、`fixtures.json`、`coin-fixtures*.json`、`wordlist-public-mobile.png`、`tips-mobile.png`、`final-provenance.json` 及各检查日志。最终后端 binary SHA、前端 BUILD_ID、两仓源码文件哈希已记录。

本批实际地址为 Rust `127.0.0.1:49349`、Web `:49350`、Admin `:49351`；Web 明确用 build + next start，Admin 用生产 dist 与显式 `/api/v1` 代理。Postgres/Redis 当时为回环 `:49490/:49491`，准备库 `coins_prepare`；sqlx tests 各自建库，同时显式设置 DATABASE_URL、TEST_REDIS_URL、REDIS_URL。

上述三个业务服务及两个专用容器均已停止，数据和证据保留。重启必须重新 docker port 核实，不照抄历史端口；不要在保留账本和签署的准备库执行破坏性 down。

## 迁移、契约和发布边界

- `20261006040000_wordlists` 新建内容/items/review；`20261006050000_wordlist_tips` 新增独立归档代次和不可变 tip 事实。迁移上下行在隔离库验证；有内容/审计/财务事实时相应 down 拒绝。
- 原生 OpenAPI 导出，前端显式 OPENAPI_SOURCE 指向任务后端。最终 SHA-256：`e0f746a10f2a0a49971ba24f694ed31c7dddef286e9723b8b4e34ddc98f97f81`；runtime bundle 哈希一致。
- 与后端 HEAD 的原 spec 比较：18 条新增 paths，既有 paths 无变化，既有 schemas 仅 ErrorCode 增加新错误。已实现词表端点从 PENDING 移除，旧假发布端点与 mock 数据删除。
- 首次发布应同时包含这两个迁移及后端，再发布 Web/Admin。本批基线代码没有真实词表模块，按首次同时引入两项迁移设计；生产状态未查询或改变，部署前仍须核实目标是否有词表历史数据。新前端遇旧 API 明确失败，不回落 mock。
- 若将 WL-02 单独部署后才引入 COIN-11，050000 对既有词表的保守回填不能区分历史普通发布和归档：有生命周期变化的记录会要求重审。此分拆发布需先补归档证据回填，不能直接视作已验证方案。本任务没有进行这种分拆发布。
- 已有金融证据后保留 schema；回退不能删除账本，也不能退回会宣称 mock 保存成功的页面。任何真实部署仍需另行授权及项目部署门禁。

## 定向复验入口

先启动本任务容器并核实端口；`run.py` 自动读取容器实际端口并使用独立 Cargo target。命令 cwd 为对应任务 worktree。

```bash
# 后端：隔离库，保留实际币账本的 coins_prepare 只执行 up。
python3 /tmp/wordlists-runtime/run.py cargo test --locked --all-features --test wordlists_handler --test wordlists_review --test wordlists_tips --test wordlists_schema --test coins_schema
python3 /tmp/wordlists-runtime/run.py cargo test --locked --all-features --lib deployment_migrations
python3 /tmp/wordlists-runtime/run.py cargo clippy --locked --all-targets --all-features -- -D warnings
# 前端
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/wordlist src/features/coins src/features/auth/shared.test.ts
pnpm --filter @tsz/admin test src/pages/WordLists.test.tsx
pnpm typecheck
pnpm lint
```

真实浏览器脚本需先按已验证来源重建并启动相应服务，每次使用新 batch；不能仅启动旧二进制就声称当前源码已验收。

## 本地交付（2026-10-06）

用户随后授权审查并本地提交两仓代码，未授权推送、PR、合并或部署。交付沿用上述工作区和已验收源码，实际提交 SHA 与精确提交审查结果以 Git 历史和交付回复为准。

本轮 fetch 的审查基线为后端 `a933c22ec9397cfb74c44669464b61e55ee3d26f`、前端 `6c72c88ef06a04a970464b1896afb626b70d877f`。两仓 main 新增了绑定手机号的业务鉴权；本次只固定原已验收任务版本，未合入这项新主线变更。后续推送/合并前须整合并复验鉴权、登录回跳及契约，不能把本地提交当作可直接部署版本。

精确提交审查增量：本地初始提交后发现并修复两项 P2。人工币服务现传递完整 AdminAuth，在取得排序主体锁后核对 security_version；管理查询沿用相同锁后检查。回归先复现改密期间等待的入账/冲正仍返回 200 并改变余额，再验证拒绝旧请求且余额/操作/审计不变。词表编辑按 entry ID 保留备注版本，修复 A→B→A 再改备注的假冲突；未读取的既有条目不再假定版本为 1。两项均按原路径定向验证，实际修复 SHA 与同一 reviewer 的增量复查结果见交付回复。

## 手机号主线整合与发布准备（2026-10-06）

本地任务分支已整合后端 `a933c22`、前端 `6c72c88`；这两份 main 的 API/Web/Admin 制品在 tshb-test 已逐件 verify，与 manifest 的 SHA、CI 来源及实际制品哈希一致。线上后端 CI 为 `37471166277`，前端 CI 为 `37470257999`，均成功；这些是现网手机号版本的 CI，不能冒充新候选的 CI。本任务尚未推送、创建 PR、合并 main 或部署。

- 本批不是单独词表页面发布，而是尚未上线的整套币账本、钱包、72 小时注销、人工入账/冲正、邀请归因、词表审核和投币。邀请奖励继续默认关闭，现网未配置启用开关或金额。
- 保留 main 的业务手机号门禁；注销 get/create/cancel 和旧 DELETE 升级拒绝走 SessionUser，不强迫邮箱用户绑定手机号才能注销。SessionUser/AuthUser 共用注销到期检查；me 的 learning_settings 形状不变。公开 API 继续允许游客；已登录未绑用户的页面门禁按 main 处理，不自行增加业务白名单。
- 8 处文本冲突已解决，生成契约由整合后后端原生导出；新的业务 403 说明已同步。后端全量回归覆盖 86 integration targets，共 1212 项通过、1 项既有 OSS 忽略；其中一个旧 schema fixture 因未绑手机按新规则返回 403，已改为明确已绑 fixture 并从该 target 续跑，未弱化门禁。新增精确迁移区间回退回归也通过（deployment_migrations 共 12 项）。
- 前端全仓 233 文件、3402 项通过、2 项既有 skip；typecheck/lint、api-client 契约、Web/Admin 生产构建和 CI 检查通过。
- 新隔离服务中，词表 6 流程、投币 8 流程及手机号组合 7 流程无 API mock 全部通过：邀请邮箱注册→绑定→旧 token 失效→短信登录→原路返回词表且不要求学习引导；未绑业务请求拒绝且组件不挂载；未绑邮箱申请注销、刷新、退出重登、从绑定页恢复 pending 并撤销。
- 只读数据库预检：现网 31 个 entry 均为 V3，active/current 非 V3 publication 为 0，wordlists/wordlist_tips 表尚不存在，最新迁移为 `20261002000000`。这只是本次准备快照，实际部署必须重查。六组新迁移的空数据整体 up/down 及新账目阻止回退已用隔离库证明；未在服务器执行迁移。
- 发布顺序为后端→Web→Admin；旧客户端注销入口会要求升级刷新，不能恢复即时删号旁路。新前端不能先发给旧 API，以免邀请字段被静默忽略。不得回退或删除已经存在的新签署/财务证据。

整合证据在 `/tmp/coins-release-integration/`；完整/定向测试日志部分复用 `/tmp/wordlists-runtime/phone-integration-*.log`。线上仅做 SSH、manifest/artifact verify、配置开关存在性和计数预检，没有服务器写入。候选需完成精确提交审查，随后才能按独立授权推送 PR、等待 CI、合并并部署。
