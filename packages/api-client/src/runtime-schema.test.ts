import { beforeAll, describe, expect, it, vi } from "vitest";
import runtimeSchemaBundleJson from "./admin-word-v3.runtime-schema.json";
import type {
  RuntimeSchemaRoot,
  validateRuntimeSchema as validateRuntimeSchemaType
} from "./runtime-schema";

type RuntimeSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, RuntimeSchema>;
  additionalProperties?: false | RuntimeSchema;
  items?: RuntimeSchema;
  oneOf?: RuntimeSchema[];
  anyOf?: RuntimeSchema[];
  allOf?: RuntimeSchema[];
  format?: string;
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

const ROOTS = [
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
] as const satisfies readonly RuntimeSchemaRoot[];

const UUID_V4 = "7a4fcb34-2f9b-4b20-8f7c-01bb5361ab77";
const UUID_V5 = "2ed6657d-e927-568b-95e1-2665a8aea6a2";
const UUID_V7 = "01890f5f-4fb1-7cc2-98c6-3f37ac1b2206";
const RFC3339 = "2026-08-24T17:30:00.123+08:00";

let validateRuntimeSchema: typeof validateRuntimeSchemaType;

function resolveRef(ref: string): RuntimeSchema {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`unexpected generated ref: ${ref}`);
  }
  const name = ref.slice(prefix.length);
  const schema = runtimeSchemaBundle.$defs[name];
  if (!schema) throw new Error(`missing generated ref: ${name}`);
  return schema;
}

function buildValidValue(
  schema: RuntimeSchema,
  activeRefs = new Set<string>()
): unknown {
  if (schema.$ref) {
    if (activeRefs.has(schema.$ref)) {
      throw new Error(
        `required recursive schema is not fixture-safe: ${schema.$ref}`
      );
    }
    const nextRefs = new Set(activeRefs).add(schema.$ref);
    return buildValidValue(resolveRef(schema.$ref), nextRefs);
  }

  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.oneOf && schema.oneOf.length > 0) {
    return buildValidValue(schema.oneOf[0]!, activeRefs);
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return buildValidValue(schema.anyOf[0]!, activeRefs);
  }
  if (schema.allOf && schema.allOf.length > 0) {
    const values = schema.allOf.map((part) =>
      buildValidValue(part, activeRefs)
    );
    if (values.every((value) => isRecord(value))) {
      return Object.assign({}, ...values);
    }
    return values[0];
  }

  const type = Array.isArray(schema.type)
    ? (schema.type.find((candidate) => candidate !== "null") ?? "null")
    : schema.type;
  switch (type) {
    case "object":
      return Object.fromEntries(
        (schema.required ?? []).map((property) => {
          const propertySchema = schema.properties?.[property];
          if (!propertySchema) {
            throw new Error(`required property has no schema: ${property}`);
          }
          return [property, buildValidValue(propertySchema, activeRefs)];
        })
      );
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () =>
        buildValidValue(schema.items!, activeRefs)
      );
    case "string":
      if (schema.format === "uuid") return UUID_V4;
      if (schema.format === "date-time") return RFC3339;
      return "x".repeat(Math.max(schema.minLength ?? 0, 1));
    case "integer":
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      throw new Error(`fixture cannot build schema type: ${String(type)}`);
  }
}

