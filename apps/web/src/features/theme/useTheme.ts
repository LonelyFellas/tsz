"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  getStoredTheme,
  resolveTheme,
  setTheme as setThemeStore,
  subscribeTheme,
  syncThemeToDom,
  type ResolvedTheme,
  type Theme
} from "@/lib/theme";

// 客户端主题 hook,基于 useSyncExternalStore:
// - 服务端/水合快照恒为默认值(system → light),与 SSR HTML 逐字节一致,
//   不会水合失配(旧实现在惰性初始化里读 localStorage,存了暗色的用户
//   首帧就渲染太阳图标,与服务端月亮图标结构不同 → 整树水合失败);
// - 水合完成后 React 自动改用真实快照(localStorage)重渲染 —— 官方机制,
//   不在 effect 同步体里 setState(满足 lint),也不读 <html> class
//   (React 水合会把前置脚本加的 class 剥掉,读 DOM 会拿到错值)。
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    getStoredTheme,
    () => "system"
  );
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribeTheme,
    () => resolveTheme(getStoredTheme()),
    () => "light"
  );

  useEffect(() => {
    // 水合后重新断言 DOM(前置脚本加的 class 已被水合剥掉,补一次)。
    syncThemeToDom();
  }, []);

  const setTheme = useCallback((next: Theme) => setThemeStore(next), []);

  // 在明/暗之间直接翻转（点一下即固化为显式选择）。
  const toggle = useCallback(
    () => setThemeStore(resolved === "dark" ? "light" : "dark"),
    [resolved]
  );

  return { theme, resolved, setTheme, toggle };
}
