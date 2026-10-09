# 可靠性补齐：实施与验收记录

日期：2026-10-09。三批实现及本地验收已完成。本记录描述实施验收；后续交付状态以当前提交和 PR 为准。

## 工作区与范围

- 前端基线：`57a20345841a03729bb3fc500f2230c7145a4839`。
- 后端基线：`960ab72b1d3832179bf428b829cfaa7b43c706f5`。
- 两仓任务分支：`codex/reliability-safety-implementation`。
- 评估聊天原 worktree 和未提交方案保持原样；本次复制方案到独立实现 worktree。
- 没有新增业务 API、wire 字段、数据库迁移或恢复平台。权限政策、验证码、72 小时注销等待期及期间撤销不变；最终删除仍不可逆。

## 实施结果

### 安全日志

后端 `safe_log` 统一服务和维护入口的 subscriber、panic hook、安全错误类别及退出路径。只允许应用拥有的日志 target，环境 DEBUG 不能打开依赖原文。HTTP 记录生成的请求 ID、固定方法类别、匹配路由模板、状态和耗时；未知路由与方法使用固定值。移除错误链、对象 key、未知权限原值、输入文件路径等日志字段；关闭应用连接 SQL 日志。

五个清理 worker 的异常退出会留下固定 `worker_stopped` 事件。panic 不打印 payload/backtrace。前端页面错误边界使用固定说明。正常运维报告继续保留。

### 截止时间与结果未知

| 边界                                   | 实际预算                                               |
| -------------------------------------- | ------------------------------------------------------ |
| 普通前端逻辑请求                       | 30 秒，覆盖 headers、body、refresh 等待和一次 401 重发 |
| refresh                                | 独立共享 10 秒，单个等待者取消不取消共享刷新           |
| 音频、语音、头像、认证材料及 Blob 上传 | 前端 90 秒；头像直传取 90 秒与签名期限较小值           |
| 普通 HTTP                              | 20 秒；readiness 4 秒                                  |
| 语音、音频、头像、认证材料 HTTP        | 60 秒                                                  |
| PostgreSQL                             | 获取连接沿用 5 秒；应用连接 SQL 10 秒、锁 3 秒         |
| Redis                                  | pool wait/create/recycle 各 3 秒，命令响应 3 秒        |
| 存储                                   | 每次完整操作 30 秒；copy 的读写共享预算                |

迁移和维护连接不套用业务 SQL 截止时间；runtime pool 的 startup options 保证 `SET LOCAL lock_timeout=DEFAULT` 不取消应用预算。SQL 超时映射既有 503，HTTP panic 映射既有 500。

refresh 超时、传输失败、畸形成功响应以及 5xx 均视为轮换结果未确认：保留尚有效 access token，释放共享锁，暂停 Cookie 重放；按 realm 在 sessionStorage 保存无凭据标记，跨页面刷新仍暂停，明确登录后清除。401 保留原失效处理；429 等明确拒绝仍沿用有限退避。保留 generation 隔离。sessionStorage 被禁用时只能提供当前运行实例内的暂停保护。

发布、回退、创建、投币及注销复用已有幂等键、原载荷与状态回读；补齐 V3 对 `RequestTimeoutError` 的分类和结果未知文案。不会因新超时类型自动重发扣币或发布。

语音 provider 沿用原有有界配置（默认 15 秒，可配置更长）。较长自定义 provider 预算可能超过 HTTP 60 秒；现有脱离 handler 的任务仍可能完成，客户端必须按结果未知处理，而非宣称取消生成/上传。

### 恢复验证

复用主线发布回退、归档恢复、币账冲正、审计事务、注销等待期和存储回收。新增人工冲正审计故障后同键恢复断言；新增真实 SQL/锁超时及事务回滚验证。

新增后端 `ops/backup_restore_drill.py`：仅接受显式合成测试源、测试数据库、已缓存不可变镜像；只恢复到新建 `--network none` + tmpfs 目标，拒绝已有目标，清理只针对本次创建的容器 ID。目录 0700，dump/report 0600；子进程原始 stderr 不外泄。恢复与应用共用 `src/coins/reconciliation.sql`，记录版本、迁移集合、hash、schema、表摘要和账本不变量。它是本地演练工具，不替代已有服务器备份手册。

## 已执行验证

