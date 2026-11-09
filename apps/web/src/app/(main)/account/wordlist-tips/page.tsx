import type { Metadata } from "next";
import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { WordlistTips } from "@/features/wordlist/components/WordlistTips";
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("词表投币记录"),
    robots: { index: false, follow: false }
  };
}

export default function Page() {
  return (
    <RouteGuard>
      <WordlistTips />
    </RouteGuard>
  );
}
