// 把 admin 端点、token 管理器、后台 store 装配成一份 admin 鉴权 runtime。
// 与 web 的 createAuthRuntime 互不引用：端点、refresh cookie path、store 形状都不同。
// 复用底层 createHttpClient / createTokenManager（无状态机制，按 baseUrl 参数化），
// realm 隔离靠 baseUrl=/api/v1/admin 与独立 cookie path 天然达成。
import {
  createAdminEndpoints,
  createHttpClient,
  HttpError,
  InvalidAdminProfileResponseError,
  type AdminEndpoints
} from "@tsz/api-client";
import type { AdminAuthResponse } from "@tsz/types";
import { createSessionRestore } from "./sessionRestore";
import { createAdminAuthStore, type AdminAuthStore } from "./adminStore";
import { createTokenManager, type TokenManager } from "./tokenManager";

export interface AdminAuthRuntime {
  api: AdminEndpoints;
  store: AdminAuthStore;
  tokens: TokenManager;
  restoreSession: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  const store = createAdminAuthStore();
  const tokens = createTokenManager({
    baseUrl,
    loginPath,
    onRefreshError: (error) => {
      if (error !== null || store.getState().hydrated) {
        store.setState({ connectionError: error !== null });
      }
    }
  });

  let loadingProfile: number | undefined;
  let profileDirty = false;
  const http = createHttpClient({
    baseUrl,
    getToken: tokens.getToken,
    getSessionGeneration: tokens.getSessionGeneration,
    onRefresh: tokens.refreshTokens,
    onSessionExpired: () => {
      store.getState().setProfile(null);
      tokens.redirectToLogin();
    },
    onForbidden: (code, path) => {
      if (code === "must_change_password") {
        store.getState().setProfile(null);
        redirectToChangePassword(code, changePasswordPath);
      } else if (code === "account_disabled") {
        store.getState().setProfile(null);
        tokens.redirectToLogin();
      } else if (path !== "/profile" && tokens.getToken()) {
        if (loadingProfile === tokens.getSessionGeneration())
          profileDirty = true;
        else void refreshProfile().catch(() => undefined);
      }
    }
  });
  const api = createAdminEndpoints(http);
  const readProfile = api.profile;
  api.profile = async () => {
    const generation = tokens.getSessionGeneration();
    try {
      return await readProfile();
    } catch (error) {
      if (
        error instanceof InvalidAdminProfileResponseError &&
        generation === tokens.getSessionGeneration()
      ) {
        store.setState({
          profile: null,
          role: null,
          hydrated: true,
          connectionError: false,
          permissionModelIncompatible: true
        });
      }
      throw error;
    }
  };
  const restoreProfile = createSessionRestore(
    tokens,
    async () => {
      try {
        return await api.profile();
      } catch (error) {
        if (
          error instanceof HttpError &&
          error.status === 403 &&
          (error.code === "must_change_password" ||
            error.code === "account_disabled")
        )
          return null;
        throw error;
      }
    },
    (profile) => {
      store.getState().setProfile(profile);
      store.setState({ hydrated: true, connectionError: false });
    },
    () =>
      store.setState({
        profile: null,
        role: null,
        hydrated: true,
        connectionError: false,
        permissionModelIncompatible: false
      }),
    () =>
      store.setState({
        connectionError: !store.getState().permissionModelIncompatible
      })
  );

  let pendingProfile:
    { generation: number; promise: Promise<void> } | undefined;
  function refreshProfile(): Promise<void> {
    const generation = tokens.getSessionGeneration();
    if (pendingProfile?.generation === generation)
      return pendingProfile.promise;
    loadingProfile = generation;
    const promise = (async () => {
      do {
        profileDirty = false;
        await restoreProfile();
      } while (generation === tokens.getSessionGeneration() && profileDirty);
    })().finally(() => {
      if (pendingProfile?.promise !== promise) return;
      const reread =
        profileDirty && generation === tokens.getSessionGeneration();
      pendingProfile = undefined;
      loadingProfile = undefined;
      profileDirty = false;
      if (reread && tokens.getToken()) return refreshProfile();
    });
    pendingProfile = { generation, promise };
    return promise;
  }

  return {
    api,
    store,
    tokens,
    restoreSession: refreshProfile,
    refreshProfile,
    persistSession: (auth) => {
      store.getState().setProfile(null);
      loadingProfile = undefined;
      profileDirty = false;
      tokens.setAccessToken(auth.access_token);
      store.setState({ connectionError: false });
      tokens.scheduleRefresh(auth.expires_in);
    }
  };
}
