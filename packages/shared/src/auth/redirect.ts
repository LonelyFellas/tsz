import type { User } from "@tsz/types";

/** 只接受站内绝对路径；按浏览器规则规范化后仍不能成为外站地址。 */
export function safeRedirectPath(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }

  const origin = "https://redirect.invalid";
  try {
    const url = new URL(value, origin);
    const pathname = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      pathname.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(pathname)
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** 未绑定手机号的账号必须先完成补绑；不影响游客。 */
export function needsPhoneBinding(user: Pick<User, "phone"> | null): boolean {
  return user !== null && !user.phone;
}

export function phoneBindingPath(redirect: string | null): string {
  const safe = safeRedirectPath(redirect);
  const pathname = decodeURIComponent(safe.split(/[?#]/)[0]!);
  const target =
    /^\/(login|register|forgot-password|onboarding|bind-phone)(\/|$)/i.test(
      pathname
    )
      ? "/"
      : safe;
  return target === "/"
    ? "/bind-phone"
    : `/bind-phone?redirect=${encodeURIComponent(target)}`;
}

/** 账号退出/注销和公开协议始终可达，认证页由访客守卫处理。 */
export function phoneBindingRedirect(
  user: Pick<User, "phone"> | null,
  pathname: string
): string | null {
  if (
    !needsPhoneBinding(user) ||
    [
      "/bind-phone",
      "/account/delete",
      "/login",
      "/register",
      "/forgot-password",
      "/privacy",
      "/terms"
    ].includes(pathname)
  )
    return null;
  return phoneBindingPath(pathname);
}
