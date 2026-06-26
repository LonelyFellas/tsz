// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";
import { TOKEN_COOKIE } from "./constants";

const REFRESH_COOKIE = "tsz_refresh_token";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}`;
}

const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;

const http = createHttpClient({
  baseUrl,
  getToken: () => getCookie(TOKEN_COOKIE),
  onRefresh: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) throw new Error("no refresh token");

    // 直接 fetch 避免循环调用自身(retrying 标志只保护一层,这里绕过 http 实例)
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!res.ok) throw new Error("refresh failed");

    const { access_token, refresh_token } = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };

    setCookie(TOKEN_COOKIE, access_token, 900); // 15 min
    setCookie(REFRESH_COOKIE, refresh_token, 60 * 60 * 24 * 30); // 30 days

    return access_token;
  },
  onSessionExpired: () => {
    // 清除 token 后跳登录页
    setCookie(TOKEN_COOKIE, "", 0);
    setCookie(REFRESH_COOKIE, "", 0);
    window.location.href = "/login";
  }
});

export const api = createEndpoints(http);
