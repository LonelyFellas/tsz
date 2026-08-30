import { describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";
import snapshot from "./openapi.snapshot.json";

type JsonSchema = {
  $ref?: string;
  oneOf?: JsonSchema[];
  discriminator?: { propertyName?: string };
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minItems?: number;
  maxItems?: number;
};

type OperationContract = {
  request: JsonSchema | null;
  responses: Record<string, JsonSchema | null>;
};

const operationKey =
  "post /admin/lexicon/entries/sentence-targets/resolve" as const;
const schemas = snapshot.schemas as unknown as Record<string, JsonSchema>;
const operationSchemas = snapshot.operationSchemas as Record<
  string,
  OperationContract
>;

function dereference(schema: JsonSchema | null | undefined): JsonSchema {
  expect(schema, "缺少 OpenAPI schema").toBeDefined();
  let current = schema!;
  const visited = new Set<string>();

  while (current.$ref !== undefined) {
    const prefix = "#/components/schemas/";
    expect(current.$ref.startsWith(prefix), current.$ref).toBe(true);
    const name = current.$ref.slice(prefix.length);
    expect(visited.has(name), `循环 schema ref: ${name}`).toBe(false);
    visited.add(name);
    current = schemas[name]!;
    expect(current, `缺少 components.schemas.${name}`).toBeDefined();
  }

  return current;
}

function literal(schema: JsonSchema | undefined): unknown {
  const resolved = dereference(schema);
  if (Object.prototype.hasOwnProperty.call(resolved, "const")) {
    return resolved.const;
  }
  return resolved.enum?.length === 1 ? resolved.enum[0] : undefined;
}

function required(schema: JsonSchema, ...keys: string[]) {
  const resolved = dereference(schema);
  for (const key of keys) {
    expect(resolved.required, `${key} 必须为 required`).toContain(key);
  }
}

function property(schema: JsonSchema, key: string): JsonSchema {
  const resolved = dereference(schema);
  const value = resolved.properties?.[key];
  expect(value, `缺少属性 ${key}`).toBeDefined();
  return value!;
}

function branchByLiteral(
  root: JsonSchema,
  propertyName: string,
  value: unknown
): JsonSchema {
  const branch = dereference(root)
    .oneOf?.map(dereference)
    .find(
      (candidate) => literal(candidate.properties?.[propertyName]) === value
    );
  expect(branch, `缺少 ${propertyName}=${String(value)} 分支`).toBeDefined();
  return branch!;
}

function schemaByRequiredProperties(...keys: string[]): JsonSchema {
  const match = Object.values(schemas)
    .map(dereference)
    .find((schema) => keys.every((key) => schema.required?.includes(key)));
  expect(match, `缺少 required=[${keys.join(", ")}] 的 schema`).toBeDefined();
  return match!;
}

describe("句内目标发现 · api-client 契约", () => {
  it("暴露固定 POST endpoint，并把 tagged-union 请求原样发送", () => {
    const http = {
      get: vi.fn(),
      post: vi.fn(() => new Promise(() => {})),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn()
    } as unknown as HttpClient;
    const words = createAdminEndpoints(http).words;
    const resolve = Reflect.get(words, "resolveSentenceTargetsV3");
    expect(resolve).toBeTypeOf("function");
    if (typeof resolve !== "function") return;

    const input = {
      schema_version: 3,
      sentence_text: "Turn the light off.",
      source_dialect: "common",
      mode: "all_published_targets",
      page_size_per_range: 20
    } as const;
    resolve(input);

    expect(Reflect.get(http, "post")).toHaveBeenCalledWith(
      "/lexicon/entries/sentence-targets/resolve",
      input
    );
  });

  it("同步快照包含 mode discriminator，且自动与手动请求不可混装", () => {
    expect(
      (snapshot.paths as Record<string, string[]>)[
        "/admin/lexicon/entries/sentence-targets/resolve"
      ]
    ).toEqual(expect.arrayContaining(["post"]));

    const request = dereference(operationSchemas[operationKey]?.request);
    expect(request.discriminator?.propertyName).toBe("mode");
    expect(request.oneOf).toHaveLength(2);

    const automatic = branchByLiteral(request, "mode", "all_published_targets");
    required(
      automatic,
      "schema_version",
      "sentence_text",
      "source_dialect",
      "mode"
    );
    expect(literal(automatic.properties?.schema_version)).toBe(3);
    expect(automatic.properties?.selected_segments).toBeUndefined();
    expect(automatic.properties?.include_drafts).toBeUndefined();

    const selected = branchByLiteral(request, "mode", "selected_segments");
    required(
      selected,
      "schema_version",
      "sentence_text",
      "source_dialect",
      "mode",
      "selected_segments",
      "include_drafts"
    );
    expect(literal(selected.properties?.schema_version)).toBe(3);
    const segments = dereference(property(selected, "selected_segments"));
    expect(segments.minItems).toBe(1);
    expect(segments.maxItems).toBe(20);
  });

  it("响应显式绑定 generation 与完整性，range 统一使用 source_segments", () => {
    const response = dereference(
      operationSchemas[operationKey]?.responses["200"]
    );
    required(
      response,
      "schema_version",
      "sentence_hash",
      "discovery_generation",
      "completeness",
      "range_results"
    );
    expect(literal(response.properties?.schema_version)).toBe(3);
    expect(dereference(property(response, "completeness")).enum).toEqual([
      "complete",
      "overloaded"
    ]);

    const range = dereference(property(response, "range_results").items);
    required(
      range,
      "source_segments",
      "segments_fingerprint",
      "published_total",
      "published_matches",
      "draft_matches"
    );
    expect(range.properties?.source_range).toBeUndefined();
    const segments = dereference(property(range, "source_segments"));
    expect(segments.minItems).toBe(1);
    expect(segments.maxItems).toBe(20);
  });

  it("候选保留 entry/publication/POS/base/sense 身份，草稿只能转 Pending", () => {
    const baseCandidate = schemaByRequiredProperties(
      "entry_id",
      "publication_id",
      "pos_id",
      "base_form_id",
      "matches",
      "senses"
    );
    const sense = dereference(property(baseCandidate, "senses").items);
    required(
      sense,
      "sense_id",
      "publication_id",
      "pos_id",
      "base_form_id",
      "level",
      "gloss"
    );

    const draftCandidate = schemaByRequiredProperties(
      "entry_id",
      "entry_revision",
      "target_state",
      "linkability"
    );
    expect(literal(draftCandidate.properties?.target_state)).toBe("draft");
    expect(literal(draftCandidate.properties?.linkability)).toBe(
      "pending_only"
    );
    expect(draftCandidate.properties?.publication_id).toBeUndefined();
  });

  it("association schema v3 只接受 source_segments，legacy 分支才接受 source_range", () => {
    const operation =
      operationSchemas[
        "put /admin/lexicon/entries/{id}/sentences/{sentence_id}/associations"
      ];
    const request = dereference(operation?.request);
    const v3 = branchByLiteral(request, "association_schema_version", 3);
    required(v3, "association_schema_version", "associations");

    const v3Item = dereference(property(v3, "associations").items);
    required(v3Item, "id", "source_dialect", "source_segments");
    expect(v3Item.properties?.source_range).toBeUndefined();
    const segments = dereference(property(v3Item, "source_segments"));
    expect(segments.minItems).toBe(1);
    expect(segments.maxItems).toBe(20);

    const legacy = request.oneOf
      ?.map(dereference)
      .find(
        (branch) => branch.properties?.association_schema_version === undefined
      );
    expect(legacy, "缺少 legacy source_range 分支").toBeDefined();
    const legacyItem = dereference(property(legacy!, "associations").items);
    required(legacyItem, "source_range");
    expect(legacyItem.properties?.source_segments).toBeUndefined();
  });
});
