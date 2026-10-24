"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Settings, X } from "lucide-react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger
} from "@tsz/ui/components";
import { ThemeModeControl } from "@/features/theme/ThemeModeControl";
import { BrandMark } from "./BrandMark";
import { useUserStore } from "@/stores/user";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { AccountMenu } from "./AccountMenu";

// 吸顶导航：左侧粗体字标，右侧毛玻璃胶囊收纳入口。
// 已登录时工作台和账户入口收进右上角头像菜单,不再平铺在顶栏。
export function HomeNav() {
  const user = useUserStore((s) => s.user);
  return <HomeNavContent key={user?.id ?? "guest"} />;
}

function HomeNavContent() {
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  const [panel, setPanel] = useState<"settings" | "account" | null>(null);
  const setAccountOpen = useCallback((open: boolean) => {
    setPanel((current) =>
      open ? "account" : current === "account" ? null : current
    );
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-3 sm:px-6">
        <Link
          href="/"
          prefetch={hydrated ? null : false}
          className="inline-flex items-center gap-2 rounded-sm text-base sm:text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <BrandMark />
          天生会背
        </Link>

        <div className="flex items-center gap-3">
          <nav
            aria-label="主导航"
            className="glass flex items-center gap-0.5 rounded-full p-1"
          >
            <Link
              href="/wordlists"
              prefetch={hydrated ? null : false}
              className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium tracking-wide text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              词表
            </Link>
            <Link
              href="/dictionary"
              prefetch={hydrated ? null : false}
              className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium tracking-wide text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              词典
            </Link>
            {!user && <ThemeToggle className="border-0" />}
            {/* 会话恢复完成前占位,避免登录态闪烁与布局抖动 */}
            {!hydrated ? (
              <span className="h-8 w-16" aria-hidden />
            ) : (
              !user && (
                <Link
                  href="/login"
                  className="inline-flex h-8 items-center rounded-full bg-surface px-3 text-[13px] font-medium tracking-wide text-foreground shadow-[0_2px_8px_rgb(0_0_0/0.06)] ring-1 ring-border/70 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  登录
                </Link>
              )
            )}
          </nav>
          {hydrated && user && (
            <>
              <Popover
                open={panel === "settings"}
                onOpenChange={(open) =>
                  setPanel((current) =>
                    open ? "settings" : current === "settings" ? null : current
                  )
                }
              >
                <PopoverTrigger
                  aria-label="偏好设置"
                  className="inline-flex size-11 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface data-[state=open]:text-primary data-[state=open]:shadow-glass"
                >
                  <Settings className="size-5" strokeWidth={1.5} aria-hidden />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  aria-label="偏好设置"
                  className="tsz-drawer rounded-3xl border-border/60 bg-surface/90 shadow-float backdrop-blur-xl"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold tracking-tight">
                      偏好设置
                    </h2>
                    <PopoverClose
                      aria-label="关闭偏好设置"
                      className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <X
                        className="size-[18px]"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </PopoverClose>
                  </div>
                  <ThemeModeControl />
                </PopoverContent>
              </Popover>
              <AccountMenu
                open={panel === "account"}
                onOpenChange={setAccountOpen}
                disableHover={panel === "settings"}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
