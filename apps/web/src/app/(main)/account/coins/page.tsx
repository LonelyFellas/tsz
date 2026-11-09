import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { CoinsWallet } from "@/features/coins/CoinsWallet";
export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:my_coins"),
    robots: { index: false, follow: false }
  };
}

export default function CoinsPage() {
  return (
    <RouteGuard>
      <CoinsWallet />
    </RouteGuard>
  );
}
