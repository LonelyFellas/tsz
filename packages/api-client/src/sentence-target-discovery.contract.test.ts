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
  "post /admin/lexicon/entries/component-targets/search" as const;
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

function schemaByRequiredProperties(...keys: string[]): JsonSchema {
  const match = Object.values(schemas)
    .map(dereference)
    .find((schema) => keys.every((key) => schema.required?.includes(key)));
  expect(match, `缺少 required=[${keys.join(", ")}] 的 schema`).toBeDefined();
  return match!;
}

describe("voice-editor 目标查询契约", () => {
  it("不再暴露已取消的整句发现接口", () => {
    const http = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn()
    } as unknown as HttpClient;
    const words = createAdminEndpoints(http).words;
    expect(Reflect.get(words, "resolveSentenceTargetsV3")).toBeUndefined();
    expect(
      (snapshot.paths as Record<string, string[]>)[
        "/admin/lexicon/entries/sentence-targets/resolve"
      ]
    ).toBeUndefined();
    expect(words.searchComponentTargetsV3).toBeTypeOf("function");
  });

  it("发布与草稿共用完整节点身份，草稿可选择具体词义而非只能转 Pending", () => {
    const baseCandidate = schemaByRequiredProperties(
      "entry_id",
      "pos_id",
      "base_form_id",
      "matched_form_id",
      "matches",
      "senses"
    );
    // component-targets/search 带 include_drafts 时会回从未发布的草稿：没有 publication_id。
    expect(property(baseCandidate, "publication_id")).toBeDefined();
    expect(baseCandidate.required).not.toContain("publication_id");
    const sense = dereference(property(baseCandidate, "senses").items);
    required(sense, "sense_id", "pos_id", "base_form_id", "level", "gloss");
    expect(property(sense, "publication_id")).toBeDefined();
    expect(sense.required).not.toContain("publication_id");

    const response = dereference(
      operationSchemas[operationKey]?.responses["200"]
    );
    const draftCandidate = dereference(property(response, "matches").items);
    expect(draftCandidate).toEqual(baseCandidate);
    expect(draftCandidate.properties?.linkability).toBeUndefined();
    expect(draftCandidate.properties?.entry_revision).toBeUndefined();
  });
});
