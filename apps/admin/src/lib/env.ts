// 浏览器可见的 API 基址。默认走同源 /api/v1（dev 由 vite.config 的 proxy 代理、
// prod 由 nginx 在子域层代理到后端），保证 refresh 的 HttpOnly cookie 与请求同源。
// Vite 仅暴露以 VITE_ 前缀的前端变量（import.meta.env.VITE_*）。
export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1"
};