function validFixture(root: RuntimeSchemaRoot): unknown {
  const schema = runtimeSchemaBundle.$defs[root];
  if (!schema) throw new Error(`missing generated root: ${root}`);
  return buildValidValue(schema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

beforeAll(async () => {
  ({ validateRuntimeSchema } = await import("./runtime-schema"));
});

describe("OpenAPI generated runtime schema", () => {
  it("冻结 V3 词性级英美拼写与音标规则", () => {
    const pos = runtimeSchemaBundle.$defs.WordPosFormsV3!;
    const rules = runtimeSchemaBundle.$defs.DialectRulesV3!;
    const mode = runtimeSchemaBundle.$defs.DialectModeV3!;

    expect(pos.required).toContain("dialect_rules");
    expect(pos.properties?.dialect_rules).toEqual({
      $ref: "#/$defs/DialectRulesV3"
    });
    expect(rules.required).toEqual(["spelling_mode", "phonetic_mode"]);
    expect(rules.additionalProperties).toBe(false);
    expect(mode.enum).toEqual(["unified", "distinguish"]);
  });

  it("只打包冻结的 response/error roots，且所有 $ref 均落在最小 $defs 闭包内", () => {
    expect(runtimeSchemaBundle.roots).toEqual(ROOTS);

    const reachable = new Set<string>();
    const pending: string[] = [...ROOTS];
    while (pending.length > 0) {
      const name = pending.shift()!;
      if (reachable.has(name)) continue;
      reachable.add(name);
      const schema = runtimeSchemaBundle.$defs[name];
      expect(schema, `missing generated ref ${name}`).toBeDefined();
      const refs = [
        ...JSON.stringify(schema).matchAll(/#\/\$defs\/([^"\\]+)/g)
      ].map((match) => match[1]!);
      pending.push(...refs);
    }

    expect([...reachable].sort()).toEqual(
      Object.keys(runtimeSchemaBundle.$defs).sort()
    );
  });

  it.each(ROOTS)("%s 接受由同一闭包构造的最小合法响应", (root) => {
    expect(validateRuntimeSchema(root, validFixture(root))).toEqual({
      valid: true
    });
  });
});

describe("runtime schema fail-closed diagnostics", () => {
  it.each([
    {
      name: "根类型错误",
      value: null,
      expected: {
        valid: false,
        path: "$",
        reason: "wrong_type",
        received_type: "null"
      }
    },
    {
      name: "整数不接受小数",
      value: { current_revision: 1.5 },
      expected: {
        valid: false,
        path: "$.current_revision",
        reason: "wrong_type",
        received_type: "number"
      }
    },
    {
      name: "minimum",
      value: { current_policy_epoch: -1 },
      expected: {
        valid: false,
        path: "$.current_policy_epoch",
        reason: "below_minimum",
        received_type: "number"
      }
    },
    {
      name: "uuid",
      value: { affected_node_ids: ["not-a-uuid"] },
      expected: {
        valid: false,
        path: "$.affected_node_ids[0]",
        reason: "invalid_format",
        received_type: "string"
      }
    },
    {
      name: "required",
      value: { reference_locations: [{}] },
      expected: {
        valid: false,
        path: "$.reference_locations[0].target_sense_id",
        reason: "missing_required_property",
        received_type: "missing"
      }
    }
  ])("$name", ({ value, expected }) => {
    expect(validateRuntimeSchema("ProblemMeta", value)).toEqual(expected);
  });

  it("extra key 只报告父节点，不泄露 key 或 raw value", () => {
    const result = validateRuntimeSchema("ProblemMeta", {
      secret_key: "secret-value"
    });

    expect(result).toEqual({
      valid: false,
      path: "$",
      reason: "unexpected_property",
      received_type: "object"
    });
    expect(JSON.stringify(result)).not.toContain("secret_key");
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("enum mismatch 不泄露 received/allowed values", () => {
    const result = validateRuntimeSchema("ProblemMeta", {
      current_policy_name: "secret-enum-value"
    });

    expect(result).toEqual({
      valid: false,
      path: "$.current_policy_name",
      reason: "enum_mismatch",
      received_type: "string"
    });
    expect(JSON.stringify(result)).not.toContain("secret-enum-value");
    expect(JSON.stringify(result)).not.toContain(
      "surface_warning_acknowledgement"
    );
  });
});

describe("wire format and collection boundaries", () => {
  it("uuid 接受通用 RFC UUID（至少 v4/v5/v7），只拒绝 malformed", () => {
    expect(
      validateRuntimeSchema("ProblemMeta", { affected_node_ids: [UUID_V4] })
    ).toEqual({ valid: true });
    expect(
      validateRuntimeSchema("ProblemMeta", { affected_node_ids: [UUID_V5] })
    ).toEqual({ valid: true });
    expect(
      validateRuntimeSchema("ProblemMeta", { affected_node_ids: [UUID_V7] })
    ).toEqual({ valid: true });
    expect(
      validateRuntimeSchema("ProblemMeta", {
        affected_node_ids: ["not-a-uuid"]
      })
    ).toMatchObject({
      valid: false,
      path: "$.affected_node_ids[0]",
      reason: "invalid_format"
    });
  });

  it("date-time 按 RFC3339 校验且必须带时区", () => {
    const word = validFixture("AdminWordV3") as Record<string, unknown>;
    word.created_at = RFC3339;
    expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });

    word.created_at = "2024-02-29T09:30:00Z";
    expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });
    word.created_at = "2000-02-29T09:30:00Z";
    expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });

    word.created_at = "1900-02-29T09:30:00Z";
    expect(validateRuntimeSchema("AdminWordV3", word)).toMatchObject({
      valid: false,
      path: "$.created_at",
      reason: "invalid_format"
    });

    word.created_at = "2026-08-24T17:30:00";
    expect(validateRuntimeSchema("AdminWordV3", word)).toMatchObject({
      valid: false,
      path: "$.created_at",
      reason: "invalid_format",
      received_type: "string"
    });
  });

  it("maxLength 按 Unicode code point 计数", () => {
    const word = validFixture("AdminWordV3") as {
      meanings: { sense_groups: unknown[] };
    };
    const group = {
      id: UUID_V4,
      name_en: "ok",
      name_zh: "🙂".repeat(200)
    };
    word.meanings.sense_groups = [group];
    expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });

    group.name_zh += "🙂";
    expect(validateRuntimeSchema("AdminWordV3", word)).toMatchObject({
      valid: false,
      path: "$.meanings.sense_groups[0].name_zh",
      reason: "too_long",
      received_type: "string"
    });
  });

  it("maxItems 在 2000/2001 边界分别接受与拒绝", () => {
    const word = validFixture("AdminWordV3") as {
      meanings: { sense_groups: unknown[] };
    };
    const group = { id: UUID_V4, name_en: "ok", name_zh: "好" };
    word.meanings.sense_groups = Array.from({ length: 2000 }, () => group);
    expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });

    word.meanings.sense_groups.push(group);
    expect(validateRuntimeSchema("AdminWordV3", word)).toMatchObject({
      valid: false,
      path: "$.meanings.sense_groups",
      reason: "too_many_items",
      received_type: "array"
    });
  });
});

