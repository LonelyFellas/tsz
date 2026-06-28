"use client";

import Link from "next/link";
import { useUserStore } from "@/stores/user";

// Hero 主行动区——只保留「向前」的动作。
// 账户/危险操作(退出、注销)在 HomeNav,不污染落地页焦点。
export function HeroCTA() {
  const user = useUserStore((s) => s.user);
  const onboarded = useUserStore((s) => s.onboarded);
  const hydrated = useUserStore((s) => s.hydrated);

  // 会话恢复完成前占位,保持版式稳定,避免按钮闪烁。
  if (!hydrated) {
    return <div className="h-12" aria-hidden />;
  }

  // 已登录:未完成引导先去 onboarding,否则进主区。
  if (user) {
    const studyHref = onboarded === false ? "/onboarding" : "/wordlists";
    return (
      <Link
        href={studyHref}
        className="inline-flex items-center rounded-full bg-[#0071e3] px-7 py-3 text-base font-medium text-white transition hover:bg-[#0077ed] active:scale-95"
      >
        进入学习
      </Link>
    );
  }

  // 未登录:主按钮登录 + 次级浏览词表。
  return (
    <div className="flex items-center gap-6">
      <Link
        href="/login"
        className="inline-flex items-center rounded-full bg-[#0071e3] px-7 py-3 text-base font-medium text-white transition hover:bg-[#0077ed] active:scale-95"
      >
        登录
      </Link>
      <Link
        href="/wordlists"
        className="text-base font-medium text-[#0071e3] transition hover:underline"
      >
        浏览词表 ›
      </Link>
    </div>
  );
}
