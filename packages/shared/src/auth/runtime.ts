// 把 api-client、token 管理器、用户 store 装配成一份应用级鉴权 runtime。
// web 与 admin 各实例化一次（注入各自 baseUrl）。
import {
  createEndpoints,
  createHttpClient,
  type AuthResponse,
  type Endpoints
} from "@tsz/api-client";
import { createSessionRestore } from "./sessionRestore";
import { createAuthStore, type AuthStore } from "./store";
import { createTokenManager, type TokenManager } from "./tokenManager";

export interface AuthRuntime {
  api: Endpoints;
  store: AuthStore;
  tokens: TokenManager;
  restoreSession: () => Promise<void>;
  /** 登录 / 注册成功后：access token 存内存并启动主动刷新定时器。 */
  persistSession: (
    auth: Pick<AuthResponse, "access_token" | "expires_in">
  ) => void;
  /** 清除 token、刷新排期和全部用户会话状态，不触发网络或导航。 */
  clearSession: () => void;
}

export interface AuthRuntimeOptions {
  baseUrl: string;
  /** refresh 失败后跳转的登录页路径。默认 /login。 */
  loginPath?: string;
}

export function createAuthRuntime({
  baseUrl,
  loginPath
}: AuthRuntimeOptions): AuthRuntime {
  const store = createAuthStore();
  const tokens = createTokenManager({
    baseUrl,
    loginPath,
    onRefreshError: (error) => {
      if (error !== null || store.getState().hydrated) {
        store.setState({ connectionError: error !== null });
      }
    }
  });

  const http = createHttpClient({
    baseUrl,
    getToken: tokens.getToken,
    getSessionGeneration: tokens.getSessionGeneration,
    onRefresh: tokens.refreshTokens,
    onSessionExpired: tokens.redirectToLogin
  });
  const api = createEndpoints(http);

  return {
    api,
    store,
    tokens,
    restoreSession: createSessionRestore(
      tokens,
      () => api.auth.me(),
      ({ user, onboarded }) => store.getState().setSession(user, onboarded),
      () =>
        store.setState({
          user: null,
          activeRole: null,
          onboarded: null,
          hydrated: true,
          connectionError: false
        }),
      () => store.setState({ connectionError: true })
    ),
    persistSession: (auth) => {
      tokens.setAccessToken(auth.access_token);
      store.setState({ connectionError: false });
      tokens.scheduleRefresh(auth.expires_in);
    },
    clearSession: () => {
      tokens.setAccessToken(null);
      store.setState({
        user: null,
        activeRole: null,
        onboarded: null,
        hydrated: true,
        connectionError: false
      });
    }
  };
}
