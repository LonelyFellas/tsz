import type { Metadata } from "next";
import { ApplyTeacherForm, RouteGuard } from "@/features/auth";
import { AppTopbar } from "@/features/shell/AppTopbar";
import { PageHeader, PageShell } from "@/features/shell/Page";

export const metadata: Metadata = {
  title: "申请成为老师",
  description: "在天生会背提交教师认证资料，通过站内通知查看审核结果。",
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
            description="提交资料申请教师认证，审核结果通过站内通知送达。班级与教学任务暂未开放；你仍可使用学生身份学习。"
          />
          <ApplyTeacherForm />
        </PageShell>
      </main>
    </RouteGuard>
  );
}
