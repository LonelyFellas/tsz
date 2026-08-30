import type {
  AdminWordAnyEnvelope,
  AdminWordDraftAnyEnvelope,
  AdminWordDraftV2Envelope,
  AdminWordListResponseAny,
  AdminWordPublicationEnvelope,
  AdminWordPublicationListResponse,
  AdminWordV2Envelope,
  AdminWordV2ListResponse,
  AdminWordV3,
  DetectLexiconResponseAny,
  DetectLexiconSurfaceResponseV3,
  DraftValidationIssueAny,
  DraftValidationResponseAny,
  DraftValidationResponseV3,
  EntryLifecycleBatchResponse,
  EntryLifecycleBatchResponseAny,
  FormsImpactResponseAny,
  FormsImpactResponseV3,
  RelatedSearchResponseAny,
  SurfaceMatchPageAny,
  SurfaceMatchPageV3
} from "@tsz/types";
import {
  validateRuntimeSchema,
  type RuntimeSchemaFailureReason,
  type RuntimeSchemaReceivedType,
  type RuntimeSchemaRoot
} from "./runtime-schema";

type AdminWordSchemaVersion = 2 | 3;
type SupportedSchemaVersions = readonly AdminWordSchemaVersion[];

export const SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS = Object.freeze([2] as const);
export const SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS = Object.freeze([
  3
] as const);
export const SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS = Object.freeze([
  2, 3
] as const);

/**
 * HTTP 已成功，但词条响应版本不是当前 decoder 可消费版本。
 *
 * 错误对象只保留安全的版本诊断，不持有完整响应，也不回显字符串、对象或数组，
 * 避免常规日志带出词条正文。
 */
export class UnsupportedAdminWordSchemaVersionError extends Error {
  readonly code = "unsupported_schema_version" as const;
  readonly source = "client_response_guard" as const;
  readonly received_schema_version: number | undefined;
  readonly received_schema_version_type:
    | "missing"
    | "null"
    | "array"
    | "object"
    | "number"
    | "string"
    | "boolean"
    | "bigint"
    | "symbol"
    | "function";
  readonly reason: "missing" | "wrong_type" | "unsupported";

  constructor(
    receivedSchemaVersion: unknown,
    readonly response_path: string,
    readonly supported_schema_versions: SupportedSchemaVersions = SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS
  ) {
    super("当前前端不支持该词条数据版本，请升级后重试");
    this.name = "UnsupportedAdminWordSchemaVersionError";
    this.received_schema_version =
      typeof receivedSchemaVersion === "number"
        ? receivedSchemaVersion
        : undefined;
    this.received_schema_version_type = describeReceivedType(
      receivedSchemaVersion
    );
    this.reason =
      receivedSchemaVersion === undefined
        ? "missing"
        : typeof receivedSchemaVersion === "number"
          ? "unsupported"
          : "wrong_type";
  }
}

/** 完整 runtime shape 与正式 OpenAPI 不一致；不保存原始 payload。 */
export class InvalidAdminWordResponseError extends Error {
  readonly code = "invalid_admin_word_response" as const;
  readonly source = "client_response_guard" as const;

  constructor(
    readonly response_path: string,
    readonly reason: RuntimeSchemaFailureReason,
    readonly received_type: RuntimeSchemaReceivedType
  ) {
    super("词条响应格式与当前客户端契约不一致，请稍后重试");
    this.name = "InvalidAdminWordResponseError";
  }
}

