// web 应用级鉴权 runtime（单实例）。token 管理 / 用户 store / api 装配等鉴权内核
// 来自 @tsz/shared/auth，与平台后台（admin）共用同一套实现。
import { createAuthRuntime } from "@tsz/shared/auth";
import { env } from "./env";

export const authRuntime = createAuthRuntime({
  baseUrl: env.NEXT_PUBLIC_API_BASE_URL
});
