# 后台连接 OpenCode

入口：超级管理员进入“系统设置 → AI 账本”，点击“连接 OpenCode”，再前往官方页面完成登录授权。后台等待设备授权结果，完成后重新读取服务器连接状态；可取消登录、刷新失败结果、在失败或过期后重新连接。

## 范围与依赖

- 复用已有超管门禁、AI 账本页面、Ant Design 和后台请求客户端。普通管理员不能读取连接状态或发起、查询、取消登录。
- 新增 tsz-rust 到 OpenCode v2 的设备授权代理。真实核对版本为 v2.1.4，集成 ID 为 `opencode`、OAuth method ID 为 `device`；不使用 v1 的 provider OAuth 接口。
- OpenCode 保存账号凭证及后续刷新所需信息。前端与业务后端不接收 Console 密码、API Key 或 OAuth token。前端只接收授权链接、临时请求 ID、过期时间和连接状态。
- 本次只实现账号连接，不切换 tsz-agent 的 DeepSeek 适配器，不发起模型推理，也不宣称所有模型免费。`connected` 只表示 OpenCode 已保存连接，不证明额度、推理可用性或免费资格。
- 不修改数据库结构，无新增迁移。未配置或旧版后端时显示不可用状态，不影响账本自身的读取。

## 后端配置

为 OpenCode 使用独立服务账号与持久化数据目录，固定服务版本。用密码保护服务，监听 loopback；不同主机之间使用受保护的 HTTPS 地址。不要直接向浏览器暴露 OpenCode 服务。

tsz-rust 新增环境变量：

```dotenv
OPENCODE_SERVER_URL=http://127.0.0.1:4096
OPENCODE_SERVER_PASSWORD=<至少32字节的随机密码>
```

同一 `OPENCODE_SERVER_PASSWORD` 也传给实际运行的 `opencode serve --hostname 127.0.0.1 --port 4096`。两项均不配置时功能处于未配置状态，不影响原有服务启动；只配置一项或地址/密码格式错误会拒绝启动。已有 Console 连接和后续授权结果保存在该 OpenCode 实例的数据中，需保留持久化目录。

调用链：浏览器 → 同源 tsz-rust 超管 API → 私有 OpenCode 服务 → OpenCode Console。官方登录页面在新标签打开，用户自行完成登录授权。

| Method / Path                                      | 行为                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/v1/admin/opencode`                       | 返回 `configured`、`connected`、`login_available`                  |
| `POST /api/v1/admin/opencode/login`                | 发起设备授权，返回 `attempt_id`、`authorization_url`、`expires_at` |
| `GET /api/v1/admin/opencode/login/{attempt_id}`    | 返回 `pending/complete/failed/expired` 及过期时间                  |
| `DELETE /api/v1/admin/opencode/login/{attempt_id}` | 取消尚未完成的设备授权，返回 204；不撤销已保存的账号连接           |

各接口按当前数据库角色重新校验超管权限，成功响应禁止缓存。上游地址只来自服务配置，授权链接限定为 `https://opencode.ai/console/device`；上游异常、token、原始错误文本不透传。HTTP 重定向关闭，响应体限制为 64 KB。

## 验收

- 模拟验证：Rust handler 覆盖未登录、普通管理员、角色撤销、连接/登录/轮询/取消、上游错误、异常链接与敏感字段剥离；前端覆盖登录、完成后重读、取消失败保留入口、过期重试、未配置与刷新失败。API 客户端与生成 OpenAPI 的路径、wire 枚举及严格 runtime schema 对齐。
- 真实验证：独立本地 PostgreSQL/Redis、真实 tsz-rust、Vite 同源代理、隔离 OpenCode v2.1.4。在 Codex 内置浏览器以临时超管登录，发起授权并打开官方登录页面，验证 pending 与取消。没有使用业务数据库、真实个人账号或付费模型。
- 尚未验证：真实个人账号完成官方授权、OpenCode 重启后账号持久化及任何模型推理。完成授权后的 UI 更新由模拟测试覆盖，不能称为真实登录完成。
- 本地代码未提交、推送或部署。发布依赖：先配置持久化的 OpenCode v2 服务，再上线配套后端和前端。旧前端不受新接口影响；新前端访问旧后端时只显示连接状态不可用。

已通过的代码检查：Rust `cargo fmt --all -- --check`、离线 `cargo clippy --locked --all-features --all-targets -- -D warnings`、`admin_opencode_handler` 3 项测试、权限路由契约 2 项测试和 CI 分区清单测试；前端相关页面 7 项测试、API 客户端全部 641 项测试、受影响包类型检查、后台/API 客户端 Lint、Prettier、后台生产构建。OpenAPI 变化仅包含本次三个路径和四个 schema。

浏览器实测 1280px 与 390px 宽度，登录控件可见且无横向溢出。测试结束已取消授权、退出临时后台会话、停止本次服务，删除独立 PostgreSQL/Redis/OpenCode 的临时账号、会话、凭证与数据，并复查本次端口不再监听。

官方依据：[v2 授权 API](https://opencode.ai/v2/docs/api)、[模型与免费层说明](https://opencode.ai/v2/docs/console/models/)。