describe("evaluator supported-keyword matrix", () => {
  it("支持 $ref/type null union/oneOf/anyOf/allOf/min/max/length/items", async () => {
    vi.resetModules();
    vi.doMock("./admin-word-v3.runtime-schema.json", () => ({
      default: {
        roots: ["AdminWordV3", "ProblemMeta"],
        $defs: {
          AdminWordV3: {
            type: "object",
            required: ["choice", "fallback", "nullable", "amount", "list"],
            properties: {
              choice: { oneOf: [{ enum: ["a"] }, { enum: ["b"] }] },
              fallback: {
                anyOf: [{ type: "integer" }, { $ref: "#/$defs/Label" }]
              },
              nullable: { type: ["string", "null"] },
              amount: { type: "number", minimum: 1, maximum: 2 },
              list: {
                type: "array",
                minItems: 1,
                maxItems: 2,
                items: { type: "boolean" }
              },
              ambiguous: { oneOf: [{ type: "number" }, { type: "integer" }] }
            },
            additionalProperties: false
          },
          ProblemMeta: {
            allOf: [
              { type: "string", minLength: 2 },
              { type: "string", maxLength: 3 }
            ]
          },
          AdminWordAnyEnvelope: { $ref: "#/unsupported/Ref" },
          AdminWordDraftAnyEnvelope: { $ref: "#/$defs/Missing" },
          AdminWordListResponse: { type: "unsupported" },
          EntryLifecycleBatchResponseAny: { type: "array" },
          Label: { type: "string", minLength: 2 }
        }
      }
    }));
    const mocked = await import("./runtime-schema");
    const valid = {
      choice: "a",
      fallback: "ok",
      nullable: null,
      amount: 2,
      list: [true]
    };

    expect(mocked.validateRuntimeSchema("AdminWordV3", valid)).toEqual({
      valid: true
    });
    expect(mocked.validateRuntimeSchema("ProblemMeta", "ab")).toEqual({
      valid: true
    });
    expect(mocked.validateRuntimeSchema("ProblemMeta", "a")).toMatchObject({
      reason: "too_short",
      path: "$"
    });
    expect(mocked.validateRuntimeSchema("ProblemMeta", "abcd")).toMatchObject({
      reason: "too_long",
      path: "$"
    });
    expect(
      mocked.validateRuntimeSchema("AdminWordV3", { ...valid, amount: 3 })
    ).toMatchObject({ reason: "above_maximum", path: "$.amount" });
    expect(
      mocked.validateRuntimeSchema("AdminWordV3", { ...valid, list: [] })
    ).toMatchObject({ reason: "too_few_items", path: "$.list" });
    expect(
      mocked.validateRuntimeSchema("AdminWordV3", { ...valid, choice: "c" })
    ).toMatchObject({ reason: "no_union_match", path: "$.choice" });
    expect(
      mocked.validateRuntimeSchema("AdminWordV3", {
        ...valid,
        fallback: false
      })
    ).toMatchObject({ reason: "no_union_match", path: "$.fallback" });
    expect(
      mocked.validateRuntimeSchema("AdminWordV3", { ...valid, ambiguous: 1 })
    ).toMatchObject({ reason: "ambiguous_union_match", path: "$.ambiguous" });
    expect(
      mocked.validateRuntimeSchema("AdminWordAnyEnvelope", {})
    ).toMatchObject({ reason: "invalid_schema", path: "$" });
    expect(
      mocked.validateRuntimeSchema("AdminWordDraftAnyEnvelope", {})
    ).toMatchObject({ reason: "invalid_schema", path: "$" });
    expect(
      mocked.validateRuntimeSchema("AdminWordListResponse", {})
    ).toMatchObject({ reason: "wrong_type", path: "$" });
    expect(
      mocked.validateRuntimeSchema("EntryLifecycleBatchResponseAny", [])
    ).toEqual({ valid: true });
    expect(
      mocked.validateRuntimeSchema(
        "DetectLexiconResponseAny" as RuntimeSchemaRoot,
        {}
      )
    ).toMatchObject({ reason: "invalid_schema", path: "$" });

    vi.doUnmock("./admin-word-v3.runtime-schema.json");
  });
});
