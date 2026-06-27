import type { AuthResponse } from "@tsz/api-client";
import { api, setAccessToken, scheduleRefresh } from "@/lib/request";
import { useUserStore } from "@/stores/user";

/** 新用户引导页路径（选择难度等级 + 英式/美式）。 */
export const ONBOARDING_PATH = "/onboarding";

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

/** 登录 / 注册成功后，将 access token 存入内存并启动主动刷新定时器。 */
export function persistSession(
  auth: Pick<AuthResponse, "access_token" | "expires_in">
): void {
  setAccessToken(auth.access_token);
  scheduleRefresh(auth.expires_in);
}

/**
 * 登录 / 注册成功后的统一跳转决策：
 * 拉取 /me 判断是否新用户（未完成 onboarding），新用户先进引导页，
 * 老用户进目标页（redirect 或首页）。同时把用户态写入全局 store。
 */
export async function navigateAfterAuth(
  push: (href: string) => void,
  redirect = "/"
): Promise<void> {
  const me = await api.auth.me();
  const { setUser, setOnboarded } = useUserStore.getState();
  setUser(me.user);
  setOnboarded(me.onboarded);
  push(me.onboarded ? redirect : ONBOARDING_PATH);
}
