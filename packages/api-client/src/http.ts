// 运行环境无关的请求层。web 与 admin 各自注入 baseUrl / token。
import type { ApiResponse } from "@tsz/types";

export interface HttpClientOptions {
  baseUrl: string;
  /** 每次请求动态获取 token(SSR/CSR 都适用)。 */
  getToken?: () => string | undefined | Promise<string | undefined>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function createHttpClient({ baseUrl, getToken }: HttpClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken?.();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });

    const body = (await res.json()) as ApiResponse<T>;
    if (!res.ok || body.code !== 0) {
      throw new HttpError(
        res.status,
        body.code,
        body.message ?? res.statusText
      );
    }
    return body.data;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, data?: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(data) }),
    put: <T>(path: string, data?: unknown) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" })
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
