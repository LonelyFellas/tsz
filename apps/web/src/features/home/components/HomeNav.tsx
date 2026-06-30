"use client";

import Link from "next/link";
import { useUserStore } from "@/stores/user";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { AccountMenu } from "./AccountMenu";

// 首页吸顶导航——Apple 风毛玻璃细顶栏。
// 已登录时账户操作(退出 / 注销)收进右上角头像菜单,不再平铺在顶栏。
export function HomeNav() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          天生会背
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {/* 账户区:会话恢复完成前占位(尺寸同头像),避免登录态闪烁与布局抖动 */}
          {!hydrated ? (
            <div className="h-8 w-8" aria-hidden />
          ) : !user ? (
            <Link
              href="/login"
              className="text-xs font-medium text-primary transition hover:underline"
            >
              登录
            </Link>
          ) : (
            <AccountMenu />
          )}
        </div>
      </div>
    </header>
  );
}
