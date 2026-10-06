"use client";

import Link from "next/link";
import { useUserStore } from "@/stores/user";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { AccountMenu } from "@/features/home/components/AccountMenu";
import { useTeacherIdentity } from "@/features/teacher-certification/TeacherIdentityProvider";

export function MainNav() {
  const user = useUserStore((s) => s.user);
  const teacher = useTeacherIdentity();
  const isTeacher = teacher.verified && teacher.identity === "teacher";
  const isStudent = !!user && !isTeacher;

  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-border py-3 sm:flex sm:flex-wrap sm:gap-4 sm:py-4">
      <Link href="/" className="whitespace-nowrap font-bold">
        天生会背
      </Link>
      <nav className="col-span-2 row-start-2 flex min-w-0 items-center gap-5 overflow-x-auto whitespace-nowrap py-1 text-sm sm:flex-1 sm:flex-wrap sm:gap-4 sm:overflow-visible sm:py-0">
        <Link href="/wordlists">词表</Link>
        {isTeacher && (
          <>
            <Link href="/teacher/tasks">任务管理</Link>
            <Link href="/teacher/classes">班级管理</Link>
            <Link href="/teacher/stats">数据统计</Link>
          </>
        )}
        {isStudent && (
          <>
            <Link href="/student/practice">练习</Link>
          </>
        )}
        {user && <Link href="/account/coins">天生币</Link>}
        {!teacher.verified && (
          <Link href="/apply-teacher" className="text-primary">
            申请成为老师
          </Link>
        )}
      </nav>
      <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-3 sm:gap-4">
        {!user && <ThemeToggle />}
        <AccountMenu />
      </div>
    </header>
  );
}
