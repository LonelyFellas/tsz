// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";

// access token 存内存：页面刷新后需重新通过 /auth/refresh 恢复会话。
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
  const delay = Math.max((expiresIn - 30) * 1000, 0);
  refreshTimer = setTimeout(async () => {
    try {
      await refreshTokens();
      // refreshTokens 成功后内部已调用 scheduleRefresh(data.expires_in)，无需重复。
    } catch {
      // 刷新失败（401）→ onSessionExpired 会跳转登录页，定时器自然结束。
    }
  }, delay);
}

const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;

// 单例 Promise：多个并发请求同时触发刷新时，共享同一次网络请求，避免竞态。
let refreshingPromise: Promise<string> | null = null;

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
  onSessionExpired: () => {
    setAccessToken(null); // 同时清除定时器
    if (typeof window !== "undefined") window.location.href = "/login";
  }
});

export const api = createEndpoints(http);
