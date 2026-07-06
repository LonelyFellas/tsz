# 后台「用户管理」重构（C 端用户 + 管理员管理） 技术设计文档

## 方案概述

在 admin 里新增两个 feature 模块，沿用后台既有的「薄页面 + `features/<name>/` 数据层（React Query
hooks 包 `api.*`）+ antd 表格/表单」范式（与 `features/dictionary` 一致）：

- **`features/users`**（C 端用户，只读）：搜索行 + 角色 tab + 分页表格，数据源 `GET /admin/users`。
- **`features/admins`**（后台管理员，完整 CRUD）：列表 + 新建弹窗 + 启禁用 + 重置密码，
  数据源 `/admin/admins*`，整页与侧栏入口按 `super_admin` 门控。

底层类型进 `@tsz/types`、请求进 `@tsz/api-client` 的 `createAdminEndpoints`（1:1 镜像 openapi 契约，
snake_case wire）。侧栏 `ConsoleSidebar` 的「用户管理」分组从两个 disabled 占位换成两个真实叶子，
其中「管理员管理」按 level 条件渲染。路由新增 `/admins`，`/users` 从空壳换成真实页面。

**交付策略**：管理员管理接真实接口；C 端用户管理**契约已就绪部分接真实、缺失部分前端 mock**——
mock 集中在 `features/users/mock.ts` 一个文件、由 `USE_MOCK_USERS` 开关切换，接口补齐后替换即可。
每个缺口在 `backend-todos.md` 与代码 `// TODO(backend): …` 双处留痕，交用户转达后端。

**为何不拆成两个页面（教师/学生）**：后端师生合一（`roles` 数组），拆页会重复且违背数据模型；
用一个页面 + 角色 tab（映射 `role` 查询参数）即可，贴合 `GET /admin/users?role=` 契约。

## 代码影响范围

### Admin 类型归属决定（评估结论）

**决定：把 admin wire 类型统一上提到 `@tsz/types`**，api-client / shared 改从 `@tsz/types` 引用。

- **现状**：`Admin` / `AdminLevel` / `AdminStatus` / `AdminProfile` / `AdminAuthResponse` 定义在
  `packages/api-client/src/admin.ts`；`@tsz/shared/auth`（`adminStore.ts` 引 `AdminLevel`/`AdminProfile`、
  `adminRuntime.ts` 引 `AdminAuthResponse`）**反向依赖 `@tsz/api-client` 取类型**——架构倒挂。
- **为何上提**：①CLAUDE.md 硬约定「类型 → `@tsz/types`（snake_case 1:1 镜像后端）」，而这些就是 openapi
  的 `Admin`/`AdminProfile`/`AdminAuthResponse` schema，是标准 wire 类型；②本次新增一批 admin wire 类型
  （`AdminUser` 等），新旧同处一个包才不精神分裂；③依赖卫生：`@tsz/types` 作为唯一叶子源，shared 与
  api-client 都镜像它，消除倒挂；④影响面小且机械（2 个 shared 文件 + api-client + index + 测试），
  typecheck 全兜。
- **迁移动作**：
  - `packages/types/src/admin.ts`（新增）：`AdminLevel` / `AdminStatus` / `AdminProfile` / `Admin` /
    `AdminAuthResponse`（从 api-client 平移，值不变）。
  - `packages/api-client/src/admin.ts`：删除这些定义，改 `import type ... from "@tsz/types"`；端点代码不变。
  - `packages/shared/src/auth/adminStore.ts`、`adminRuntime.ts`：import 源从 `@tsz/api-client` 换成 `@tsz/types`。

### `@tsz/types`（新增 / 迁入 wire 类型，snake_case 1:1 镜像 openapi）

