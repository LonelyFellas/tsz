"use client";

import { useEffect } from "react";
import { api, tokens, useAuthStore } from "@/lib/auth";

/**
 * 页面刷新后 access token 丢失（仅存内存），通过 admin refresh cookie 静默恢复会话。
 * 挂载时执行一次：refresh 续期 → 探 /admin/profile，成功则写入 profile，失败则保持未登录
 * （不跳转，交给路由守卫）。无论成功失败都标记 hydrated，UI 据此区分「恢复中」与「未登录」。
 */
export function useAdminSessionRestore() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    tokens
      .refreshTokens()
      .then(() => api.profile())
      .then((profile) => {
        setProfile(profile);
      })
      .catch(() => {
        // 无有效会话，保持未登录，由路由守卫决定跳转。
      })
      .finally(() => {
        setHydrated(true);
      });
  }, [setProfile, setHydrated]);
}
