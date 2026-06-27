// 绑定到本应用环境的 HttpClient + Endpoints + access token 管理。
// 实际逻辑下沉到 @tsz/shared/auth（与 admin 共用）；本模块保留原有导出名，
// 既是各 feature 的统一入口，也是测试的 mock 目标。
import { authRuntime } from "./auth";

const { tokens } = authRuntime;

export const api = authRuntime.api;

/** 写入 / 清除内存 access token；清除时同步取消刷新定时器。 */
export function setAccessToken(token: string | null) {
  tokens.setAccessToken(token);
}

/** 在 expiresIn 秒后（提前 30 秒）自动刷新，形成自滚动定时器。 */
export function scheduleRefresh(expiresIn: number) {
  tokens.scheduleRefresh(expiresIn);
}

/** 用 refresh cookie 换取新 access token；并发调用共享同一次请求。 */
export function refreshTokens(): Promise<string> {
  return tokens.refreshTokens();
}
