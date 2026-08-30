// 从后端权威 spec(tsz-rust/docs/openapi.json)生成一份精简契约快照,供契约测试对账。
// tsz-rust 的 spec 由 utoipa 生成；后端仓库使用
// `cargo run --locked --all-features --bin export_openapi` 原生导出。
// 快照保留 path -> [methods]、操作级 header 参数与词库对接所需的关键 schema，
// 路径会剥掉 /api/v1 前缀（前端 http baseURL 默认就是 /api/v1）。
// 用法:pnpm --filter @tsz/api-client sync:openapi
// 后端 spec 位置可用 OPENAPI_SOURCE 覆盖(CI 里 checkout 路径不同的话)。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// 具名导入而非 default:js-yaml 是 CJS,Node 25 起 ESM 互操作不再合成 default 导出。
import { load } from "js-yaml";
// 输出过一遍 prettier:JSON.stringify 直出与仓库格式不一致,
// 每次同步都会造成整文件格式抖动、淹没真实的路径增量。
import { format } from "prettier";

const here = dirname(fileURLToPath(import.meta.url));
const source =
  process.env.OPENAPI_SOURCE ??
  resolve(here, "../../../../tsz-rust/docs/openapi.json");
// 放进 src/:契约测试可直接 import(免 node 类型、免 rootDir 越界)。
const out = resolve(here, "../src/openapi.snapshot.json");
const runtimeSchemaOut = resolve(
  here,
  "../src/admin-word-v3.runtime-schema.json"
);
const runtimeOnly = process.env.SYNC_OPENAPI_RUNTIME_ONLY === "1";

const API_PREFIX = "/api/v1";
const ADMIN_LEXICON_PREFIX = `${API_PREFIX}/admin/lexicon`;
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const QUERY_CONTRACT_OPERATIONS = new Set([
  "get /admin/lexicon/entries/related-search"
]);

const RUNTIME_SCHEMA_ROOTS = [
  "AdminWordV3",
  "AdminWordAnyEnvelope",
  "AdminWordDraftAnyEnvelope",
  "AdminWordListResponse",
  "EntryLifecycleBatchResponseAny",
  "DraftValidationResponseAny",
  "FormsImpactResponseAny",
  "SurfaceMatchPageAny",
  "RelatedSearchResponse",
  "DetectLexiconResponseAny",
  "AdminWordPublicationListResponse",
  "AdminWordPublicationEnvelope",
  "DraftValidationIssueAny",
  "ProblemMeta",
  "ProblemDetails"
];
const SUPPORTED_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string"
]);
const IGNORED_ANNOTATION_KEYWORDS = new Set([
  "deprecated",
  "description",
  "discriminator",
  "example",
  "readOnly"
]);
const IGNORED_ANNOTATION_FORMATS = new Set(["int32", "int64"]);
const SUPPORTED_VALIDATION_FORMATS = new Set(["date-time", "uuid"]);

