import type {
  ChatGPTAccounts,
  ChatGPTLogin,
  ChatGPTLoginStatus,
  ChatGPTLogout
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";

function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  if (!validateRuntimeSchema(root, value).valid)
    throw new Error("ChatGPT 响应不符合接口契约");
  return value as T;
}

export function createChatGPTEndpoints(http: HttpClient) {
  function validateLogin(value: ChatGPTLogin): ChatGPTLogin {
    const url = new URL(value.authorization_url);
    const redirect = url.searchParams.getAll("redirect_uri");
    if (
      url.origin !== "https://auth.openai.com" ||
      url.pathname !== "/api/accounts/authorize" ||
      url.username ||
      url.password ||
      url.hash ||
      redirect.length !== 1 ||
      [
        "access_token",
        "refresh_token",
        "id_token",
        "id_token_hint",
        "client_secret"
      ].some((key) => url.searchParams.has(key))
    )
      throw new Error("ChatGPT 授权地址无效");
    const callback = new URL(redirect[0]!);
    if (
      callback.protocol !== "http:" ||
      callback.hostname !== "127.0.0.1" ||
      callback.pathname !== "/auth/callback" ||
      !callback.port ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash
    )
      throw new Error("ChatGPT 回调地址无效");
    return value;
  }
  return {
    accounts: async (options?: {
      signal?: AbortSignal;
    }): Promise<ChatGPTAccounts> => {
      const value = decode<ChatGPTAccounts>(
        "ChatGPTAccounts",
        await http.get<unknown>("/chatgpt", options)
      );
      if (value.pending_login) validateLogin(value.pending_login);
      return value;
    },
    login: async (clientId: string | null = null): Promise<ChatGPTLogin> => {
      const value = decode<ChatGPTLogin>(
        "ChatGPTLogin",
        await http.post<unknown>("/chatgpt/login", { client_id: clientId })
      );
      return validateLogin(value);
    },
    loginStatus: async (
      attemptId: string,
      options?: { signal?: AbortSignal }
    ): Promise<ChatGPTLoginStatus> =>
      decode(
        "ChatGPTLoginStatus",
        await http.get<unknown>(
          `/chatgpt/login/${encodeURIComponent(attemptId)}`,
          options
        )
      ),
    cancelLogin: async (attemptId: string): Promise<ChatGPTLoginStatus> =>
      decode(
        "ChatGPTLoginStatus",
        await http.del<unknown>(
          `/chatgpt/login/${encodeURIComponent(attemptId)}`
        )
      ),
    useAccount: async (clientId: string): Promise<ChatGPTAccounts> =>
      decode(
        "ChatGPTAccounts",
        await http.put<unknown>("/chatgpt/account", { client_id: clientId })
      ),
    logout: async (clientId: string): Promise<ChatGPTLogout> =>
      decode(
        "ChatGPTLogout",
        await http.del<unknown>(
          `/chatgpt/accounts/${encodeURIComponent(clientId)}`
        )
      )
  };
}
