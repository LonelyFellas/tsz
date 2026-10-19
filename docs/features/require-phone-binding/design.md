# 实现设计

## 基线与依赖

前端复用本聊天隔离 checkout `/Users/darwish/.codex/worktrees/9aa0/tsz`，后端新建 `/Users/darwish/.codex/worktrees/require-phone-binding/tsz-rust`；均使用 `codex/require-phone-binding` 分支，基于 fetch 后 origin/main。

- 已有：邮箱/手机注册、密码登录、手机号 OTP 接口、双验证码绑定/换绑、注销、会话撤销。
- 可复用：AccountSecurity 的联系方式表单、统一用户 store 和认证恢复、GuestGuard、RouteGuard。
- 新增：共享必绑判断与安全回跳、绑定页、全局已登录未绑门禁、手机验证码登录 UI。
- 小改动：隐藏解绑手机号；后端业务 AuthUser 要求 phone，必要账号流程用 SessionUser。
- 上线阻塞：真实短信/邮件发送仍为 Mock。

## 数据与状态流

使用现有 user.phone 判定，不新增 wire 字段或数据库迁移。
后端统一校验 JWT、active 状态与 security_version；SessionUser 允许未绑手机，只用于读取本人资料、绑定/安全操作、注销。默认 AuthUser 额外要求 phone，保护学习配置、昵称/头像、教师业务等。
前端会话恢复不阻塞公开页 SSR；资料确定后，全局门禁阻止未绑手机用户挂载业务区域。认证表单由 GuestGuard 统一导航，受保护页 RouteGuard 使用同一共享规则。绑定页、注销、公开协议和认证页保留可达性。
绑定页复用双验证码表单，不提供取消绕过。邮箱注册码不复用为绑定码，保持验证码用途隔离。绑定后按原接口 204 + 撤销所有会话执行整页重新登录。
OTP 登录保留密码作为默认方式，添加“手机验证码登录”切换。发码冷却 60 秒、在途去重、严格手机号/六位码校验；资料加载失败仅重试资料，不能重复消费验证码；卸载后迟到结果不写会话。

## 契约与兼容

业务 AuthUser 无 phone 时返回 403 phone_binding_required；解绑手机号在发码和最终事务检查均返回 403，不能仅靠隐藏按钮。
OpenAPI 补充状态与语义，按后端 export_openapi → 前端 sync:openapi 原生流程同步。不改响应结构、数据库、.sqlx 缓存。
先前端后后端：新前端复用旧绑定/OTP API 可工作；过渡期旧后端仍不强制 API 限制。后端先发时旧前端可能遇到 403 且无自动补绑引导。回退前端会失去引导；回退后端会失去强制限制，无数据格式回退问题。部署不在本任务范围。

## 验收

- `pnpm test apps/web/src/features/auth packages/shared/src/auth packages/api-client/src/endpoints`：绑定导航、恢复会话、密码/OTP 登录、验证码错误/去重/资料重试、手机号不可解绑。
- `pnpm typecheck`、`pnpm lint`、`pnpm test`：跨包最终门。
- `pnpm build` + `pnpm --filter @tsz/web exec next start -p 3107`：生产构建与关键流程浏览器验证，禁止 next dev。
- 后端隔离数据库与 Redis 下 `SQLX_OFFLINE=true cargo test --locked --all-features --test auth_extract --test auth_me --test account_security_handler --test auth_login_otp_handler --test teacher_certification_handler`，按实际受影响业务补测试目标。
- `SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings`、`cargo fmt --check`。
- `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi` 后，显式 OPENAPI_SOURCE 同步并跑 api-client 测试。

## 本地验收结果（2026-10-06）

- 基线：前端 `78efe65`、后端 `035d1dd`，均加本任务工作区差异；未提交、推送或部署。
- 前端：typecheck、lint、Prettier、web/admin 生产构建通过。lint 仅保留既有 useLogout 整页跳转警告。
- 全仓普通测试首轮 3322 通过、25 失败、2 跳过：1 项是同步后需更新的 OpenAPI 指纹断言，已核对源文件 SHA-256 并更新；其余失败文件在 `--maxWorkers=2` 复验，仅余词形组件超时，该文件再以 `--maxWorkers=1` 单独复验 69 项全部通过。未修改超时阈值或弱化断言。
- 新增离页后迟到绑定响应保护，账号绑定定向复验 31 项通过；新测试文件已出现在 web 的原生测试发现清单中。
- 后端：104 项目标 handler/鉴权集成测试、26 项注销/登录/refresh 回归、323 项库测试全部通过；clippy（all-targets/all-features，拒绝 warning）与 fmt 通过。库测试首次漏传隔离连接产生环境失败，补齐 DATABASE_URL、TEST_REDIS_URL、REDIS_URL 后完整通过。
- Playwright：登录、注册/引导、账号安全共 47 项均通过。旧登录页断言误以子串匹配“手机验证码登录”，修正后登录文件 8 项复验通过。
- 真实链路：生产 Next `127.0.0.1:3107` → 本任务 API `127.0.0.1:8397` → 独立 PostgreSQL/Redis 容器。无 API 拦截；邮箱注册、补绑、硬刷新、直达业务页拦截、旧 token 401、手机号 OTP 登录同一账号、绑定后会话恢复全部通过。375px 无横向溢出，浏览器 pageerror 为 0。短信/邮件使用 Mock，因此不代表实际发送成功。
- OpenAPI 源 SHA-256：`39b62ad47851d7f29faf116bb5ef135c71bcbde5e4e65c806214869933a22a66`。两份前端生成物指向本任务后端，runtime bundle 指纹一致。
- 发布顺序依据主线新旧源码及契约核对；未验证线上已部署版本的混合组合。独立只读审查未发现可确认缺陷。
- 临时数据与进程归属本任务；收尾停止 API/Next 并移除 `tsz-phone-binding-pg`、`tsz-phone-binding-redis` 容器及其匿名卷，不影响其他工作树或共享服务。
