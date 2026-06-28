import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "找回密码",
  description: "通过手机号验证码重置天生会背账号密码。",
  alternates: { canonical: "/forgot-password" }
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
