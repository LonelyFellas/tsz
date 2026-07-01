// 平台后台的应用级鉴权 runtime（单实例）。后台是与 web 学员/教师**完全独立**的身份体系：
// 独立 baseUrl（/api/v1/admin）、独立 token、独立 refresh cookie（path=/api/v1/admin）。
// 复用 @tsz/shared/auth 的底层无状态机制（token 管理 / single-flight refresh），
// 但端点与 store 都是 admin 专用的，与 web 端互不引用。
import { createAdminAuthRuntime } from "@tsz/shared/auth";
import { env } from "./env";

export const authRuntime = createAdminAuthRuntime({
  // 拼出后台前缀：login/refresh/profile 均落到 /api/v1/admin/*，refresh cookie path 天然匹配。
  baseUrl: `${env.API_BASE_URL}/admin`
});

export const { api, tokens, persistSession } = authRuntime;

/** 后台用户态 store（含 profile / level，门禁据 profile 是否存在判定）。 */
export const useAuthStore = authRuntime.store;

// dev-only：把 store 挂到 window，便于本地无后端时在控制台注入登录态调试受保护页。
// 生产构建（import.meta.env.DEV=false）下整段被 tree-shake 掉，不会泄露。
if (import.meta.env.DEV) {
  (window as unknown as { __authStore?: typeof useAuthStore }).__authStore =
    useAuthStore;
}
