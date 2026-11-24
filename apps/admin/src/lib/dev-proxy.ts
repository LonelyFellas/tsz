import { createHash } from "node:crypto";
import type { ProxyOptions } from "vite";

const ADMIN_REFRESH_COOKIE = "admin_refresh_token";
const DEV_REFRESH_PREFIX = `${ADMIN_REFRESH_COOKIE}_vite_`;

export const DEFAULT_ADMIN_BACKEND_API_URL = "http://localhost:8383/api/v1";

/** 构造 admin dev server 的同源 API 代理；纯函数便于锁定默认 tsz-rust 端口。 */
export function buildAdminDevProxy(
  backendApiUrl = DEFAULT_ADMIN_BACKEND_API_URL
): { "/api/v1": ProxyOptions & { rewrite: (path: string) => string } } {
  let backend: URL;
  try {
    backend = new URL(backendApiUrl);
  } catch {
    throw new Error(
      `[vite] BACKEND_API_URL 不是合法 URL：${backendApiUrl}。请写成含协议与 API 基址的完整地址，如 ${DEFAULT_ADMIN_BACKEND_API_URL}`
    );
  }

  if (
    (backend.protocol !== "http:" && backend.protocol !== "https:") ||
    backend.origin === "null"
  ) {
    throw new Error(
      `[vite] BACKEND_API_URL 缺少 http(s) 协议或 origin 非法：${backendApiUrl}。请写成含协议的完整地址，如 ${DEFAULT_ADMIN_BACKEND_API_URL}`
    );
  }

  const backendBasePath = backend.pathname.replace(/\/$/, "");
  if (!backendBasePath) {
    throw new Error(
      `[vite] BACKEND_API_URL 缺少路径前缀：${backendApiUrl}。请写成含 API 基址的完整地址，如 ${backend.origin}/api/v1`
    );
  }

  const backendId = createHash("sha256")
    .update(backend.origin + backendBasePath)
    .digest("hex")
    .slice(0, 16);
  const devCookieName = (port: number | undefined) =>
    port === undefined
      ? undefined
      : `${DEV_REFRESH_PREFIX}${port}_${backendId}`;

  return {
    "/api/v1": {
      target: backend.origin,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/v1/, backendBasePath),
      cookieDomainRewrite: "",
      // Cookie 按主机共享，不区分端口；刷新锁和请求键按 origin 隔离。
      bypass(req) {
        if (!req.headers.cookie) return;
        const scopedName = devCookieName(req.socket.localPort);
        const cookies: string[] = [];
        for (const pair of req.headers.cookie.split(/;\s*/u)) {
          const separator = pair.indexOf("=");
          if (separator <= 0) continue;
          const name = pair.slice(0, separator).trim();
          if (scopedName && name === scopedName) {
            cookies.push(ADMIN_REFRESH_COOKIE + pair.slice(separator));
          } else if (
            name !== ADMIN_REFRESH_COOKIE &&
            !name.startsWith(DEV_REFRESH_PREFIX)
          ) {
            cookies.push(pair);
          }
        }
        if (cookies.length) req.headers.cookie = cookies.join("; ");
        else delete req.headers.cookie;
      },
      configure(proxy) {
        proxy.on("proxyRes", (response, request) => {
          const cookies = response.headers["set-cookie"];
          if (!cookies) return;
          const scopedName = devCookieName(request.socket.localPort);
          response.headers["set-cookie"] = cookies.flatMap((cookie) => {
            if (!cookie.startsWith(`${ADMIN_REFRESH_COOKIE}=`)) return [cookie];
            return scopedName
              ? [scopedName + cookie.slice(ADMIN_REFRESH_COOKIE.length)]
              : [];
          });
        });
      }
    }
  };
}
