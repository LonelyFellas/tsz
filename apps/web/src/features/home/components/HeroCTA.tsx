"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";
import { useUserStore } from "@/stores/user";

// Hero 主行动区——只保留「向前」的动作。
// 账户/危险操作(退出、注销)在 HomeNav,不污染落地页焦点。
export function HeroCTA() {
  const identity = useTeacherIdentity();
  const user = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);

  // 会话恢复完成前占位,保持版式稳定,避免按钮闪烁。
  if (!hydrated) {
    return <div className="h-13" aria-hidden />;
  }

  // 学习首页的守卫处理未完成引导并保留回跳地址；教师沿用教学入口。
  if (user) {
    const teaching = identity.verified && identity.identity === "teacher";
    const studyHref = teaching ? "/teacher/classes" : "/student/home";
    return (
      <Button asChild size="lg">
        <Link href={studyHref}>{teaching ? "进入教学" : "进入学习"}</Link>
      </Button>
    );
  }

  // 未登录:主按钮登录 + 次级浏览词表。
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg">
        <Link href="/login">开始学习</Link>
      </Button>
      <Button asChild size="lg" variant="link">
        <Link href="/wordlists">
          浏览词表
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
