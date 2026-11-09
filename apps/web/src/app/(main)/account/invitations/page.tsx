import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { Invitations } from "@/features/invitations/Invitations";
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("邀请好友"),
    robots: { index: false, follow: false }
  };
}

export default function InvitationsPage() {
  return (
    <RouteGuard>
      <Invitations />
    </RouteGuard>
  );
}
