# 后端对接待办清单 —— 后台「用户管理」（C 端用户）

> 本清单列出后台「用户管理」页所需、但当前 `openapi.yaml` 契约**尚未覆盖**的接口/字段。
> 前端已按下列**建议形状**先行 mock（`apps/admin/src/features/users/mock.ts`），页面按产品原型完整呈现；
> 后端按此对齐后，前端切 `USE_MOCK_USERS=false` 即接真实接口。字段一律 snake_case wire。
>
> 管理员管理（`/admin/admins*`）接口已实现，不在此清单——那部分直接接真实接口。

---

## #1 `AdminUser` 补展示字段（头像 / 语言等级 / 更新时间）

产品原型的用户表要展示头像、等级（A1/A2…）、更新时间，当前 `AdminUser` schema 都没有。

- **建议**：`AdminUser` 增加
  - `avatar_url: string`（同 `User.avatar_url`，未设置为 `""`）
  - `level: string`（语言等级，如 `A1`/`B2`；若是教师，取其作为学生时的等级——需产品确认取值口径）
  - `updated_at: string`（RFC3339，同 `User.updated_at`）
- **影响前端**：`AdminUserView` 里这三个字段现由 mock 填充；补齐后并入 `AdminUser`，删除 mock 填充。
- 代码锚点：`features/users/mock.ts`、`packages/types/src/admin-user.ts`（`AdminUserView` 注释）。

## #2 `GET /admin/users` 补注册时间筛选参数

产品原型有「注册时间」筛选，当前列表接口只有 `role` / `q` / `page` / `page_size`。

- **建议**：新增查询参数 `registered_from` / `registered_to`（RFC3339，半开区间 `[from, to)`，
  与 `GET /admin/words` 的时间筛选一致）。
- **影响前端**：`listQuery.toUserListQuery` 现不下传时间、由 mock 客户端过滤；补齐后改为下传参数。
- 代码锚点：`features/users/listQuery.ts`、`features/users/mock.ts`。

## #3 用户详情接口 `GET /admin/users/{id}`

点击用户行需要详情。当前无详情接口，前端只读抽屉复用列表字段 + mock 补充。

- **建议**：`GET /admin/users/{id}` → 返回单个 `AdminUser`（后续可扩展学习记录/订单等，待产品定）。
- **影响前端**：`UserDetailDrawer` 现用行数据 + mock；补齐后改真实请求。
- 代码锚点：`features/users/UserDetailDrawer.tsx`、`features/users/mock.ts`。

## #4 用户启用 / 禁用 `PATCH /admin/users/{id}/status`

原型有对用户的启禁用诉求；当前无接口，前端 mock 本地生效。

- **建议**：`PATCH /admin/users/{id}/status`，body `{ "status": "active" | "disabled" }` → 返回更新后的
  `AdminUser`，语义同管理员启禁用（`PATCH /admin/admins/{id}/status`）。
- **影响前端**：用户行「启用/禁用」现 mock；补齐后换真实 mutation。
- 代码锚点：`features/users/mock.ts`、`features/users/UsersTable.tsx`。

## #5 用户编辑 / 删除接口

原型行操作含「编辑」「删除」，当前均无接口，前端 mock 本地生效（演示用）。

- **建议**（待产品明确可编辑字段）：
  - `PATCH /admin/users/{id}`：编辑可管理字段（如昵称等，范围待定）。
  - `DELETE /admin/users/{id}`：删除/注销用户（软删语义待定）。
- **影响前端**：用户行「编辑」「删除」现 mock；补齐后换真实 mutation。
- 代码锚点：`features/users/mock.ts`、`features/users/UsersTable.tsx`。

## #6 天生币 / 等级 / 方言管理（独立模块，非本次）

原型行操作含「天生币管理」「等级管理」「方言管理」。这三者是**独立功能模块**（天生币在侧栏另有分组），
不在本次「用户管理」范围内，前端仅渲染入口 + 点击「功能待接入」占位。

- **建议**：各自单独立契约与需求（天生币走币模块；等级/方言待产品与后端设计）。
- 代码锚点：`features/users/UsersTable.tsx`（占位操作项）。

## #7 管理员强制改密流程（契约已有，待联调确认后端**运行时**已实现）

> 与 #1–#6 不同：这条的 openapi 契约**已定义**，前端已接**真实调用**（非 mock）。列在此仅作
> 「契约有 ≠ 测试服后端一定已实现」的联调确认项 —— 与 `GET /admin/users`「契约冻结但后端可能未实现」同理。

超管重置某普通管理员密码后，对方须首次强制改密。前端已落地闭环：登录读 `AdminAuthResponse.must_change_password`
→ 弹不可关闭的强制改密弹窗 → `POST /admin/auth/change-password`（`{ current_password, new_password }` → 204）。

- **需后端确认已实现的两点**：
  - 登录响应返回 `must_change_password`（openapi 标 required）。**若缺失** → 前端视为 `false`、改密流程永不触发，
    被重置账号登录后其余 admin 接口全 403、控制台形同不可用。
  - `POST /admin/auth/change-password` 端点可用。**若未实现** → 改密请求 404，账号在前端无从恢复。
- **若后端尚未实现**：联调前补齐；在此之前可临时把「管理员管理」的**重置密码入口降级隐藏**
  （`AdminManagement` 行操作），避免造出无法登录使用的账号。
- 代码锚点：`features/auth/AdminLoginForm.tsx`、`features/auth/ForceChangePasswordModal.tsx`、
  `packages/api-client/src/admin.ts`（`auth.changePassword`）、`packages/types/src/admin.ts`（`must_change_password`）。

---

**联调切换**：以上 #1–#5 落地后，`apps/admin` 里把 `USE_MOCK_USERS` 关闭，替换对应 mock 调用为真实
`api.users.*`，并删除 `features/users/mock.ts` 中已被真实接口覆盖的部分。#7 无需切开关，联调时直接验证改密流程通路。
