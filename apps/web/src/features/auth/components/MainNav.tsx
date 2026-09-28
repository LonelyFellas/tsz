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
    <header className="flex flex-wrap items-center gap-4 border-b border-border py-4">
      <Link href="/" className="font-bold">
        天生会背
      </Link>
      <nav className="flex flex-1 flex-wrap gap-4 text-sm">
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
            <Link href="/student/coins">天生币</Link>
          </>
        )}
        {!teacher.verified && (
          <Link href="/apply-teacher" className="text-primary">
            申请成为老师
          </Link>
        )}
      </nav>
      <ThemeToggle />
      <AccountMenu />
    </header>
  );
}
