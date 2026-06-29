import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "登录",
  description: "登录天生会背,继续你的英语单词学习计划。",
  alternates: { canonical: "/login" }
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
