"use client";

import type { AdminProfile } from "@tsz/api-client";
import { useEffect, useState } from "react";
import { api, useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

/**
 * 后台顶栏：调门禁探针 GET /admin/profile 拿身份，渲染「已登录为 X」+ 登出。
 * 探针失败（如 token 状态异常）时回退到 store 里的用户昵称。
 */
export function AdminHeader() {
  const storeUser = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const logout = useAdminLogout();

  useEffect(() => {
    let alive = true;
    api.admin
      .profile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {
        // 探针失败不阻断渲染；guard 已保证当前为 admin，用 store 兜底显示。
      });
    return () => {
      alive = false;
    };
  }, []);

  const name = profile?.display_name ?? storeUser?.nickname ?? "管理员";

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3">
      <span className="text-sm text-gray-500">
        已登录为 <span className="font-medium text-gray-900">{name}</span>
      </span>
      <button
        onClick={() => void logout()}
        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        退出登录
      </button>
    </header>
  );
}
