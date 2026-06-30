"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getStoredTheme,
  resolveTheme,
  setTheme as setThemeStore,
  subscribeTheme,
  syncThemeToDom,
  type ResolvedTheme,
  type Theme
} from "@/lib/theme";

// 客户端主题 hook。
// 状态从「已保存的选择」派生(resolveTheme(stored))——不读 <html> class,
// 因为 React 水合会把前置脚本加的 class 剥掉,读 DOM 会拿到错值导致按钮脱节。
// - 惰性初始化:SSR 取不到 localStorage → system → light;客户端读真实选择。
// - effect 内只在订阅回调里 setState(非同步体),无级联渲染,且满足 lint。
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme())
  );

  useEffect(() => {
    // 水合后再断言一次 DOM(惰性初始化已对齐 React 状态,故此处只补 DOM)。
    syncThemeToDom();
    return subscribeTheme(() => {
      setThemeState(getStoredTheme());
      setResolved(resolveTheme(getStoredTheme()));
    });
  }, []);

  const setTheme = useCallback((next: Theme) => setThemeStore(next), []);

  // 在明/暗之间直接翻转（点一下即固化为显式选择）。
  const toggle = useCallback(
    () => setThemeStore(resolved === "dark" ? "light" : "dark"),
    [resolved]
  );

  return { theme, resolved, setTheme, toggle };
}
