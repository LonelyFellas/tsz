// 把 api-client、token 管理器、用户 store 装配成一份应用级鉴权 runtime。
// web 与 admin 各实例化一次（注入各自 baseUrl）。
import {
  createEndpoints,
  createHttpClient,
  type AuthResponse,
  type Endpoints
} from "@tsz/api-client";
import { createAuthStore, type AuthStore } from "./store";
import { createTokenManager, type TokenManager } from "./tokenManager";

export interface AuthRuntime {
  api: Endpoints;
  store: AuthStore;
  tokens: TokenManager;
  /** 登录 / 注册成功后：access token 存内存并启动主动刷新定时器。 */
  persistSession: (
    auth: Pick<AuthResponse, "access_token" | "expires_in">
  ) => void;
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
  const tokens = createTokenManager({ baseUrl, loginPath });
  const store = createAuthStore();

  const http = createHttpClient({
    baseUrl,
    getToken: tokens.getToken,
    onRefresh: tokens.refreshTokens,
    onSessionExpired: tokens.redirectToLogin
  });
  const api = createEndpoints(http);

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
