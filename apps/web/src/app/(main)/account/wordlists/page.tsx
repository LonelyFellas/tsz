import type { Metadata } from "next";
import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import { Suspense } from "react";
import { WordlistLibrary } from "@/features/wordlist/components/WordlistLibrary";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("我的词表"),
    robots: { index: false, follow: false }
  };
}

export default function Page() {
  return (
    <RouteGuard preserveSearch>
      <Suspense>
        <WordlistLibrary />
      </Suspense>
    </RouteGuard>
  );
}
