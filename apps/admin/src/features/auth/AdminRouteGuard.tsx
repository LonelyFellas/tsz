"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";

/**
 * 后台门禁守卫（客户端）：
 * - 会话恢复完成（hydrated）前只显示加载态，避免把「恢复中」误判为「未登录」。
 * - 未登录 → 跳 /login?redirect=<当前路径>。
 *
 * 后台是与 web 完全独立的账号体系：能拿到 /admin/profile 就是有效 admin，
 * 不存在「已登录但不是 admin」的中间态（不再有角色判定）。level 只影响菜单可见性，
 * 由各页面自行按 super_admin 控制，不在门禁层处理。
 */
export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const pathname = usePathname();

  const needsLogin = hydrated && !profile;

  useEffect(() => {
    if (needsLogin) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [needsLogin, pathname, router]);

  if (!hydrated || needsLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        加载中...
      </div>
    );
  }

  return <>{children}</>;
}
