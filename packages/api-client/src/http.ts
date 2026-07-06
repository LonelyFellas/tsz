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
  /**
   * 收到 403 时以副作用形式通知(携带业务 code)。用于全局分支——如
   * code==="must_change_password" 时整页跳改密页。仅通知、不吞错:请求仍照常抛 HttpError,
   * 调用方可继续 catch 做局部处理。web 端不传即维持原行为(向后兼容)。
   */
  onForbidden?: (code: string | undefined) => void;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** 422 发布完整性检查的逐条违规(词库对接文档 §3.4);其余错误为空。 */
    public details: string[] = [],
    /**
     * 后端稳定错误码(如 403 的 "must_change_password")。文案可变、code 是稳定契约,
     * 需要按错误码分支的全局处理据此判定,而非匹配 message。多数错误无此字段。
     */
    public code?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 422 发布完整性检查:带 details 的 HttpError。 */
export function isIncompleteHttpError(
  err: unknown
): err is HttpError & { details: string[] } {
  return err instanceof HttpError && err.status === 422;
}

async function parseError(
  res: Response
): Promise<{ message: string; details: string[]; code?: string }> {
  try {
    const body = (await res.json()) as {
      error?: string;
      details?: string[];
      code?: string;
    };
    if (body.error) {
      return {
        message: body.error,
        details: body.details ?? [],
        code: body.code
      };
    }
  } catch {
    // ignore
  }
  return { message: res.statusText, details: [] };
}

export function createHttpClient({
  baseUrl,
  getToken,
  onRefresh,
  onSessionExpired,
  onForbidden
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
      const { message, details, code } = await parseError(res);
      // 403 全局通知(如 must_change_password → 跳改密页)。只作副作用,不吞错:仍照常抛出。
      if (res.status === 403) onForbidden?.(code);
      throw new HttpError(res.status, message, details, code);
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
