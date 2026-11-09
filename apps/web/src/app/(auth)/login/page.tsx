import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("登录"),
    description: uiText("登录天生会背,继续你的英语单词学习计划。"),
    alternates: { canonical: "/login" }
  };
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
