import { afterEach, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";
import { createEndpoints } from "./endpoints";
import { decodeLoginRewardDay } from "./login-reward";
import snapshot from "./openapi.snapshot.json";

const day = {
  business_day: "2026-10-17",
  server_time: "2026-10-17T05:00:00Z",
  next_day_starts_at: "2026-10-17T20:00:00Z",
  status: "awarded",
  awarded_amount: "1",
  operation_id: "0199bd15-8100-7000-8000-000000000001"
};
afterEach(() => vi.unstubAllGlobals());

it("posts only an empty body and preserves cancellation; no client amount/day/account", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(day));
  vi.stubGlobal("fetch", fetch);
  const api = createEndpoints(
    createHttpClient({ baseUrl: "https://example.test/api/v1" })
  );
  const controller = new AbortController();
  expect(await api.loginReward.claim({ signal: controller.signal })).toEqual(
    day
  );
  expect(fetch.mock.calls[0]![0]).toBe(
    "https://example.test/api/v1/me/coins/login-reward"
  );
  expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "POST", body: "{}" });
  expect(snapshot.paths["/me/coins/login-reward"]).toEqual(["post"]);
  expect(
    snapshot.operationSchemas["post /me/coins/login-reward"].responses["200"]
  ).toEqual({
    $ref: "#/components/schemas/LoginRewardDay"
  });
});

it("rejects invented rewards and invalid business windows", () => {
  for (const patch of [
    { awarded_amount: "5" },
    { awarded_amount: 1 },
    { operation_id: null },
    { status: "wallet_unavailable" },
    { status: "claimed" },
    { private_reason: "secret" },
    { business_day: "2026-10-18" },
    { server_time: "invalid" },
    { next_day_starts_at: "2026-10-16T20:00:00Z" },
    { next_day_starts_at: "2026-10-18T20:00:00Z" },
    { next_day_starts_at: "2026-10-17T21:00:00Z" }
  ])
    expect(() => decodeLoginRewardDay({ ...day, ...patch })).toThrow();
  expect(
    decodeLoginRewardDay({
      ...day,
      status: "wallet_unavailable",
      awarded_amount: "0",
      operation_id: null
    }).status
  ).toBe("wallet_unavailable");
});

it("old backend 404 and failed settlement remain errors", async () => {
  const api = createEndpoints(
    createHttpClient({ baseUrl: "https://example.test/api/v1" })
  );
  for (const status of [404, 500]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status }))
    );
    await expect(api.loginReward.claim()).rejects.toMatchObject({ status });
  }
});

it("accepts an explicitly disabled server policy without an operation", () => {
  expect(
    decodeLoginRewardDay({
      ...day,
      status: "reward_disabled",
      awarded_amount: "0",
      operation_id: null
    }).status
  ).toBe("reward_disabled");
  expect(() =>
    decodeLoginRewardDay({ ...day, status: "reward_disabled" })
  ).toThrow();
});
