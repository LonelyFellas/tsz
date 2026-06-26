// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";

// access token 存内存：页面刷新后需重新通过 /auth/refresh 恢复会话。
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}

const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;

const http = createHttpClient({
  baseUrl,
  getToken: () => accessToken ?? undefined,
  onRefresh: async () => {
    // refresh token 由 HttpOnly cookie 自动携带，无需手动读取或传递。
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    });

    if (!res.ok) throw new Error("refresh failed");

    const { access_token } = (await res.json()) as { access_token: string };
    setAccessToken(access_token);
    return access_token;
  },
  onSessionExpired: () => {
    setAccessToken(null);
    window.location.href = "/login";
  }
});

export const api = createEndpoints(http);
