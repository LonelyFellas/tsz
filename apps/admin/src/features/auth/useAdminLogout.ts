import { api, tokens, useAuthStore } from "@/lib/auth";

/**
 * 本地登出收尾：清 token、清 profile、整页跳回登录页。两条登出路径（当前会话 / 全部会话）
 * 共用同一份收尾，后端调用成败都要执行。
 *
 * 整页跳转到干净的 /login（而非客户端 navigate）：撤销整棵 React 树，彻底避开门禁守卫
 * 在 setProfile(null) 后抢注 ?redirect=<当前页> 的竞态——否则再次登录（尤其切换账号）
 * 会被那个残留的 redirect 送回上一账号的页面，而非从首页进。与「终止操作整页跳转」约定一致；
 * replace 不把登出前的受保护页留在历史，避免「后退」闪回外壳。
 */
function useFinishLocalLogout() {
  const setProfile = useAuthStore((s) => s.setProfile);

  return function finishLocalLogout() {
    tokens.setAccessToken(null);
    setProfile(null);
    window.location.replace("/login");
  };
}

/** 后台登出：吊销当前会话 refresh token，清本地态，整页跳回登录页。 */
export function useAdminLogout() {
  const finishLocalLogout = useFinishLocalLogout();

  return async function logout() {
    try {
      // 通知后端吊销 refresh token（admin cookie 自动携带）。幂等。
      await api.auth.logout();
    } catch {
      // 后端吊销失败不应阻断本地登出；吞掉错误保证 logout() 始终 resolve。
    } finally {
      finishLocalLogout();
    }
  };
}

/**
 * 后台「退出所有设备」：吊销该 admin 的全部会话（含当前这台），再走同一套本地收尾。
 * 逃生组端点，带 Bearer、不过 must_change_password 守卫。后端失败同样不阻断本地登出——
 * 本机至少要下线，别把人卡在一个已经点了「全部退出」的界面里。
 */
export function useAdminLogoutAll() {
  const finishLocalLogout = useFinishLocalLogout();

  return async function logoutAll() {
    try {
      await api.auth.logoutAll();
    } catch {
      // 同 logout()：吞掉错误，保证始终 resolve 并完成本地登出。
    } finally {
      finishLocalLogout();
    }
  };
}
