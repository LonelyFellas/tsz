// 后端英文错误 → 中文文案。web 与 admin 共用。

// 会话相关的通用后端错误，登录/注册/刷新都会遇到。
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
