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

  useEffect(() => {
    refreshTokens()
      .then(() => api.auth.me())
      .then(({ user }) => setUser(user))
      .catch(() => {
        // 无有效 refresh cookie，保持未登录。
      });
  }, [setUser]);
}
