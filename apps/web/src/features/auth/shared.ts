import type { AuthResponse } from "@tsz/api-client";
import { setAccessToken } from "@/lib/request";

// 登录 / 注册表单共用的输入框样式。
export const AUTH_INPUT_CLASS =
  "w-full rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

// 会话相关的通用后端错误，登录注册都会遇到。
const COMMON_ERRORS: Record<string, string> = {
  "session expired": "登录已过期，请重新登录",
  "missing refresh token": "登录已过期，请重新登录",
  "invalid refresh token": "登录已过期，请重新登录"
};

/**
 * 把后端英文错误翻译成中文文案。
 * 优先用调用方传入的 `map`，再回退到通用映射，最后回退到原文 / 兜底文案。
 */
export function translateAuthError(
  msg: string,
  map: Record<string, string>,
  fallback: string
): string {
  const key = msg.toLowerCase().trim();
  return map[key] ?? COMMON_ERRORS[key] ?? (msg || fallback);
}

/** 登录 / 注册成功后，将 access token 存入内存。refresh token 由 HttpOnly cookie 自动管理。 */
export function persistSession(auth: Pick<AuthResponse, "access_token">): void {
  setAccessToken(auth.access_token);
}
