import { expect, it, vi } from "vitest";
import { createAiLedgerEndpoints } from "./ai-ledger";
import type { HttpClient } from "./http";
import snapshot from "./openapi.snapshot.json";

it("费用概览保留十进制字符串与未知值，币种与时间范围有明确契约", async () => {
  const period = {
    start: null,
    end: "2026-10-28T04:00:00Z",
    total_calls: 2,
    priced_calls: 1,
    unknown_calls: 1,
    estimated_cost_cny: "0.001392000000"
  };
  const value = {
    generated_at: period.end,
    timezone: "Asia/Shanghai",
    currency: "CNY",
    pricing_version: "fixture",
    pricing_valid_until: "2027-01-01",
    total: period,
    today: {
      ...period,
      estimated_cost_cny: null,
      priced_calls: 0,
      unknown_calls: 2
    },
    week: period,
    month: period
  };
  const get = vi.fn().mockResolvedValue(value);
  const api = createAiLedgerEndpoints({ get } as unknown as HttpClient);
  expect(await api.costOverview()).toEqual(value);
  expect(get).toHaveBeenCalledWith("/ai-ledger/cost-overview", undefined);
  expect(snapshot.paths["/admin/ai-ledger/cost-overview"]).toEqual(["get"]);
  expect(snapshot.paths["/admin/ai-ledger/costs"]).toEqual(["get"]);
  for (const invalid of [
    { ...value, currency: "USD" },
    { ...value, today: { ...period, estimated_cost_cny: 0.001392 } },
    { ...value, month: {} }
  ]) {
    get.mockResolvedValueOnce(invalid);
    await expect(api.costOverview()).rejects.toThrow(
      "AI 账本响应不符合接口契约"
    );
  }
});

it("AI 账本路径与权威契约一致，保留未知值并拒绝不完整或多余字段", async () => {
  const value = {
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    summary: {
      observed_calls: 0,
      usage_observed_calls: 0,
      cache_observed_calls: 0,
      input_tokens: null,
      output_tokens: null,
      cache_hit_tokens: null,
      cache_miss_tokens: null,
      cache_hit_rate: null,
      total_duration_ms: null,
      average_duration_ms: null
    }
  };
  const get = vi.fn().mockResolvedValue(value);
  const api = createAiLedgerEndpoints({ get } as unknown as HttpClient);
  const signal = new AbortController().signal;
  const runId = "0199bd15-8100-7000-8000-000000000001";
  expect(
    await api.list({ page: 1, page_size: 20, run_id: runId }, { signal })
  ).toEqual(value);
  expect(get).toHaveBeenCalledExactlyOnceWith(
    `/ai-ledger?page=1&page_size=20&run_id=${runId}`,
    { signal }
  );
  expect(snapshot.paths["/admin/ai-ledger"]).toEqual(["get"]);
  for (const invalid of [
    { ...value, api_key: "unexpected" },
    { ...value, summary: {} },
    { ...value, items: [{ call_id: runId }] }
  ]) {
    get.mockResolvedValueOnce(invalid);
    await expect(api.list()).rejects.toThrow("AI 账本响应不符合接口契约");
  }
});
