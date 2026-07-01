import { useEffect } from "react";
import { api, tokens, useAuthStore } from "@/lib/auth";

// 在途去重：StrictMode 下 dev 会双跑挂载 effect，若不拦会并发发两次
// refresh + profile，可能撞上后端的 refresh token 轮换互相踩踏。用共享 promise
// 合并「同时在途」的调用；结算后释放，后续（极少见的）重新挂载可再探一次。
let restorePromise: Promise<void> | null = null;

/**
 * 页面刷新后 access token 丢失（仅存内存），通过 admin refresh cookie 静默恢复会话。
 * 挂载时执行一次：refresh 续期 → 探 /admin/profile，成功则写入 profile，失败则保持未登录
 * （不跳转，交给路由守卫）。无论成功失败都标记 hydrated，UI 据此区分「恢复中」与「未登录」。
 */
export function useAdminSessionRestore() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    // zustand 的 action 引用稳定，可安全在只创建一次的 promise 里闭包捕获。
    restorePromise ??= tokens
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
        // 结算后释放在途标记，让后续重新挂载能再发起一次恢复。
        restorePromise = null;
      });
  }, [setProfile, setHydrated]);
}
