import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 需登录的私密区域，禁止搜索引擎收录。
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

// 学生专区：需登录且已完成新用户引导（选择难度等级 + 英式/美式）。
export default function StudentLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <RouteGuard requireOnboarding>{children}</RouteGuard>;
}