- `packages/types/src/admin.ts`（新增，含上提的账号类型 + 新增账号操作类型）：
  - 迁入：`AdminLevel` / `AdminStatus` / `AdminProfile` / `Admin` / `AdminAuthResponse`（见上）。
  - 新增：`CreateAdminInput`（`{ phone; password; display_name; email?; level? }`，对齐 openapi
    `CreateAdminRequest`）、`AdminListQuery`（`{ level?; q?; page?; page_size? }`）、
    `AdminListResponse`（`{ items: Admin[]; page: PageMeta }`）、`AdminStatusInput`（`{ status }`）、
    `ResetPasswordResponse`（`{ temporary_password: string }`）。
- `packages/types/src/admin-user.ts`（新增，C 端用户后台视图）：
  - `AdminUser`：`{ id, phone?, email?, display_name, roles: Role[], status: "active"|"disabled", coin_balance?, created_at }`
    —— 严格照 openapi `AdminUser`（required: `id, display_name, roles, status, created_at`）。
  - `AdminUserListQuery`：`{ role?: "student"|"teacher"; q?: string; page?: number; page_size?: number }`。
  - `AdminUserListResponse`：`{ items: AdminUser[]; page: PageMeta }`。
  - **mock 扩展类型** `AdminUserView`（仅前端本地，非 wire）：`AdminUser & { avatar_url?; level?; updated_at? }`
    —— 页面渲染用，值来自真实契约 + mock 补齐；带注释标明这几字段待后端补进 `AdminUser`（TODO(backend)）。
- `packages/types/src/index.ts`：re-export 上述类型。
- `PageMeta`：`{ page; page_size; total }`——若 types 尚无则在 `admin.ts` 里新增（admin 列表通用）。

### `@tsz/api-client`（`createAdminEndpoints` 扩展）

`packages/api-client/src/admin.ts`：类型改从 `@tsz/types` 引用（见「Admin 类型归属决定」）；
在返回对象里新增两组端点（baseUrl 已是 `/api/v1/admin`）：

- `users`：
  - `list(query: AdminUserListQuery)` → `GET /users${qs(query)}` → `AdminUserListResponse`。
- `admins`：
  - `list(query: AdminListQuery)` → `GET /admins${qs(query)}` → `AdminListResponse`。
  - `create(input: CreateAdminInput)` → `POST /admins` → `Admin`（201）。
  - `setStatus(id, status)` → `PATCH /admins/${id}/status` （body `{ status }`）→ `Admin`。
  - `resetPassword(id)` → `POST /admins/${id}/reset-password` → `ResetPasswordResponse`。
- 复用现有 `qs()` helper。相应补 `packages/api-client/src/admin.test.ts` 端点单测
  - `endpoints.contract.test.ts`/openapi 快照可能需同步（`sync-openapi` 脚本）。
- **注意**：`users.list` 端点照契约实现（真实），但页面数据层可切到 mock（见「Mock 策略」）——
  端点函数本身不含 mock，mock 只在 admin app 的 feature 数据层。

### admin app（页面 / feature / 路由 / 侧栏）

- `apps/admin/src/features/users/`（新增）：
  - `api.ts`：`userKeys` + `useUserList(query)`（`useQuery` + `keepPreviousData`）。**数据源经 `usersDataSource`
    抽象**：`USE_MOCK_USERS` 开时走 `mock.ts`、关时走 `api.users.list`（见「Mock 策略」）。
  - `mock.ts`（新增，集中隔离、易删）：内存 mock 用户数据（含 `avatar_url`/`level`/`updated_at` 等契约外字段），
    实现列表分页、`q`/`role`/注册时间客户端过滤，以及 mock 的编辑/删除/启禁用本地行为。文件顶注 `// TODO(backend)`。
  - `listQuery.ts`：`UserFilterValues`（camelCase 本地 state：`nickname/phone/email/registeredDate?`）
    - `toUserListQuery(filters, role, page, pageSize)` 纯映射到 `AdminUserListQuery`（可单测）。
      注册时间当前**不下传后端**（契约无参数），由 mock 层客户端过滤 + TODO(backend)。
  - `UsersTable.tsx` / `UserFilters.tsx` / `UserDetailDrawer.tsx`：搜索行、角色 tab、完整表格（含 mock 列）、
    详情抽屉、行操作（编辑/删除/启禁用走 mock；天生币/等级/方言给「功能待接入」占位 + TODO）。
