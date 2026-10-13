import type { Metadata } from "next";
import { PageHeader, PageShell } from "@/features/shell/Page";
import { RouteGuard } from "@/features/auth";
import { ApplicationDetail } from "@/features/teacher-certification/ApplicationDetail";

export const metadata: Metadata = {
  title: "教师认证申请详情",
  robots: { index: false, follow: false }
};

export default async function TeacherApplicationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteGuard>
      <PageShell>
        <PageHeader
          back={{ href: "/account/notifications", label: "返回站内通知" }}
          eyebrow="教师认证"
          title="教师认证申请详情"
        />
        <ApplicationDetail id={id} />
      </PageShell>
    </RouteGuard>
  );
}
