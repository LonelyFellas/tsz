import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "注册",
  description: "免费注册天生会背,按遗忘曲线科学背单词,开启高效英语学习。",
  alternates: { canonical: "/register" }
};

export default function RegisterPage() {
  return <RegisterForm />;
}
