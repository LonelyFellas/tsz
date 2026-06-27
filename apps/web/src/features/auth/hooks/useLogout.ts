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
    } catch {
      // 后端吊销失败不应阻断本地登出；吞掉错误保证 logout() 始终 resolve，
      // 调用方（按钮）无需各自 try/catch，也不会产生未处理的 Promise 拒绝。
    } finally {
      // 无论后端是否成功，本地状态必须清除。
      setAccessToken(null);
      setUser(null);
      router.push("/login");
    }
  };
}
