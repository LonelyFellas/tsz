import { HttpError, type AuthResponse } from "@tsz/api-client";
import { passwordErrorMessage } from "@tsz/shared/auth";
import { PASSWORD_MIN_LENGTH } from "@tsz/shared";
import { safeRedirectPath } from "@tsz/shared/auth";
import type { Role } from "@tsz/types";
import { api, persistSession as persistRuntimeSession } from "@/lib/request";
import { useUserStore } from "@/stores/user";

// 后端错误翻译下沉到 @tsz/shared/auth（与 admin 共用通用会话错误映射）。
export { translateAuthError } from "@tsz/shared/auth";

/** 新用户引导页路径（选择难度等级 + 英式/美式）。 */
export const ONBOARDING_PATH = "/onboarding";

export const AUTH_PASSWORD_HINT = `密码至少 ${PASSWORD_MIN_LENGTH} 位`;

// 登录 / 注册表单共用的输入框样式。
export const AUTH_INPUT_CLASS =
  "w-full rounded-full border border-border bg-surface px-4 py-3 text-sm text-foreground outline-hidden placeholder:text-foreground-subtle focus:border-primary focus:ring-1 focus:ring-primary";

/** 登录 / 注册成功后，将 access token 存入内存并启动主动刷新定时器。 */
export function persistSession(
  auth: Pick<AuthResponse, "access_token" | "expires_in">
): void {
  persistRuntimeSession(auth);
}

/** 认证成功后一次性发布完整用户态；导航只由 GuestGuard 执行。 */
export async function completeAuthentication(
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return;
  const me = await api.auth.me({ signal });
  if (signal?.aborted) return;
  useUserStore.getState().setSession(me.user, me.onboarded);
}

export function securityErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return "网络异常，请稍后重试";
  const passwordMessage = passwordErrorMessage(error.code);
  if (passwordMessage) return passwordMessage;
  const messages: Record<string, string> = {
    invalid_otp_code: "验证码错误或已失效，请重新获取所需的全部验证码",
    invalid_identifier:
      "联系方式无效、尚未绑定或与当前联系方式相同，请检查后重试",
    password_hash_unavailable: "密码服务暂不可用，请稍后再试",
    invalid_credentials: "当前密码错误，请重试",
    invalid_token: "登录已失效，请重新登录后操作",
    user_already_exists: "该联系方式已被其他账号使用",
    otp_rate_limited: "验证码发送过于频繁，请稍后再试",
    otp_unavailable: "验证码服务暂不可用，请稍后再试",
    invalid_password: "密码须为 15–128 个字符，区分大小写，支持符号和空格",
    account_disabled: "账号已停用，请联系平台客服",
    forbidden: "不能移除最后一种登录方式",
    phone_binding_required: "请先验证并绑定手机号",
    phone_unbind_forbidden: "手机号不能解绑，请使用换绑手机号",
    revision_conflict: "账号信息已变化，请刷新页面后重试"
  };
  return messages[error.code ?? ""] ?? "操作失败，请稍后重试";
}

export function postAuthPath(
  onboarded: boolean,
  redirect: string | null,
  roles: readonly Role[] = []
): string {
  const target = safeRedirectPath(redirect);
  const pathname = decodeURIComponent(target.split(/[?#]/)[0]!);
  const teacherReturn =
    roles.includes("teacher") && /^\/teacher(\/|$)/.test(pathname);
  if (
    !onboarded &&
    !teacherReturn &&
    pathname !== "/account/coins" &&
    pathname !== "/account/invitations" &&
    pathname !== "/student/coins" &&
    pathname !== "/wordlists/new" &&
    pathname !== "/account/wordlist-tips" &&
    !/^\/wordlists\/[^/]+$/.test(pathname) &&
    !/^\/account\/wordlists(\/|$)/.test(pathname)
  ) {
    return target === "/"
      ? ONBOARDING_PATH
      : `${ONBOARDING_PATH}?redirect=${encodeURIComponent(target)}`;
  }
  // 完成后的回跳不能再次落入认证或引导流程。
  return /^\/(login|register|forgot-password|onboarding|bind-phone)(\/|$)/i.test(
    pathname
  )
    ? "/"
    : target;
}
