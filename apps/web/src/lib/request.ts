// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";

// access token 存内存：页面刷新后需重新通过 /auth/refresh 恢复会话。
let accessToken: string | null = null;
let tokenExpiresAt: number | null = null; // Unix ms

export function setAccessToken(token: string | null) {
  accessToken = token;
  tokenExpiresAt = token ? parseJwtExpiry(token) : null;
}

function parseJwtExpiry(jwt: string): number | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]!)) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// 提前 5 分钟主动刷新，与后端 15 分钟 TTL 配合。
const REFRESH_BEFORE_MS = 5 * 60 * 1000;

function isExpiringSoon(): boolean {
  return (
    tokenExpiresAt !== null && Date.now() >= tokenExpiresAt - REFRESH_BEFORE_MS
  );
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
      const { access_token } = (await res.json()) as { access_token: string };
      setAccessToken(access_token);
      return access_token;
    })
    .finally(() => {
      refreshingPromise = null;
    });

  return refreshingPromise;
}

const http = createHttpClient({
  baseUrl,
  getToken: async () => {
    if (accessToken && isExpiringSoon()) {
      try {
        // 主动刷新：当前 token 未过期但即将到期，提前换新，做到无感刷新。
        return await refreshTokens();
      } catch {
        // 主动刷新失败则用现有 token 继续，让后续 401 走被动刷新路径。
      }
    }
    return accessToken ?? undefined;
  },
  // 被动刷新：收到 401 时复用同一个 refreshTokens()，竞态保护同样生效。
  onRefresh: refreshTokens,
  onSessionExpired: () => {
    setAccessToken(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  }
});

export const api = createEndpoints(http);