- `apps/admin/src/features/admins/`（新增）：
  - `api.ts`：`adminKeys` + `useAdminList(query)` + `useCreateAdmin` / `useSetAdminStatus` /
    `useResetAdminPassword`（mutation 成功后 `invalidateQueries(adminKeys.all)`）。
  - `AdminsTable.tsx` / `CreateAdminModal.tsx`（`Form` 校验对齐契约）/ `ResetPasswordResult.tsx`
    （弹窗一次性展示临时密码 + 复制按钮）。
  - 页面级 super_admin 守卫（见下）。
- `apps/admin/src/pages/Users.tsx`：从空壳改为渲染 `features/users` 的页面组件。
- `apps/admin/src/pages/Admins.tsx`（新增）：渲染 `features/admins` 页面组件，外层套 super_admin 守卫。
- `apps/admin/src/router.tsx`：新增 `{ path: "admins", lazy: () => import Admins }`；`/users` 保持。
- `apps/admin/src/features/console/ConsoleSidebar.tsx`：
  - 「用户管理」分组 children 改为 `[{ key: "/users", label: "用户管理" }, { key: "/admins", label: "管理员管理" }]`。
  - 「管理员管理」项**按 level 条件加入**：读 `useAuthStore(s => s.profile?.level)`，
    非 `super_admin` 时不渲染该叶子（`NAV` 由静态数组改为依赖 level 的 `useMemo` 构造）。
  - 同步更新 `ConsoleSidebar.test.tsx`。

### super_admin 门控实现

- **入口隐藏**：`ConsoleSidebar` 按 `profile.level === "super_admin"` 决定是否渲染「管理员管理」叶子。
- **页面守卫**：`Admins.tsx` 里做一层轻守卫——`profile.level !== "super_admin"` 时渲染「无权限」提示
  或 `<Navigate to="/" replace />`。**不改** `AdminRouteGuard`（它只管「是否登录」，level 门控按现有约定
  「由各页面自行按 super_admin 控制，不在门禁层处理」，见 `AdminRouteGuard.tsx` 注释）。

## 后端对接（含缺口 / 建议）

依据 `../tsz-go/docs/admin-frontend-integration.md`（§7 管理员账号、§9 用户管理 B 段）与
`../tsz-go/docs/openapi.yaml`（`Admin (accounts)` / `Admin (users)` 标签）。

### 已有、可直接对接的接口

| 用途           | 方法 & 路径                                    | 响应                                         | 就绪度                                                 |
| -------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| C 端用户列表   | `GET /admin/users?role=&q=&page=&page_size=`   | `AdminUserListResponse`                      | 契约冻结，后端**可能未实现**（§9 B 段：先按契约 mock） |
| 管理员列表     | `GET /admin/admins?level=&q=&page=&page_size=` | `AdminListResponse`                          | **已实现**                                             |
| 新建管理员     | `POST /admin/admins`                           | `Admin`(201)；`409 phone already registered` | **已实现**                                             |
| 启/禁用管理员  | `PATCH /admin/admins/{id}/status` `{ status }` | `Admin`；`409` 禁最后超管                    | **已实现**                                             |
| 重置管理员密码 | `POST /admin/admins/{id}/reset-password`       | `{ temporary_password }`；`403` 目标是超管   | **已实现**                                             |

- 鉴权：全部 admin token（`Authorization: Bearer` + `credentials: include`）；管理员接口要求 super_admin，
  普通 admin → `403 super admin required`。401 走后台 401 刷新重试拦截器（已有）。

### 对接缺口 / 后端建议（需用户转达后端）

产品原型的 C 端用户管理有若干能力，当前契约**未覆盖**，本次前端不做，列此供后端评估：

