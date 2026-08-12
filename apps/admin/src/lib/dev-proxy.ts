export const DEFAULT_ADMIN_BACKEND_API_URL = "http://localhost:8383/api/v1";

/** 构造 admin dev server 的同源 API 代理；纯函数便于锁定默认 tsz-rust 端口。 */
export function buildAdminDevProxy(
  backendApiUrl = DEFAULT_ADMIN_BACKEND_API_URL
) {
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

  return {
    "/api/v1": {
      target: backend.origin,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api\/v1/, backendBasePath),
      cookieDomainRewrite: ""
    }
  };
}
