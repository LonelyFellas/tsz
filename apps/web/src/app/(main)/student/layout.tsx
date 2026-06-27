import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 学生专区：需登录且已完成新用户引导（选择难度等级 + 英式/美式）。
export default function StudentLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <RouteGuard requireOnboarding>{children}</RouteGuard>;
}
