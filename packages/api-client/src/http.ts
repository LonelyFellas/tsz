// 运行环境无关的请求层。web 与 admin 各自注入 baseUrl / token。

import type {
  DraftValidationIssue,
  ProblemDetails,
  ProblemMeta,
  SurfaceMatchPageV2
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

const SURFACE_POLICY_NAMES = [
  "surface_warning_acknowledgement",
  "allow_new_exact_headword_entries",
  "allow_multiple_active_exact_headword_publications"
] as const;

const SURFACE_CONFIRMATION_REASONS = [
  "unacknowledged_surface_matches",
  "visibility_activation"
] as const;
const SURFACE_MATCH_CATEGORIES = [
  "exact_headword",
  "cross_kind_headword",
  "headword_form",
  "form_headword",
  "form_form"
] as const;
const SURFACE_ATTENTION_LEVELS = ["high", "normal"] as const;
const SURFACE_POLICY_BLOCK_CODES = [
  "exact_headword_creation_temporarily_disabled",
  "multiple_active_exact_headword_publications_not_enabled"
] as const;
const DIALECTS = ["common", "uk", "us"] as const;
const ENTRY_KINDS = ["word", "phrase"] as const;
const WORD_STATUSES = ["draft", "published", "archived"] as const;
const WORD_FORM_TYPES = [
  "base",
  "present_participle",
  "past_tense",
  "past_participle",
  "third_person_singular",
  "plural",
  "comparative",
  "superlative"
] as const;
const SURFACE_CONTENT_SCOPES = ["draft", "current_publication"] as const;
const RELATION_TYPES = ["synonym", "antonym", "derivative"] as const;

const HEADWORD_CANDIDATE_KEYS = [
  "candidate_type",
  "candidate_ref",
  "candidate_word_id",
  "surface",
  "normalized_surface",
  "dialect",
  "entry_kind"
] as const;
const FORM_CANDIDATE_KEYS = [
  "candidate_type",
  "candidate_ref",
  "candidate_word_id",
  "candidate_node_id",
  "surface",
  "normalized_surface",
  "dialect",
  "pos_id",
  "pos",
  "form_type"
] as const;
const HEADWORD_SOURCE_KEYS = [
  "source_kind",
  "source_id",
  "content_scope",
  "surface",
  "dialect"
] as const;
const FORM_SOURCE_KEYS = [
  "source_kind",
  "source_id",
  "source_node_id",
  "content_scope",
  "surface",
  "dialect",
  "pos_id",
  "pos",
  "form_type"
] as const;
const EXISTING_MATCH_KEYS = [
  "word_id",
  "headword",
  "kind",
  "status",
  "source"
] as const;
const SURFACE_MATCH_KEYS = [
  "match_id",
  "match_category",
  "severity",
  "attention_level",
  "can_continue",
  "confirmation_reasons",
  "candidate",
  "existing"
] as const;
const RELATION_COUNTS_KEYS = ["synonym", "antonym", "derivative"] as const;
const RELATION_PREVIEW_KEYS = [
  "source_word_id",
  "source_headword",
  "relation"
] as const;
const RELATION_SUMMARY_KEYS = [
  "total",
  "by_type",
  "previews",
  "truncated"
] as const;
const MATCHED_ENTRY_CONTEXT_KEYS = [
  "word_id",
  "pos_labels",
  "gloss_previews",
  "updated_at",
  "inbound_relations"
] as const;
const SURFACE_PAGE_BASE_KEYS = [
  "snapshot_id",
  "items",
  "total",
  "matched_entry_contexts",
  "confirmation_reasons",
  "policy_name",
  "policy_epoch"
] as const;
const SURFACE_ENABLED_NEXT_PAGE_KEYS = [
  ...SURFACE_PAGE_BASE_KEYS,
  "continuation_policy",
  "next_cursor"
] as const;
const SURFACE_ENABLED_TERMINAL_PAGE_KEYS = [
  ...SURFACE_ENABLED_NEXT_PAGE_KEYS,
  "surface_confirmation_token",
  "impact_confirmation_token"
] as const;
const SURFACE_DISABLED_PAGE_KEYS = [
  ...SURFACE_ENABLED_NEXT_PAGE_KEYS,
  "policy_block_code"
] as const;

const RFC_3339_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedArray(
  value: unknown,
  minItems: number,
  maxItems: number,
  isItem: (item: unknown) => boolean
): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.length <= maxItems &&
    value.every(isItem)
  );
}

