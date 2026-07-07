// 可靠复制到剪贴板：真正校验是否复制成功，两级降级都失败时返回 false。
//
// 为什么不用 antd Typography 的 copyable：其内核复制在 navigator.clipboard 缺失
// 与 execCommand 失败时只返回 false 不抛异常，而 antd 仍无条件 setCopied(true)，
// UI 恒亮「已复制」。用于一次性临时密码时会让操作者误以为已复制、关窗后永久丢密码。
// 故这里自持复制逻辑，把真实成败交回调用方决定提示文案。见 project_insecure_context_browser_api。

/**
 * 复制文本到系统剪贴板。
 * @returns 是否复制成功。任一环节失败均返回 false（绝不谎报成功）。
 */
export async function copyText(text: string): Promise<boolean> {
  // 优先异步 Clipboard API：仅在安全上下文暴露（tshb-test 裸 IP HTTP 为非安全上下文，缺失）。
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒或写入异常，继续降级到 execCommand。
    }
  }
  return legacyCopy(text);
}

/**
 * document.execCommand('copy') 降级：非安全上下文下主流浏览器仍支持。
 * 用离屏 textarea 承载文本并选中，复制后移除；execCommand 的返回值即真实成败。
 */
function legacyCopy(text: string): boolean {
  // jsdom / 老环境可能没有 execCommand，直接判失败。
  if (typeof document.execCommand !== "function") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // 移出视口且不可见，避免复制时页面滚动/闪烁。
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}
