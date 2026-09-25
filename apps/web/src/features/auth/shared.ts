import type { AuthResponse } from "@tsz/api-client";
import { safeRedirectPath } from "@tsz/shared/auth";
import { api, setAccessToken, scheduleRefresh } from "@/lib/request";
import { useUserStore } from "@/stores/user";

// 后端错误翻译下沉到 @tsz/shared/auth（与 admin 共用通用会话错误映射）。
export { translateAuthError } from "@tsz/shared/auth";

/** 新用户引导页路径（选择难度等级 + 英式/美式）。 */
export const ONBOARDING_PATH = "/onboarding";

// 登录 / 注册表单共用的输入框样式。
export const AUTH_INPUT_CLASS =
  "w-full rounded-full border border-border bg-surface px-4 py-3 text-sm text-foreground outline-hidden placeholder:text-foreground-subtle focus:border-primary focus:ring-1 focus:ring-primary";

/** 登录 / 注册成功后，将 access token 存入内存并启动主动刷新定时器。 */
export function persistSession(
  auth: Pick<AuthResponse, "access_token" | "expires_in">
): void {
  setAccessToken(auth.access_token);
  scheduleRefresh(auth.expires_in);
}

/** 认证成功后一次性发布完整用户态；导航只由 GuestGuard 执行。 */
export async function completeAuthentication(): Promise<void> {
  const me = await api.auth.me();
  useUserStore.getState().setSession(me.user, me.onboarded);
}

export function postAuthPath(
  onboarded: boolean,
  redirect: string | null
): string {
  if (!onboarded) return ONBOARDING_PATH;
  const target = safeRedirectPath(redirect);
  const pathname = decodeURIComponent(target.split(/[?#]/)[0]!);
  // 登录/注册/找回密码共享访客守卫，回跳到这些页面会形成导航循环。
  return /^\/(login|register|forgot-password)(\/|$)/i.test(pathname)
    ? "/"
    : target;
}
