// 平台后台（admin）专用端点。后台是与 web 学员/教师**完全独立**的身份体系：
// 独立登录 / 独立 token / 独立 refresh cookie（path=/api/v1/admin）。
// 这些端点要绑定到 baseUrl=/api/v1/admin 的 HttpClient 上，路径才会落到 /api/v1/admin/*。
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
    profile: () => http.get<AdminProfile>("/profile")
  };
}

export type AdminEndpoints = ReturnType<typeof createAdminEndpoints>;
