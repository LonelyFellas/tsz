# C 端账号注销技术设计文档

## 方案概述

在现有 `DeleteAccountForm` 基础上按最新 tsz-rust OpenAPI 重构状态机：选择当前用户真实可用渠道，申请验证码并记录已申请状态，输入六位码后打开最终确认 dialog，确认后才执行 DELETE。错误统一按 `HttpError.code` 映射。成功路径调用鉴权 runtime 的集中清理能力，清 token/刷新任务和全部 store 会话字段，再以 `window.location.replace` 整页跳转登录页，规避受保护页守卫竞态。

项目没有现成 Dialog/Toast 导出，因此按钮与卡片复用 `@tsz/ui`，确认层使用组件内原生 `role="dialog"`/`aria-modal` 语义、焦点进入与 Escape/取消返回；错误和成功申请提示使用现有表单内联反馈范式，不新增第二套通知系统。

## 代码影响范围

- `packages/types/src/auth.ts`（或现有认证类型文件）：补充 `AccountDeletionChannel`、请求 wire 类型，保持 snake_case 1:1 契约。
- `packages/api-client/src/endpoints.ts`：端点改用类型化对象输入/空响应，确保不提交 target/purpose。
- `packages/api-client/src/openapi.snapshot.json`、`endpoints.contract.test.ts`：同步最新 tsz-rust OpenAPI，并将两个端点移出 PENDING。
- `packages/shared/src/auth/store.ts` / runtime：提供集中清除完整认证态的动作（若现有能力不足），并测试其行为。
- `apps/web/src/features/auth/components/DeleteAccountForm.tsx`：高风险流程、稳定错误码、并发防护、可访问确认层和窄屏布局。
- `apps/web/src/features/auth/components/DeleteAccountForm.test.tsx`：覆盖渠道、申请、确认、错误、重复提交与完整清理。
- `e2e/tests/support/mockApi.ts`、`e2e/tests/auth-flows.spec.ts`：202/204 真实状态语义、请求体断言和关键注销路径。
- 必要时更新 barrel exports；不修改 admin。

## 后端对接

权威依据：`/Users/darwish/Dev/tsz-core/tsz-rust/docs/openapi.json`（2026-08-13 当前 `origin/main` 工作副本）。

- `POST /api/v1/auth/account/deletion-code`：Bearer；body `{ "channel": "phone" | "email" }`；202 空响应。
- `DELETE /api/v1/auth/account`：Bearer；body `{ "channel": "phone" | "email", "code": "000000" }`；204 空响应，并由服务端清 refresh cookie。
- RFC 9457：按 `ProblemDetails.code` 处理 `invalid_account_deletion_code`、`invalid_token`、`account_deletion_channel_unavailable`、`otp_rate_limited`、`otp_unavailable`，以及 400/422/500 的通用反馈。
- 无后端对接缺口。

## 复用与约定

- wire 类型放 `@tsz/types`；请求放 `@tsz/api-client`；会话清理放 `@tsz/shared/auth`；web UI 复用 `@tsz/ui`。
- access token 仍只存在内存；清 token 时由 TokenManager 同步取消主动 refresh 定时器。
- 受保护页终止操作使用整页跳转，不用 Next 客户端路由。
- 不解析 RFC 9457 `detail` 做分支，只使用稳定 `code` 和 HTTP status 兜底。

## 数据流 / 时序

1. 从 `useUserStore.user` 派生可用渠道；无渠道则禁用流程。
2. 点击申请验证码：同步锁定按钮 → POST `{channel}` → 202 后展示已发送状态并开始倒计时；失败解锁并映射错误。
3. 渠道切换时清空验证码、申请状态、倒计时和旧错误，避免跨渠道复用验证码。
4. 输入六位数字并点击“继续注销”打开确认 dialog，不触发网络请求。
5. 最终确认同步锁定 → DELETE `{channel, code}`；失败关闭/保留适当状态供重试，成功不再恢复 loading。
6. 成功后集中清 token与 store 会话字段，随后 `window.location.replace("/login?deleted=success")`；RouteGuard 不参与中间态跳转。

## 测试策略与用例矩阵

| #   | 层   | 场景               | 输入/前置            | 预期                                               | 优先级 |
| --- | ---- | ------------------ | -------------------- | -------------------------------------------------- | ------ |
| 1   | 契约 | 两个注销端点       | 最新 OpenAPI         | method/path 均在 spec，退出 PENDING                | P0     |
| 2   | 单元 | API 请求体         | phone/email/code     | 只发送 channel/code，无 target/purpose             | P0     |
| 3   | 单元 | 完整清会话         | 已登录且已排 refresh | token/定时器/user/role/onboarded 清除              | P0     |
| 4   | 集成 | 单/双/无渠道       | 不同 User 联系方式   | 仅展示真实可用渠道，无渠道不可操作                 | P0     |
| 5   | 集成 | 申请验证码         | 点击/双击/202        | 单次 `{channel}` 请求、loading、成功态和倒计时正确 | P0     |
| 6   | 集成 | 渠道切换           | 已申请且已填码       | 清旧码/倒计时/提示，改用新渠道                     | P0     |
| 7   | 集成 | 最终确认           | 合法六位码           | 先开 dialog；取消/Escape 不 DELETE；确认才 DELETE  | P0     |
| 8   | 集成 | 注销并发与失败恢复 | 延迟 Promise/拒绝    | 重复点击单请求；失败后可再次操作                   | P0     |
| 9   | 集成 | RFC 9457 错误      | 指定 code/status     | 稳定中文反馈；invalid_token 走会话失效             | P0     |
| 10  | 集成 | 注销成功           | DELETE 204           | 完整清状态并整页跳登录成功页                       | P0     |
| 11  | e2e  | C 端注销主流程     | authenticated mock   | 申请码→输入→确认→登录页且后续 `/me` 非认证         | P1     |
| 12  | 手测 | 真后端/窄屏/键盘   | tshb-test、375px     | 真实 202/204、无溢出、焦点/Escape/读屏语义可用     | 手测   |

## 风险与回滚

- 风险：DELETE 成功与本地清理之间若发生同步异常可能残留 UI；集中清理函数须无网络依赖且整页跳转作为最终隔离。
- 风险：401 同时承载验证码错误与 token 无效；必须按 `code` 区分，不能仅按 status 清会话。
- 风险：OpenAPI 快照整体同步可能带入同日其他后端契约变化；提交前检查生成 diff，仅保留权威快照的机械变化并跑全契约测试。
- 回滚：移除新确认状态机和集中清理调用即可恢复旧页面；API 端点保持向后兼容，不需后端回滚。

## 手测清单

- [ ] tshb-test 登录账号，手机/邮箱渠道分别申请验证码，Network 请求体无 target/purpose，响应为 202。
- [ ] 输入 `000000`，确认层取消不发 DELETE，再次确认成功收到 204 并跳登录页。
- [ ] 375px 宽度无横向滚动；Tab 顺序合理；打开 dialog 后焦点进入确认区，Escape 可取消。
- [ ] 频控、渠道不可用、验证码错误时文案正确且按钮恢复可用。
