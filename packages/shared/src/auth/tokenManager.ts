import { HttpError, createRequestDeadline } from "@tsz/api-client";

export class RefreshUnconfirmedError extends Error {
  constructor() {
    super("会话刷新结果尚未确认，请重新登录");
    this.name = "RefreshUnconfirmedError";
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super("session changed");
  }
}

export interface TokenManager {
  getToken: () => string | undefined;
  getSessionGeneration: () => number;
  setAccessToken: (token: string | null) => void;
  clearSession: () => void;
  canRestoreSession: () => boolean;
  scheduleRefresh: (expiresIn: number) => void;
  refreshTokens: () => Promise<string>;
  redirectToLogin: () => void;
}

export interface TokenManagerOptions {
  baseUrl: string;
  loginPath?: string;
  onRefreshError?: (error: unknown | null) => void;
  onSessionChanged?: () => void;
}

// 这里只比较身份以阻止跨账号重放；令牌签名与访问权限仍由服务端验证。
function tokenIdentity(token: string | null): string | null {
  try {
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const { sub, aud } = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { sub?: unknown; aud?: unknown };
    return typeof sub === "string" && typeof aud === "string"
      ? JSON.stringify([aud, sub.replace(/-/g, "").toLowerCase()])
      : null;
  } catch {
    return null;
  }
}