function describeReceivedType(
  value: unknown
): UnsupportedAdminWordSchemaVersionError["received_schema_version_type"] {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as Exclude<
    UnsupportedAdminWordSchemaVersionError["received_schema_version_type"],
    "missing" | "null" | "array"
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMatchingSourceRangeAlias(
  sourceRange: Record<string, unknown>,
  sourceSegments: unknown[]
): boolean {
  const firstSegment = sourceSegments[0];
  return (
    Object.keys(sourceRange).length === 3 &&
    isRecord(firstSegment) &&
    sourceRange.start === firstSegment.start &&
    sourceRange.end === firstSegment.end &&
    sourceRange.surface === firstSegment.surface
  );
}

function runtimeCompatibilityValue(
  value: unknown,
  withinV3Word = false
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => runtimeCompatibilityValue(item, withinV3Word));
  }
  if (!isRecord(value)) return value;
  const nextWithinV3Word = withinV3Word || value.schema_version === 3;
  const mapped = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      runtimeCompatibilityValue(item, nextWithinV3Word)
    ])
  );
  if (
    nextWithinV3Word &&
    isRecord(mapped.source_range) &&
    Array.isArray(mapped.source_segments) &&
    isMatchingSourceRangeAlias(mapped.source_range, mapped.source_segments)
  ) {
    const { source_range: _legacyAlias, ...association } = mapped;
    return association;
  }
  if (
    nextWithinV3Word &&
    isRecord(mapped.source_range) &&
    !Object.hasOwn(mapped, "source_segments") &&
    !Object.hasOwn(mapped, "association_schema_version") &&
    !Object.hasOwn(mapped, "state") &&
    !Object.hasOwn(mapped, "target_component_usages") &&
    typeof mapped.id === "string" &&
    typeof mapped.source_dialect === "string" &&
    typeof mapped.target_word_id === "string" &&
    typeof mapped.target_sense_id === "string"
  ) {
    const { source_range, ...association } = mapped;
    return {
      ...association,
      association_schema_version: 3,
      source_segments: [source_range],
      state: "linked",
      target_component_usages: []
    };
  }
  if (
    !nextWithinV3Word &&
    isRecord(mapped.source_range) &&
    typeof mapped.id === "string" &&
    typeof mapped.source_dialect === "string" &&
    typeof mapped.target_word_id === "string" &&
    typeof mapped.target_sense_id === "string" &&
    !Object.hasOwn(mapped, "state")
  ) {
    return { ...mapped, state: "linked" };
  }
  return mapped;
}

function addLegacyAssociationAliases(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(addLegacyAssociationAliases);
    return;
  }
  if (!isRecord(value)) return;
  if (
    value.association_schema_version === 3 &&
    Array.isArray(value.source_segments) &&
    value.source_segments.length > 0 &&
    !Object.hasOwn(value, "source_range")
  ) {
    value.source_range = value.source_segments[0];
  }
  Object.values(value).forEach(addLegacyAssociationAliases);
}

function assertSupportedSchemaVersion(
  value: unknown,
  responsePath: string,
  supportedVersions: SupportedSchemaVersions
): asserts value is { schema_version: AdminWordSchemaVersion } {
  const receivedSchemaVersion = isRecord(value)
    ? value.schema_version
    : undefined;
  if (
    typeof receivedSchemaVersion !== "number" ||
    !supportedVersions.includes(receivedSchemaVersion as AdminWordSchemaVersion)
  ) {
    throw new UnsupportedAdminWordSchemaVersionError(
      receivedSchemaVersion,
      responsePath,
      supportedVersions
    );
  }
}

function assertVersionedArray(
  value: unknown,
  containerPath: string,
  supportedVersions: SupportedSchemaVersions
): asserts value is Array<{ schema_version: AdminWordSchemaVersion }> {
  if (!Array.isArray(value)) {
    throw new UnsupportedAdminWordSchemaVersionError(
      undefined,
      containerPath,
      supportedVersions
    );
  }
  value.forEach((item, index) => {
    assertSupportedSchemaVersion(
      item,
      `${containerPath}[${index}].schema_version`,
      supportedVersions
    );
  });
}

function assertRuntimeContract(
  rootName: RuntimeSchemaRoot,
  value: unknown,
  pathPrefix = "$"
): void {
  const result = validateRuntimeSchema(
    rootName,
    runtimeCompatibilityValue(value)
  );
  if (!result.valid) {
    const responsePath =
      pathPrefix === "$"
        ? result.path
        : `${pathPrefix}${result.path === "$" ? "" : result.path.slice(1)}`;
    throw new InvalidAdminWordResponseError(
      responsePath,
      result.reason,
      result.received_type
    );
  }
  addLegacyAssociationAliases(value);
}

/** 旧 Admin UI 保持 V2-only；这里只增加版本防火墙，不改变既有 wire 消费。 */
export function decodeAdminWordV2Envelope(value: unknown): AdminWordV2Envelope {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS
  );
  return value as AdminWordV2Envelope;
}

/** GET 详情的 V2 schema guard；retired slots 的完整 shape 仍由正式契约负责。 */
export function decodeAdminWordDraftV2Envelope(
  value: unknown
): AdminWordDraftV2Envelope {
  decodeAdminWordV2Envelope(value);
  return value as AdminWordDraftV2Envelope;
}

/** 任一列表行版本未知时拒绝整个 V2-only 响应，不过滤后伪装成功。 */
export function decodeAdminWordV2ListResponse(
  value: unknown
): AdminWordV2ListResponse {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(words, "words", SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS);
  return value as AdminWordV2ListResponse;
}

/** 旧批量命令同样不能让未知版本词条进入 V2 UI 状态。 */
export function decodeEntryLifecycleBatchV2Response(
  value: unknown
): EntryLifecycleBatchResponse {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(words, "words", SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS);
  return value as EntryLifecycleBatchResponse;
}

