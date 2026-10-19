import type {
  CoinAccountPage,
  CoinAccountsQuery,
  CoinEntriesQuery,
  CoinOperationsQuery,
  CoinOwnerType,
  ManualCoinOperation,
  ManualCoinOperationPage,
  ManualCreditRequest,
  ManualReversalRequest
} from "@tsz/types";
import type { HttpClient } from "./http";
import { checkInteger, decodeCoinEntryPage } from "./coins";
import { validateRuntimeSchema } from "./runtime-schema";

function decode<T>(
  name: "CoinAccountPage" | "ManualCoinOperation" | "ManualCoinOperationPage",
  value: unknown
): T {
  const result = validateRuntimeSchema(name, value);
  if (!result.valid)
    throw new Error(
      `天生币管理响应不符合接口契约：${result.path} (${result.reason})`
    );
  if (name === "CoinAccountPage") {
    for (const row of (value as CoinAccountPage).items)
      checkInteger(row.balance);
  } else {
    const items =
      name === "ManualCoinOperation"
        ? [value as ManualCoinOperation]
        : (value as ManualCoinOperationPage).items;
    for (const row of items) {
      checkInteger(row.delta);
      checkInteger(row.balance_after);
    }
  }
  return value as T;
}
function suffix(query: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
export function createAdminCoinEndpoints(http: HttpClient) {
  return {
    accounts: (query: CoinAccountsQuery, opts?: { signal?: AbortSignal }) =>
      http
        .get<unknown>(`/coins/accounts${suffix(query)}`, opts)
        .then((v) => decode<CoinAccountPage>("CoinAccountPage", v)),
    entries: (
      owner_type: CoinOwnerType,
      owner_id: string,
      query: CoinEntriesQuery = {},
      opts?: { signal?: AbortSignal }
    ) =>
      http
        .get<unknown>(
          `/coins/accounts/${owner_type}/${owner_id}/entries${suffix(query)}`,
          opts
        )
        .then(decodeCoinEntryPage),
    operations: (
      query: CoinOperationsQuery = {},
      opts?: { signal?: AbortSignal }
    ) =>
      http
        .get<unknown>(`/coins/operations${suffix(query)}`, opts)
        .then((v) =>
          decode<ManualCoinOperationPage>("ManualCoinOperationPage", v)
        ),
    credit: (body: ManualCreditRequest) =>
      http
        .post<unknown>("/coins/manual-credits", body)
        .then((v) => decode<ManualCoinOperation>("ManualCoinOperation", v)),
    reverse: (id: string, body: ManualReversalRequest) =>
      http
        .post<unknown>(`/coins/manual-credits/${id}/reversal`, body)
        .then((v) => decode<ManualCoinOperation>("ManualCoinOperation", v))
  };
}
