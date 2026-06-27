"use client";

import Link from "next/link";
import { useUserStore } from "@/stores/user";
import { LogoutButton } from "./LogoutButton";

// 登录后主区导航：角色感知（师/生看到各自入口）。
// 订阅 user 本身再计算角色——store 的 hasRole 是稳定函数引用，user 变化时不会触发重渲染。
export function MainNav() {
  const user = useUserStore((s) => s.user);
  const isTeacher = !!user?.roles.includes("teacher");
  const isStudent = !!user?.roles.includes("student");

  return (
    <header className="flex items-center gap-6 border-b py-4">
      <Link href="/" className="font-bold">
        天生会背
      </Link>
      <nav className="flex flex-1 gap-4 text-sm">
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
        {!isTeacher && (
          <Link href="/apply-teacher" className="text-blue-600">
            申请成为老师
          </Link>
        )}
      </nav>
      <LogoutButton />
    </header>
  );
}
