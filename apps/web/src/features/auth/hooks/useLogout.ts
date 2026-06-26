"use client";

import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/user";
import { api, setAccessToken } from "@/lib/request";

export function useLogout() {
  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();

  return async function logout() {
    try {
      // 通知后端吊销 refresh token（cookie 自动携带）。
      await api.auth.logout();
    } finally {
      // 无论后端是否成功，本地状态必须清除。
      setAccessToken(null);
      setUser(null);
      router.push("/login");
    }
  };
}
