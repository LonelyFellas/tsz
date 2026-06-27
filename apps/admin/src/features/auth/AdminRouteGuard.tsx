"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

/**
 * 后台门禁守卫（客户端）：
 * - 会话恢复完成（hydrated）前只显示加载态，避免把「恢复中」误判为「未登录」。
 * - 未登录 → 跳 /login?redirect=<当前路径>。
 * - 已登录但激活角色非 admin → 显示无权页（§4：active_role === 'admin' 才进后台）。
 *
 * 注：判定看 token 的「当前激活角色」activeRole，而非「持有」角色 user.roles。
 */
export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.activeRole);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();
  const pathname = usePathname();

  const needsLogin = hydrated && !user;
  const forbidden = hydrated && !!user && activeRole !== "admin";

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

  if (forbidden) {
    return <ForbiddenView />;
  }

  return <>{children}</>;
}

// 已登录但当前激活角色不是 admin：提示无权并提供切换账号入口。
function ForbiddenView() {
  const logout = useAdminLogout();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-gray-900">无权访问</h1>
      <p className="max-w-sm text-sm text-gray-500">
        当前账号不是平台管理员。请使用管理员账号登录。
      </p>
      <button
        onClick={() => void logout()}
        className="rounded-full bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        切换账号
      </button>
    </div>
  );
}
