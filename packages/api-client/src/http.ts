// 运行环境无关的请求层。web 与 admin 各自注入 baseUrl / token。

export interface HttpClientOptions {
  baseUrl: string;
  /** 每次请求动态获取 access token。 */
  getToken?: () => string | undefined | Promise<string | undefined>;
  /**
   * access token 过期(401)时调用。实现应：
   *   1. 用 refresh token 换取新的 access token
   *   2. 持久化新 token 并返回新的 access token 字符串
   *   3. 若 refresh 本身也 401 则抛出(http 层会调 onSessionExpired)
   */
  onRefresh?: () => Promise<string>;
  /** refresh 失败后调用(通常跳转登录页)。 */
  onSessionExpired?: () => void;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return res.statusText;
}

export function createHttpClient({
  baseUrl,
  getToken,
  onRefresh,
  onSessionExpired
}: HttpClientOptions) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    retrying = false,
    skipAuth = false
  ): Promise<T> {
    // 公开端点(登录/注册等)不带 access token，避免遗留的旧 token 污染请求。
    const token = skipAuth ? undefined : await getToken?.();
    const res = await fetch(`${baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });

    // 只有携带了 access token 的请求才触发 refresh 逻辑。
    // 无 token 时(如登录接口)，401 代表凭证错误，直接抛出即可。
    if (res.status === 401 && !retrying && token && onRefresh) {
      try {
        await onRefresh();
        return request<T>(path, init, true);
      } catch {
        onSessionExpired?.();
        throw new HttpError(401, "session expired");
      }
    }

    if (!res.ok) {
      throw new HttpError(res.status, await parseError(res));
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, data?: unknown, opts?: { skipAuth?: boolean }) =>
      request<T>(
        path,
        { method: "POST", body: JSON.stringify(data) },
        false,
        opts?.skipAuth
      ),
    put: <T>(path: string, data?: unknown) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
    patch: <T>(path: string, data?: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
    del: <T>(path: string, data?: unknown) =>
      request<T>(path, {
        method: "DELETE",
        // 部分删除接口需要请求体（如注销账号需带 channel + code）。
        ...(data !== undefined ? { body: JSON.stringify(data) } : {})
      })
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
