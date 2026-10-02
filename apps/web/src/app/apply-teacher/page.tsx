import type { Metadata } from "next";
import { ApplyTeacherForm, RouteGuard } from "@/features/auth";
import Link from "next/link";
import { AccountMenu } from "@/features/home/components/AccountMenu";

export const metadata: Metadata = {
  title: "申请成为老师",
  description: "在天生会背申请成为老师,创建班级、布置单词任务并跟踪学情。",
  alternates: { canonical: "/apply-teacher" },
  robots: { index: false, follow: false }
};

// 申请成为老师:填写资料 → 提交审核 →(被拒)查看拒绝原因。
export default function ApplyTeacherPage() {
  return (
    <RouteGuard>
      <main className="mx-auto max-w-4xl px-5 pb-12 pt-6 sm:px-8 sm:pb-16 sm:pt-8">
        <div className="mb-8 flex items-center justify-between border-b border-border/70 pb-5">
          <Link
            href="/"
            className="rounded-sm text-sm text-foreground-muted transition hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ← 返回首页
          </Link>
          <AccountMenu />
        </div>
        <div className="mb-7 sm:mb-8">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            申请成为老师
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-muted">
            通过认证后，可以创建班级、布置任务。你仍可用学生身份学习，原有记录会保留。
          </p>
        </div>
        <ApplyTeacherForm />
      </main>
    </RouteGuard>
  );
}
