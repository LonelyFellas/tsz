import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("注册"),
    description: uiText(
      "免费注册天生会背,按遗忘曲线科学背单词,开启高效英语学习。"
    ),
    alternates: { canonical: "/register" }
  };
}

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{
    method?: string;
    redirect?: string;
    invite?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const invite = Array.isArray(params.invite)
    ? params.invite[0]
    : params.invite;
  const method = params.method === "email" ? "email" : "phone";
  return (
    <RegisterForm
      key={`${method}:${invite ?? ""}`}
      initialMethod={method}
      initialInviteCode={invite}
      redirect={params.redirect}
    />
  );
}
