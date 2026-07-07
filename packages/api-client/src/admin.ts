// 平台后台（admin）专用端点。后台是与 web 学员/教师**完全独立**的身份体系：
// 独立登录 / 独立 token / 独立 refresh cookie（path=/api/v1/admin）。
// 这些端点要绑定到 baseUrl=/api/v1/admin 的 HttpClient 上，路径才会落到 /api/v1/admin/*。
import type {
  AdminListQuery,
  AdminListResponse,
  AdminRole,
  AdminUser,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserUpdateInput,
  AdminWordBatchDeleteResponse,
  AdminWordCreateInput,
  AdminWordEnvelope,
  AdminWordKind,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordSaveInput,
  AdminWordStats,
  AdminStatus,
  CreateAdminInput,
  CreateAdminResponse,
  CreateRoleRequest,
  Admin,
  AdminAuthResponse,
  AdminProfile,
  PermissionCatalogResponse,
  RelatedSearchResponse,
  ResetPasswordResponse,
  RoleListResponse,
  UpdateRoleRequest
} from "@tsz/types";
import type { RefreshResponse } from "./endpoints";
import type { HttpClient } from "./http";

// admin 账号体系的 wire 类型已收敛到 @tsz/types（wire 类型唯一家）。此处 re-export，
// 保持既有 `import { AdminProfile, ... } from "@tsz/api-client"` 的消费方不破。
export type {
  Admin,
  AdminAuthResponse,
  AdminChangePasswordInput,
  AdminLevel,
  AdminListQuery,
  AdminListResponse,
  AdminProfile,
  AdminRole,
  AdminStatus,
  AdminUser,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserUpdateInput,
  AdminUserView,
  CreateAdminInput,
  CreateAdminResponse,
  CreateRoleRequest,
  MenuPermission,
  PageMeta,
  PermissionCatalogItem,
  PermissionCatalogResponse,
  PermissionKey,
  ResetPasswordResponse,
  RoleListResponse,
  SetAdminRoleRequest,
  UpdateRoleRequest
} from "@tsz/types";

/** 把可选查询参数编成 query string;跳过 undefined / null / 空串,空对象返回 ""。 */
function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * 装配 admin 端点。传入的 http 必须以 /api/v1/admin 为 baseUrl，
 * 这样这里的相对路径（/auth/login、/profile）才会命中后台独立路由，
 * 且 refresh cookie 的 path（/api/v1/admin）天然匹配。
 */
