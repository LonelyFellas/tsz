# C 端手机号注册接口对接设计

## 方案

在现有注册页上做最小收敛：手机 Tab 保持可用，邮箱 Tab 保留但禁用并展示“未开放”；复用登录页已有的验证码倒计时与错误交互。API client 将注册返回值直接声明为 `AuthResponse`，组件拿响应完成会话落地，不再链式登录。

邮箱入口仅用于向用户传达后续能力，不绑定状态、不渲染邮箱输入框，也不会产生邮箱请求。注册不继续采用“注册后再登录”，因为新接口已经创建 refresh 会话，重复登录会额外创建会话并增加失败分支。

## 文件影响

### `packages/api-client`

- `src/endpoints.ts`
  - `RegisterPayload` 改为必填 `phone/password/code`，移除 email。
  - 删除旧 `RegisterResponse`。
  - `OtpPurpose` 增加 `register`。
  - `auth.register` 改调 `/auth/register` 并返回 `AuthResponse`。
- `src/endpoints.test.ts`
  - 更新注册 method/path/body/返回契约测试。
  - 增加注册用途发码测试。
- `src/openapi.snapshot.json`
  - 从后端最新 OpenAPI 同步 `/auth/register`。
- `src/endpoints.contract.test.ts`
  - 新路径自动纳入正式契约校验，不进入 PENDING。

### `apps/web`

- `src/features/auth/components/RegisterForm.tsx`
  - 邮箱 Tab 改为禁用的“未开放”状态，不进入邮箱表单。
  - 新增 code、countdown、sending 状态和发码函数。
  - 提交 `phone/password/code`，直接消费 `AuthResponse`。
  - 保留 `persistSession`、`setUser`、`navigateAfterAuth`。
- `src/features/auth/components/RegisterForm.test.tsx`
  - 更新按钮状态、发码、倒计时、提交 payload、成功跳转和错误映射测试。
  - 删除邮箱注册和链式登录失败用例。

无需修改 `@tsz/types`：注册响应复用现有 `User` 和 `AuthResponse`。无需修改 `@tsz/shared`：`isPhone`、`isCode`、`isRegisterPassword` 已存在。

## Wire 契约

### 发注册验证码

```http
POST /api/v1/otp/send
Content-Type: application/json

{
  "phone": "13800138000",
  "purpose": "register"
}
```

成功为 202 空 body；429 表示频控；503 表示验证码基础设施不可用。

### 注册并建立会话

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "phone": "13800138000",
  "password": "ABC12345678",
  "code": "123456"
}
```

成功响应复用 `AuthResponse` 的 snake_case wire shape：`user`、`access_token`、`expires_in`、`refresh_token_expires_at`；refresh token 经 `Set-Cookie` 下发。

## 状态流

```text
手机号合法
  → sendCode(phone, "register")
  → 202 → countdown 60s
  → 输入 code + password
  → register({phone,password,code})
  → AuthResponse
  → persistSession + setUser
  → GET /auth/me
  → onboarding 或首页
```

发码与注册分别使用 `sending`、`loading`，互不混用。倒计时期间禁止重复发码；注册中禁止重复提交。

## 错误映射

- `invalid code` → 验证码无效或已过期。
- `user already exists` → 该手机号已注册，请直接登录。
- rate limit/429 → 操作频繁，请稍后重试。
- 其他错误沿用 `translateAuthError` 与中文兜底。

## 测试策略

- API client 单测：新路径、body、`skipAuth`、register purpose。
- API contract：实际调用路径必须存在于 OpenAPI 快照。
- RegisterForm 集成测试：字段和按钮状态、发码成功/失败、倒计时、成功会话、onboarding 分支、401/409/429、未知错误、显示密码、回车提交。
- 手工联调：真实后端 + Redis Mock sender，使用后端日志中的验证码走完整注册流程并检查 refresh cookie。
- 不新增 E2E：当前关键风险集中在接口契约和表单状态，组件集成测试覆盖更直接；真实短信供应商不在本次范围。

## 风险与回滚

- 后端已公开 `register` OTP purpose；若部署环境未同步最新后端，发码会返回 422。
- 前端不分支判断 200/201，但以 OpenAPI 声明的 201 作为接口契约。
- 回滚只需恢复旧 API client 与 RegisterForm；独立分支不会影响当前字典功能工作区。
