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
    title: uiText("webApp:notifications"),
    robots: { index: false, follow: false }
  };
}

export default function NotificationsPage() {
  return (
    <RouteGuard>
      <PageShell>
        <AppPageHeader
          back={{ href: "/account", label: "webApp:back_to_account" }}
          eyebrow="webApp:account"
          title="webApp:notifications"
        />
        <Notifications />
      </PageShell>
    </RouteGuard>
  );
}
