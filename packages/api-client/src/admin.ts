// 平台后台（admin）专用端点。后台是与 web 学员/教师**完全独立**的身份体系：
// 独立登录 / 独立 token / 独立 refresh cookie（path=/api/v1/admin）。
// 这些端点要绑定到 baseUrl=/api/v1/admin 的 HttpClient 上，路径才会落到 /api/v1/admin/*。
import type {
  AdminWordBatchDeleteResponse,
  AdminWordCreateInput,
  AdminWordEnvelope,
  AdminWordKind,
  AdminWordListQuery,
  AdminWordListResponse,
  AdminWordSaveInput,
  AdminWordStats,
  RelatedSearchResponse
} from "@tsz/types";
import type { RefreshResponse } from "./endpoints";
import type { HttpClient } from "./http";

/** admin 权限等级：super_admin 额外可管理管理员账号。 */
export type AdminLevel = "admin" | "super_admin";

/** admin 账号状态。 */
export type AdminStatus = "active" | "disabled";

/** GET /admin/profile 的响应：登录管理员自身身份，用于门禁探针 + 顶栏「已登录为 X」。 */
export interface AdminProfile {
  id: string;
  phone: string;
  display_name: string;
  level: AdminLevel;
}

/** 账号管理里看到的完整 admin 对象（含状态与创建时间）。 */
export interface Admin {
  id: string;
  phone: string;
  email?: string;
  display_name: string;
  level: AdminLevel;
  status: AdminStatus;
  /** ISO8601 */
  created_at: string;
}

/** POST /admin/auth/login 的响应。 */
export interface AdminAuthResponse {
  admin: Admin;
  access_token: string;
  level: AdminLevel;
  /** access token 剩余有效期（秒），约 900。 */
  expires_in: number;
  /** refresh token 过期的 Unix 时间戳（秒）。 */
  refresh_token_expires_at: number;
}

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
      logoutAll: () => http.post<void>("/auth/logout-all")
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
    }
  };
}

export type AdminEndpoints = ReturnType<typeof createAdminEndpoints>;
