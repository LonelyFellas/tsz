import { Outlet } from "react-router-dom";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";
import { ConsoleSidebar } from "@/features/console/ConsoleSidebar";

// 受保护的后台壳：门禁守卫 + 侧栏 + 顶栏，子路由渲染在 <Outlet/>。仅登录的 admin 可见。
export function ConsoleLayout() {
  return (
    <AdminRouteGuard>
      <div className="flex bg-muted/40">
        <ConsoleSidebar />
        <div className="flex flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
