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
