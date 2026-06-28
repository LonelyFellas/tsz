import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 需登录的私密区域，禁止搜索引擎收录。
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

// 教师专区：需登录。（onboarding 是学生侧的难度/口音设置，教师不强制。）
export default function TeacherLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <RouteGuard>{children}</RouteGuard>;
}
