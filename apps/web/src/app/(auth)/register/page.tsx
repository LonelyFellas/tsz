import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:create_account"),
    description: uiText(
      "webApp:create_a_free_account_and_learn_english_vocabulary_using_the_forgetting"
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
