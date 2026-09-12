import type { EntryAnnotationResponse } from "@tsz/types";
import type {
  AdminWordV3Envelope,
  AdminWordDraftV3Envelope,
  AdminWordListResponseAny,
  AdminWordPublicationEnvelope,
  AdminWordPublicationListResponse,
  AdminWordV3,
  DetectLexiconSurfaceResponseV3,
  V3DraftValidationIssue,
  DraftValidationResponseV3,
  EntryDeleteBatchResponse,
  EntryLifecycleBatchResponse,
  FormsImpactResponseV3,
  ResolveSentenceTargetsV3Response,
  SearchComponentTargetsV3Response,
  RelatedSearchResponseAny,
  SurfaceMatchPageV3
} from "@tsz/types";
import {
  validateRuntimeSchema,
  type RuntimeSchemaFailureReason,
  type RuntimeSchemaReceivedType,
  type RuntimeSchemaRoot
} from "./runtime-schema";

type AdminWordSchemaVersion = 3;
type SupportedSchemaVersions = readonly AdminWordSchemaVersion[];

export const SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS = Object.freeze([
  3
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
    readonly supported_schema_versions: SupportedSchemaVersions = SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
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

/**
 * 批量永久删除只回 { affected }：词条已不存在，没有实体可校验版本。
 * 但仍要挡住结构漂移——affected 不是非负整数就说明契约变了，
 * 静默当 0 会让 UI 报「已删除 0 条」而掩盖真实故障。
 */
export function decodeEntryDeleteBatchResponse(
  value: unknown
): EntryDeleteBatchResponse {
  const affected = isRecord(value) ? value.affected : undefined;
  if (typeof affected !== "number") {
    throw new InvalidAdminWordResponseError(
      "affected",
      affected === undefined ? "missing_required_property" : "wrong_type",
      describeReceivedType(affected) as RuntimeSchemaReceivedType
    );
  }
  if (!Number.isInteger(affected) || affected < 0) {
    throw new InvalidAdminWordResponseError(
      "affected",
      affected < 0 ? "below_minimum" : "wrong_type",
      "number"
    );
  }
  return value as EntryDeleteBatchResponse;
}

export function decodeAdminWordV3Envelope(
  value: unknown
): AdminWordV3Envelope & { word: AdminWordV3 } {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordV3", word, "$.word");
  assertRuntimeContract("AdminWordV3Envelope", value);
  return value as AdminWordV3Envelope & { word: AdminWordV3 };
}

export function decodeAdminWordAnyEnvelope(
  value: unknown
): AdminWordV3Envelope {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordV3Envelope", value);
  return value as AdminWordV3Envelope;
}

export function decodeAdminWordDraftAnyEnvelope(
  value: unknown
): AdminWordDraftV3Envelope {
  const word = isRecord(value) ? value.word : undefined;
  assertSupportedSchemaVersion(
    word,
    "word.schema_version",
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordDraftV3Envelope", value);
  return value as AdminWordDraftV3Envelope;
}

export function decodeAdminWordAnyListResponse(
  value: unknown
): AdminWordListResponseAny {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(words, "words", SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS);
  assertRuntimeContract("AdminWordListResponse", value);
  return value as AdminWordListResponseAny;
}

export function decodeEntryLifecycleBatchAnyResponse(
  value: unknown
): EntryLifecycleBatchResponse {
  const words = isRecord(value) ? value.words : undefined;
  assertVersionedArray(words, "words", SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS);
  assertRuntimeContract("EntryLifecycleBatchResponse", value);
  return value as EntryLifecycleBatchResponse;
}

function decodeVersionedRoot<T>(
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
): DraftValidationResponseV3 {
  return decodeVersionedRoot("DraftValidationResponseV3", value);
}

export function decodeDraftValidationResponseV3(
  value: unknown
): DraftValidationResponseV3 {
  return decodeV3VersionedRoot("DraftValidationResponseV3", value);
}

export function decodeFormsImpactResponseAny(
  value: unknown
): FormsImpactResponseV3 {
  return decodeVersionedRoot("FormsImpactResponseV3", value);
}

export function decodeFormsImpactResponseV3(
  value: unknown
): FormsImpactResponseV3 {
  return decodeV3VersionedRoot("FormsImpactResponseV3", value);
}

export function decodeSurfaceMatchPageAny(value: unknown): SurfaceMatchPageV3 {
  return decodeVersionedRoot("SurfaceMatchPageV3", value);
}

export function decodeSurfaceMatchPageV3(value: unknown): SurfaceMatchPageV3 {
  return decodeV3VersionedRoot("SurfaceMatchPageV3", value);
}

export function decodeDetectLexiconResponseAny(
  value: unknown
): DetectLexiconSurfaceResponseV3 {
  return decodeVersionedRoot("DetectLexiconSurfaceResponseV3", value);
}

export function decodeDetectLexiconResponseV3(
  value: unknown
): DetectLexiconSurfaceResponseV3 {
  return decodeV3VersionedRoot("DetectLexiconSurfaceResponseV3", value);
}

export function decodeDraftValidationIssueAny(
  value: unknown
): V3DraftValidationIssue {
  return decodeVersionedRoot("V3DraftValidationIssue", value);
}

export function decodeRelatedSearchResponseAny(
  value: unknown
): RelatedSearchResponseAny {
  const results = isRecord(value) ? value.results : undefined;
  if (Array.isArray(results)) {
    assertVersionedArray(
      results,
      "results",
      SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
    );
  }
  assertRuntimeContract("RelatedSearchResponse", value);
  return value as RelatedSearchResponseAny;
}

export function decodeResolveSentenceTargetsV3Response(
  value: unknown
): ResolveSentenceTargetsV3Response {
  assertRuntimeContract("ResolveSentenceTargetsV3Response", value);
  return value as ResolveSentenceTargetsV3Response;
}

export function decodeSearchComponentTargetsV3Response(
  value: unknown
): SearchComponentTargetsV3Response {
  assertRuntimeContract("SearchComponentTargetsV3Response", value);
  return value as SearchComponentTargetsV3Response;
}

export function decodeAdminWordPublicationListResponse(
  value: unknown
): AdminWordPublicationListResponse {
  const publications = isRecord(value) ? value.publications : undefined;
  if (Array.isArray(publications)) {
    assertVersionedArray(
      publications,
      "publications",
      SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
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
    SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS
  );
  assertRuntimeContract("AdminWordPublicationEnvelope", value);
  return value as AdminWordPublicationEnvelope;
}

export function decodeEntryAnnotationResponse(
  value: unknown
): EntryAnnotationResponse {
  assertRuntimeContract("EntryAnnotationResponse", value);
  return value as EntryAnnotationResponse;
}
