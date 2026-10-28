import type { AiLedgerPage, AiLedgerQuery } from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

export function createAiLedgerEndpoints(http: HttpClient) {
  return {
    list: async (
      query: AiLedgerQuery = {},
      options?: { signal?: AbortSignal }
    ): Promise<AiLedgerPage> => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      const result = await http.get<unknown>(
        `/ai-ledger${params.size ? `?${params}` : ""}`,
        options
      );
      const validation = validateRuntimeSchema("AiLedgerPage", result);
      if (!validation.valid) throw new Error("AI 账本响应不符合接口契约");
      return result as AiLedgerPage;
    }
  };
}
