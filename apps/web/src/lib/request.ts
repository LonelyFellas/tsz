// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";

// access token 存内存：页面刷新后需重新通过 /auth/refresh 恢复会话。
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let tokenExpiresAt = 0; // Unix ms，token 过期时间，用于可见性检测

export function setAccessToken(token: string | null) {
  accessToken = token;
  // token 清除时同步取消定时器，防止已登出后仍触发刷新。
  if (!token) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * 在 expiresIn 秒后（提前 30 秒）自动触发 refreshTokens()。
 * 刷新成功后用新的 expires_in 重新排期，形成自滚动定时器。
 * 每次调用会先取消上一个定时器，保证同一时刻只有一个在跑。
 */
export function scheduleRefresh(expiresIn: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  const delay = (expiresIn - 30) * 1000;
  if (!(delay > 0)) return; // guards NaN and ≤ 0; let 401-retry handle expired tokens
  refreshTimer = setTimeout(async () => {
    try {
      await refreshTokens();
      // refreshTokens 成功后内部已调用 scheduleRefresh(data.expires_in)，无需重复。
    } catch {
      redirectToLogin();
    }
  }, delay);
}

const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;

// 单例 Promise：多个并发请求同时触发刷新时，共享同一次网络请求，避免竞态。
let refreshingPromise: Promise<string> | null = null;

export function redirectToLogin() {
  setAccessToken(null); // 同时取消定时器
  if (typeof window !== "undefined") window.location.href = "/login";
}

export function refreshTokens(): Promise<string> {
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

const http = createHttpClient({
  baseUrl,
  getToken: () => accessToken ?? undefined,
  onRefresh: refreshTokens,
  onSessionExpired: redirectToLogin
});

export const api = createEndpoints(http);

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
