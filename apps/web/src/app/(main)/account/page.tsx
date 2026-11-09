import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { ProfileHub } from "@/features/auth/components/ProfileHub";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 个人中心属私密页,禁止收录。
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:account"),
    robots: { index: false, follow: false }
  };
}

// 个人中心:需登录(任何已登录用户都可进入)。
export default function AccountPage() {
  return (
    <RouteGuard>
      <ProfileHub />
    </RouteGuard>
  );
}
