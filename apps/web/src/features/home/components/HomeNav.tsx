"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AccountControls,
  type TopbarPanel
} from "@/features/shell/AccountControls";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { BrandMark } from "./BrandMark";
import { useUserStore } from "@/stores/user";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

// 吸顶导航：品牌与公开入口沿同一基线排列。
// 已登录时工作台和账户入口收进右上角头像菜单,不再平铺在顶栏。
export function HomeNav() {
  const user = useUserStore((s) => s.user);
  return <HomeNavContent key={user?.id ?? "guest"} />;
}

function HomeNavContent() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  const identity = useTeacherIdentity();
  const [panel, setPanel] = useState<TopbarPanel>(null);
  const studying =
    !!user && user.roles.includes("student") && identity.identity !== "teacher";

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-3 sm:px-6">
        <Link
          href="/"
          prefetch={hydrated ? null : false}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-base sm:text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <BrandMark />
          天生会背
        </Link>

        <div className="flex items-center gap-3">
          <nav aria-label="主导航" className="flex items-center gap-0 sm:gap-2">
            <Link
              href="/wordlists"
              prefetch={hydrated ? null : false}
              className="inline-flex min-h-11 items-center rounded-full px-2 text-sm sm:px-3 font-medium tracking-wide text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              词表
            </Link>
            <Link
              href="/dictionary"
              prefetch={hydrated ? null : false}
              className="inline-flex min-h-11 items-center rounded-full px-2 text-sm sm:px-3 font-medium tracking-wide text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              词典
            </Link>
            {!user && (
              <ThemeToggle className="size-11 shrink-0 border-0 focus-visible:outline-2 focus-visible:outline-primary" />
            )}
            {/* 会话恢复完成前占位,避免登录态闪烁与布局抖动 */}
            {!hydrated ? (
              <span className="h-11 w-14" aria-hidden />
            ) : (
              !user && (
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center rounded-full bg-muted px-2 text-sm sm:px-4 font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  登录
                </Link>
              )
            )}
          </nav>
          {hydrated && user && (
            <AccountControls
              panel={panel}
              setPanel={setPanel}
              studying={studying}
            />
          )}
        </div>
      </div>
    </header>
  );
}
