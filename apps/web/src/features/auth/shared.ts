import {
  lookupWebNotice,
  webCommon,
  originalText,
  webErrorText,
  localText,
  type WebNotice
} from "@/i18n/catalog";

import { HttpError, type AuthResponse } from "@tsz/api-client";

import {
  passwordLengthErrorCode,
  displayNameErrorCode,
  PASSWORD_MIN_LENGTH
} from "@tsz/shared";

import { safeRedirectPath } from "@tsz/shared/auth";
import type { Role } from "@tsz/types";
import { api, persistSession as persistRuntimeSession } from "@/lib/request";
import { useUserStore } from "@/stores/user";

// 保留现有 legacy 错误分类；Web 返回显式本地消息，未知服务端文字保持原文。
export function translateAuthError(
  error: unknown,
  map: Record<string, WebNotice>,
  fallback: WebNotice
): WebNotice {
  const msg =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const common: Record<string, WebNotice> = {
    "session expired": localText(webCommon, "webCommon:session_expired"),
    "missing refresh token": localText(webCommon, "webCommon:session_expired"),
    "invalid refresh token": localText(webCommon, "webCommon:session_expired"),
    "not found": localText(webCommon, "webCommon:feature_unavailable")
  };
  return (
    lookupWebNotice(map, msg.toLowerCase().trim()) ??
    lookupWebNotice(common, msg.toLowerCase().trim()) ??
    (error instanceof Error
      ? webErrorText(error, fallback)
      : msg
        ? originalText(msg)
        : fallback)
  );
}
export function passwordErrorMessage(
  code: string | undefined
): WebNotice | undefined {
  const messages: Record<string, WebNotice> = {
    password_missing: localText(webCommon, "webCommon:password_required"),
    password_too_short: localText(webCommon, "webCommon:password_short"),
    password_too_long: localText(webCommon, "webCommon:password_long"),
    password_too_weak: localText(webCommon, "webCommon:password_weak"),
    password_compromised: localText(
      webCommon,
      "webCommon:password_compromised"
    ),
    password_unchanged: localText(webCommon, "webCommon:password_unchanged"),
    password_hash_unavailable: localText(
      webCommon,
      "webCommon:shared_the_password_service_is_unavailable_try_again_later"
    )
  };
  return lookupWebNotice(messages, code);
}
export function passwordLengthError(value: string): WebNotice | null {
  const code = passwordLengthErrorCode(value);
  return code ? (passwordErrorMessage(code) ?? null) : null;
}
export function displayNameError(value: string): WebNotice | null {
  const code = displayNameErrorCode(value);
  const messages = {
    display_name_required: localText(
      webCommon,
      "webCommon:shared_use_1_50_characters_for_your_nickname"
    ),
    display_name_too_long: localText(
      webCommon,
      "webCommon:shared_your_nickname_must_not_exceed_50_characters"
    ),
    display_name_forbidden: localText(
      webCommon,
      "webCommon:shared_your_nickname_cannot_contain_or_invisible_characters"
    )
  };
  return code ? messages[code] : null;
}
export const WEB_PASSWORD_HINT = localText(
  webCommon,
  "webCommon:shared_15_128_characters_case_sensitive_symbols_and_spaces_allowed"
);

/** 新用户引导页路径（选择难度等级 + 英式/美式）。 */
export const ONBOARDING_PATH = "/onboarding";

export const AUTH_PASSWORD_HINT = localText(
  webCommon,
  "webCommon:shared_use_at_least_v0_characters_for_your_password",
  {
    v0: PASSWORD_MIN_LENGTH
  }
);

// 登录 / 注册表单共用的输入框样式。
export const AUTH_INPUT_CLASS =
  "min-h-12 w-full rounded-full border border-border bg-surface px-5 py-3 text-sm text-foreground outline-hidden transition-shadow placeholder:text-foreground-subtle focus:border-primary/50 focus:ring-4 focus:ring-primary/15 aria-invalid:border-danger";

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

export function securityErrorMessage(error: unknown): WebNotice {
  if (!(error instanceof HttpError))
    return localText(
      webCommon,
      "webCommon:shared_network_error_try_again_later"
    );
  const passwordMessage = passwordErrorMessage(error.code);
  if (passwordMessage) return passwordMessage;
  const messages: Record<string, WebNotice> = {
    invalid_otp_code: localText(
      webCommon,
      "webCommon:shared_incorrect_or_expired_code_request_all_required_codes_again"
    ),
    invalid_identifier: localText(
      webCommon,
      "webCommon:shared_contact_details_are_invalid_unbound_or_unchanged_check_and_try_again"
    ),
    password_hash_unavailable: localText(
      webCommon,
      "webCommon:shared_the_password_service_is_unavailable_try_again_later"
    ),
    invalid_credentials: localText(
      webCommon,
      "webCommon:shared_incorrect_current_password_try_again"
    ),
    invalid_token: localText(
      webCommon,
      "webCommon:shared_your_session_expired_sign_in_again_to_continue"
    ),
    user_already_exists: localText(
      webCommon,
      "webCommon:shared_this_contact_method_is_used_by_another_account"
    ),
    login_rate_limited: localText(
      webCommon,
      "webCommon:shared_too_many_sign_in_attempts_try_again_later"
    ),
    login_unavailable: localText(
      webCommon,
      "webCommon:shared_sign_in_is_unavailable_try_again_later"
    ),
    otp_rate_limited: localText(
      webCommon,
      "webCommon:shared_too_many_code_requests_try_again_later"
    ),
    otp_unavailable: localText(
      webCommon,
      "webCommon:shared_verification_codes_are_unavailable_try_again_later_3"
    ),
    invalid_password: localText(
      webCommon,
      "webCommon:shared_use_15_128_characters_case_sensitive_symbols_and_spaces_allowed"
    ),
    account_disabled: localText(
      webCommon,
      "webCommon:shared_this_account_is_disabled_contact_support_2"
    ),
    forbidden: localText(
      webCommon,
      "webCommon:shared_you_cannot_remove_your_last_sign_in_method"
    ),
    phone_binding_required: localText(
      webCommon,
      "webCommon:shared_verify_and_bind_a_phone_number_first"
    ),
    phone_unbind_forbidden: localText(
      webCommon,
      "webCommon:shared_a_phone_number_cannot_be_unbound_use_change_phone_number_instead"
    ),
    revision_conflict: localText(
      webCommon,
      "webCommon:shared_your_account_details_have_changed_reload_and_try_again"
    )
  };
  return lookupWebNotice(messages, error.code) ?? webErrorText(error, "");
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
