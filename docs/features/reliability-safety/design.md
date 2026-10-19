# 异常、日志与恢复保障：技术方案

状态：已实施；固定预算、执行结果和环境限制见 [verification.md](verification.md)。需求见 [requirements.md](requirements.md)。

## 依赖与实施顺序

按跨模块、需要前后端配套验证的重档记录，文档集中在前端仓库；后端不重复维护。

关键路径：固定主线与隔离环境 → 定义超时/结果未知语义 → 前端请求与后端依赖边界 → 日志收口 → 复用业务恢复测试与隔离恢复演练 → 一次完整质量门。

复用项不重新估算。剩余预计 2–3 个工程工作日，包含环境准备、实现和故障验证，不含外部环境等待及部署；此估计是计划值。若确认需要改业务协议或扩大数据恢复范围，重新估算。

## 1. 异常必须有结束时间，也必须说明结果是否确定

### 前端

- 在 `packages/api-client/src` 增加一个小型请求截止时间工具，由 `http.ts` 和 `packages/shared/src/auth/tokenManager.ts` 复用，不分别实现定时器。
- 工具负责合并调用方取消、超时取消，保留截止时间直至响应体读取完成，在 finally 清理计时器与监听。不要在收到响应头时过早结束超时保护。
- 增加本地 `RequestTimeoutError`；不伪造 HTTP 状态，不加入 wire 类型。可带请求方法及安全的响应 `x-request-id`，不携带 URL/query、请求体、凭据或任意响应正文。
- 普通逻辑调用建议 30 秒总预算；refresh 建议 10 秒；现有上传/音频长操作可显式选择 90 秒。数值为初始候选，实施时按代表性慢路径验证后固定，不为未来场景引入配置框架。
- 同一逻辑请求的 401→refresh→最多一次重发共享原始截止时间。不要给每次重试重置 30 秒。refresh 有独立共享预算，单个等待者取消不能中止全局 refresh。
- 定时器必须覆盖挂起的 refresh 等待，保留现有 generation 防串号检查；注销/切号仍取消旧会话请求。
- 超时与主动取消分开反馈；普通读请求可以有限重试，但写请求不因新超时类型获得自动重试。现有取消行为、空响应与二进制下载均需回归。

### refresh 的特殊边界

现有服务端 refresh 会旋转 Cookie。旧 token 在短宽限期内也不会拿到同一成功响应，宽限期外重放还会撤销会话。因此不能把超时加入现有 5/15/30 秒自动重试队列。

推荐保持 token 协议和权限规则不变：refresh 超时/传输中断/5xx 进入“刷新结果未确认”，释放共享锁并暂停自动重放；仍有效的 access token 不立刻清空，但后续刷新等待者快速返回该状态，不反复发送旧 Cookie。提示重新登录以重建会话；按 realm 在 sessionStorage 保留暂停标记，登录成功清除状态；不可用时退化为当前实例内保护。明确的 401 沿用原退出逻辑。这牺牲极少数丢包场景的无感续期，避免新增敏感 token 重放缓存；服务端刷新协议改造不在本次范围。

### 写请求的结果确认

| 操作                                     | 已有机制                                                 | 本次工作                                                         |
| ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| 发布/回退/生命周期、词表创建、币账及投币 | 请求键、版本、部分界面持久化意图                         | 测试超时能进入原有不确定状态，重试保留键与 payload               |
| 权限调整                                 | `PermissionChangeDialog` 在网络异常、5xx、409 后只读回查 | 复用，不增加权限变更接口或自动反向调整                           |
| 注销申请/撤销                            | 主线请求幂等与状态回读                                   | 保留 72 小时行为，测试响应丢失与到期竞争                         |
| 永久删除/普通编辑                        | 各自版本或状态查询                                       | 超时先刷新事实，禁止提示确定失败后盲目再提交；只修查证存在的缺口 |

### 后端

