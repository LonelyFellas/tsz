import type {
  AccountDeletionRequest,
  AccountDeletionState,
  CreateAccountDeletionRequest
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";
function decodeRequest(value: unknown): AccountDeletionRequest {
  const result = validateRuntimeSchema("AccountDeletionRequest", value);
  if (!result.valid) throw new Error(`注销申请响应不符合契约：${result.path}`);
  const request = value as AccountDeletionRequest;
  if (BigInt(request.confirmed_balance) > 9223372036854775807n)
    throw new Error("注销金额超出范围");
  return request;
}
function decodeState(value: unknown): AccountDeletionState {
  const result = validateRuntimeSchema("AccountDeletionState", value);
  if (!result.valid) throw new Error(`注销状态响应不符合契约：${result.path}`);
  const state = value as AccountDeletionState;
  if (BigInt(state.coin_balance) > 9223372036854775807n)
    throw new Error("注销金额超出范围");
  if (state.request) decodeRequest(state.request);
  return state;
}
export function createAccountDeletionEndpoints(http: HttpClient) {
  return {
    accountDeletion: () =>
      http.get<unknown>("/me/account-deletion").then(decodeState),
    requestAccountDeletion: (input: CreateAccountDeletionRequest) =>
      http
        .post<unknown>("/me/account-deletion", input, {
          retryOnUnauthorized: () => false
        })
        .then(decodeRequest),
    cancelAccountDeletion: (id: string) =>
      http
        .post<unknown>(`/me/account-deletion/${id}/cancel`, undefined, {
          retryOnUnauthorized: () => false
        })
        .then(decodeRequest)
  };
}
