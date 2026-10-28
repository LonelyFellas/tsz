import { expect, it, vi } from "vitest";
import { createAiLedgerEndpoints } from "./ai-ledger";
import type { HttpClient } from "./http";
import snapshot from "./openapi.snapshot.json";

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
