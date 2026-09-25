import { HttpError } from "@tsz/api-client";

export class SessionChangedError extends Error {
  constructor() {
    super("session changed");
  }
}

export interface TokenManager {
  getToken: () => string | undefined;
  getSessionGeneration: () => number;
  setAccessToken: (token: string | null) => void;
  scheduleRefresh: (expiresIn: number) => void;
  refreshTokens: () => Promise<string>;
  redirectToLogin: () => void;
}

export interface TokenManagerOptions {
  baseUrl: string;
  loginPath?: string;
  onRefreshError?: (error: unknown | null) => void;
}

export function createTokenManager({
  baseUrl,
  loginPath = "/login",
  onRefreshError
}: TokenManagerOptions): TokenManager {
  let accessToken: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let tokenExpiresAt = 0;
  let sessionGeneration = 0;
  let refreshingPromise: Promise<string> | null = null;
  let refreshController: AbortController | null = null;
  let retryAttempt = 0;

  function setAccessToken(token: string | null) {
    sessionGeneration += 1;
    refreshController?.abort();
    refreshController = null;
    accessToken = token;
    refreshingPromise = null;
    retryAttempt = 0;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    tokenExpiresAt = 0;
    onRefreshError?.(null);
  }

  function redirectToLogin() {
    setAccessToken(null);
    if (typeof window !== "undefined") window.location.href = loginPath;
  }

  function refreshInBackground() {
    const generation = sessionGeneration;
    void refreshTokens().catch((error: unknown) => {
      if (generation !== sessionGeneration) return;
      if (error instanceof HttpError && error.status === 401) redirectToLogin();
    });
  }

  function refreshTokens(): Promise<string> {
    if (refreshingPromise) return refreshingPromise;
    const generation = sessionGeneration;
    const assertCurrent = () => {
      if (generation !== sessionGeneration) throw new SessionChangedError();
    };
    refreshController = new AbortController();
    const promise = fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal: refreshController.signal
    })
      .then(async (res) => {
        assertCurrent();
        if (!res.ok) throw new HttpError(res.status, "会话刷新失败，请重试");
        const data = (await res.json()) as {
          access_token: string;
          expires_in: number;
        };
        assertCurrent();
        if (
          typeof data.access_token !== "string" ||
          !data.access_token ||
          !Number.isFinite(data.expires_in) ||
          data.expires_in <= 0
        ) {
          throw new Error("会话刷新响应异常，请重试");
        }
        accessToken = data.access_token;
        retryAttempt = 0;
        onRefreshError?.(null);
        scheduleRefresh(data.expires_in);
        return data.access_token;
      })
      .catch((error: unknown) => {
        assertCurrent();
        if (!(error instanceof HttpError && error.status === 401)) {
          onRefreshError?.(error);
          if (accessToken && retryAttempt < 3) {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(
              refreshInBackground,
              [5_000, 15_000, 30_000][retryAttempt++]
            );
          }
        }
        throw error;
      })
      .finally(() => {
        // 新登录可另起刷新；旧请求不能释放新请求的 single-flight 锁。
        if (refreshingPromise === promise) {
          refreshingPromise = null;
          refreshController = null;
        }
      });
    refreshingPromise = promise;
    return promise;
  }

  function scheduleRefresh(expiresIn: number) {
    if (refreshTimer) clearTimeout(refreshTimer);
    tokenExpiresAt = Date.now() + expiresIn * 1000;
    const delay = (expiresIn - 30) * 1000;
    if (!(delay > 0)) return;
    refreshTimer = setTimeout(refreshInBackground, delay);
  }

  if (typeof window !== "undefined") {
    const resume = () => {
      if (accessToken && tokenExpiresAt - Date.now() < 30_000)
        refreshInBackground();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
  }

  return {
    getToken: () => accessToken ?? undefined,
    getSessionGeneration: () => sessionGeneration,
    setAccessToken,
    scheduleRefresh,
    refreshTokens,
    redirectToLogin
  };
}
