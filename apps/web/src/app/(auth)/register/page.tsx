import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "注册",
  description: "免费注册天生会背,按遗忘曲线科学背单词,开启高效英语学习。",
  alternates: { canonical: "/register" }
};

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
