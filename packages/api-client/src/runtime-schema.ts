import runtimeSchemaBundleJson from "./admin-word-v3.runtime-schema.json";

export const RUNTIME_SCHEMA_ROOTS = [
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
] as const;

export type RuntimeSchemaRoot = (typeof RUNTIME_SCHEMA_ROOTS)[number];

export type RuntimeSchemaFailureReason =
  | "above_maximum"
  | "ambiguous_union_match"
  | "below_minimum"
  | "enum_mismatch"
  | "invalid_format"
  | "invalid_schema"
  | "missing_required_property"
  | "no_union_match"
  | "too_few_items"
  | "too_long"
  | "too_many_items"
  | "too_short"
  | "unexpected_property"
  | "wrong_type";

export type RuntimeSchemaReceivedType =
  "array" | "boolean" | "missing" | "null" | "number" | "object" | "string";

export type RuntimeSchemaValidationResult =
  | { valid: true }
  | {
      valid: false;
      path: string;
      reason: RuntimeSchemaFailureReason;
      received_type: RuntimeSchemaReceivedType;
    };

type RuntimeSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, RuntimeSchema>;
  additionalProperties?: false;
  items?: RuntimeSchema;
  oneOf?: RuntimeSchema[];
  anyOf?: RuntimeSchema[];
  allOf?: RuntimeSchema[];
  format?: "date-time" | "uuid";
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

type RuntimeSchemaBundle = {
  roots: string[];
  $defs: Record<string, RuntimeSchema>;
};

const runtimeSchemaBundle =
  runtimeSchemaBundleJson as unknown as RuntimeSchemaBundle;

function receivedType(value: unknown): RuntimeSchemaReceivedType {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  if (type === "boolean" || type === "number" || type === "string") {
    return type;
  }
  return "object";
}

function failure(
  path: string,
  reason: RuntimeSchemaFailureReason,
  value: unknown
): RuntimeSchemaValidationResult & { valid: false } {
  return { valid: false, path, reason, received_type: receivedType(value) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value)
      );
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRfc3339(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/u.exec(
      value
    );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1]! &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function validateSchema(
  schema: RuntimeSchema,
  value: unknown,
  path: string
): (RuntimeSchemaValidationResult & { valid: false }) | undefined {
  if (schema.$ref !== undefined) {
    const prefix = "#/$defs/";
    if (!schema.$ref.startsWith(prefix)) {
      return failure(path, "invalid_schema", value);
    }
    const referenced =
      runtimeSchemaBundle.$defs[schema.$ref.slice(prefix.length)];
    if (!referenced) return failure(path, "invalid_schema", value);
    const referencedFailure = validateSchema(referenced, value, path);
    if (referencedFailure) return referencedFailure;
  }

  if (schema.allOf !== undefined) {
    for (const branch of schema.allOf) {
      const branchFailure = validateSchema(branch, value, path);
      if (branchFailure) return branchFailure;
    }
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(type, value))) {
      return failure(path, "wrong_type", value);
    }
  }

  if (
    schema.enum !== undefined &&
    !schema.enum.some((candidate) => Object.is(candidate, value))
  ) {
    return failure(path, "enum_mismatch", value);
  }

  if (schema.oneOf !== undefined) {
    const matchCount = schema.oneOf.reduce(
      (count, branch) =>
        validateSchema(branch, value, path) === undefined ? count + 1 : count,
      0
    );
    if (matchCount === 0) return failure(path, "no_union_match", value);
    if (matchCount > 1) return failure(path, "ambiguous_union_match", value);
  }

  if (
    schema.anyOf !== undefined &&
    !schema.anyOf.some(
      (branch) => validateSchema(branch, value, path) === undefined
    )
  ) {
    return failure(path, "no_union_match", value);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return failure(path, "below_minimum", value);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return failure(path, "above_maximum", value);
    }
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      return failure(path, "too_short", value);
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      return failure(path, "too_long", value);
    }
    if (
      schema.format !== undefined &&
      !(
        (schema.format === "uuid" && isUuid(value)) ||
        (schema.format === "date-time" && isRfc3339(value))
      )
    ) {
      return failure(path, "invalid_format", value);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return failure(path, "too_few_items", value);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return failure(path, "too_many_items", value);
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        const itemFailure = validateSchema(
          schema.items,
          value[index],
          `${path}[${index}]`
        );
        if (itemFailure) return itemFailure;
      }
    }
  }

  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const property of schema.required ?? []) {
      if (!Object.hasOwn(value, property)) {
        return failure(
          `${path}.${property}`,
          "missing_required_property",
          undefined
        );
      }
    }
    for (const [property, propertySchema] of Object.entries(properties)) {
      if (!Object.hasOwn(value, property)) continue;
      const propertyFailure = validateSchema(
        propertySchema,
        value[property],
        `${path}.${property}`
      );
      if (propertyFailure) return propertyFailure;
    }
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some(
        (property) => !Object.hasOwn(properties, property)
      )
    ) {
      return failure(path, "unexpected_property", value);
    }
  }

  return undefined;
}

export function validateRuntimeSchema(
  rootName: RuntimeSchemaRoot,
  value: unknown
): RuntimeSchemaValidationResult {
  const root = runtimeSchemaBundle.$defs[rootName];
  if (!root) return failure("$", "invalid_schema", value);
  return validateSchema(root, value, "$") ?? { valid: true };
}