function isConfirmationReasonArray(value: unknown): value is string[] {
  if (
    !isBoundedArray(value, 1, 2, (item) =>
      isOneOf(item, SURFACE_CONFIRMATION_REASONS)
    )
  ) {
    return false;
  }
  return new Set(value).size === value.length;
}

function isNonEmptyStringArray(value: unknown, maxItems: number): boolean {
  return isBoundedArray(
    value,
    0,
    maxItems,
    (item) => nonEmptyString(item) !== undefined
  );
}

function isDateTime(value: unknown): boolean {
  const stringValue = nonEmptyString(value);
  return (
    stringValue !== undefined &&
    RFC_3339_DATE_TIME.test(stringValue) &&
    !Number.isNaN(Date.parse(stringValue))
  );
}

function isSurfaceMatchCandidate(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (value.candidate_type === "headword") {
    return (
      hasOnlyKeys(value, HEADWORD_CANDIDATE_KEYS) &&
      hasNonEmptyStringFields(value, [
        "candidate_ref",
        "surface",
        "normalized_surface"
      ]) &&
      (value.candidate_word_id === undefined ||
        nonEmptyString(value.candidate_word_id) !== undefined) &&
      isOneOf(value.dialect, DIALECTS) &&
      isOneOf(value.entry_kind, ENTRY_KINDS)
    );
  }

  return (
    value.candidate_type === "form" &&
    hasOnlyKeys(value, FORM_CANDIDATE_KEYS) &&
    hasNonEmptyStringFields(value, [
      "candidate_ref",
      "candidate_word_id",
      "candidate_node_id",
      "surface",
      "normalized_surface",
      "pos_id",
      "pos",
      "form_type"
    ]) &&
    isOneOf(value.dialect, DIALECTS) &&
    isOneOf(value.form_type, WORD_FORM_TYPES)
  );
}

function isExistingSurfaceSource(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (value.source_kind === "headword") {
    return (
      hasOnlyKeys(value, HEADWORD_SOURCE_KEYS) &&
      hasNonEmptyStringFields(value, ["source_id", "surface"]) &&
      isOneOf(value.content_scope, SURFACE_CONTENT_SCOPES) &&
      isOneOf(value.dialect, DIALECTS)
    );
  }

  return (
    value.source_kind === "form" &&
    hasOnlyKeys(value, FORM_SOURCE_KEYS) &&
    hasNonEmptyStringFields(value, [
      "source_id",
      "source_node_id",
      "surface",
      "pos_id",
      "pos",
      "form_type"
    ]) &&
    isOneOf(value.content_scope, SURFACE_CONTENT_SCOPES) &&
    isOneOf(value.dialect, DIALECTS) &&
    isOneOf(value.form_type, WORD_FORM_TYPES)
  );
}

function isExistingSurfaceMatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, EXISTING_MATCH_KEYS) &&
    hasNonEmptyStringFields(value, ["word_id", "headword"]) &&
    isOneOf(value.kind, ENTRY_KINDS) &&
    isOneOf(value.status, WORD_STATUSES) &&
    isExistingSurfaceSource(value.source)
  );
}

function isLexiconSurfaceMatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, SURFACE_MATCH_KEYS) &&
    nonEmptyString(value.match_id) !== undefined &&
    isOneOf(value.match_category, SURFACE_MATCH_CATEGORIES) &&
    value.severity === "warning" &&
    isOneOf(value.attention_level, SURFACE_ATTENTION_LEVELS) &&
    value.can_continue === true &&
    isConfirmationReasonArray(value.confirmation_reasons) &&
    isSurfaceMatchCandidate(value.candidate) &&
    isExistingSurfaceMatch(value.existing)
  );
}

function isRelationReferenceCounts(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RELATION_COUNTS_KEYS) &&
    nonNegativeInteger(value.synonym) &&
    nonNegativeInteger(value.antonym) &&
    nonNegativeInteger(value.derivative)
  );
}

