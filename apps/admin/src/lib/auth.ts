// 平台后台的应用级鉴权 runtime（单实例）。鉴权内核来自 @tsz/shared/auth，
// web 与 admin 共用同一套 token 管理 / store / session 恢复逻辑。
import { createAuthRuntime } from "@tsz/shared/auth";
import { env } from "./env";

export const authRuntime = createAuthRuntime({
  baseUrl: env.NEXT_PUBLIC_API_BASE_URL
});

export const { api, tokens, persistSession } = authRuntime;

/** 后台用户态 store（含 activeRole，门禁据此判断 === 'admin'）。 */
export const useAuthStore = authRuntime.store;
