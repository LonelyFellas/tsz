import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth";
import { PageHeader, PageShell } from "@/features/shell/Page";
import { Notifications } from "@/features/teacher-certification/Notifications";

export const metadata: Metadata = {
  title: "站内通知",
  robots: { index: false, follow: false }
};

export default function NotificationsPage() {
  return (
    <RouteGuard>
      <PageShell>
        <PageHeader
          back={{ href: "/account", label: "返回个人中心" }}
          eyebrow="个人中心"
          title="站内通知"
        />
        <Notifications />
      </PageShell>
    </RouteGuard>
  );
}
