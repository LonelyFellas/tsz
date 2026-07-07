import { api, tokens, useAuthStore } from "@/lib/auth";

/** 后台登出：吊销当前会话 refresh token，清本地态，整页跳回登录页。 */
export function useAdminLogout() {
  const setProfile = useAuthStore((s) => s.setProfile);

  return async function logout() {
    try {
      // 通知后端吊销 refresh token（admin cookie 自动携带）。幂等。
      await api.auth.logout();
    } catch {
      // 后端吊销失败不应阻断本地登出；吞掉错误保证 logout() 始终 resolve。
    } finally {
      tokens.setAccessToken(null);
      setProfile(null);
      // 整页跳转到干净的 /login（而非客户端 navigate）：撤销整棵 React 树，彻底避开门禁守卫
      // 在 setProfile(null) 后抢注 ?redirect=<当前页> 的竞态——否则再次登录（尤其切换账号）
      // 会被那个残留的 redirect 送回上一账号的页面，而非从首页进。与「终止操作整页跳转」约定一致；
      // replace 不把登出前的受保护页留在历史，避免「后退」闪回外壳。
      window.location.replace("/login");
    }
  };
}