- 在 `src/lib.rs` 的 HTTP 边界增加截止时间和 panic 的受控响应；使用已有 `503 service_unavailable`、`500 internal_error` 与固定安全 detail，保留请求 ID，不新增 ErrorCode。
- 依赖先到期，HTTP 后到期，浏览器最后到期。普通候选预算：DB 锁 3 秒、单条 SQL 10 秒、Redis 连接/池等待/命令各 3 秒、普通 HTTP 20 秒；长操作候选 HTTP 60 秒、客户端 90 秒。readiness 采用独立短预算。所有数值必须与已有语音/存储预算校准。
- PostgreSQL 保留已有 5 秒获取连接上限，增加应用连接的 statement/lock timeout；不改变数据库全局配置，不给迁移 CLI 套业务查询预算。超时映射为稳定服务暂不可用，事务未提交部分回滚；提交确认丢失仍属于结果未知。
- Redis 不能只限制取连接，还须限制命令响应；保持 OTP、权限与会话失败时不放行的现有语义。
- OSS 的读取、上传、删除和补偿各有明确预算；语音已有供应商超时直接复用。不能仅中止 HTTP handler 而放任后台任务无限等待。
- `speech/preview`、`audio_assets` 已有脱离 handler 的任务用于善后，不删除这些机制。给其依赖操作加预算，保留最终缓存、补偿和持久重试；客户端超时不宣称对象上传或付费合成已取消。
- panic hook 与受控 500 一起验收：HTTP 捕获不等于默认 hook 不会先打印 payload；后台任务另行捕获 JoinError/监测退出，不能默默停止关键清理 worker。

## 2. 日志采用允许字段，而非任意字符串正则抹敏

新增小型安全日志模块，集中初始化与错误分类；允许固定事件、请求 ID、路由模板、状态、错误类别、受校验 SQLSTATE、操作类型、必要资源 UUID、代码位置。禁止任意 Display/Debug 错误链、SQL 原文/参数、对象 key、payload、连接串和签名 URL。未知来源只记 unknown。

落点：`src/error.rs`、`src/lib.rs`、`src/main.rs`、`src/platform/db.rs`、词库快照清理、音频/试听清理与补偿。最新主线 `src/account_deletion/worker.rs` 也纳入核对，但其 AppError Display 已隐藏 internal source，不能把它误报为确认泄漏。

- AppError 不再记录 `%source`；Speech/Storage 已有安全类别直接复用，但 ObjectNotFound 的 key 不输出。
- HTTP path 改为已匹配路由模板；未匹配路径使用固定标记，避免 URL 路径中的用户输入进入日志。
- 启动入口显式记录固定 stage + 安全类别后非零退出，避免 `main -> anyhow::Result` 默认向 stderr 输出原始错误链。
- 安装不打印 payload 的 panic hook，保留固定事件、源文件和行号。异常消息不是可信日志字段。
- 明确 SQLx/第三方 tracing target 输出策略，禁用 SQL 原文，环境 DEBUG 不能重新打开敏感原文；扫描其他二进制入口，复用安全退出路径，保留正常导入报告格式。
- 前端错误边界展示安全说明和已有可用诊断 ID，不新增原始 error 对象上报，不引入外部监控平台。

收益是敏感信息不经过日志出口；代价是少了原始错误描述。排障依靠 request_id + 类别 + SQLSTATE + 位置关联。禁止把诊断 ID 或任意来源字段当作绕过白名单的载体。

应用内可验证范围为仓库在线服务、后台任务和运维程序输出；反向代理和外部采集系统须独立核验，不声称本次代码即可约束全部基础设施。

## 3. 恢复沿用各业务语义，补验证和工具

- 词条/例句：回退生成新的发布记录，不覆盖草稿；归档恢复复用原入口。验证跨对象失败的原子性和响应丢失后的幂等。
- 权限：调整与 before/after 审计在一个事务；成功后可查看审计并走原预览反向调整。本次不新增撤权/撤销能力，不改第一项权限功能。
- 币账：只复用已支持的人工发币全额一次冲正及其余额/状态限制；投币不因此增加退款，账本不删除。故障时核对余额、流水、业务事实和审计同时保持一致。
- 注销：等待期可撤销，到期后最终删除不可逆；永久删除确认已经存在，只修缺失或与结果不确定相矛盾的提示，不机械新增弹窗。
- 存储：复用正式音频持久回收任务、试听对象生命周期兜底；验证删除失败重试。OSS 实际生命周期规则若未核验，应单列待验而非宣称完成。
- 部署：复用 `ops/deployment_manifest.py restore`、`deploy-undo-migrations` 与已有拒绝危险回退逻辑，只做本地工具测试与隔离演练，不操作服务器。
- 数据备份：将 `docs/postgresql-backup-restore.md` 已有步骤整理为 `ops/backup_restore_drill.py`（拟新增）及对应测试。只支持从明确测试源备份、校验、恢复到新建隔离目标，拒绝覆盖现有库；失败保留可诊断证据，清理仅限本次创建资源。
- 工具使用现有审核镜像与安全凭据传递，不在参数、stdout/stderr、manifest 中写 DSN/密码；备份目录 0700、文件 0600。备份本身含业务数据，不把它当作脱敏日志对外展示。
- 演练证据记录版本、迁移集合、备份 hash、开始/完成时间、schema/行数/checksum 与币账不变量结果，不输出业务行。报告实测恢复时间，不臆定生产 RPO/RTO，也不创建自动备份任务。

