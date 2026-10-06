import type {
  InvitationCode,
  InvitationOverview,
  InvitationRecordPage,
  InvitationRecordsQuery
} from "@tsz/types";
import type { HttpClient } from "./http";
import { checkInteger } from "./coins";
import { validateRuntimeSchema } from "./runtime-schema";
function validate(
  name: "InvitationCode" | "InvitationOverview" | "InvitationRecordPage",
  value: unknown
) {
  const result = validateRuntimeSchema(name, value);
  if (!result.valid)
    throw new Error(
      `邀请响应不符合接口契约：${result.path} (${result.reason})`
    );
}
export function decodeInvitationOverview(value: unknown): InvitationOverview {
  validate("InvitationOverview", value);
  const result = value as InvitationOverview;
  if (result.reward_amount !== null) checkInteger(result.reward_amount);
  return result;
}
export function decodeInvitationRecords(value: unknown): InvitationRecordPage {
  validate("InvitationRecordPage", value);
  const result = value as InvitationRecordPage;
  for (const item of result.items) {
    checkInteger(item.reward_amount);
    if ((item.reward_status === "awarded") !== BigInt(item.reward_amount) > 0n)
      throw new Error("邀请奖励状态与金额不一致");
  }
  return result;
}
export function createInvitationEndpoints(http: HttpClient) {
  return {
    overview: (opts?: { signal?: AbortSignal }) =>
      http.get<unknown>("/me/invitations", opts).then(decodeInvitationOverview),
    createCode: () =>
      http.post<unknown>("/me/invitations/code").then((value) => {
        validate("InvitationCode", value);
        return value as InvitationCode;
      }),
    records: (
      query: InvitationRecordsQuery = {},
      opts?: { signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return http
        .get<unknown>(
          `/me/invitations/records${params.size ? `?${params}` : ""}`,
          opts
        )
        .then(decodeInvitationRecords);
    }
  };
}
