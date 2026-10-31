import type {
  AdminDubbingGroupsV3Response,
  SaveAdminPairedDubbingGroupInput
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

const headers = {
  "X-TSZ-Voice-Models": "v1",
  "X-TSZ-Dubbing-Groups": "v3"
};

export function decodeDubbingGroupsV3(
  value: unknown
): AdminDubbingGroupsV3Response {
  if (!validateRuntimeSchema("DubbingGroupsV3Response", value).valid)
    throw new Error("配对推荐响应不符合接口契约，请保留草稿并更新服务");
  return value as AdminDubbingGroupsV3Response;
}

export function createDubbingGroupsV3Endpoints(http: HttpClient) {
  return {
    groupsV3: (signal?: AbortSignal) =>
      http
        .get<unknown>("/speech/groups", { signal, headers })
        .then(decodeDubbingGroupsV3),
    savePairedGroup: (
      input: SaveAdminPairedDubbingGroupInput,
      create = false
    ) =>
      (create
        ? http.post<unknown>("/speech/groups", input, { headers })
        : http.put<unknown>(
            `/speech/groups/${encodeURIComponent(input.group.id)}`,
            input,
            { headers }
          )
      ).then(decodeDubbingGroupsV3),
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