- 前端请求、二进制、token 与 refresh 集成基线：218 项通过。增补覆盖 headers/body/blob/error body 停滞、401 总预算、取消隔离、refresh 迟到、跨实例暂停、5xx 不重放、头像无 `AbortSignal.timeout` 场景。
- 前端普通全量运行：243 文件，3,485 通过、9 失败、2 个既有 skipped。2 个失败是旧的 offline 自动恢复预期；7 个是重表单用例在并行负载下超过 5 秒。更新正确预期后，以 `--maxWorkers=2` 定向重跑所有失败文件，全部通过，未提高超时、删除断言或跳过用例。
- 随后受影响请求/鉴权/V3/头像补充测试通过；最新 V3 发布和历史 75 项通过、头像/统一创建/token 101 项通过。测试计数有重叠，不将其相加包装成独立测试数量。
- 前端 `pnpm typecheck`、`pnpm lint` 通过；lint 存在既有 hook/导航警告，以及本次依照鉴权约定保留整页重新登录的 Next 导航建议警告。
- admin 生产构建通过。Next 默认 Turbopack 两次因本机内部端口 `Operation not permitted` 失败（包括提权重试）；改用 `pnpm --filter @tsz/web build --webpack` 成功，浏览器用该生产产物 `next start` 验收，未使用 next dev。
- 后端隔离环境 `cargo test --locked --lib`：331 项通过；新增存储 read/put/delete 挂起测试通过（30.01 秒），最新实际日志子进程测试通过。最初未设置隔离连接/不允许本机网络的失败已保留，未算作通过。
- 后端选定集成首批 59 项全部通过：权限、币账、投币、注销申请/worker/截止时间门禁、语音故障、可靠性边界。后续人工冲正、health、音频回收、V3 生命周期 39 项通过；跨词条/句子发布晚期故障 1 项通过。存在重复目标，非累计独立数。
- 后端 `cargo fmt --check`、`cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。首次 all-features 因 Swagger 构建下载受沙箱代理限制失败，允许依赖网络后通过。新增 Rust 集成 target 已登记 CI 分区，inventory 单测 8 项通过。
- Python：部署 manifest 8 项、preflight 4 项、演练工具 3 项通过。

### 实际日志、混合版本和浏览器

1. 子进程捕获 stdout/stderr，覆盖 AppError、依赖 target、panic、worker panic 和 HTTP 请求中的敏感哨兵；`RUST_LOG=trace` 与 `RUST_BACKTRACE=full` 下无泄漏，保留固定诊断事件。
2. 实际 HTTP 未匹配路径、Cookie 和伪造 request ID 注入哨兵，日志无原值；服务仍生成自己的请求 ID。实际维护入口失败 stderr 无哨兵。
3. 从基线导出的原请求层 → 新后端、当前请求层 → 基线编译的旧后端，两组合均解析真实 401 Problem Details。
4. 原请求层 → 新后端：持有审计表锁使人工发币返回真实 503；释放后同一 key/payload 成功，重复确认返回同一 operation，只有一次入账。
5. 最终 Next 生产实例通过真实同源代理创建合成账号并登录；登录清除未知刷新标记，进入既有绑定手机号流程。
6. 独立 Playwright 浏览器中，refresh 响应挂起 10 秒显示重新登录；503 和断网分别触发暂停，整页刷新不产生第二次 refresh。关闭拦截后真实登录恢复成功。故障拦截仅用于此浏览器，未将其冒充真实后端故障。

### 真实备份恢复

最终演练使用本机固定镜像 ID `sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb`（PostgreSQL/pg_dump/pg_restore 16.14），与测试源相同；不冒用手册服务器的 PostgreSQL 18 镜像审核结论。

- 最终成功演练用时 **19.454 秒**，核对 **101 张表、100 项迁移**，schema/hash 一致；钱包、逐笔余额、operation 形状差异均为 0，总余额 = 净发行量 = 100（合成币）。
- 备份 SHA-256、工具 hash、版本和完成时间见 `restore-evidence.json`。
- 已有目标：拒绝且保留原目标；截断备份：明确失败并删除本次目标；SIGINT 中断：记录失败并删除本次目标。三种故障串行执行后源库摘要不变。
- 首轮故障源库摘要受并行 SQLx 管理元数据写入干扰，未宣称通过；停止数据库测试后完整串行复验通过。

复跑入口（需自行准备仅含合成数据的测试源和同版本已缓存镜像）：

```bash
python3 ops/backup_restore_drill.py \
  --synthetic-test-source \
  --source-container tsz-reliability-<task>-pg \
  --database reliability_test \
  --image sha256:<cached-image-id> \
  --output /private/tmp/<new-private-output-dir>
```

可用 `--backup <prior-test-dump>` 验证已有测试备份，`--target tsz-restore-drill-<name>` 验证已有目标拒绝。工具不接受真实服务器 DSN，不执行覆盖恢复。

## 限制与清理

- 外部 OSS 生命周期、供应商真实网络、反向代理和采集平台未进行线上验证；本次覆盖应用边界、受控依赖故障和本地恢复，不声称生产 RPO/RTO。
- 实施验收未操作线上环境；后续交付走两仓任务分支 PR。原评估 worktree 文件保持未提交状态。
- 测试只使用任务专用 PostgreSQL/Redis、loopback 服务和合成账号/币账。结束后清理任务服务与测试容器，保留代码和脱敏验收证据。
