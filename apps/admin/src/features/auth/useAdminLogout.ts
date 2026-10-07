import { clearOtherSnapshots } from "@tsz/shared/recovery";
import { api, tokens, useAuthStore } from "@/lib/auth";

/**
 * 本地登出收尾：清 token、清 profile、整页跳回登录页。两条登出路径（当前会话 / 全部会话）
 * 共用同一份收尾；全部退出须先确认后端成功，普通退出则尽力通知后端。
 *
 * 整页跳转到干净的 /login（而非客户端 navigate）：撤销整棵 React 树，彻底避开门禁守卫
 * 在 setProfile(null) 后抢注 ?redirect=<当前页> 的竞态——否则再次登录（尤其切换账号）
 * 会被那个残留的 redirect 送回上一账号的页面，而非从首页进。与「终止操作整页跳转」约定一致；
 * replace 不把登出前的受保护页留在历史，避免「后退」闪回外壳。
 */
function useFinishLocalLogout() {
  const setProfile = useAuthStore((s) => s.setProfile);

  return function finishLocalLogout() {
    // 仅明确登出清全部草稿；会话恢复/续期失败保留备份供重新登录后恢复。
    try {
      clearOtherSnapshots(null, sessionStorage);
    } catch {
      // 存储不可用不能阻断本地退出登录。
    }
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
 * 逃生组端点，带 Bearer、不过 must_change_password 守卫。失败交给界面提示并允许重试，
 * 避免仅本地登出被误认为全部设备已退出。
 */
export function useAdminLogoutAll() {
  const finishLocalLogout = useFinishLocalLogout();

  return async function logoutAll() {
    await api.auth.logoutAll();
    finishLocalLogout();
  };
}
