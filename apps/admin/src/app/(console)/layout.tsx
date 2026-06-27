import Link from "next/link";
import { AdminHeader } from "@/features/auth/AdminHeader";
import { AdminRouteGuard } from "@/features/auth/AdminRouteGuard";

// 受保护的后台壳：门禁守卫 + 侧栏 + 顶栏。仅 active_role === 'admin' 可见。
export default function ConsoleLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminRouteGuard>
      <div className="flex">
        <aside className="min-h-screen w-48 border-r bg-white p-4">
          <h2 className="mb-4 font-bold">平台后台</h2>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/words">词库管理</Link>
            <Link href="/wordlists">词表管理</Link>
            <Link href="/users">用户管理</Link>
            <Link href="/reviews">审核中心</Link>
          </nav>
        </aside>
        <div className="flex flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AdminRouteGuard>
  );
}
