"use client";

import { useTheme } from "./useTheme";

// 明/暗切换按钮。Apple 风圆形细描边,点击在两套主题间翻转。
// 图标由 useTheme 驱动:SSR 用浅色快照,hydration 后以真实主题重渲染;
// 按钮带 suppressHydrationWarning,避免明/暗不一致时的 hydration 警告。
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      suppressHydrationWarning
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "浅色模式" : "深色模式"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground-muted transition hover:bg-muted hover:text-foreground ${className}`}
    >
      {isDark ? (
        // 太阳（点击回到浅色）
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // 月亮（点击进入深色）
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
