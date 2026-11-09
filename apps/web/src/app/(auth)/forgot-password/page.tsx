import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:reset_password"),
    description: uiText("webApp:reset_your_password_using_a_verification_code"),
    alternates: { canonical: "/forgot-password" }
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