export function createTokenManager({
  baseUrl,
  loginPath = "/login",
  onRefreshError,
  onSessionChanged
}: TokenManagerOptions): TokenManager {
  let accessToken: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let tokenExpiresAt = 0;
  let sessionGeneration = 0;
  let refreshingPromise: Promise<string> | null = null;
  let refreshController: AbortController | null = null;
  let retryAttempt = 0;
  let refreshNeeded = false;
  let recoverySupported: boolean | undefined;
  const requestKey = `tsz:refresh-request:${baseUrl}`;
  let requestId: string | null = null;
  const unconfirmedKey = `tsz:refresh-unconfirmed:${baseUrl}`;
  let unconfirmed: RefreshUnconfirmedError | null = null;
  let legacyUnconfirmed = false;
  const logoutKey = `tsz.auth.logged-out:${baseUrl}`;
  const sessionKey = `tsz:auth-session:${baseUrl}`;
  const tabSessionKey = `tsz:auth-tab:${baseUrl}`;
  let locallyLoggedOut = false;
  let sessionStamp: string | null = null;
  try {
    locallyLoggedOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(logoutKey) === "1";
    sessionStamp =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(sessionKey)
        : null;
    const tabStamp =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(tabSessionKey)
        : null;
    locallyLoggedOut ||=
      (sessionStamp?.startsWith("logout:") ?? false) ||
      (tabStamp !== null && tabStamp !== (sessionStamp ?? ""));
    markLoggedOut(locallyLoggedOut);
    rememberSessionStamp();
  } catch {
    /* 存储不可用时仍保留内存状态与刷新主体检查。 */
  }
  try {
    const marker =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(unconfirmedKey)
        : null;
    if (marker === "1" || marker === "cancelled") {
      unconfirmed = new RefreshUnconfirmedError();
      legacyUnconfirmed = marker === "1";
    }
  } catch {
    /* In-memory protection still applies when storage is unavailable. */
  }

  function rememberUnconfirmed(value: boolean, cancelled = false) {
    try {
      if (typeof sessionStorage === "undefined") return;
      if (value)
        sessionStorage.setItem(unconfirmedKey, cancelled ? "cancelled" : "1");
      else sessionStorage.removeItem(unconfirmedKey);
    } catch {
      /* No credentials are stored; storage failure must not replay a Cookie. */
    }
  }

  function requestStorage() {
    try {
      if (typeof localStorage !== "undefined") return localStorage;
      if (typeof sessionStorage !== "undefined") return sessionStorage;
    } catch {
      /* 内存仍可续接当前页面的刷新。 */
    }
    return undefined;
  }

  function clearRequest(force = false) {
    try {
      const storage = requestStorage();
      if (force || storage?.getItem(requestKey) === requestId)
        storage?.removeItem(requestKey);
    } catch {
      /* Web Storage 被禁用时仅清理当前实例。 */
    }
    requestId = null;
  }

  function scheduleRetry() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const delay = [5_000, 15_000, 30_000][Math.min(retryAttempt++, 2)];
    refreshTimer = setTimeout(refreshInBackground, delay);
  }

  function markLoggedOut(value: boolean) {
    locallyLoggedOut = value;
    try {
      if (typeof sessionStorage === "undefined") return;
      if (value) sessionStorage.setItem(logoutKey, "1");
      else sessionStorage.removeItem(logoutKey);
    } catch {
      /* 存储不可用不阻断本地退出。 */
    }
  }

  function rememberSessionStamp() {
    try {
      if (typeof sessionStorage !== "undefined")
        sessionStorage.setItem(tabSessionKey, sessionStamp ?? "");
    } catch {
      /* 页面重建标记不可用时保留内存与主体检查。 */
    }
  }

  function publishSession(kind: "login" | "logout") {
    // 这是失效通知标记，不是凭据；非安全上下文也须完成本地登录和退出。
    const stamp = `${kind}:${Date.now()}:${Math.random()}`;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(sessionKey, stamp);
        sessionStamp = stamp;
        rememberSessionStamp();
      }
    } catch {
      /* 不保存凭据；跨页通知不可用时由刷新主体检查兜底。 */
    }
  }

  function invalidateSession() {
    markLoggedOut(true);
    setAccessToken(null);
    onSessionChanged?.();
    if (typeof window !== "undefined") window.location.href = loginPath;
  }

  function checkSharedSession() {
    let stamp: string | null;
    try {
      if (typeof localStorage === "undefined") return;
      stamp = localStorage.getItem(sessionKey);
    } catch {
      return;
    }
    if (stamp === sessionStamp) return;
    sessionStamp = stamp;
    rememberSessionStamp();
    invalidateSession();
    throw new SessionChangedError();
  }

  function clearSession() {
    try {
      checkSharedSession();
    } catch {
      return;
    }
    const wasLoggedOut = locallyLoggedOut;
    markLoggedOut(true);
    setAccessToken(null);
    if (!wasLoggedOut) publishSession("logout");
  }

  function setAccessToken(token: string | null) {
    sessionGeneration += 1;
    if (token !== null) {
      markLoggedOut(false);
      publishSession("login");
    }
    // Local logout cannot prove that the rotating Cookie was revoked.
    if (token !== null) {
      unconfirmed = null;
      legacyUnconfirmed = false;
      rememberUnconfirmed(false);
      clearRequest(true);
    } else if (refreshController || requestId || unconfirmed) {
      // Rotation may already be committed; the old generation's catch cannot record it.
      unconfirmed ??= new RefreshUnconfirmedError();
      legacyUnconfirmed = false;
      rememberUnconfirmed(true, true);
    }
    refreshController?.abort();
    refreshController = null;
    accessToken = token;
    refreshingPromise = null;
    retryAttempt = 0;
    refreshNeeded = false;
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
    try {
      checkSharedSession();
      if (locallyLoggedOut) throw new SessionChangedError();
    } catch (error) {
      return Promise.reject(error);
    }
    if (unconfirmed && !legacyUnconfirmed) {
      onRefreshError?.(unconfirmed);
      return Promise.reject(unconfirmed);
    }
    if (refreshingPromise) return refreshingPromise;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      refreshNeeded = true;
      const error = new Error("网络已断开，联网后会自动恢复");
      onRefreshError?.(error);
      return Promise.reject(error);
    }
    const generation = sessionGeneration;
    const assertCurrent = () => {
      checkSharedSession();
      if (generation !== sessionGeneration) throw new SessionChangedError();
    };
    refreshController = new AbortController();
    const deadline = createRequestDeadline(
      10_000,
      "POST",
      refreshController.signal
    );
    const rotate = async () => {
      assertCurrent();
      let stored: string | null = null;
      try {
        stored = requestStorage()?.getItem(requestKey) ?? null;
      } catch {
        /* 使用当前请求键。 */
      }
      const recovering = Boolean(stored || requestId);
      requestId = stored || requestId || crypto.randomUUID();
      if (recovering || legacyUnconfirmed) {
        const capability = await fetch(`${baseUrl}/auth/refresh`, {
          method: "HEAD",
          credentials: "include",
          signal: deadline.signal
        });
        assertCurrent();
        deadline.signal.throwIfAborted();
        if (capability.status >= 500 || capability.status === 429)
          throw new Error("会话连接暂时中断，正在自动恢复");
        recoverySupported =
          capability.ok &&
          capability.headers.get("x-refresh-recovery") === "v1";
        if (
          !recoverySupported ||
          (legacyUnconfirmed &&
            capability.headers.get("x-refresh-current-only") !== "v1")
        )
          throw new RefreshUnconfirmedError();
      }
      try {
        const storage = requestStorage();
        if (storage) storage.setItem(requestKey, requestId);
        else rememberUnconfirmed(true);
      } catch {
        // 请求键无法持久化时，页面重载后不能安全猜测上次的轮换结果。
        rememberUnconfirmed(true);
      }
      return fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Refresh-Request-Id": requestId,
          ...(legacyUnconfirmed ? { "X-Refresh-Current-Only": "v1" } : {})
        },
        signal: deadline.signal
      }).then(async (res) => {
        assertCurrent();
        deadline.signal.throwIfAborted();
        if (!res.ok) throw new HttpError(res.status, "会话刷新失败，请重试");
        recoverySupported = res.headers?.get("x-refresh-recovery") === "v1";
        const data = (await res.json()) as {
          access_token: string;
          expires_in: number;
        };
        assertCurrent();
        deadline.signal.throwIfAborted();
        if (
          typeof data.access_token !== "string" ||
          !data.access_token ||
          !Number.isFinite(data.expires_in) ||
          data.expires_in <= 0
        ) {
          throw new Error("会话刷新响应异常，请重试");
        }
        const identity = tokenIdentity(accessToken);
        if (
          identity !== null &&
          identity !== tokenIdentity(data.access_token)
        ) {
          invalidateSession();
          throw new SessionChangedError();
        }
        accessToken = data.access_token;
        const recovered = refreshNeeded || legacyUnconfirmed;
        unconfirmed = null;
        legacyUnconfirmed = false;
        refreshNeeded = false;
        clearRequest();
        rememberUnconfirmed(false);
        retryAttempt = 0;
        onRefreshError?.(null);
        scheduleRefresh(data.expires_in);
        if (recovered && typeof window !== "undefined")
          window.dispatchEvent(new Event("tsz:session-recovered"));
        return data.access_token;
      });
    };
    const promise = deadline
      .wait(() =>
        typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        navigator.locks
          ? navigator.locks.request(
              `tsz:refresh:${baseUrl}`,
              { signal: deadline.signal },
              rotate
            )
          : rotate()
      )
      .catch((error: unknown) => {
        assertCurrent();
        if (
          error instanceof RefreshUnconfirmedError ||
          (recoverySupported === false &&
            (!(error instanceof HttpError) || error.status >= 500))
        ) {
          unconfirmed = new RefreshUnconfirmedError();
          rememberUnconfirmed(true);
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = null;
          onRefreshError?.(unconfirmed);
          throw unconfirmed;
        }
        if (error instanceof HttpError && error.status < 500) clearRequest();
        if (
          error instanceof HttpError &&
          error.status === 401 &&
          legacyUnconfirmed
        ) {
          unconfirmed = null;
          legacyUnconfirmed = false;
          rememberUnconfirmed(false);
          onRefreshError?.(null);
        }
        if (!(error instanceof HttpError && error.status === 401)) {
          refreshNeeded = true;
          onRefreshError?.(error);
          if (
            !(error instanceof HttpError) ||
            error.status >= 500 ||
            (error.status === 429 && retryAttempt < 3)
          )
            scheduleRetry();
        }
        throw error;
      })
      .finally(() => {
        deadline.dispose();
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
      if (
        refreshNeeded ||
        (accessToken && tokenExpiresAt - Date.now() < 30_000)
      )
        refreshInBackground();
    };
    window.addEventListener("storage", (event) => {
      if (event.key !== sessionKey) return;
      try {
        checkSharedSession();
      } catch {
        // 已清除当前页面身份并导航，不能让事件处理器产生未捕获异常。
      }
    });
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
  }

  return {
    getToken: () => {
      try {
        checkSharedSession();
      } catch {
        // 请求层会检查已递增的代次；可见性事件的只读检查不应抛错。
        return undefined;
      }
      return accessToken ?? undefined;
    },
    getSessionGeneration: () => sessionGeneration,
    setAccessToken,
    clearSession,
    canRestoreSession: () => {
      checkSharedSession();
      return !locallyLoggedOut;
    },
    scheduleRefresh,
    refreshTokens,
    redirectToLogin
  };
}
