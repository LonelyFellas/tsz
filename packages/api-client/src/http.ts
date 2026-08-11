// 运行环境无关的请求层。web 与 admin 各自注入 baseUrl / token。

import type {
  DraftValidationIssue,
  ProblemDetails,
  ProblemMeta
} from "@tsz/types";

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
  /** 完整 RFC 9457 响应；响应不完整或畸形时为空。 */
  public problem?: ProblemDetails;
  /** V2 分步保存/发布的字段级问题；legacy 错误为空数组。 */
  public field_issues: DraftValidationIssue[];
  /** V2 冲突/影响确认的结构化上下文；legacy 错误缺省。 */
  public meta?: ProblemMeta;

  constructor(
    public status: number,
    message: string,
    /** 422 发布完整性检查的逐条违规(词库对接文档 §3.4);其余错误为空。 */
    public details: string[] = [],
    /**
     * 后端稳定错误码(如 403 的 "must_change_password")。文案可变、code 是稳定契约,
     * 需要按错误码分支的全局处理据此判定,而非匹配 message。多数错误无此字段。
     */
    public code?: string,
    problemOrFieldIssues?: ProblemDetails | DraftValidationIssue[],
    meta?: ProblemMeta,
    problem?: ProblemDetails
  ) {
    super(message);
    this.name = "HttpError";
    if (Array.isArray(problemOrFieldIssues)) {
      this.field_issues = problemOrFieldIssues;
      this.meta = meta;
      this.problem = problem;
    } else {
      this.field_issues = [];
      this.problem = problemOrFieldIssues;
    }
  }
}

/** 422 发布完整性检查:带 details 的 HttpError。 */
export function isIncompleteHttpError(
  err: unknown
): err is HttpError & { details: string[] } {
  return err instanceof HttpError && err.status === 422;
}

interface ParsedError {
  message: string;
  details: string[];
  code: string | undefined;
  problem: ProblemDetails | undefined;
  field_issues: DraftValidationIssue[];
  meta: ProblemMeta | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasNonEmptyStringFields(
  value: unknown,
  fields: readonly string[]
): value is Record<string, string> {
  return (
    isRecord(value) &&
    fields.every((field) => nonEmptyString(value[field]) !== undefined)
  );
}

function isDraftReferenceLocation(
  value: unknown
): value is Record<string, string> {
  return hasNonEmptyStringFields(value, [
    "source_entry_id",
    "source_publication_id",
    "source_node_id",
    "reference_kind"
  ]);
}

function isProblemReferenceLocation(
  value: unknown
): value is Record<string, string> {
  return (
    isDraftReferenceLocation(value) &&
    nonEmptyString(value.target_sense_id) !== undefined
  );
}

function toDraftValidationIssues(value: unknown): DraftValidationIssue[] {
  if (!Array.isArray(value)) return [];
  const valid = value.every(
    (issue) =>
      isRecord(issue) &&
      ["basics", "forms", "meanings"].includes(String(issue.step)) &&
      nonEmptyString(issue.node_id) !== undefined &&
      nonEmptyString(issue.field) !== undefined &&
      nonEmptyString(issue.code) !== undefined &&
      nonEmptyString(issue.message) !== undefined &&
      (issue.reference_location === undefined ||
        issue.reference_location === null ||
        isDraftReferenceLocation(issue.reference_location))
  );
  return valid ? (value as DraftValidationIssue[]) : [];
}

function toProblemMeta(value: unknown): ProblemMeta | undefined {
  if (!isRecord(value)) return undefined;
  if (
    (value.current_revision !== undefined &&
      !nonNegativeInteger(value.current_revision)) ||
    (value.current_lifecycle_revision !== undefined &&
      !nonNegativeInteger(value.current_lifecycle_revision)) ||
    (value.word_id !== undefined &&
      nonEmptyString(value.word_id) === undefined) ||
    (value.max_reachable_step !== undefined &&
      !["basics", "forms", "meanings", "preview"].includes(
        String(value.max_reachable_step)
      )) ||
    (value.affected_node_ids !== undefined &&
      (!Array.isArray(value.affected_node_ids) ||
        !value.affected_node_ids.every(
          (nodeId) => nonEmptyString(nodeId) !== undefined
        ))) ||
    (value.usage_count !== undefined &&
      (typeof value.usage_count !== "number" ||
        !Number.isInteger(value.usage_count) ||
        value.usage_count < 0)) ||
    (value.part_of_speech_id !== undefined &&
      nonEmptyString(value.part_of_speech_id) === undefined) ||
    (value.code !== undefined && nonEmptyString(value.code) === undefined) ||
    (value.reference_locations !== undefined &&
      (!Array.isArray(value.reference_locations) ||
        !value.reference_locations.every(isProblemReferenceLocation)))
  ) {
    return undefined;
  }
  return value as ProblemMeta;
}

function toProblemDetails(
  body: Record<string, unknown>,
  responseStatus: number,
  meta: ProblemMeta | undefined
): ProblemDetails | undefined {
  const type = nonEmptyString(body.type);
  const title = nonEmptyString(body.title);
  const code = nonEmptyString(body.code);
  if (
    type === undefined ||
    title === undefined ||
    !Number.isInteger(body.status) ||
    body.status !== responseStatus ||
    typeof body.detail !== "string" ||
    code === undefined ||
    (body.field !== undefined && nonEmptyString(body.field) === undefined)
  ) {
    return undefined;
  }

  return {
    type,
    title,
    status: responseStatus,
    detail: body.detail,
    code,
    ...(typeof body.field === "string" ? { field: body.field } : {}),
    ...(meta ? { meta } : {})
  };
}

async function parseError(res: Response): Promise<ParsedError> {
  try {
    const body: unknown = await res.json();
    if (isRecord(body)) {
      const meta = toProblemMeta(body.meta);
      return {
        message:
          nonEmptyString(body.detail) ??
          nonEmptyString(body.error) ??
          res.statusText,
        details: stringArray(body.details),
        code: nonEmptyString(body.code),
        problem: toProblemDetails(body, res.status, meta),
        field_issues: toDraftValidationIssues(body.field_issues),
        meta
      };
    }
  } catch {
    // ignore
  }
  return {
    message: res.statusText,
    details: [],
    code: undefined,
    problem: undefined,
    field_issues: [],
    meta: undefined
  };
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
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const res = await fetch(`${baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers
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
      const { message, details, code, problem, field_issues, meta } =
        await parseError(res);
      // 403 全局通知(如 must_change_password → 跳改密页)。只作副作用,不吞错:仍照常抛出。
      if (res.status === 403) onForbidden?.(code);
      throw new HttpError(
        res.status,
        message,
        details,
        code,
        field_issues,
        meta,
        problem
      );
    }

    // 204 No Content / 202 Accepted(otp/send)等空 body:直接 res.json() 会抛
    // SyntaxError,统一按文本解析、空则返回 undefined。
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    get: <T>(path: string, opts?: { signal?: AbortSignal }) =>
      request<T>(path, opts?.signal ? { signal: opts.signal } : {}),
    post: <T>(
      path: string,
      data?: unknown,
      opts?: {
        skipAuth?: boolean;
        signal?: AbortSignal;
        headers?: HeadersInit;
      }
    ) =>
      request<T>(
        path,
        {
          method: "POST",
          body: JSON.stringify(data),
          ...(opts?.headers ? { headers: opts.headers } : {}),
          ...(opts?.signal ? { signal: opts.signal } : {})
        },
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
