import { useNavigate } from "react-router-dom";
import { api, tokens, useAuthStore } from "@/lib/auth";

/** 后台登出：吊销当前会话 refresh token，清本地态，回登录页。 */
export function useAdminLogout() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const navigate = useNavigate();

  return async function logout() {
    try {
      // 通知后端吊销 refresh token（admin cookie 自动携带）。幂等。
      await api.auth.logout();
    } catch {
      // 后端吊销失败不应阻断本地登出；吞掉错误保证 logout() 始终 resolve。
    } finally {
      tokens.setAccessToken(null);
      setProfile(null);
      // 用 replace：不把登出前的受保护页留在历史，避免「后退」闪回外壳后又被门禁踢回。
      navigate("/login", { replace: true });
    }
  };
}
