import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { AccountSecurity } from "@/features/auth/components/AccountSecurity";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return { title: uiText("账号安全") };
}

export default function AccountSecurityPage() {
  return (
    <RouteGuard>
      <AccountSecurity />
    </RouteGuard>
  );
}