## 4. 接口、迁移、兼容与本次改动回退

推荐版无数据库迁移，无新增业务端点，无响应字段/枚举新增。使用现有 503/500、Problem Details、x-request-id；如实施发现必须改 wire，须先更新本方案及契约验证。

旧前端 + 新后端应能解析既有错误形状；新前端 + 旧后端仍能自行超时和显示结果未确认。实施须实际验证两组合，不能用“无字段新增”代替测试。

建议先交付后端依赖预算与日志，再交付前端截止时间与恢复反馈，使服务端先于客户端结束慢路径。配套版本边界以实测为准；这里仅设计顺序，不执行部署。

无 schema 变化时可分别回退代码，但不能以回退此补丁为由把后端降至 coins/注销/权限前的旧版本。回退前端会失去超时保障；回退日志补丁会重新引入原文输出。业务数据恢复遵守现有迁移安全门。

## 5. 验收

以下为原设计验收清单；实际执行与补充用例见 verification.md。先安装锁文件依赖，按仓库 dev-env 准备隔离 PostgreSQL/Redis；显式指定测试连接与可写、独立的 CARGO_TARGET_DIR，不使用旧本地 main 的数据库 schema、不迁移共享库。新增 Rust 测试模块须登记实际 CI inventory。

```bash
# 前端仓库：现有文件补超时/取消/结果未知的有效断言
pnpm exec vitest run packages/api-client/src/http.test.ts packages/api-client/src/http.binary.test.ts packages/shared/src/auth/tokenManager.test.ts packages/shared/src/auth/refresh.integration.test.ts
pnpm exec vitest run apps/admin/src/features/permissions/PermissionChangeDialog.test.tsx apps/admin/src/features/sentences/SentencePublicationModal.test.tsx apps/admin/src/features/dictionary/useLifecycleSurfaceCommand.test.tsx apps/web/src/features/auth/components/DeleteAccountForm.test.tsx apps/web/src/features/wordlist/components/WordlistTips.test.tsx

# 后端新主线任务 worktree：纯测试；reliability 为拟新增的模块过滤名
SQLX_OFFLINE=true cargo test --locked --lib reliability
SQLX_OFFLINE=true cargo test --locked --lib error::tests
# 已准备隔离连接后运行，不把编译离线当作测试数据库隔离
SQLX_OFFLINE=true cargo test --locked --test admin_permissions_handler --test admin_coins_handler --test coins_ledger --test wordlists_tips --test account_deletion_handler --test account_deletion_worker --test speech_preview_faults
SQLX_OFFLINE=true cargo test --locked --test lexicon_handler batch4_mixed_late_failure_rolls_back_word_and_sentence
python3 -m unittest discover -s ops -p 'test_deployment_manifest.py'
python3 -m unittest discover -s ops -p 'test_deployment_preflight.py'
# 下列工具/测试为拟新增，实施后才存在
python3 -m unittest discover -s ops -p 'test_backup_restore_drill.py'
```

判据：超时覆盖 headers/body/refresh/依赖等待；挂起结束且计时器和共享锁释放；写请求未知结果不产生第二次副作用；审计故障、锁超时、panic 后未提交数据不残留。日志捕获使用唯一敏感哨兵，检查实际 stdout/stderr/HTTP，不只测试 Debug；panic 与启动失败用独立子进程，防止全局 hook 污染测试。

隔离恢复人工验收：准备仅含合成数据的测试源 → 记录业务和账本摘要 → 创建备份 → 新建无业务网络的目标 → 恢复并核对摘要与账本 → 再以截断备份验证明确失败 → 确认源库及已有目标未被改写。实施时提供该工具的精确参数与可复跑命令，不能只以 Python 单测代替恢复成功。

结束统一执行一次仓库完整质量门：前端 typecheck/lint/test 及涉及 UI 的生产构建；后端 fmt、all-targets/all-features clippy 与项目要求测试。浏览器按 build + next start 验证断网、慢响应和安全恢复，不用 next dev。仅文档评估无需安装依赖或运行这些实现测试。
