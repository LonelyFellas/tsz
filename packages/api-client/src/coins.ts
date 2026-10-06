import type { CoinEntriesQuery, CoinEntryPage, CoinWallet } from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

export function checkInteger(value: string) {
  const amount = BigInt(value);
  // Entry deltas originate from positive i64 amounts, so i64::MIN is also excluded.
  if (amount < -9223372036854775807n || amount > 9223372036854775807n)
    throw new Error("天生币响应整数超出 BIGINT 范围");
}
export function decodeCoinWallet(value: unknown): CoinWallet {
  const result = validateRuntimeSchema("CoinWallet", value);
  if (!result.valid)
    throw new Error(
      `钱包响应不符合接口契约：${result.path} (${result.reason})`
    );
  const wallet = value as CoinWallet;
  checkInteger(wallet.balance);
  return wallet;
}
export function decodeCoinEntryPage(value: unknown): CoinEntryPage {
  const result = validateRuntimeSchema("CoinEntryPage", value);
  if (!result.valid)
    throw new Error(
      `流水响应不符合接口契约：${result.path} (${result.reason})`
    );
  const page = value as CoinEntryPage;
  checkInteger(page.snapshot);
  for (const entry of page.items) {
    checkInteger(entry.id);
    checkInteger(entry.delta);
    checkInteger(entry.balance_after);
  }
  return page;
}
/** Base URL determines user/admin realm. No arbitrary account or write endpoint. */
export function createCoinEndpoints(http: HttpClient) {
  return {
    wallet: (opts?: { signal?: AbortSignal }) =>
      http.get<unknown>("/me/coins/wallet", opts).then(decodeCoinWallet),
    entries: (
      query: CoinEntriesQuery = {},
      opts?: { signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      const suffix = params.size ? `?${params}` : "";
      return http
        .get<unknown>(`/me/coins/entries${suffix}`, opts)
        .then(decodeCoinEntryPage);
    }
  };
}