function isRelationReferencePreview(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RELATION_PREVIEW_KEYS) &&
    hasNonEmptyStringFields(value, ["source_word_id", "source_headword"]) &&
    isOneOf(value.relation, RELATION_TYPES)
  );
}

function isRelationReferenceSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RELATION_SUMMARY_KEYS) &&
    nonNegativeInteger(value.total) &&
    isRelationReferenceCounts(value.by_type) &&
    isBoundedArray(value.previews, 0, 5, isRelationReferencePreview) &&
    typeof value.truncated === "boolean"
  );
}

function isMatchedEntryContext(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, MATCHED_ENTRY_CONTEXT_KEYS) &&
    nonEmptyString(value.word_id) !== undefined &&
    isNonEmptyStringArray(value.pos_labels, 5) &&
    isNonEmptyStringArray(value.gloss_previews, 5) &&
    isDateTime(value.updated_at) &&
    isRelationReferenceSummary(value.inbound_relations)
  );
}

function hasValidSurfacePageBase(value: Record<string, unknown>): boolean {
  return (
    nonEmptyString(value.snapshot_id) !== undefined &&
    isBoundedArray(value.items, 1, 50, isLexiconSurfaceMatch) &&
    nonNegativeInteger(value.total) &&
    isBoundedArray(
      value.matched_entry_contexts,
      1,
      50,
      isMatchedEntryContext
    ) &&
    isConfirmationReasonArray(value.confirmation_reasons) &&
    isOneOf(value.policy_name, SURFACE_POLICY_NAMES) &&
    nonNegativeInteger(value.policy_epoch)
  );
}

function isSurfaceMatchPage(value: unknown): value is SurfaceMatchPageV2 {
  if (!isRecord(value) || !hasValidSurfacePageBase(value)) return false;

  if (value.continuation_policy === "enabled") {
    if (typeof value.next_cursor === "string") {
      return (
        hasOnlyKeys(value, SURFACE_ENABLED_NEXT_PAGE_KEYS) &&
        nonEmptyString(value.next_cursor) !== undefined
      );
    }
    return (
      value.next_cursor === null &&
      hasOnlyKeys(value, SURFACE_ENABLED_TERMINAL_PAGE_KEYS) &&
      nonEmptyString(value.surface_confirmation_token) !== undefined &&
      (value.impact_confirmation_token === undefined ||
        nonEmptyString(value.impact_confirmation_token) !== undefined)
    );
  }

  return (
    value.continuation_policy === "temporarily_disabled" &&
    hasOnlyKeys(value, SURFACE_DISABLED_PAGE_KEYS) &&
    (value.next_cursor === null ||
      nonEmptyString(value.next_cursor) !== undefined) &&
    isOneOf(value.policy_block_code, SURFACE_POLICY_BLOCK_CODES)
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
        !value.reference_locations.every(isProblemReferenceLocation))) ||
    (value.surface_match_page !== undefined &&
      !isSurfaceMatchPage(value.surface_match_page)) ||
    (value.current_policy_name !== undefined &&
      !SURFACE_POLICY_NAMES.includes(
        value.current_policy_name as (typeof SURFACE_POLICY_NAMES)[number]
      )) ||
    (value.current_policy_epoch !== undefined &&
      !nonNegativeInteger(value.current_policy_epoch))
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
    skipAuth = false,
    retryOnUnauthorized = true
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
    if (
      res.status === 401 &&
      !retrying &&
      token &&
      onRefresh &&
      retryOnUnauthorized
    ) {
      try {
        await onRefresh();
        return request<T>(path, init, true, skipAuth, retryOnUnauthorized);
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
    del: <T>(
      path: string,
      data?: unknown,
      opts?: { retryOnUnauthorized?: boolean }
    ) =>
      request<T>(
        path,
        {
          method: "DELETE",
          // 部分删除接口需要请求体（如注销账号需带 channel + code）。
          ...(data !== undefined ? { body: JSON.stringify(data) } : {})
        },
        false,
        false,
        opts?.retryOnUnauthorized ?? true
      )
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
