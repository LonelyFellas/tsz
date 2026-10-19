import type { LoginRewardDay } from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

export function decodeLoginRewardDay(value: unknown): LoginRewardDay {
  const result = validateRuntimeSchema("LoginRewardDay", value);
  if (!result.valid)
    throw new Error(
      `登录奖励响应不符合接口契约：${result.path} (${result.reason})`
    );
  const day = value as LoginRewardDay;
  const server = Date.parse(day.server_time);
  const next = Date.parse(day.next_day_starts_at);
  if (
    !Number.isFinite(server) ||
    !Number.isFinite(next) ||
    next <= server ||
    next - server > 86400000 ||
    new Date(server + 4 * 3600000).toISOString().slice(0, 10) !==
      day.business_day ||
    new Date(next).toISOString().slice(11) !== "20:00:00.000Z" ||
    (day.status === "awarded"
      ? day.awarded_amount !== "1" || !day.operation_id
      : day.awarded_amount !== "0" || day.operation_id !== null)
  )
    throw new Error("登录奖励状态与账目不一致");
  return day;
}

export function createLoginRewardEndpoints(http: HttpClient) {
  return {
    claim: (options?: { signal?: AbortSignal }) =>
      http
        .post<unknown>("/me/coins/login-reward", {}, options)
        .then(decodeLoginRewardDay)
  };
}