const sourceText = readFileSync(source, "utf8");
const spec = load(sourceText);
if (!spec?.paths) {
  throw new Error(`spec 无 paths 字段: ${source}`);
}
const adminWordV2 = spec.components?.schemas?.AdminWordV2;
if (!adminWordV2?.required || !adminWordV2?.properties) {
  throw new Error(`spec 无 components.schemas.AdminWordV2: ${source}`);
}
const contractSchemaNames = [
  "ErrorCode",
  "CreateAdminWordV2Input",
  "DeleteDraftInput",
  "DuplicateWordMatchV2",
  "SmartDictionaryResultV2",
  "DictionaryProviderV2",
  "DictionaryCoverageStateV2",
  "DictionaryCoverageV2",
  "DictionaryProvenanceV2",
  "DetectionSurfaceMatchPreviewV2",
  "DetectionSurfaceWarningAuditV2",
  "WordDetectionSnapshotSmartDictionaryV2",
  "WordDetectionSnapshotV2",
  "SurfaceMatchCandidateV2",
  "ExistingSurfaceSourceV2",
  "WordFormTypeV2",
  "SurfaceContentScopeV2",
  "SurfaceConfirmationReasonV2",
  "SurfaceMatchCategoryV2",
  "SurfaceAttentionLevelV2",
  "SurfaceMatchSeverityV2",
  "ExistingSurfaceMatchV2",
  "LexiconSurfaceMatchV2",
  "RelationTypeV2",
  "RelationReferenceCountsV2",
  "RelationReferencePreviewV2",
  "RelationReferenceSummaryV2",
  "MatchedEntryContextV2",
  "SurfacePolicyNameV2",
  "SurfacePolicyBlockCodeV2",
  "SurfaceContinuationEnabledV2",
  "SurfaceContinuationDisabledV2",
  "SurfaceMatchPageBaseV2",
  "SurfaceMatchEnabledNextPageV2",
  "SurfaceMatchEnabledTerminalPageV2",
  "SurfaceMatchTemporarilyDisabledPageV2",
  "SurfaceMatchPageV2",
  "ProblemMeta",
  "PreviewFormsImpactInputV2",
  "SaveFormsStepInput",
  "SaveMeaningsStepInput",
  "FormSurfaceMatchV3",
  "LegacySurfaceMatchV3",
  "SurfaceMatchItemV3",
  "V3ValidationIssueCode",
  "RelatedWordSense",
  "RelatedWordResult",
  "RelatedSearchMatchMode",
  "RelatedSearchLegacyResponse",
  "RelatedSearchV2Response",
  "RelatedSearchResponse",
  "FormsImpactItemV2",
  "FormsImpactNodeType",
  "FormsImpactResponseV2",
  "RetiredStableSlotV2",
  "DraftNodeLocation",
  "AdminWordDraftV2Envelope",
  "AdminWordListItem",
  "EntryLifecycleInput",
  "EntryLifecycleTarget",
  "EntryLifecycleBatchInput",
  "EntryLifecycleBatchResponse",
  "ActivatePublicationInput",
  "SuggestDialectVariantsResponseV2",
  "ContentCompletionScope",
  "ContentCompletionFillPolicy",
  "ContentCompletionJobStatus",
  "ContentCompletionPartitionStatus",
  "CreateContentCompletionJobInput",
  "RetryContentCompletionJobInput",
  "ContentCompletionDictionaryProvenance",
  "ContentCompletionGenerationProvenance",
  "ContentCompletionEvidenceKind",
  "ContentCompletionFieldOrigins",
  "ContentCompletionProvenance",
  "ContentCompletionPartition",
  "ContentCompletionJob",
  "ContentCompletionJobEnvelope",
  "VoiceCapabilities",
  "VoiceResponse",
  "VoiceListResponse",
  "CreatePreviewRequest",
  "PreviewCacheStatus",
  "PreviewResponse"
];
for (const name of contractSchemaNames) {
  if (!spec.components?.schemas?.[name]) {
    throw new Error(`spec 无 components.schemas.${name}: ${source}`);
  }
}

function assertPlainObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} 必须是 schema object`);
  }
}

function assertFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} 必须是有限数字`);
  }
}

function collectComponentSchemaClosure(rootSchemas, sourceSchemas) {
  const componentPrefix = "#/components/schemas/";
  const pending = [...rootSchemas];
  const collected = new Set();

  while (pending.length > 0) {
    const { schema, path } = pending.shift();
    if (Array.isArray(schema)) {
      pending.push(
        ...schema.map((item, index) => ({
          schema: item,
          path: `${path}[${index}]`
        }))
      );
      continue;
    }
    if (schema === null || typeof schema !== "object") continue;

    for (const [keyword, value] of Object.entries(schema)) {
      if (keyword !== "$ref") {
        pending.push({ schema: value, path: `${path}.${keyword}` });
        continue;
      }
      if (
        typeof value !== "string" ||
        !value.startsWith(componentPrefix) ||
        value.length === componentPrefix.length
      ) {
        throw new Error(`${path} 含无法快照的 schema ref: ${value}`);
      }
      const name = value.slice(componentPrefix.length);
      if (collected.has(name)) continue;
      const componentSchema = sourceSchemas[name];
      if (!componentSchema) {
        throw new Error(`${path} 引用不存在的 components.schemas.${name}`);
      }
      collected.add(name);
      pending.push({
        schema: componentSchema,
        path: `components.schemas.${name}`
      });
    }
  }

  return [...collected].sort();
}

