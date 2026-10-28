import type {
  OpenCodeConnection,
  OpenCodeLogin,
  OpenCodeModelList,
  OpenCodeProviderList,
  OpenCodeModelSelection,
  OpenCodeLoginStatus
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";

function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  if (!validateRuntimeSchema(root, value).valid)
    throw new Error("OpenCode 响应不符合接口契约");
  return value as T;
}

export function createOpenCodeEndpoints(http: HttpClient) {
  return {
    models: async (options?: {
      signal?: AbortSignal;
    }): Promise<OpenCodeModelList> =>
      decode(
        "OpenCodeModelList",
        await http.get<unknown>("/opencode/models", options)
      ),
    providers: async (options?: {
      signal?: AbortSignal;
    }): Promise<OpenCodeProviderList> =>
      decode(
        "OpenCodeProviderList",
        await http.get<unknown>("/opencode/providers", options)
      ),
    currentModel: async (options?: {
      signal?: AbortSignal;
    }): Promise<OpenCodeModelSelection> =>
      decode(
        "OpenCodeModelSelection",
        await http.get<unknown>("/opencode/model", options)
      ),
    selectModel: async (
      body: OpenCodeModelSelection
    ): Promise<OpenCodeModelSelection> =>
      decode(
        "OpenCodeModelSelection",
        await http.put<unknown>("/opencode/model", body)
      ),
    connectKey: (body: {
      provider_id: string;
      api_key: string;
    }): Promise<void> => http.post<void>("/opencode/keys", body),
    connection: async (options?: {
      signal?: AbortSignal;
    }): Promise<OpenCodeConnection> =>
      decode(
        "OpenCodeConnection",
        await http.get<unknown>("/opencode", options)
      ),
    login: async (): Promise<OpenCodeLogin> => {
      const result = decode<OpenCodeLogin>(
        "OpenCodeLogin",
        await http.post<unknown>("/opencode/login")
      );
      const url = new URL(result.authorization_url);
      if (
        url.origin !== "https://opencode.ai" ||
        url.pathname !== "/console/device" ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error("OpenCode 授权地址无效");
      return result;
    },
    loginStatus: async (
      attemptId: string,
      options?: { signal?: AbortSignal }
    ): Promise<OpenCodeLoginStatus> =>
      decode(
        "OpenCodeLoginStatus",
        await http.get<unknown>(
          `/opencode/login/${encodeURIComponent(attemptId)}`,
          options
        )
      ),
    cancelLogin: (attemptId: string): Promise<void> =>
      http.del(`/opencode/login/${encodeURIComponent(attemptId)}`)
  };
}
