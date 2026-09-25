# C 端注册登录设计

## 数据与接口

复用 `users` 的 phone/email 至少一个非空约束、手机号唯一索引和 `lower(email)` 部分唯一索引，无新增迁移。跨仓需求只在前端此目录维护，后端对应 `codex/account-permissions-batch-2`。

`POST /api/v1/auth/register` 接受 `{ phone, password, code }` 或 `{ email, password, code }`，恰好一种联系方式；错误返回 400，重复账号返回 409 并使用对应的 phone/email 字段。成功仍为 201 与原 `LoginResponse`，HttpOnly cookie 下发 refresh token。

处理顺序：

1. 用 `Phone::parse`／`Email::parse` 归一化并校验联系方式。
2. 校验注册密码为 11–20 位 ASCII 字母数字且二者都有，转大写。
3. OTP 验证使用归一化标识及固定 Register 用途。
4. hash 后开启事务，通过 `register_verified_in` 创建账号和 student 角色。
5. 同事务写 refresh session，提交后返回响应及 cookie。失败回滚全部 DB 写入；验证码已消费时须重新获取。

`/otp/send` 和 `/auth/login-otp` 复用现有协议及限流存储。Mock sender 暂时保留，真实 provider 不在本次范围。前端请求类型 `RegisterPayload` 位于 `@tsz/types`，以互斥联合限制 phone/email，API client 不增加字段转换层。

## 密码兼容

新注册沿用现有 web 产品规则；不全局改 `Password::parse`，避免把 admin、改密和存量服务路径纳入本次改造。

登录前端不再提前丢失输入大小写，传原串；后端 user 域先比较原串，失败且存在小写 ASCII 字符时比较大写版本。未知账号用同样流程对 dummy hash 验证，仍返回相同凭据错误；账号状态只在密码正确后暴露。

这兼容已有两类凭据：历史 API 原串哈希和 web 大写哈希。历史混合大小写原串仍按原串匹配，不迁移哈希或假定能从 hash 恢复密码；新注册大写哈希支持大小写变体。额外 bcrypt 只出现在原串未匹配且有大小写变化时。

## 前端状态与入口

- `RegisterForm` 共用 phone/email 状态机；归一化后的同一 identifier 用于发码和提交。
- `/register?method=email` 由服务端注册页传初始方式，保留无 JS 的 SSR 表单；不新增海外路由。
- 登录失败的注册按钮按当前登录方式／账号格式选择邮箱入口，不携带联系方式；保持 redirect，最终由原有 safe redirect／GuestGuard 处理。
- 注册／登录成功先 persistSession，再 completeAuthentication；资料失败时锁定认证参数，仅重试 me。
- 验证码表单限定六位；切换联系方式清旧码和 UI 冷却，真实限流仍由服务端负责。
- 重复账号提示当前渠道并提供登录入口；登录凭据错误不强行区分未注册和密码错误。

## 验证命令

前端根目录：

```sh
pnpm typecheck
pnpm lint
pnpm test:cov
WEB_E2E_PORT=3017 CI=1 pnpm --filter @tsz/e2e exec playwright test --workers=2
```

后端任务工作树（测试指向本地 PostgreSQL，SQLx 创建隔离测试库；Redis 使用测试前缀）：

```sh
cargo fmt --check
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
SQLX_OFFLINE=true cargo test --locked --all-targets --all-features --no-fail-fast
```

预期：所有非既有忽略测试通过；浏览器证明 email-only 注册、资料失败重试、重复邮箱、手机和邮箱登录及安全回跳。真实 API 测试不等于真实短信／邮件送达；后者明确暂缓。测试资源参数与实际结果写入六批记录。

## 契约与发布回退

后端源码生成 OpenAPI 后，以该任务工作树的绝对 `OPENAPI_SOURCE` 同步前端；生成文件不手工改。前端精简快照未收录注册 DTO 时，不把元数据变化误当作请求校验已覆盖，注册集成测试直接断言真实 handler。

发布须后端先行：旧 web 注册提交本来就符合 11–20 位字母数字并转大写，旧 web 的手机号注册／登录仍适配新后端；新 web 邮箱注册和原串登录需要新后端。直接 API 客户端使用旧的 8–10 位或符号注册密码会被新规则拒绝，这是已批准的注册规则收口，不声称所有旧注册请求都兼容。

回退先退前端，再退后端；先退后端会令新邮箱注册失败，并可能令新前端的小写输入无法匹配大写哈希。已有邮箱账号不删除，无 schema 回滚；邮箱账号本身已受旧后端登录模型支持。没有自动部署或真实数据变更授权。
