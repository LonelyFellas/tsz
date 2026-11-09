import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("找回密码"),
    description: uiText("通过手机号验证码重置天生会背账号密码。"),
    alternates: { canonical: "/forgot-password" }
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
