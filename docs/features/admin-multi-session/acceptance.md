# Admin 多端登录实施与验收

2026-10-07 完成实现及本地验证。本记录描述提交前的验收结果；后续提交以 Git 历史为准，未推送、合并或部署。

## 版本与实现

- 前端工作区：`/Users/darwish/.codex/worktrees/68ba/tsz`，分支 `codex/admin-multi-session-assessment`，基线 `5b2c993a4a68eef5f51cd279b2cb80eed4c47599` 加本任务工作区差异。
- 后端工作区：`/Users/darwish/.codex/worktrees/admin-multi-session/tsz-rust`，分支 `codex/admin-multi-session`，基线 `b1bb101565a0d566917b3b48aac8753a63c215b4` 加本任务工作区差异。
- 后端签发独立会话，保留账号行锁、active 状态及安全版本检查；全部退出和禁用同事务撤销访问与刷新凭证；重新启用不会复活旧登录。
- 前端全部退出仅成功后清态，失败提示并可原地重试；普通退出保持原有行为。
- 无新增端点、wire 字段或数据库迁移。`.sqlx` 仅本次相关 3 删 1 增，OpenAPI 仅 4 个端点的行为描述变化。

## 自动验证

| 检查                                                                                  | 实际结果                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 前端新增失败回归                                                                      | 旧实现失败，修复后 AdminHeader 11/11 通过              |
| `pnpm typecheck`                                                                      | 7 个项目成功                                           |
| `pnpm exec vitest run --maxWorkers=4`                                                 | 235 文件，3409 通过、2 既有跳过，退出 0                |
| 契约同步后的 `pnpm --filter @tsz/api-client test`                                     | 17 文件、482 测试通过；源 SHA 常量随已验证的 spec 更新 |
| 修改的 TS/TSX 的 ESLint、修改文件的 Prettier                                          | 通过                                                   |
| 后端 8 组受影响集成测试                                                               | 94 条通过，退出 0                                      |
| `cargo fmt --all -- --check`                                                          | 通过                                                   |
| `SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings` | 通过                                                   |
| `cargo sqlx prepare -- --all-targets --all-features`、OpenAPI 导出                    | 成功，生成差异已审查                                   |
| 两仓 `git diff --check`                                                               | 通过                                                   |

后端目标为 `admin_accounts_reset_password_handler`、`admin_accounts_status_handler`、`admin_login_handler`、`admin_logout_all_handler`、`admin_refresh_handler`、`admin_session_repository`、`admin_session_reuse_detection`、`admin_session_service`。
覆盖真实登录后多 Cookie 独立轮换、单端退出、迟到全端退出不能撤销新登录、旁观账号不受影响、禁用后重启用、事务故障回滚，以及安全变更与登录/刷新之间的真实数据库锁等待。

独立审查发现并修复了 `access 401 → refresh 403` 的禁用衔接问题：已撤销刷新凭证提前返回 401，前端得以清态；未撤销的 rotated 凭证仍进入重放检测。新增 HTTP 回归实际先报 403 失败，修复后通过。最终独立审查无未解决的可确认缺陷。

## 契约来源与兼容

前端生成器显式读取本任务后端 `docs/openapi.json`，SHA256 为 `f859eb102aa638f835669a6de150656341268a06fd565ff89b475c4b638b1c80`。
比较新旧 OpenAPI 去除 `description` 后完全一致；前端两份快照去除来源元数据后完全一致。已核实 `_source`、`_source_sha256` 与契约测试常量相符。
旧前端可消费新后端响应；新前端也可消费旧后端响应，但旧后端仍会在新登录时挤掉其他端。建议先发前端失败反馈、再发后端；必须确认认证流量已全部切到新后端才宣告功能上线。

## 真实浏览器验收

前端为本工作区 Vite，`http://127.0.0.1:3017`；同源 API 代理指向本任务后端 `http://127.0.0.1:8397/api/v1`。
后端从本工作区构建后立即复制固定制品，避免共享 Cargo target 被其他任务重建覆盖；制品 SHA256：`aa5d28dcda2f74d09231f635b12dfa5801f99e260c16a09187d4e5f8d041284c`。
运行时读取任务独立 PostgreSQL `127.0.0.1:55507/admin_multi_session_browser`、Redis `127.0.0.1:6407/1`，未连接已有 8383/3001 服务。
API 与数据库为真实链路，前端业务 mock 关闭；验证码发送沿用后端既有开发 Mock sender。仅“失败反馈”用例主动中断一次 logout-all 网络请求，其余认证请求均进入真实服务。
为验证自动续期，隔离进程将 Admin access TTL 临时设为 1 分钟，刷新绝对期限保持默认；纯 HTTP 本地测试使用 `COOKIE_SECURE=false`，未修改任何部署配置。

下列流程均通过，浏览器脚本退出 0：

1. 三个独立浏览器 context 登录同一普通管理员，电脑和平板尺寸页面均正常恢复；第三次登录不挤掉前两端。
2. 两端实际等到自动刷新令牌后，受保护接口仍返回成功。
3. 同浏览器新增标签页可恢复登录；当前浏览器退出后该标签重新加载进入登录页，独立平板 context 仍能恢复和访问。
4. 注入一次全部退出网络失败：弹窗明确提示未确认完成，当前登录保留；点击原弹窗重试后成功退出。
5. 全部退出后，其他端旧 access 请求与 refresh 请求均返回 401，刷新页面进入登录；旁观管理员仍在线。
6. 自助改密、超级管理员重置密码，均使两端旧 access/refresh 失效。
7. 禁用时两端旧 access/refresh 已失效；重新启用后仍失效，旁观管理员保持正常。

初轮浏览器脚本因菜单按钮的图标计入可访问名称而精确匹配超时，页面实际正常；修正测试定位后完整重跑通过，未为此修改产品代码。

## 验证边界与清理

- 浏览器引擎为 Chromium；平板使用 1024×1366 与触控模拟，未进行 iPad Safari 实机验收。
- 多标签页只验证基本恢复和退出；没有宣称解决已有的跨标签页同时刷新竞争。
- 普通退出不新增按单会话即时撤销 access 的机制，其他端页面也不接收实时踢下线推送；按既定需求在下次请求/刷新时体现失效。
- 本任务本地服务、专用 PostgreSQL/Redis 容器与其中测试账号在验收后清理；不停止其他任务的服务。临时凭据与复制制品删除，保留脱敏测试日志及本记录。
- 验收阶段没有执行提交、推送、PR、合并或部署；后续已获本地提交授权。
