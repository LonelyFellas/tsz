import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { StudentHome } from "@/features/student-home/StudentHome";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("学习首页"),
    robots: { index: false, follow: false }
  };
}

export default function StudentHomePage() {
  return (
    <RouteGuard requireOnboarding>
      <StudentHome />
    </RouteGuard>
  );
}