export function createAdminEndpoints(http: HttpClient) {
  return {
    auth: {
      /** POST /admin/auth/login — 仅密码，无验证码。identifier = 手机号或邮箱。 */
      login: (identifier: string, password: string) =>
        http.post<AdminAuthResponse>(
          "/auth/login",
          { identifier, password },
          { skipAuth: true }
        ),
      /** POST /admin/auth/refresh — 刷新 access token（refresh cookie 自动携带，无 body）。 */
      refresh: () => http.post<RefreshResponse>("/auth/refresh"),
      /** POST /admin/auth/logout — 吊销当前会话 refresh token（cookie 自动携带）。 */
      logout: () => http.post<void>("/auth/logout"),
      /** POST /admin/auth/logout-all — 吊销该 admin 全部会话（带 Bearer）。 */
      logoutAll: () => http.post<void>("/auth/logout-all"),
      /**
       * POST /admin/auth/change-password — 登录管理员改自己的密码（带 Bearer）→ 204。
       * must_change_password 未清前少数可达端点之一。400 = 新密码同旧/不满足策略；
       * 401 = 当前密码错误。
       */
      changePassword: (currentPassword: string, newPassword: string) =>
        http.post<void>("/auth/change-password", {
          current_password: currentPassword,
          new_password: newPassword
        })
    },
    /** GET /admin/profile — 门禁探针：200=有效 admin / 401=未登录。 */
    profile: () => http.get<AdminProfile>("/profile"),
    /**
     * 智能词库（词条创编）。字段与状态码见 docs/admin-wordlist-frontend-integration.md；
     * 树内节点 id 由前端生成（UUID v4）且跨保存稳定，updated_at 兼作乐观锁 token。
     */
    words: {
      /** GET /admin/words — 列表页：搜索行筛选 + 分页。 */
      list: (query: AdminWordListQuery = {}) =>
        http.get<AdminWordListResponse>(`/words${qs({ ...query })}`),
      /** GET /admin/words/stats — 头部计数（累计 / 今日 / 本月，按 Asia/Shanghai）。 */
      stats: () => http.get<AdminWordStats>("/words/stats"),
      /** POST /admin/words — 创建草稿壳；409 = 同 kind 下 headword 已存在（忽略大小写）。 */
      create: (input: AdminWordCreateInput) =>
        http.post<AdminWordEnvelope>("/words", input),
      /** GET /admin/words/{id} — 编辑页加载整棵树；记住 updated_at 作乐观锁基准。 */
      get: (wordId: string) => http.get<AdminWordEnvelope>(`/words/${wordId}`),
      /**
       * PUT /admin/words/{id}/content — 保存（整树替换）。
       * 409 = 乐观锁冲突（重新加载）；422 = 已发布词条改残（details 逐条展示）。
       */
      saveContent: (wordId: string, input: AdminWordSaveInput) =>
        http.put<AdminWordEnvelope>(`/words/${wordId}/content`, input),
      /**
       * POST /admin/words/{id}/publish — 提交（发布），幂等且重新触发题目生成。
       * 422 = 完整性检查未过（HttpError.details）；409 = 并发保存，重试即可。
       */
      publish: (wordId: string) =>
        http.post<AdminWordEnvelope>(`/words/${wordId}/publish`),
      /** DELETE /admin/words/{id} — 单条删除（整棵树一起删）→ 204。 */
      remove: (wordId: string) => http.del<void>(`/words/${wordId}`),
      /** POST /admin/words/batch-delete — ≤100 个，重复去重；不存在的 id 跳过。 */
      batchDelete: (ids: string[]) =>
        http.post<AdminWordBatchDeleteResponse>("/words/batch-delete", {
          ids
        }),
      /** GET /admin/words/related-search — 「添加关联词」弹窗搜索；q 空则返回空结果。 */
      relatedSearch: (
        q: string,
        opts?: { kind?: AdminWordKind; limit?: number }
      ) =>
        http.get<RelatedSearchResponse>(
          `/words/related-search${qs({ q, kind: opts?.kind, limit: opts?.limit })}`
        )
    },
    /**
     * 用户管理：C 端用户（web 学员/教师）的后台目录。读（列表/详情）任意 admin 可见；
     * 写（启禁用/编辑）后端限 super_admin（普通 admin 得 403 super admin required）。
     * 删除用户后端本轮 out of scope，无对应端点。
     */
    users: {
      /** GET /admin/users — 列表页：role/关键字/注册时间筛选 + 分页。联系方式不脱敏。 */
      list: (query: AdminUserListQuery = {}) =>
        http.get<AdminUserListResponse>(`/users${qs({ ...query })}`),
      /** GET /admin/users/{id} — 用户详情（单个 AdminUser）。 */
      get: (id: string) => http.get<AdminUser>(`/users/${id}`),
      /**
       * PATCH /admin/users/{id}/status — 启用/禁用；返回更新后的 AdminUser。
       * 禁用在用户下次登录/刷新时生效（一个 access-token TTL 内），不强制吊销活跃会话。
       */
      setStatus: (id: string, status: AdminUser["status"]) =>
        http.patch<AdminUser>(`/users/${id}/status`, { status }),
      /** PATCH /admin/users/{id} — 编辑可管理字段（本轮仅昵称）；返回更新后的 AdminUser。 */
      update: (id: string, input: AdminUserUpdateInput) =>
        http.patch<AdminUser>(`/users/${id}`, input)
    },
    /**
     * 管理员账号管理（`super_admin` 专属；普通 admin 调用得 403 super admin required）。
     * 契约见 openapi `Admin (accounts)` 标签、docs/tsz-go admin-frontend-integration §7。
     */
    admins: {
      /** GET /admin/admins — 列表：level/关键字筛选 + 分页。 */
      list: (query: AdminListQuery = {}) =>
        http.get<AdminListResponse>(`/admins${qs({ ...query })}`),
      /**
       * POST /admin/admins — 建号。前端不再传密码/等级：后端生成一次性临时密码、
       * 等级恒为 admin。201 返回 { admin, temporary_password }；409 = 手机号/邮箱已被占用。
       */
      create: (input: CreateAdminInput) =>
        http.post<CreateAdminResponse>("/admins", input),
      /**
       * PATCH /admin/admins/{id}/status — 启用/禁用；返回更新后的 Admin。
       * 409 = 不能禁用最后一个 active super_admin。
       */
      setStatus: (adminId: string, status: AdminStatus) =>
        http.patch<Admin>(`/admins/${adminId}/status`, { status }),
      /**
       * POST /admin/admins/{id}/reset-password — 把某 level=admin 账号重置为一次性临时密码，
       * 返回明文（仅此一次）。403 = 目标是 super_admin（超管不在此重置）。
       */
      resetPassword: (adminId: string) =>
        http.post<ResetPasswordResponse>(`/admins/${adminId}/reset-password`),
      /**
       * PATCH /admin/admins/{id}/role — 给普通管理员派 / 换 / 清角色（RBAC 第二段）→ 204。
       * roleId 传 null = 收回（降为仅首页）。403 = 目标是超管（不挂角色）；
       * 404 = 管理员或 roleId 指向的角色不存在。成功后重拉角色列表刷新 member_count。
       */
      setRole: (adminId: string, roleId: string | null) =>
        http.patch<void>(`/admins/${adminId}/role`, { role_id: roleId })
    },
    /**
     * 后台 RBAC「角色治理」（`super_admin` 专属；普通 admin 调用得 403 super admin required）。
     * 契约见 openapi `Admin (roles)` 标签、docs/admin-rbac-frontend-integration.md。
     */
    roles: {
      /** GET /admin/permissions — 权限目录（渲染勾选框；顺序即侧栏顺序，别硬编码 key）。 */
      permissions: () => http.get<PermissionCatalogResponse>("/permissions"),
      /** GET /admin/roles — 角色列表（系统角色最前，permissions 按 key 字母序）。 */
      list: () => http.get<RoleListResponse>("/roles"),
      /**
       * POST /admin/roles — 建角色。201 返回新 AdminRole；409 = 重名（大小写不敏感）；
       * 400 = 名称非法或勾了目录外 key（code=unknown_permission_key）。
       */
      create: (input: CreateRoleRequest) =>
        http.post<AdminRole>("/roles", input),
      /**
       * PATCH /admin/roles/{id} — 改名/描述/权限集（部分更新；permissions 传了就是全量替换）。
       * 200 返回更新后的 AdminRole；403 = 系统角色禁改；404 = 已被删；409 = 重名；400 同 create。
       */
      update: (roleId: string, input: UpdateRoleRequest) =>
        http.patch<AdminRole>(`/roles/${roleId}`, input),
      /**
       * DELETE /admin/roles/{id} — 删角色 → 204，名下管理员自动解绑降为仅首页。
       * 403 = 系统角色禁删；404 = 不存在。删前用 member_count 二次确认。
       */
      remove: (roleId: string) => http.del<void>(`/roles/${roleId}`)
    }
  };
}

export type AdminEndpoints = ReturnType<typeof createAdminEndpoints>;
