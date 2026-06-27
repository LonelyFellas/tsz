import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 教师专区：需登录。（onboarding 是学生侧的难度/口音设置，教师不强制。）
export default function TeacherLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <RouteGuard>{children}</RouteGuard>;
}