function sanitizeRuntimeSchema(schema, path, referencedNames) {
  assertPlainObject(schema, path);
  const sanitized = {};

  for (const [keyword, value] of Object.entries(schema)) {
    if (IGNORED_ANNOTATION_KEYWORDS.has(keyword)) continue;

    switch (keyword) {
      case "$ref": {
        if (typeof value !== "string") {
          throw new Error(`${path}.$ref 必须是字符串`);
        }
        const prefix = "#/components/schemas/";
        if (!value.startsWith(prefix) || value.length === prefix.length) {
          throw new Error(`${path} 含 evaluator 不支持的 $ref: ${value}`);
        }
        const name = value.slice(prefix.length);
        referencedNames.add(name);
        sanitized.$ref = `#/$defs/${name}`;
        break;
      }
      case "type": {
        const types = Array.isArray(value) ? value : [value];
        if (
          types.length === 0 ||
          new Set(types).size !== types.length ||
          types.some(
            (type) =>
              typeof type !== "string" || !SUPPORTED_SCHEMA_TYPES.has(type)
          )
        ) {
          throw new Error(`${path}.type 含 evaluator 不支持的类型`);
        }
        sanitized.type = Array.isArray(value) ? [...types] : types[0];
        break;
      }
      case "enum":
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.some(
            (item) =>
              item !== null &&
              !["boolean", "number", "string"].includes(typeof item)
          )
        ) {
          throw new Error(`${path}.enum 仅支持非空 JSON primitive 数组`);
        }
        sanitized.enum = value;
        break;
      case "required":
        if (
          !Array.isArray(value) ||
          new Set(value).size !== value.length ||
          value.some((property) => typeof property !== "string")
        ) {
          throw new Error(`${path}.required 必须是不重复的字符串数组`);
        }
        sanitized.required = value;
        break;
      case "properties": {
        assertPlainObject(value, `${path}.properties`);
        sanitized.properties = Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([property, propertySchema]) => [
              property,
              sanitizeRuntimeSchema(
                propertySchema,
                `${path}.properties.${property}`,
                referencedNames
              )
            ])
        );
        break;
      }
      case "additionalProperties":
        if (value !== false) {
          throw new Error(
            `${path}.additionalProperties 含 evaluator 不支持的开放或 typed map 语义`
          );
        }
        sanitized.additionalProperties = false;
        break;
      case "items":
        sanitized.items = sanitizeRuntimeSchema(
          value,
          `${path}.items`,
          referencedNames
        );
        break;
      case "oneOf":
      case "anyOf":
      case "allOf":
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error(`${path}.${keyword} 必须是非空 schema 数组`);
        }
        sanitized[keyword] = value.map((branch, index) =>
          sanitizeRuntimeSchema(
            branch,
            `${path}.${keyword}[${index}]`,
            referencedNames
          )
        );
        break;
      case "format":
        if (IGNORED_ANNOTATION_FORMATS.has(value)) break;
        if (
          typeof value !== "string" ||
          !SUPPORTED_VALIDATION_FORMATS.has(value)
        ) {
          throw new Error(`${path}.format 含 evaluator 不支持的格式: ${value}`);
        }
        sanitized.format = value;
        break;
      case "minimum":
      case "maximum":
      case "minLength":
      case "maxLength":
      case "minItems":
      case "maxItems":
        assertFiniteNumber(value, `${path}.${keyword}`);
        if (
          ["minLength", "maxLength", "minItems", "maxItems"].includes(
            keyword
          ) &&
          (!Number.isInteger(value) || value < 0)
        ) {
          throw new Error(`${path}.${keyword} 必须是非负整数`);
        }
        sanitized[keyword] = value;
        break;
      default:
        throw new Error(
          `${path} 含 evaluator 未明确支持的 schema keyword: ${keyword}`
        );
    }
  }

  return sanitized;
}

