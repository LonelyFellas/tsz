// 平台后台（admin）专用端点。后台是与 web 学员/教师**完全独立**的身份体系：
// 独立登录 / 独立 token / 独立 refresh cookie（path=/api/v1/admin）。
// 这些端点要绑定到 baseUrl=/api/v1/admin 的 HttpClient 上，路径才会落到 /api/v1/admin/*。
import type {
  ActivatePublicationInput,
  AdminListQuery,
  AdminListResponse,
  AdminRole,
  AdminUser,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserUpdateInput,
  AdminSpeechPreviewResponse,
  AdminSpeechVoiceListResponse,
  AdminWordDraftV2Envelope,
  AdminWordV2Envelope,
  AdminWordListQuery,
  AdminWordV2ListResponse,
  AdminWordStats,
  AdminStatus,
  CreateAdminInput,
  CreateAdminSpeechPreviewInput,
  CreateAdminWordV2Input,
  CreateContentCompletionJobInput,
  ContentCompletionJobEnvelope,
  CreateAdminResponse,
  CreateRoleRequest,
  DeleteDraftInput,
  DetectWordInputV2,
  DetectWordResponseV2,
  DraftValidationResponse,
  EntryLifecycleBatchInput,
  EntryLifecycleBatchResponse,
  EntryLifecycleInput,
  PreviewFormsImpactInputV2,
  PreviewFormsImpactResponseV2,
  PublishAdminWordV2Input,
  Admin,
  AdminAuthResponse,
  AdminProfile,
  UpdateAdminPreferencesInput,
  UpdateAdminPreferencesResponse,
  PermissionCatalogResponse,
  PartOfSpeechCatalogResponse,
  PartOfSpeechConfig,
  PartOfSpeechConfigListQuery,
  PartOfSpeechConfigListResponse,
  RelatedSearchResponse,
  RelatedSearchQuery,
  ResetPasswordResponse,
  RetryContentCompletionJobInput,
  RoleListResponse,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  SurfaceMatchPageV2,
  SuggestDialectVariantsInputV2,
  SuggestDialectVariantsResponseV2,
  SubPartOfSpeechConfig,
  SubPartOfSpeechListResponse,
  CreatePartOfSpeechInput,
  CreateSubPartOfSpeechInput,
  DeletePartOfSpeechQuery,
  UpdatePartOfSpeechInput,
  UpdateSubPartOfSpeechInput,
  ValidateAdminWordV2Input,
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
  AdminDialectPreference,
  AdminPreferences,
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
  UpdateAdminPreferencesInput,
  UpdateAdminPreferencesResponse,
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
      /**
       * POST /admin/auth/login-code — 2FA 第一步：给手机号发登录验证码。
       * 后端恒 202（反枚举，查无此号/冷却也 202）；无凭证要求 → skipAuth。
       */
      requestLoginCode: (phone: string) =>
        http.post<void>("/auth/login-code", { phone }, { skipAuth: true }),
      /**
       * POST /admin/auth/login — 手机号 + 密码 + 验证码三要素 2FA。
       * 登录标识仅手机号（Q9：admin 无 email，后端 get_by_phone 精确匹配）。
       */
      login: (phone: string, password: string, code: string) =>
        http.post<AdminAuthResponse>(
          "/auth/login",
          { phone, password, code },
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
     * PATCH /admin/profile/preferences — 改**自己的**个人偏好。
     * 目标恒为 token subject，请求体里没有管理员 ID，改不到别人。
     * 200 返回落库后的完整偏好；422 = dialect 不在枚举内（invalid_request_body）。
     */
    updateProfilePreferences: (input: UpdateAdminPreferencesInput) =>
      http.patch<UpdateAdminPreferencesResponse>("/profile/preferences", input),
    /** 语音富文本试听；wire 映射由 admin 业务层承担。 */
    speech: {
      voices: (signal?: AbortSignal) =>
        http.get<AdminSpeechVoiceListResponse>("/speech/voices", { signal }),
      preview: (input: CreateAdminSpeechPreviewInput, signal?: AbortSignal) =>
        http.post<AdminSpeechPreviewResponse>("/speech/previews", input, {
          signal
        })
    },
    /**
     * 智能词库（词条创编）。字段与状态码见 docs/admin-wordlist-frontend-integration.md；
     * 树内节点 id 由前端生成（UUID v4）且跨保存稳定，updated_at 兼作乐观锁 token。
     */
    words: {
      /** GET /admin/lexicon/entries — 列表页：搜索行筛选 + 分页。 */
      list: (query: AdminWordListQuery = {}) =>
        http.get<AdminWordV2ListResponse>(
          `/lexicon/entries${qs({ ...query })}`
        ),
      /** GET /admin/lexicon/entries/stats — 头部计数（累计 / 今日 / 本月）。 */
      stats: () => http.get<AdminWordStats>("/lexicon/entries/stats"),
      /** POST /admin/lexicon/detections — 创建 V2 草稿前执行内置词典与智能词库检测。 */
      detect: (input: DetectWordInputV2) =>
        http.post<DetectWordResponseV2>("/lexicon/detections", input),
      /** GET /admin/lexicon/surface-match-snapshots/{id} — 顺序读取不可变 warning 页。 */
      surfaceMatchSnapshotPage: (
        snapshotId: string,
        cursor: string,
        signal?: AbortSignal
      ) =>
        http.get<SurfaceMatchPageV2>(
          `/lexicon/surface-match-snapshots/${snapshotId}${qs({ cursor })}`,
          { signal }
        ),
      /** POST /admin/lexicon/dialect-variant-suggestions — 获取 evidence-backed 方言建议。 */
      suggestDialectVariants: (input: SuggestDialectVariantsInputV2) =>
        http.post<SuggestDialectVariantsResponseV2>(
          "/lexicon/dialect-variant-suggestions",
          input
        ),
      /** POST /admin/lexicon/entries — 由有效 detection 幂等创建 V2 canonical 草稿。 */
      createV2: (idempotencyKey: string, input: CreateAdminWordV2Input) =>
        http.post<AdminWordV2Envelope>("/lexicon/entries", input, {
          headers: { "Idempotency-Key": idempotencyKey }
        }),
      /**
       * GET /admin/lexicon/entries/{id} — 加载 V2 canonical 词条。
       *
       * 只有这个接口带 `retired_stable_slots`：命令类接口的调用方自己就知道刚
       * 退役了什么，需要服务端补身份的只有「刷新」和「换设备」。
       */
      get: (wordId: string) =>
        http.get<AdminWordDraftV2Envelope>(`/lexicon/entries/${wordId}`),
      /** POST /admin/lexicon/entries/{id}/steps/forms/impact。 */
      previewFormsImpact: (wordId: string, input: PreviewFormsImpactInputV2) =>
        http.post<PreviewFormsImpactResponseV2>(
          `/lexicon/entries/${wordId}/steps/forms/impact`,
          input
        ),
      /** PUT /admin/lexicon/entries/{id}/steps/forms。 */
      saveFormsStep: (wordId: string, input: SaveFormsStepInput) =>
        http.put<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/steps/forms`,
          input
        ),
      /** PUT /admin/lexicon/entries/{id}/steps/meanings。 */
      saveMeaningsStep: (wordId: string, input: SaveMeaningsStepInput) =>
        http.put<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/steps/meanings`,
          input
        ),
      /** POST .../content-completion-jobs — 创建真实内容生成任务。 */
      createContentCompletionJob: (
        wordId: string,
        idempotencyKey: string,
        input: CreateContentCompletionJobInput
      ) =>
        http.post<ContentCompletionJobEnvelope>(
          `/lexicon/entries/${wordId}/content-completion-jobs`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** GET .../content-completion-jobs/{jobId} — 查询任务和候选内容。 */
      getContentCompletionJob: (wordId: string, jobId: string) =>
        http.get<ContentCompletionJobEnvelope>(
          `/lexicon/entries/${wordId}/content-completion-jobs/${jobId}`
        ),
      /** POST .../retries — 仅重试失败或缺失分区。 */
      retryContentCompletionJob: (
        wordId: string,
        jobId: string,
        idempotencyKey: string,
        input: RetryContentCompletionJobInput
      ) =>
        http.post<ContentCompletionJobEnvelope>(
          `/lexicon/entries/${wordId}/content-completion-jobs/${jobId}/retries`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/{id}/validate。 */
      validateV2: (wordId: string, input: ValidateAdminWordV2Input) =>
        http.post<DraftValidationResponse>(
          `/lexicon/entries/${wordId}/validate`,
          input
        ),
      /** POST /admin/lexicon/entries/{id}/publications — 带 revision 幂等发布 V2。 */
      publishV2: (
        wordId: string,
        idempotencyKey: string,
        input: PublishAdminWordV2Input
      ) =>
        http.post<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/publications`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/{id}/publications/{publication_id}/activate。 */
      activatePublication: (
        wordId: string,
        publicationId: string,
        idempotencyKey: string,
        input: ActivatePublicationInput
      ) =>
        http.post<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/publications/${publicationId}/activate`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/{id}/archive — 保留 publication 的幂等归档。 */
      archive: (
        wordId: string,
        idempotencyKey: string,
        input: EntryLifecycleInput
      ) =>
        http.post<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/archive`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/{id}/restore — 幂等恢复。 */
      restore: (
        wordId: string,
        idempotencyKey: string,
        input: EntryLifecycleInput
      ) =>
        http.post<AdminWordV2Envelope>(
          `/lexicon/entries/${wordId}/restore`,
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/archive-batch — 最多 100 条原子归档。 */
      archiveBatch: (idempotencyKey: string, input: EntryLifecycleBatchInput) =>
        http.post<EntryLifecycleBatchResponse>(
          "/lexicon/entries/archive-batch",
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** POST /admin/lexicon/entries/restore-batch — 最多 100 条原子恢复。 */
      restoreBatch: (idempotencyKey: string, input: EntryLifecycleBatchInput) =>
        http.post<EntryLifecycleBatchResponse>(
          "/lexicon/entries/restore-batch",
          input,
          { headers: { "Idempotency-Key": idempotencyKey } }
        ),
      /** DELETE /admin/lexicon/entries/{id} — 仅永久删除从未发布的 V2 草稿。 */
      deleteDraft: (wordId: string, input: DeleteDraftInput) =>
        http.del<void>(`/lexicon/entries/${wordId}`, input),
      /** GET /admin/lexicon/entries/related-search — 关联词/上下文目标搜索。 */
      relatedSearch: (q: string, opts?: RelatedSearchQuery) =>
        http.get<RelatedSearchResponse>(
          `/lexicon/entries/related-search${qs({
            q,
            kind: opts?.kind,
            match_mode: opts?.match_mode,
            exclude_exact:
              opts?.exclude_exact === undefined
                ? undefined
                : String(opts.exclude_exact),
            page_size: opts?.page_size,
            limit: opts?.limit,
            cursor: opts?.cursor
          })}`
        )
    },
    /**
     * 系统设置 → 词性配置。catalog 供全部词条页面只读消费；管理 CRUD 为
     * super_admin 专属。契约已在 tsz-rust 落地。
     */
    partOfSpeechSettings: {
      /** GET /admin/settings/parts-of-speech/catalog — 完整基本/细分词性目录。 */
      catalog: () =>
        http.get<PartOfSpeechCatalogResponse>(
          "/settings/parts-of-speech/catalog"
        ),
      /** GET /admin/settings/parts-of-speech — 配置管理分页列表。 */
      list: (query: PartOfSpeechConfigListQuery = {}) =>
        http.get<PartOfSpeechConfigListResponse>(
          `/settings/parts-of-speech${qs({ ...query })}`
        ),
      /** POST /admin/settings/parts-of-speech — 新建基本词性。 */
      create: (input: CreatePartOfSpeechInput) =>
        http.post<PartOfSpeechConfig>("/settings/parts-of-speech", input),
      /** PATCH /admin/settings/parts-of-speech/{id} — 修改展示信息与排序。 */
      update: (id: string, input: UpdatePartOfSpeechInput) =>
        http.patch<PartOfSpeechConfig>(
          `/settings/parts-of-speech/${id}`,
          input
        ),
      /** DELETE /admin/settings/parts-of-speech/{id} — 仅未引用配置可删。 */
      remove: (id: string, query: DeletePartOfSpeechQuery) =>
        http.del<void>(
          `/settings/parts-of-speech/${id}${qs({ base_revision: query.base_revision })}`
        ),
      /** GET /admin/settings/parts-of-speech/{id}/sub-parts。 */
      listSubParts: (id: string) =>
        http.get<SubPartOfSpeechListResponse>(
          `/settings/parts-of-speech/${id}/sub-parts`
        ),
      /** POST /admin/settings/parts-of-speech/{id}/sub-parts。 */
      createSubPart: (id: string, input: CreateSubPartOfSpeechInput) =>
        http.post<SubPartOfSpeechConfig>(
          `/settings/parts-of-speech/${id}/sub-parts`,
          input
        ),
      /** PATCH /admin/settings/parts-of-speech/{id}/sub-parts/{subId}。 */
      updateSubPart: (
        id: string,
        subId: string,
        input: UpdateSubPartOfSpeechInput
      ) =>
        http.patch<SubPartOfSpeechConfig>(
          `/settings/parts-of-speech/${id}/sub-parts/${subId}`,
          input
        ),
      /** DELETE /admin/settings/parts-of-speech/{id}/sub-parts/{subId}。 */
      removeSubPart: (
        id: string,
        subId: string,
        query: DeletePartOfSpeechQuery
      ) =>
        http.del<void>(
          `/settings/parts-of-speech/${id}/sub-parts/${subId}${qs({ base_revision: query.base_revision })}`
        )
    },
    /**
     * 用户管理：C 端用户（web 学员/教师）的后台目录。当前后端仅列表已落地；
     * 详情、启禁用、编辑仍在契约 PENDING，页面不会调用。
     */
    users: {
      /** GET /admin/users — 列表页：role/关键字/注册时间筛选 + 分页。联系方式不脱敏。 */
      list: (query: AdminUserListQuery = {}) =>
        http.get<AdminUserListResponse>(`/users${qs({ ...query })}`),
      /** GET /admin/users/{id} — PENDING：用户详情（单个 AdminUser）。 */
      get: (id: string) => http.get<AdminUser>(`/users/${id}`),
      /**
       * PENDING：PATCH /admin/users/{id}/status — 启用/禁用；返回更新后的 AdminUser。
       * 禁用在用户下次登录/刷新时生效（一个 access-token TTL 内），不强制吊销活跃会话。
       */
      setStatus: (id: string, status: AdminUser["status"]) =>
        http.patch<AdminUser>(`/users/${id}/status`, { status }),
      /** PENDING：PATCH /admin/users/{id} — 编辑可管理字段；返回更新后的 AdminUser。 */
      update: (id: string, input: AdminUserUpdateInput) =>
        http.patch<AdminUser>(`/users/${id}`, input)
    },
    /**
     * 管理员账号管理（`super_admin` 专属；普通 admin 调用得 403 super admin required）。
     * 契约见 tsz-rust openapi `admin-accounts` 标签。
     */
    admins: {
      /** GET /admin/admins — 列表：role/手机号/昵称筛选 + 分页。 */
      list: (query: AdminListQuery = {}) =>
        http.get<AdminListResponse>(`/admins${qs({ ...query })}`),
      /**
       * POST /admin/admins — 建号。前端不再传密码/等级：后端生成一次性临时密码、
       * 角色恒为 admin。201 返回 { admin, temporary_password }；409 = 手机号已被占用。
       */
      create: (input: CreateAdminInput) =>
        http.post<CreateAdminResponse>("/admins", input),
      /** POST /admin/admins/create-code — 给当前超管的数据库手机号发送建号确认码。 */
      requestCreateCode: () => http.post<void>("/admins/create-code"),
      /**
       * PATCH /admin/admins/{id}/status — 启用/禁用；返回更新后的 Admin。
       * 409 = 不能禁用最后一个 active super_admin。
       */
      setStatus: (adminId: string, status: AdminStatus) =>
        http.patch<Admin>(`/admins/${adminId}/status`, { status }),
      /**
       * POST /admin/admins/{id}/reset-password — 把某 role=admin 账号重置为一次性临时密码，
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
