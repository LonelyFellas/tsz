import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BindPhoneForm } from "@/features/auth/components/BindPhoneForm";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:bind_phone_number"),
    robots: { index: false, follow: false }
  };
}

export default function BindPhonePage() {
  return (
    <RouteGuard>
      <Suspense fallback={null}>
        <BindPhoneForm />
      </Suspense>
    </RouteGuard>
  );
}
