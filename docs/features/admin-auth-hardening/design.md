# 后台登录加固对接 技术设计文档

> 需求见同目录 `requirements.md`。契约以 `../tsz-go/docs/openapi.yaml`（`Admin (auth)` / `Admin (accounts)`）
> 与 `../docs/admin-auth-hardening-frontend-integration.md` 为准。**本次纯前端对接，不碰后端。**

## 方案概述

三块缺口（A 登录 423、B 全局 403 强制改密拦截、C 独立改密页+自助入口）分层落地，核心是 **B**：

在 web/admin 共用的无状态请求层 `@tsz/api-client/http.ts` 里，新增一条「403 且业务 `code` 命中」的
**通用出口**——通过一个可选回调 `onForbidden(code)` 上抛给具体 realm，而不是把 admin 路由跳转硬编码进请求层
（请求层运行环境无关，不认识 React Router）。admin 侧在 `adminRuntime` 装配时注入该回调，回调内用
**`window.location` 整页跳转**到 `/change-password`——与现有 `redirectToLogin` 同款范式，天然规避
RouteGuard/GuestGuard 竞态（命中既有硬约定「终止/跨态操作整页跳转」）。web 端不传回调，行为零变化。

为让请求层能读到 `code`，扩展 `HttpError` 携带可选 `code` 字段（`parseError` 顺带解析 `body.code`），
既服务 403 判定，也让上层错误处理未来可按 code 分支（当前 message 判定不变、向后兼容）。

改密页（C）做成独立路由 `/change-password`，一页同时服务两种场景（强制 / 自助），
现有登录内嵌的 `ForceChangePasswordModal` 逻辑收敛进该页复用的改密表单，登录成功且 `must_change_password`
时改为跳转到该页（而非弹窗），与 403 跳转殊途同归、只有一个改密落点。

备选：把 403 跳转做进 React Query 的全局 `QueryCache.onError`。不选——它只覆盖 Query/Mutation，
覆盖不到不经 Query 的裸 `api.*` 调用（如登录、登出），且请求层才是所有后台请求的唯一咽喉，语义更周正。

## 代码影响范围

### `@tsz/api-client`（packages/api-client）

- `src/http.ts`：
  - `HttpError` 增加可选 `code?: string`；`parseError` 解析 `body.code` 一并返回并挂到 `HttpError`。
  - `HttpClientOptions` 增加可选 `onForbidden?: (code: string | undefined) => void`。
  - `request()` 在 `!res.ok` 分支里，`res.status === 403` 时先触发 `onForbidden(code)` 再照常抛
    `HttpError`（回调只作副作用通知，不吞错——调用方仍能 catch 到 403 做局部处理）。
- 类型导出无新增（`code` 属现有 `HttpError` 扩展）。

### `@tsz/shared/auth`（packages/shared）

- `src/auth/adminRuntime.ts`：
  - `AdminAuthRuntimeOptions` 增加可选 `changePasswordPath?`（默认 `/change-password`）。
  - 装配 `createHttpClient` 时注入 `onForbidden`：当 `code === 'must_change_password'` 且当前不在改密页时，
    `window.location.href = changePasswordPath`（整页跳转，去重防抖：已在目标页则不跳，避免自循环）。
  - 该逻辑可抽成小函数 `handleForbidden(code)` 便于单测（注入 window/location 或以纯函数返回「是否跳转 + 目标」）。
- `src/auth/runtime.ts`（web）：**不传** `onForbidden`，保持原样（仅确认零改动）。
- `packages/shared` 覆盖率门槛 100% —— 新增分支必须补测。

### `apps/admin`（目标 app）

- `src/router.tsx`：新增 `/change-password` 路由（顶层，**不进 (console) 分组**——它必须在「待改密」态可达，
  不能被 console 门禁或全局 403 再次拦截；自身改密请求属可达端点不会 403）。route.lazy 动态 import。