1. **`AdminUser` 缺字段**：原型表格要展示**头像 `avatar_url`、语言等级 `level`（A1/A2…，教师取其作为学生时
   的等级）、更新时间 `updated_at`**。建议后端在 `AdminUser` schema 补这三个字段（`User` 已有 `avatar_url`
   / `updated_at`；语言等级需确认数据来源）。
2. **注册时间筛选**：`GET /admin/users` 当前无时间参数。建议补 `registered_from` / `registered_to`
   （RFC3339，半开区间 `[from, to)`，与 `/admin/words` 的时间筛选一致）。接口补齐前，前端此筛选项先占位不下传。
3. **用户详情接口**：建议 `GET /admin/users/{id}` 返回单用户详情（本次前端仅用列表字段做只读展示兜底）。
4. **用户启禁用**：建议 `PATCH /admin/users/{id}/status` `{ status }`，语义同管理员启禁用。
5. **行操作（天生币 / 等级 / 方言管理、编辑、删除）**：各需独立接口（天生币走币模块、等级/方言待定），
   建议后端与产品对齐后单独立契约，前端另开需求承接。

> 以上缺口不阻塞本次「列表+筛选+查看 + 管理员完整 CRUD」的落地。

## Mock 策略与待办追踪

**原则**：mock 只为「让页面按原型呈现完整形态」，必须**集中、隔离、可一键切换、易删**，绝不散落进
真实端点或 UI 组件。

- **切换开关**：`features/users/api.ts` 里一个 `USE_MOCK_USERS` 常量（或 `env` 派生）。开=数据层调 `mock.ts`；
  关=调 `api.users.list`。UI 组件对二者无感（同一 `useUserList` 接口）。
- **mock 边界**（哪些走 mock）：
  1. 列表**契约外字段**（头像 `avatar_url`、语言等级 `level`、更新时间 `updated_at`）→ mock 填充。
  2. **注册时间筛选** → mock 客户端过滤（后端无参数）。
  3. **用户详情** → mock 详情（复用列表 + 补充字段）。
  4. **编辑 / 删除 / 启禁用（用户）** → mock 内存态本地生效（演示用）。
- **不 mock**（划走）：天生币 / 等级 / 方言管理——独立模块，仅渲染操作入口 + 点击「功能待接入」占位提示。
- **替换路径**：后端补齐后，把契约外字段并入真实 `AdminUser`、写操作换成真实 mutation，删 `mock.ts`、
  关 `USE_MOCK_USERS`。因隔离良好，替换只碰 `features/users/{api,mock}.ts`。

**待办追踪**：新建 `docs/features/admin-user-management/backend-todos.md`，逐条列出接口/字段缺口
（形状建议 + 影响的前端点），供用户转达后端；代码里对应位置加 `// TODO(backend): 见 backend-todos.md #N`
锚点，接口就绪后可反查删除。

## 复用与约定

- **类型 → `@tsz/types`**（`AdminUser` 等，snake_case wire，1:1 镜像 openapi）；**请求 → `@tsz/api-client`**
  （`createAdminEndpoints` 扩展）；**逻辑 → 就地 feature 数据层**（React Query hooks，参照 `features/dictionary/api.ts`）。
- **鉴权**：复用 `@/lib/auth` 的 `api`（已绑定 `/api/v1/admin` baseUrl + admin token + 401 刷新）与
  `useAuthStore`（`profile.level`）；不新增鉴权逻辑、不碰 `@tsz/shared/auth` 内核。
- **UI**：admin → **antd v6**，禁止 tailwind / `@tsz/ui`。命中的 antd v6 约定：`Form` 校验、
  两字按钮插空格、jsdom 测试垫片、大表格测试避免 `getByRole`（用 `getByText`/`data-testid`）。
- **列表交互**：`keepPreviousData` 防翻页闪空；筛选值 camelCase 本地 state，映射为 snake_case wire query
  （与 `dictionary/listQuery.ts` 同构，纯函数便于单测）。

