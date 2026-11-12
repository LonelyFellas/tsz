import type {
  AdminDubbingGroupsV3Response,
  SaveAdminDubbingGroupOrderInput,
  SaveAdminDubbingGroupInput
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

const headers = {};

export function decodeDubbingGroupsV3(
  value: unknown
): AdminDubbingGroupsV3Response {
  if (!validateRuntimeSchema("DubbingGroupsResponse", value).valid)
    throw new Error("分组推荐响应不符合接口契约，请保留草稿并更新服务");
  return value as AdminDubbingGroupsV3Response;
}

export function createDubbingGroupsV3Endpoints(http: HttpClient) {
  return {
    groupsV3: (signal?: AbortSignal) =>
      http
        .get<unknown>("/speech/groups", { signal, headers })
        .then(decodeDubbingGroupsV3),
    saveIndependentGroup: (input: SaveAdminDubbingGroupInput, create = false) =>
      (create
        ? http.post<unknown>("/speech/groups", input, { headers })
        : http.put<unknown>(
            `/speech/groups/${encodeURIComponent(input.group.id)}`,
            input,
            { headers }
          )
      ).then(decodeDubbingGroupsV3),
    saveGroupOrder: (input: SaveAdminDubbingGroupOrderInput) =>
      http
        .put<unknown>("/speech/groups/order", input, { headers })
        .then(decodeDubbingGroupsV3),
    deleteGroupV3: (id: string, base_revision: number) =>
      http
        .del<unknown>(
          `/speech/groups/${encodeURIComponent(id)}`,
          { base_revision },
          { headers }
        )
        .then(decodeDubbingGroupsV3)
  };
}