- `src/pages/ChangePassword.tsx`（新增页面壳）：承载改密表单，读取「是否强制场景」。
- `src/features/auth/ChangePasswordForm.tsx`（新增，或由 `ForceChangePasswordModal` 重构而来）：
  改密表单核心——current_password + new_password + confirm，密码策略本地校验，提交调
  `api.auth.changePassword`，处理 204/401/400。两场景差异（强制场景 current 预填临时密码/文案不同、
  成功后去向不同）以 props 参数化。
- `src/features/auth/AdminLoginForm.tsx`：登录返回 `must_change_password` 时，由「弹 `ForceChangePasswordModal`」
  改为 `persistSession` 后 `navigate('/change-password', { state: { forced: true, ... } })`；移除内嵌弹窗分支。
- `src/features/auth/ForceChangePasswordModal.tsx`：逻辑并入 `ChangePasswordForm` 后**删除**（连同其 test）。
- `src/features/auth/AdminLoginForm.tsx` 的 `LOGIN_ERRORS` / 提交流程：
  - 新增 **423** 分支：捕获 `HttpError.status===423` → 文案「账号已锁定，请 15 分钟后再试」+ 置灰登录按钮
    （见「423 交互」）。423 不带 code，按 status 判。
- `src/features/auth/AdminHeader.tsx`：加「修改密码」按钮 → `navigate('/change-password')`（自助场景）。
- `src/lib/auth.ts`：`createAdminAuthRuntime` 已封装，通常无需改；若 `changePasswordPath` 非默认在此传入。
- `apps/admin/src/**` 覆盖率门槛 90%（业务逻辑层）——新增表单/分支补测；纯装配按约定 exclude+TODO。

### 类型与数据（`@tsz/types`）

- **无 wire 变更**。`AdminAuthResponse.must_change_password`、`AdminChangePasswordInput`、
  `ResetPasswordResponse` 均已在 `packages/types/src/admin.ts` 就位并 1:1 镜像 openapi。
  403 的 `{ error, code }` 形状由 `HttpError` 承接，非独立 wire 类型。

## 后端对接（依据对接文档，接口均 ✅ 已上线）

- `POST /admin/auth/login` → 200 含 `must_change_password`；失败 401（凭证）/ 403（停用）/ **423（锁定）** / 429（IP 限流）。
- `POST /admin/auth/change-password`（Bearer）→ 204 成功 / 401 当前密码错 / 400 新密码不合规或同旧。**must_change 期间可达。**
- `POST /admin/admins/{id}/reset-password`（超管）→ 200 `temporary_password`（已对接，不动）。
- 全局网关守卫：待改密期访问受限端点 → `403 { error, code:"must_change_password" }`。**改密/登出/全端登出豁免。**

**对接缺口 / 后端建议**：

- 423 响应**未携带锁定剩余秒数**。前端只能固定/一次性置灰（见风险）。若后端愿在 423 body 或
  `Retry-After` 头给出剩余秒数，前端可做精确倒计时——**列为可选优化建议，由用户转达后端，本次不依赖**。
- 现有契约足够本次落地，无阻塞性缺口。

## 复用与约定

- 逻辑复用：请求层回调机制沿用现有 `onSessionExpired` 范式（`@tsz/api-client`）；整页跳转沿用
  `redirectToLogin` 的 `window.location` 范式（`@tsz/shared/auth`）。命中硬约定
  [[project_terminal_action_hard_nav]]（跨态跳转整页导航防守卫竞态）。
- 类型 → `@tsz/types`（已就位，无新增）；请求 → `@tsz/api-client`；鉴权逻辑下沉 `@tsz/shared/auth`，
  admin `lib/auth` 保持薄壳（命中 [[project_shared_auth_kernel]]）。
- UI → admin 用 antd v6（Modal/Form/Input.Password/Button/Alert；注意 v6 `Alert` 的 `message`→`title`、
  两字按钮插空格、`Form.Item` rules 校验）。禁引 tailwind / `@tsz/ui`。
- 密码策略本地校验与 `CreateAdminModal` 现有规则保持一致（≥12、非纯数字），文案以后端 400 为准。

## 数据流 / 时序

