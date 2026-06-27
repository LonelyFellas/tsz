"use client";

import { useEffect } from "react";
import type { AuthRuntime } from "./runtime";

/**
 * 页面刷新后 access token 丢失（存内存），通过 refresh cookie 静默恢复会话。
 * 挂载时执行一次：成功则写入 user / activeRole / onboarded，失败则保持未登录
 * （不跳转，让路由守卫处理）。无论成功失败都标记 hydrated，UI 据此区分
 * 「恢复中」与「未登录」。
 */
export function useSessionRestore(runtime: AuthRuntime) {
  const { tokens, api, store } = runtime;

  useEffect(() => {
    const { setUser, setActiveRole, setOnboarded, setHydrated } =
      store.getState();

    tokens
      .refreshTokens()
      .then(() => api.auth.me())
      .then((me) => {
        setUser(me.user);
        setActiveRole(me.active_role);
        setOnboarded(me.onboarded);
      })
      .catch(() => {
        // 无有效会话，保持未登录，由路由守卫决定跳转。
      })
      .finally(() => {
        setHydrated(true);
      });
  }, [tokens, api, store]);
}
