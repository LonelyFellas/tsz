import { AdminHeader } from "@/features/auth/AdminHeader";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

// 受保护的后台壳：门禁守卫 + 侧栏 + 顶栏。仅登录的 admin 账号可见。
export default function ConsoleLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminRouteGuard>
      <div className="flex bg-gray-50">
        <ConsoleSidebar />
        <div className="flex flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
