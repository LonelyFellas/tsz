import Link from "next/link";
import { BrandMark } from "@/features/home/components/BrandMark";
import type { ReactNode } from "react";
import { AuthBranding } from "./AuthBranding";

// 登录、注册、找回密码共用骨架：左侧品牌区，右侧毛玻璃表单卡。
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-20 shrink-0 items-center px-6 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-sm text-2xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <BrandMark />
          天生会背
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-4 pb-16 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 lg:pb-24">
        <AuthBranding />
        <div
          className="animate-in glass mx-auto w-full max-w-[440px] rounded-3xl p-2"
          style={{ animationDelay: "0.08s" }}
        >
          <div className="rounded-[20px] bg-surface/70 px-6 py-8 sm:px-9 sm:py-10">
            {children}
          </div>
        </div>
      </div>
      <footer className="pb-6 text-center text-xs text-foreground-subtle">
        天生会背 · 智能英语单词学习平台
      </footer>
    </main>
  );
}