function buildRuntimeSchemaBundle() {
  const sourceSchemas = spec.components?.schemas;
  assertPlainObject(sourceSchemas, "spec.components.schemas");

  const pending = [...RUNTIME_SCHEMA_ROOTS];
  const collected = new Map();
  while (pending.length > 0) {
    const name = pending.shift();
    if (collected.has(name)) continue;
    const schema = sourceSchemas[name];
    if (!schema) {
      throw new Error(`spec 无 runtime schema root/ref: ${name}`);
    }
    const referencedNames = new Set();
    collected.set(
      name,
      sanitizeRuntimeSchema(
        schema,
        `components.schemas.${name}`,
        referencedNames
      )
    );
    pending.push(...[...referencedNames].sort());
  }

  return {
    _note:
      "AUTO-GENERATED minimal response/error schema closure. 勿手改；重新运行 sync:openapi。",
    _source: source,
    _source_sha256: createHash("sha256").update(sourceText).digest("hex"),
    roots: RUNTIME_SCHEMA_ROOTS,
    $defs: Object.fromEntries(
      [...collected.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    )
  };
}

const runtimeSchemaBundle = buildRuntimeSchemaBundle();

const paths = {};
const operationHeaders = {};
const operationQueryParameters = {};
const operationSchemas = {};
for (const [rawPath, item] of Object.entries(spec.paths)) {
  const path = rawPath.startsWith(API_PREFIX)
    ? rawPath.slice(API_PREFIX.length)
    : rawPath;
  const methods = Object.keys(item)
    .filter((key) => HTTP_METHODS.includes(key))
    .sort();
  if (methods.length) paths[path] = methods;

  for (const method of methods) {
    const operation = item[method];
    const parameters = [
      ...(Array.isArray(item.parameters) ? item.parameters : []),
      ...(Array.isArray(operation?.parameters) ? operation.parameters : [])
    ];
    const headers = parameters
      .filter((parameter) => parameter?.in === "header")
      .map((parameter) => {
        if (!parameter.name || !parameter.schema) {
          throw new Error(`无法快照未内联的 header 参数: ${method} ${rawPath}`);
        }
        return {
          name: parameter.name,
          in: parameter.in,
          required: parameter.required === true,
          schema: parameter.schema
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    if (headers.length > 0) {
      operationHeaders[`${method} ${path}`] = headers;
    }

    const operationKey = `${method} ${path}`;
    if (rawPath.startsWith(ADMIN_LEXICON_PREFIX)) {
      const requestSchema =
        operation?.requestBody?.content?.["application/json"]?.schema ?? null;
      const responses = Object.fromEntries(
        Object.entries(operation?.responses ?? {})
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([status, response]) => [
            status,
            response?.content?.["application/json"]?.schema ??
              response?.content?.["application/problem+json"]?.schema ??
              null
          ])
      );
      operationSchemas[operationKey] = { request: requestSchema, responses };
    }
    if (QUERY_CONTRACT_OPERATIONS.has(operationKey)) {
      operationQueryParameters[operationKey] = parameters
        .filter((parameter) => parameter?.in === "query")
        .map((parameter) => {
          if (!parameter.name || !parameter.schema) {
            throw new Error(
              `无法快照未内联的 query 参数: ${method} ${rawPath}`
            );
          }
          return {
            name: parameter.name,
            in: parameter.in,
            required: parameter.required === true,
            schema: parameter.schema
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    }
  }
}

const operationRequestSchemaNames = collectComponentSchemaClosure(
  Object.entries(operationSchemas)
    .filter(([, operation]) => operation.request !== null)
    .map(([operationKey, operation]) => ({
      schema: operation.request,
      path: `operationSchemas.${operationKey}.request`
    })),
  spec.components.schemas
);
const snapshotSchemaNames = [
  ...new Set([...contractSchemaNames, ...operationRequestSchemaNames])
];

const snapshotBase = {
  // 仅供人读:这份快照是从哪生成的、何时。契约测试不依赖这些字段。
  _note:
    "AUTO-GENERATED from backend docs/openapi.json via `pnpm --filter @tsz/api-client sync:openapi`. 勿手改。",
  _source: source,
  paths,
  operationHeaders,
  operationQueryParameters,
  operationSchemas,
  schemas: {
    AdminWordV2: {
      required: adminWordV2.required,
      properties: {
        status: adminWordV2.properties.status,
        revision: adminWordV2.properties.revision,
        lifecycle_revision: adminWordV2.properties.lifecycle_revision,
        archived_at: adminWordV2.properties.archived_at,
        archived_by: adminWordV2.properties.archived_by,
        published_revision: adminWordV2.properties.published_revision,
        has_unpublished_changes: adminWordV2.properties.has_unpublished_changes
      }
    },
    ...Object.fromEntries(
      snapshotSchemaNames.map((name) => [name, spec.components.schemas[name]])
    )
  }
};

let previousSnapshot;
try {
  previousSnapshot = JSON.parse(readFileSync(out, "utf8"));
} catch {
  previousSnapshot = undefined;
}
const previousGeneratedAt = previousSnapshot?._generatedAt;
const previousWithoutGeneratedAt = previousSnapshot
  ? Object.fromEntries(
      Object.entries(previousSnapshot).filter(([key]) => key !== "_generatedAt")
    )
  : undefined;
const snapshotUnchanged =
  previousWithoutGeneratedAt !== undefined &&
  JSON.stringify(previousWithoutGeneratedAt) === JSON.stringify(snapshotBase);
const { _note, _source, ...snapshotContent } = snapshotBase;
const snapshot = {
  _note,
  _source,
  _generatedAt:
    snapshotUnchanged && typeof previousGeneratedAt === "string"
      ? previousGeneratedAt
      : new Date().toISOString(),
  ...snapshotContent
};

if (!runtimeOnly) {
  writeFileSync(
    out,
    await format(JSON.stringify(snapshot), { parser: "json" })
  );
}
writeFileSync(
  runtimeSchemaOut,
  await format(JSON.stringify(runtimeSchemaBundle), { parser: "json" })
);
console.log(
  `${runtimeOnly ? "⏭️ 保留现有 OpenAPI endpoint 快照" : `✅ 写入 ${out}\n   共 ${Object.keys(paths).length} 条路径`}\n✅ 写入 ${runtimeSchemaOut}\n   共 ${Object.keys(runtimeSchemaBundle.$defs).length} 个最小 schema`
);
