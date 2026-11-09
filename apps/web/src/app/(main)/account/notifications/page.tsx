import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { AppPageHeader } from "@/i18n/AppText";
import { PageShell } from "@/features/shell/Page";
import { Notifications } from "@/features/teacher-certification/Notifications";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("站内通知"),
    robots: { index: false, follow: false }
  };
}

export default function NotificationsPage() {
  return (
    <RouteGuard>
      <PageShell>
        <AppPageHeader
          back={{ href: "/account", label: "返回个人中心" }}
          eyebrow="个人中心"
          title="站内通知"
        />
        <Notifications />
      </PageShell>
    </RouteGuard>
  );
}
