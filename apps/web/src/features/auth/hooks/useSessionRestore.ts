"use client";

import { useEffect } from "react";
import { useUserStore } from "@/stores/user";
import { api, refreshTokens } from "@/lib/request";

/**
 * 页面刷新后 access token 丢失（存内存），通过 refresh cookie 静默恢复会话。
 * 挂载时执行一次：成功则写入用户信息，失败则保持未登录状态（不跳转，让路由守卫处理）。
 */
export function useSessionRestore() {
  const setUser = useUserStore((s) => s.setUser);
  const setOnboarded = useUserStore((s) => s.setOnboarded);
  const setHydrated = useUserStore((s) => s.setHydrated);

  useEffect(() => {
    refreshTokens()
      .then(() => api.auth.me())
      .then(({ user, onboarded }) => {
        setUser(user);
        setOnboarded(onboarded);
      })
      .catch(() => {
        // 无有效会话，保持未登录，由路由守卫决定跳转。
      })
      .finally(() => {
        // 无论成功失败，标记会话恢复已完成，UI 据此区分「恢复中」与「未登录」。
        setHydrated(true);
      });
  }, [setUser, setOnboarded, setHydrated]);
}
