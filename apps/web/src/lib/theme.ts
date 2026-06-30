// 主题内核（纯逻辑，无 React、无 "use client"）。
// 机制：明/暗由 <html class="dark"> 控制；用户选择存 localStorage,
// 未选择时跟随系统。首屏前置脚本在 paint 前就把 class 打好,杜绝闪烁(FOUC)。

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "tsz-theme";

// 系统是否处于深色（matchMedia 不可用时——如 jsdom——回退为浅色）。
function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// 解析为最终生效的明/暗（system 时读系统偏好）。
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

// 把生效主题落到 <html> 上。
export function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}

// 按当前选择把生效主题重新写到 <html>，返回生效值。
// 用于「水合之后」重新断言——React 水合 <html> 时会把前置脚本加的 class 剥掉,
// 这里在 layout effect 里再补一次,保证视觉与状态一致(且不闪)。
export function syncThemeToDom(): ResolvedTheme {
  const resolved = resolveTheme(getStoredTheme());
  applyResolvedTheme(resolved);
  return resolved;
}

// 首屏前置脚本:同步运行于 <body> 顶部、首帧 paint 之前。
// 读 localStorage / 系统偏好并立即给 <html> 加 class,避免明暗闪烁。
// 保持极简且自包含（不能引用模块作用域,会被内联进 HTML 字符串）。
export const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

// ---- 轻量外部 store（真值源:<html> class 与 localStorage）----
// 逻辑全在普通函数里(便于单测);useTheme 用 useState+useEffect 订阅,
// 回调里才 setState —— 不在 effect 同步体里 setState,故不会级联渲染。

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

/** 读取用户已保存的选择;未保存即 system。 */
export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** 当前生效明暗 —— 直接读 <html> 的 class（前置脚本已保证正确）。
    服务端无 document,回退 light（hydration 后由客户端校正）。 */
export function getResolvedFromDom(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** 写入选择:落 localStorage + 更新 <html> + 通知订阅者。 */
export function setTheme(next: Theme) {
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* 隐私模式等场景下忽略持久化失败 */
  }
  applyResolvedTheme(resolveTheme(next));
  emit();
}

/** 订阅主题变化:本标签的 setTheme、跨标签 storage、system 模式下的系统配色。
    返回取消订阅函数(供 useEffect 清理)。 */
export function subscribeTheme(cb: Listener): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    applyResolvedTheme(resolveTheme(getStoredTheme()));
    emit();
  };
  const onMedia = () => {
    if (getStoredTheme() !== "system") return;
    applyResolvedTheme(resolveTheme("system"));
    emit();
  };
  window.addEventListener("storage", onStorage);
  // matchMedia 在部分测试环境(jsdom)缺失,缺失时跳过系统配色订阅。
  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  mq?.addEventListener("change", onMedia);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    mq?.removeEventListener("change", onMedia);
  };
}
