import type { Metadata } from "next";
import { ApplyTeacherForm, RouteGuard } from "@/features/auth";
import { AppTopbar } from "@/features/shell/AppTopbar";
import { PageHeader, PageShell } from "@/features/shell/Page";

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
      <AppTopbar />
      <main className="mx-auto w-full max-w-5xl">
        <PageShell size="lg">
          <PageHeader
            back={{ href: "/account", label: "返回个人中心" }}
            eyebrow="教师认证"
            title="申请成为老师"
            description="通过认证后，可以创建班级、布置任务。你仍可用学生身份学习，原有记录会保留。"
          />
          <ApplyTeacherForm />
        </PageShell>
      </main>
    </RouteGuard>
  );
}