export function decodeAdminWordV3Envelope(
  value: unknown
): AdminWordAnyEnvelope & { word: AdminWordV3 } {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordV3", word, "$.word");
  assertRuntimeContract("AdminWordAnyEnvelope", value);
  return value as AdminWordAnyEnvelope & { word: AdminWordV3 };
}

export function decodeAdminWordAnyEnvelope(
  value: unknown
): AdminWordAnyEnvelope {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordAnyEnvelope", value);
  return value as AdminWordAnyEnvelope;
}

export function decodeAdminWordDraftAnyEnvelope(
  value: unknown
): AdminWordDraftAnyEnvelope {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordDraftAnyEnvelope", value);
  return value as AdminWordDraftAnyEnvelope;
}

export function decodeAdminWordAnyListResponse(
  value: unknown
): AdminWordListResponseAny {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(
    words,
    "words",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordListResponse", value);
  return value as AdminWordListResponseAny;
}

export function decodeEntryLifecycleBatchAnyResponse(
  value: unknown
): EntryLifecycleBatchResponseAny {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(
    words,
    "words",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract("EntryLifecycleBatchResponseAny", value);
  return value as EntryLifecycleBatchResponseAny;
}

function decodeVersionedRoot<T>(
  rootName: RuntimeSchemaRoot,
  value: unknown
): T {
  assertSupportedSchemaVersion(
    value,
    "schema_version",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract(rootName, value);
  return value as T;
}

function decodeV3VersionedRoot<T>(
  rootName: RuntimeSchemaRoot,
  value: unknown
): T {
  assertSupportedSchemaVersion(
    value,
    "schema_version",
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract(rootName, value);
  return value as T;
}

export function decodeDraftValidationResponseAny(
  value: unknown
): DraftValidationResponseAny {
  return decodeVersionedRoot("DraftValidationResponseAny", value);
}

export function decodeDraftValidationResponseV3(
  value: unknown
): DraftValidationResponseV3 {
  return decodeV3VersionedRoot("DraftValidationResponseAny", value);
}

export function decodeFormsImpactResponseAny(
  value: unknown
): FormsImpactResponseAny {
  return decodeVersionedRoot("FormsImpactResponseAny", value);
}

export function decodeFormsImpactResponseV3(
  value: unknown
): FormsImpactResponseV3 {
  return decodeV3VersionedRoot("FormsImpactResponseAny", value);
}

export function decodeSurfaceMatchPageAny(value: unknown): SurfaceMatchPageAny {
  return decodeVersionedRoot("SurfaceMatchPageAny", value);
}

export function decodeSurfaceMatchPageV3(value: unknown): SurfaceMatchPageV3 {
  return decodeV3VersionedRoot("SurfaceMatchPageAny", value);
}

export function decodeDetectLexiconResponseAny(
  value: unknown
): DetectLexiconResponseAny {
  return decodeVersionedRoot("DetectLexiconResponseAny", value);
}

export function decodeDetectLexiconResponseV3(
  value: unknown
): DetectLexiconSurfaceResponseV3 {
  return decodeV3VersionedRoot("DetectLexiconResponseAny", value);
}

export function decodeDraftValidationIssueAny(
  value: unknown
): DraftValidationIssueAny {
  return decodeVersionedRoot("DraftValidationIssueAny", value);
}

export function decodeRelatedSearchResponseAny(
  value: unknown
): RelatedSearchResponseAny {
  const results = isRecord(value) ? value.results : undefined;
  if (Array.isArray(results)) {
    assertVersionedArray(
      results,
      "results",
      SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
    );
  }
  assertRuntimeContract("RelatedSearchResponse", value);
  return value as RelatedSearchResponseAny;
}

export function decodeAdminWordPublicationListResponse(
  value: unknown
): AdminWordPublicationListResponse {
  const publications = isRecord(value) ? value.publications : undefined;
  if (Array.isArray(publications)) {
    assertVersionedArray(
      publications,
      "publications",
      SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
    );
  }
  assertRuntimeContract("AdminWordPublicationListResponse", value);
  return value as AdminWordPublicationListResponse;
}

export function decodeAdminWordPublicationEnvelope(
  value: unknown
): AdminWordPublicationEnvelope {
  const publication = isRecord(value) ? value.publication : undefined;
  assertSupportedSchemaVersion(
    publication,
    "publication.schema_version",
    SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordPublicationEnvelope", value);
  return value as AdminWordPublicationEnvelope;
}
