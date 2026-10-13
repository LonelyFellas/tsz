import { AppTopbar } from "@/features/shell/AppTopbar";

// 主区使用学习区同款顶栏：左侧品牌菜单、右侧设置与账户入口。
// 注意：主区本身不强制登录——词表浏览对游客开放；
// 受保护区域（student/teacher）各自的 layout 用 RouteGuard 单独把关。
export default function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto max-w-5xl">{children}</main>
    </>
  );
}
