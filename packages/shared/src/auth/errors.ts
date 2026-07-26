// 后端英文错误 → 中文文案。web 与 admin 共用。

// 会话相关的通用后端错误，登录/注册/刷新都会遇到。
const COMMON_ERRORS: Record<string, string> = {
  "session expired": "登录已过期，请重新登录",
  "missing refresh token": "登录已过期，请重新登录",
  "invalid refresh token": "登录已过期，请重新登录",
  // tsz-rust 重写过渡期:部分界面可达的端点后端尚未实现(api-client 契约测试
  // PENDING 白名单),404 时 http 层落到 statusText "Not Found"——给中文兜底,
  // 避免英文原文透传给用户。后端补齐、白名单清空后可删。
  "not found": "该功能暂未开放，敬请期待"
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
