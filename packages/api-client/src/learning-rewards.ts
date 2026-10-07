import type { LearningRewardDay } from "@tsz/types";
import type { HttpClient } from "./http";
import { checkInteger } from "./coins";
import { validateRuntimeSchema } from "./runtime-schema";

export function decodeLearningRewardDay(value: unknown): LearningRewardDay {
  const result = validateRuntimeSchema("LearningRewardDay", value);
  if (!result.valid)
    throw new Error(
      `奖励响应不符合接口契约：${result.path} (${result.reason})`
    );
  const day = value as LearningRewardDay;
  checkInteger(day.awarded_amount);
  if (day.daily_amount !== null) checkInteger(day.daily_amount);
  const enabled = day.status !== "reward_disabled";
  if (
    (enabled &&
      (!day.rule_version ||
        !day.daily_amount ||
        day.minimum_units === null ||
        day.minimum_units < 1 ||
        day.minimum_units > 200 ||
        day.qualifying_units > day.minimum_units)) ||
    (day.status === "awarded"
      ? day.awarded_amount === "0" ||
        day.awarded_amount !== day.daily_amount ||
        !day.operation_id ||
        !day.settled_at ||
        day.qualifying_units !== day.minimum_units
      : day.awarded_amount !== "0" || day.operation_id !== null)
  )
    throw new Error("奖励响应状态与账目不一致");
  return day;
}
export function createLearningRewardEndpoints(http: HttpClient) {
  return {
    day: (businessDay?: string, options?: { signal?: AbortSignal }) => {
      const query = businessDay
        ? `?${new URLSearchParams({ business_day: businessDay })}`
        : "";
      return http
        .get<unknown>(`/me/coins/learning-rewards${query}`, options)
        .then(decodeLearningRewardDay);
    }
  };
}
