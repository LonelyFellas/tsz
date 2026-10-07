import { expect, it, vi } from "vitest";
import {
  createLearningRewardEndpoints,
  decodeLearningRewardDay
} from "./learning-rewards";
import type { HttpClient } from "./http";
const day = {
  business_day: "2026-10-07",
  server_time: "2026-10-07T00:00:00Z",
  rule_version: "v1",
  minimum_units: 10,
  daily_amount: "9007199254740993",
  qualifying_units: 10,
  status: "awarded",
  awarded_amount: "9007199254740993",
  operation_id: "0199bd15-8100-7000-8000-000000000001",
  settled_at: "2026-10-07T00:00:00Z"
};
it("reads only the requested business day, preserves signal and exact amounts", async () => {
  const get = vi.fn().mockResolvedValue(day);
  const api = createLearningRewardEndpoints({ get } as unknown as HttpClient);
  const controller = new AbortController();
  expect(
    (await api.day("2026-10-07", { signal: controller.signal })).awarded_amount
  ).toBe("9007199254740993");
  expect(get).toHaveBeenCalledWith(
    "/me/coins/learning-rewards?business_day=2026-10-07",
    { signal: controller.signal }
  );
});
it("rejects invented success, malformed dates, unknown fields and lossy amounts", () => {
  for (const bad of [
    { ...day, awarded_amount: "0", operation_id: null },
    { ...day, settled_at: null },
    { ...day, status: "in_progress" },
    { ...day, status: "issued" },
    { ...day, minimum_units: null },
    { ...day, qualifying_units: 9 },
    { ...day, awarded_amount: "9223372036854775808" },
    { ...day, business_day: "2026-02-30" },
    { ...day, coins_earned: 10 }
  ])
    expect(() => decodeLearningRewardDay(bad)).toThrow();
  const { operation_id: _operation, ...missing } = day;
  expect(() => decodeLearningRewardDay(missing)).toThrow();
  expect(
    decodeLearningRewardDay({
      ...day,
      status: "reward_disabled",
      rule_version: null,
      minimum_units: null,
      daily_amount: null,
      qualifying_units: 0,
      awarded_amount: "0",
      operation_id: null,
      settled_at: null
    }).status
  ).toBe("reward_disabled");
});
