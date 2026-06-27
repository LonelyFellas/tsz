import { MainNav } from "@/features/auth/components/MainNav";

// 登录后主布局：角色感知导航。
// 注意：主区本身不强制登录——词表浏览对游客开放；
// 受保护区域（student/teacher）各自的 layout 用 RouteGuard 单独把关。
export default function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <MainNav />
      <main className="py-6">{children}</main>
    </div>
  );
}
