// 把 admin 端点、token 管理器、后台 store 装配成一份 admin 鉴权 runtime。
// 与 web 的 createAuthRuntime 互不引用：端点、refresh cookie path、store 形状都不同。
// 复用底层 createHttpClient / createTokenManager（无状态机制，按 baseUrl 参数化），
// realm 隔离靠 baseUrl=/api/v1/admin 与独立 cookie path 天然达成。
import {
  createAdminEndpoints,
  createHttpClient,
  type AdminEndpoints
} from "@tsz/api-client";
import type { AdminAuthResponse } from "@tsz/types";
import { createAdminAuthStore, type AdminAuthStore } from "./adminStore";
import { createTokenManager, type TokenManager } from "./tokenManager";

export interface AdminAuthRuntime {
  api: AdminEndpoints;
  store: AdminAuthStore;
  tokens: TokenManager;
  /** 登录成功后：access token 存内存并启动主动刷新定时器。 */
  persistSession: (
    auth: Pick<AdminAuthResponse, "access_token" | "expires_in">
  ) => void;
}

export interface AdminAuthRuntimeOptions {
  /** 必须指向后台前缀（如 /api/v1/admin），refresh 与各端点据此拼接。 */
  baseUrl: string;
  /** refresh 失败后跳转的登录页路径。默认 /login。 */
  loginPath?: string;
  /** 待改密（403 code:must_change_password）时整页跳转的改密页路径。默认 /change-password。 */
  changePasswordPath?: string;
}

/**
 * 待改密拦截：仅当 403 的业务 code 为 must_change_password、且当前不在改密页时，
 * 整页跳转到改密页。整页跳转（而非 SPA 导航）与 redirectToLogin 同款，规避 RouteGuard 竞态；
 * 「已在改密页不跳」防止改密页内产生的 403（如会话恢复探 /profile 也被守卫 403）触发自循环。
 * 抽成具名导出便于单测（注入 window.location 桩，不触发真实导航）。
 */
export function redirectToChangePassword(
  code: string | undefined,
  changePasswordPath: string
): void {
  if (code !== "must_change_password") return;
  if (typeof window === "undefined") return;
  if (window.location.pathname === changePasswordPath) return;
  window.location.href = changePasswordPath;
}

export function createAdminAuthRuntime({
  baseUrl,
  loginPath,
  changePasswordPath = "/change-password"
}: AdminAuthRuntimeOptions): AdminAuthRuntime {
  const tokens = createTokenManager({ baseUrl, loginPath });
  const store = createAdminAuthStore();

  const http = createHttpClient({
    baseUrl,
    getToken: tokens.getToken,
    onRefresh: tokens.refreshTokens,
    onSessionExpired: tokens.redirectToLogin,
    onForbidden: (code) => redirectToChangePassword(code, changePasswordPath)
  });
  const api = createAdminEndpoints(http);

  return {
    api,
    store,
    tokens,
    persistSession: (auth) => {
      tokens.setAccessToken(auth.access_token);
      tokens.scheduleRefresh(auth.expires_in);
    }
  };
}
