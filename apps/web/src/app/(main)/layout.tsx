import Link from "next/link";
import { getSession, hasRole } from "@/lib/auth";

// 登录后主布局:角色感知导航。师生共用「词表」,各自看到自己的专属入口。
export default async function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isTeacher = hasRole(session, "teacher");
  const isStudent = hasRole(session, "student");

  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex items-center gap-6 border-b py-4">
        <Link href="/" className="font-bold">
          天生字
        </Link>
        <nav className="flex gap-4 text-sm">
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
      </header>
      <main className="py-6">{children}</main>
    </div>
  );
}
