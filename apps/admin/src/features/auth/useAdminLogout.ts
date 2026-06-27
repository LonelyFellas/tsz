"use client";

import { useRouter } from "next/navigation";
import { api, tokens, useAuthStore } from "@/lib/auth";

/** 后台登出：吊销 refresh token，清本地态，回登录页。 */
export function useAdminLogout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setActiveRole = useAuthStore((s) => s.setActiveRole);
  const router = useRouter();

  return async function logout() {
    try {
      // 通知后端吊销 refresh token（cookie 自动携带）。
      await api.auth.logout();
    } catch {
      // 后端吊销失败不应阻断本地登出；吞掉错误保证 logout() 始终 resolve。
    } finally {
      tokens.setAccessToken(null);
      setUser(null);
      setActiveRole(null);
      router.push("/login");
    }
  };
}