## 数据流 / 时序

**C 端用户列表**：

```
UserFilters(表单, camelCase) + 角色 tab + 分页
  → toUserListQuery() 映射为 AdminUserListQuery(snake_case)
  → useUserList(query) → api.users.list() → GET /admin/users
  → AdminUserListResponse → UsersTable 渲染 + PageMeta 驱动分页
点击行 → UserDetailDrawer(只读, 复用行数据)
```

**管理员管理**（super_admin）：

```
AdminsTable ← useAdminList() ← GET /admin/admins
新建: CreateAdminModal 提交 → useCreateAdmin → POST /admin/admins
     → 成功 invalidate adminKeys → 列表刷新; 409 → 表单报「手机号已被占用」
启禁用: useSetAdminStatus → PATCH /admins/{id}/status → invalidate; 409 → 提示「不能禁用最后一个超管」
重置密码: useResetAdminPassword → POST /admins/{id}/reset-password
     → ResetPasswordResult 弹窗展示 temporary_password + 复制; 403 → 提示「超管不在此重置」
```

## 测试策略（概览）

用例设计与落地在动工阶段交 **test skill**，方向如下：

- **`@tsz/api-client` 单测**（`admin.test.ts`）：新增 `users.list` / `admins.*` 端点的 URL、method、
  query 拼装、body 正确性（100% 门槛，packages 全覆盖）。
- **`listQuery` 纯函数单测**：`toUserListQuery` 的空值跳过、role 映射、分页参数（易覆盖、必测）。
- **feature 组件/hooks 测试**（admin 90% 门槛）：
  - `UsersTable` / `UserFilters`：筛选 → query 变化、tab 切换、分页、只读详情打开。
  - `AdminsTable` / `CreateAdminModal`：新建成功刷新、409/403 错误提示、启禁用、重置密码弹窗与复制。
  - `ConsoleSidebar`：super_admin 见「管理员管理」、普通 admin 不见（补 `ConsoleSidebar.test.tsx`）。
  - `Admins.tsx` 页面守卫：普通 admin 被拦。
- **mock 数据层单测**（`features/users/mock.ts`）：分页、`q`/`role`/注册时间过滤、编辑/删除/启禁用本地行为
  ——有逻辑分支，必测（admin 90%）。
- **纯装配/薄页面**（`Users.tsx`/`Admins.tsx` 若仅转发）按约定加 coverage exclude + TODO；有逻辑分支必测。
- jsdom 需 `matchMedia`/`ResizeObserver` 垫片；大表格断言避免 `getByRole`。
- **手测/联调**：管理员接口已实现，走真实联调（超管测试账号见私有记忆）；C 端用户开 `USE_MOCK_USERS` 先用
  mock 验证 UI，后端就绪后切真实联调。
- e2e 由 CI 兜底，本次不新增强制 e2e。

## 风险与回滚

- **C 端接口未实现**：`GET /admin/users` 可能后端未落地——`USE_MOCK_USERS` 开关兜底，mock 保 UI 与状态流，
  接口就绪切真实；风险可控（不阻塞 UI）。**mock 与真实契约漂移**风险：mock 的契约外字段形状即我们向后端
  提的建议（`backend-todos.md`），后端按此对齐可最小化返工。
- **`Admin` 类型上提**：已决定迁 `@tsz/types`（见「Admin 类型归属决定」）。迁移触及 shared/auth 的 2 个文件 +
  api-client，均由 typecheck 兜；风险低，但需一次迁全避免半拉子。
- **侧栏 level 条件渲染**：把静态 `NAV` 改为依赖 `profile.level` 的构造，注意 `profile` 未就绪（恢复中）时
  的降级——恢复完成前不显示 super-admin 项即可，不影响普通导航。
- **回滚**：功能自成模块（新增 feature/页面/端点，仅侧栏与 `/users` 空壳是原地替换），出问题可单独回退
  本分支 PR，不影响词库/审核等既有模块。
