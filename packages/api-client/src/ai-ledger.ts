import type {
  AiCostLedgerPage,
  AiCostOverview,
  AiLedgerPage,
  AiLedgerQuery
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";

export function createAiLedgerEndpoints(http: HttpClient) {
  let purposeFilterSupported: boolean | undefined;
  async function read<T>(
    path: string,
    root: RuntimeSchemaRoot,
    query: AiLedgerQuery,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    if (query.purpose && purposeFilterSupported !== true) {
      const { purpose: _purpose, ...unfiltered } = query;
      const capability = await read<AiCostLedgerPage>(
        "/ai-ledger/costs",
        "AiCostLedgerPage",
        unfiltered,
        options
      );
      if (capability.ledger.purpose_filter_supported !== true)
        throw new Error("当前服务不支持用途筛选");
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const result = await http.get<unknown>(
      `${path}${params.size ? `?${params}` : ""}`,
      { ...options, headers: { "x-tsz-ledger-version": "2" } }
    );
    if (!validateRuntimeSchema(root, result).valid)
      throw new Error("AI 账本响应不符合接口契约");
    if (root === "AiCostLedgerPage")
      purposeFilterSupported =
        (result as AiCostLedgerPage).ledger.purpose_filter_supported === true;
    if (root === "AiLedgerPage")
      purposeFilterSupported =
        (result as AiLedgerPage).purpose_filter_supported === true;
    return result as T;
  }
  return {
    list: (
      query: AiLedgerQuery = {},
      options?: { signal?: AbortSignal }
    ): Promise<AiLedgerPage> =>
      read("/ai-ledger", "AiLedgerPage", query, options),
    costs: (
      query: AiLedgerQuery = {},
      options?: { signal?: AbortSignal }
    ): Promise<AiCostLedgerPage> =>
      read("/ai-ledger/costs", "AiCostLedgerPage", query, options),
    costOverview: (options?: {
      signal?: AbortSignal;
    }): Promise<AiCostOverview> =>
      read("/ai-ledger/cost-overview", "AiCostOverview", {}, options)
  };
}
