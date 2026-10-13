import { HomeNav } from "@/features/home/components/HomeNav";

// 主区与首页共用顶栏，账户入口收进头像菜单。
// 注意：主区本身不强制登录——词表浏览对游客开放；
// 受保护区域（student/teacher）各自的 layout 用 RouteGuard 单独把关。
export default function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HomeNav />
      <main className="mx-auto max-w-5xl">{children}</main>
    </>
  );
}