**场景 2（刷新后重新发现，关键链路）**：

```
刷新 → useAdminSessionRestore 用 admin refresh cookie 静默恢复 → 进 (console) 壳
  → 首个后台请求(如列表/profile) 命中网关守卫 → 403 {code:"must_change_password"}
  → http.request 触发 onForbidden("must_change_password")
  → adminRuntime.handleForbidden: 非改密页 → window.location.href="/change-password"
  → 改密页(顶层路由,不被 console 门禁/403 再拦) 加载
  → 用户填 current(临时密码)+new → POST change-password
      ├ 204 → 标记清除,全局403解除 → 跳回 / 正常进控制台
      ├ 401 → 当前密码错 → 停留重填
      └ 400 → 新密码不合规 → 展示后端文案 → 停留重填
```

**场景 3（登录 423）**：

```
提交登录 → 423 → catch HttpError.status===423
  → setError("账号已锁定，请 15 分钟后再试") + 按钮置灰(见下)
```

**423 交互**：以后端 423 为唯一事实来源，前端**不本地计数**。置灰策略（开放问题 3）——
推荐：显示锁定文案 + 登录按钮置灰，直到用户**修改了账号或密码输入**才恢复可点（避免徒劳重试同一凭证），
文案提示「请 15 分钟后再试」。不做本地倒计时（后端未给剩余秒数，固定 15min 倒计时可能与实际解锁不符、
反而误导）。若后端后续提供剩余秒数再升级为精确倒计时。

## 测试策略（概览）

分层，具体用例矩阵与代码在动工阶段交 test skill 落地：

- **单元（packages，100%）**：
  - `http.ts`：403 触发 `onForbidden(code)` 且仍抛 `HttpError`；`parseError` 解析 `code`；
    非 403 不触发；`onForbidden` 缺省（web 路径）不报错。
  - `adminRuntime`：`handleForbidden` 仅 `code==='must_change_password'` 跳转、已在改密页不跳（防自循环）、
    其它 code 不跳。
- **组件（admin，90%）**：
  - `ChangePasswordForm`：204 成功去向（强制/自助两分支）、401 当前密码错、400 后端文案、
    新密码本地校验（≥12/非纯数字/两次一致/不同当前）。
  - `AdminLoginForm`：423 锁定文案 + 按钮置灰与恢复；must_change 登录→跳改密页（不再弹窗）；
    401/403 既有分支回归。
  - `AdminHeader`：「修改密码」入口跳转。
- **回归**：web 端登录/刷新/登出不受共用层改动影响（现有 `runtime.test` / `http.test` 应保持绿）。
- **e2e / 手测（CI + 联调）**：真实测试服走「超管重置 A → A 临时密码登录被强制改密 → 刷新中途重新发现 →
  改密成功进控制台」全链路；连续失败触发 423。测试账号见 [[reference_admin_test_account]]。
- 纯装配文件（page 壳、router）按约定 coverage exclude + TODO。

## 风险与回滚

- **共用层回归风险**：改 `http.ts`（web+admin 共用）。缓解：`onForbidden` 可选、web 不传即原行为；
  403 仍照抛 `HttpError` 不改变既有 catch 语义；补齐 http 单测。
- **自循环风险**：改密页自身或登出请求若被 403 拦截会无限跳转。缓解：改密页为顶层路由；`handleForbidden`
  「已在目标页不跳」去重；且后端对 change-password/logout 豁免 403。测试覆盖「已在改密页不跳」。
- **刷新后闪现**：场景 2 里 console 壳会短暂渲染再整页跳转。可接受（整页跳转干净利落）；
  若体验不佳，后续可在会话恢复后探一次轻量端点前置判断——**本次不做**，列为后续优化。
- **423 置灰体验**：无剩余秒数，置灰策略是折中（见上）。风险低，纯提示层。
- **回滚**：三块相互解耦，可分别回退。B 回退只需移除 `onForbidden` 注入（http 层改动向后兼容、
  不移除也无副作用）。改密页/登录改动为 admin 局部，回退不影响 web。
