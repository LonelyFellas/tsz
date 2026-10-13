"use client";

import Link from "next/link";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { useUserStore } from "@/stores/user";

const PRIMARY =
  "inline-flex h-12 items-center rounded-full bg-primary px-7 text-sm font-medium tracking-wide text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Hero 主行动区——只保留「向前」的动作。
// 账户/危险操作(退出、注销)在 HomeNav,不污染落地页焦点。
export function HeroCTA() {
  const identity = useTeacherIdentity();
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);

  // 会话恢复完成前占位,保持版式稳定,避免按钮闪烁。
  if (!hydrated) {
    return <div className="h-12" aria-hidden />;
  }

  // 学习首页的守卫处理未完成引导并保留回跳地址；教师沿用教学入口。
  if (user) {
    const teaching = identity.verified && identity.identity === "teacher";
    const studyHref = teaching ? "/teacher/classes" : "/student/home";
    return (
      <Link href={studyHref} className={PRIMARY}>
        {teaching ? "进入教学" : "进入学习"}
      </Link>
    );
  }

  // 未登录:主按钮登录 + 次级浏览词表。
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/login" className={PRIMARY}>
        登录
      </Link>
      <Link
        href="/wordlists"
        className="glass inline-flex h-12 items-center rounded-full px-6 text-sm font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        浏览词表 ›
      </Link>
    </div>
  );
}
