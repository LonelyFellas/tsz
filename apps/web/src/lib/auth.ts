// web 应用级鉴权 runtime（单实例）。token 管理 / 用户 store / api 装配等鉴权内核
// 来自 @tsz/shared/auth，与平台后台（admin）共用同一套实现。
import { createAuthRuntime } from "@tsz/shared/auth";
import { env } from "./env";

export const authRuntime = createAuthRuntime({
  baseUrl: env.NEXT_PUBLIC_API_BASE_URL
});

let initialRestore: { generation: number; promise: Promise<void> } | undefined;

/** 水合接手同一次启动恢复，包括已结束的失败，避免立即重放刷新请求。 */
export function restoreInitialSession() {
  const state = authRuntime.store.getState();
  if (state.hydrated)
    return state.connectionError
      ? authRuntime.restoreSession()
      : Promise.resolve();
  const generation = authRuntime.tokens.getSessionGeneration();
  if (initialRestore?.generation !== generation)
    initialRestore = { generation, promise: authRuntime.restoreSession() };
  return initialRestore.promise;
}
