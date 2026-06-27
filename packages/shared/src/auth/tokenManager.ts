// 内存 access token 管理 + 主动刷新定时器 + refresh cookie 续期。
// 运行环境无关：各应用注入 baseUrl，token 不落 localStorage（仅内存）。

export interface TokenManager {
  /** 每次受保护请求动态取当前 access token。 */
  getToken: () => string | undefined;
  /** 写入 / 清除内存 token；清除时同步取消刷新定时器。 */
  setAccessToken: (token: string | null) => void;
  /** 在 expiresIn 秒后（提前 30 秒）自动刷新，形成自滚动定时器。 */
  scheduleRefresh: (expiresIn: number) => void;
  /** 用 refresh cookie 换取新 access token；并发调用共享同一次请求。 */
  refreshTokens: () => Promise<string>;
  /** 清 token 并跳登录页（refresh 彻底失败时）。 */
  redirectToLogin: () => void;
}

export interface TokenManagerOptions {
  baseUrl: string;
  /** refresh 失败后跳转的登录页路径。默认 /login。 */
  loginPath?: string;
}

export function createTokenManager({
  baseUrl,
  loginPath = "/login"
}: TokenManagerOptions): TokenManager {
  // access token 存内存：页面刷新后需重新通过 /auth/refresh 恢复会话。
  let accessToken: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let tokenExpiresAt = 0; // Unix ms，token 过期时间，用于可见性检测
  // 单例 Promise：多个并发请求同时触发刷新时，共享同一次网络请求，避免竞态。
  let refreshingPromise: Promise<string> | null = null;

  function setAccessToken(token: string | null) {
    accessToken = token;
    // token 清除时同步取消定时器，防止已登出后仍触发刷新。
    if (!token) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function redirectToLogin() {
    setAccessToken(null); // 同时取消定时器
    if (typeof window !== "undefined") window.location.href = loginPath;
  }

  function refreshTokens(): Promise<string> {
    if (refreshingPromise) return refreshingPromise;

    refreshingPromise = fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("refresh failed");
        const data = (await res.json()) as {
          access_token: string;
          expires_in: number;
        };
        setAccessToken(data.access_token);
        scheduleRefresh(data.expires_in); // 用后端返回的 expires_in 重新排期
        return data.access_token;
      })
      .finally(() => {
        refreshingPromise = null;
      });

    return refreshingPromise;
  }

  /**
   * 在 expiresIn 秒后（提前 30 秒）自动触发 refreshTokens()。
   * 刷新成功后用新的 expires_in 重新排期。每次调用先取消上一个定时器，
   * 保证同一时刻只有一个在跑。
   */
  function scheduleRefresh(expiresIn: number) {
    if (refreshTimer) clearTimeout(refreshTimer);
    tokenExpiresAt = Date.now() + expiresIn * 1000;
    const delay = (expiresIn - 30) * 1000;
    if (!(delay > 0)) return; // guards NaN and ≤ 0; let 401-retry handle expired tokens
    refreshTimer = setTimeout(() => {
      refreshTokens().catch(redirectToLogin);
    }, delay);
  }

  // 页面从后台切回前台时，检查 token 是否已过期或即将过期，是则立即刷新。
  // 解决浏览器对后台标签页节流 setTimeout 导致定时器不准时的问题。
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && accessToken) {
        if (tokenExpiresAt - Date.now() < 30_000) {
          refreshTokens().catch(redirectToLogin);
        }
      }
    });
  }

  return {
    getToken: () => accessToken ?? undefined,
    setAccessToken,
    scheduleRefresh,
    refreshTokens,
    redirectToLogin
  };
}
