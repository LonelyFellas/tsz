import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { AppPageHeader } from "@/i18n/AppText";
import { PageShell } from "@/features/shell/Page";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { ApplicationDetail } from "@/features/teacher-certification/ApplicationDetail";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("教师认证申请详情"),
    robots: { index: false, follow: false }
  };
}

export default async function TeacherApplicationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteGuard>
      <PageShell>
        <AppPageHeader
          back={{ href: "/account/notifications", label: "返回站内通知" }}
          eyebrow="教师认证"
          title="教师认证申请详情"
        />
        <ApplicationDetail id={id} />
      </PageShell>
    </RouteGuard>
  );
}
