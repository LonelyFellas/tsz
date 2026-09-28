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
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-sm text-foreground-muted">
            返回首页
          </Link>
          <AccountMenu />
        </div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">
          申请成为老师
        </h1>
        <p className="mb-8 text-foreground-muted">
          审核通过后获得教师身份，原有学生身份与学习数据保持不变。
        </p>
        <ApplyTeacherForm />
      </main>
    </RouteGuard>
  );
}
