// 浏览器可见的 API 基址。默认走同源 /api/v1（由 next.config rewrites 代理到后端），
// 保证 refresh 的 HttpOnly cookie 与请求同源，浏览器才会自动携带。
// Next 仅在「字面量引用」时内联 NEXT_PUBLIC_*，故不可用 process.env 动态键。
export const env = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"
};
