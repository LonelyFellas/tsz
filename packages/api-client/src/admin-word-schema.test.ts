import { describe, expect, it } from "vitest";
import runtimeSchemaBundleJson from "./admin-word-v3.runtime-schema.json";
import {
  decodeAdminWordPublicationEnvelope,
  decodeAdminWordPublicationListResponse,
  InvalidAdminWordResponseError,
  SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS,
  SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS,
  SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS,
  UnsupportedAdminWordSchemaVersionError,
  decodeAdminWordAnyEnvelope,
  decodeAdminWordAnyListResponse,
  decodeAdminWordDraftV2Envelope,
  decodeAdminWordDraftAnyEnvelope,
  decodeAdminWordV3Envelope,
  decodeAdminWordV2Envelope,
  decodeAdminWordV2ListResponse,
  decodeDetectLexiconResponseAny,
  decodeDetectLexiconResponseV3,
  decodeDraftValidationIssueAny,
  decodeDraftValidationResponseAny,
  decodeDraftValidationResponseV3,
  decodeEntryLifecycleBatchAnyResponse,
  decodeEntryLifecycleBatchV2Response,
  decodeFormsImpactResponseAny,
  decodeFormsImpactResponseV3,
  decodeRelatedSearchResponseAny,
  decodeSurfaceMatchPageAny,
  decodeSurfaceMatchPageV3
} from "./admin-word-schema";

type RuntimeFixtureSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, RuntimeFixtureSchema>;
  items?: RuntimeFixtureSchema;
  oneOf?: RuntimeFixtureSchema[];
  anyOf?: RuntimeFixtureSchema[];
  allOf?: RuntimeFixtureSchema[];
  format?: string;
  minimum?: number;
  minLength?: number;
  minItems?: number;
};

const runtimeFixtureBundle = runtimeSchemaBundleJson as unknown as {
  $defs: Record<string, RuntimeFixtureSchema>;
};

const IDS = {
  entry: "018f47b8-e3c1-7bd1-9f0a-123456789abc",
  creator: "018f47b8-e3c1-7bd1-9f0a-123456789abd",
  pos: "018f47b8-e3c1-7bd1-9f0a-123456789abe",
  form1: "018f47b8-e3c1-7bd1-9f0a-123456789ab1",
  form2: "018f47b8-e3c1-7bd1-9f0a-123456789ab2",
  group1: "018f47b8-e3c1-7bd1-9f0a-123456789ab3",
  group2: "018f47b8-e3c1-7bd1-9f0a-123456789ab4",
  member1: "018f47b8-e3c1-7bd1-9f0a-123456789ab5",
  member2: "018f47b8-e3c1-7bd1-9f0a-123456789ab6",
  member3: "018f47b8-e3c1-7bd1-9f0a-123456789ab7",
  common: "018f47b8-e3c1-7bd1-9f0a-123456789ab8",
  uk: "018f47b8-e3c1-7bd1-9f0a-123456789ab9",
  us: "018f47b8-e3c1-7bd1-9f0a-123456789aba",
  pronunciation1: "018f47b8-e3c1-7bd1-9f0a-123456789abb",
  pronunciation2: "018f47b8-e3c1-7bd1-9f0a-123456789aaf"
} as const;

function buildRuntimeFixture(
  schema: RuntimeFixtureSchema,
  activeRefs = new Set<string>()
): unknown {
  if (schema.$ref) {
    if (activeRefs.has(schema.$ref)) {
      throw new Error(`fixture 遇到必填递归 ref: ${schema.$ref}`);
    }
    const prefix = "#/$defs/";
    const referenced =
      runtimeFixtureBundle.$defs[schema.$ref.slice(prefix.length)];
    if (!schema.$ref.startsWith(prefix) || !referenced) {
      throw new Error(`fixture 找不到 ref: ${schema.$ref}`);
    }
    return buildRuntimeFixture(
      referenced,
      new Set(activeRefs).add(schema.$ref)
    );
  }
  if (schema.enum?.length) return schema.enum[0];
  if (schema.oneOf?.length) return buildRuntimeFixture(schema.oneOf[0]!);
  if (schema.anyOf?.length) return buildRuntimeFixture(schema.anyOf[0]!);
  if (schema.allOf?.length) {
    const values = schema.allOf.map((part) => buildRuntimeFixture(part));
    return values.every(
      (value) =>
        typeof value === "object" && value !== null && !Array.isArray(value)
    )
      ? Object.assign({}, ...values)
      : values[0];
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
            throw new Error(`fixture 必填字段无 schema: ${property}`);
          }
          return [property, buildRuntimeFixture(propertySchema, activeRefs)];
        })
      );
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () =>
        buildRuntimeFixture(schema.items!, activeRefs)
      );
    case "string":
      if (schema.format === "uuid") return IDS.entry;
      if (schema.format === "date-time") return "2026-08-24T12:00:00Z";
      return "x".repeat(Math.max(schema.minLength ?? 1, 1));
    case "integer":
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      throw new Error(`fixture 无法构造 type: ${String(type)}`);
  }
}

function validRuntimeDefinition(name: string): unknown {
  const schema = runtimeFixtureBundle.$defs[name];
  if (!schema) throw new Error(`fixture 缺少 definition: ${name}`);
  return buildRuntimeFixture(schema);
}

function validAdminWordV3() {
  return {
    schema_version: 3,
    id: IDS.entry,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: false,
    presentation: {
      label: "colour / color",
      matched_surfaces: ["colour", "color"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: {
      pos: [
        {
          pos_id: IDS.pos,
          pos: "adjective",
          dialect_rules: {
            spelling_mode: "distinguish",
            phonetic_mode: "distinguish"
          },
          forms: [
            {
              id: IDS.form1,
              form_type: "base",
              regional_variants: {
                mode: "common",
                common: {
                  id: IDS.common,
                  dialect: "common",
                  spelling: "bright",
                  origin: "manual",
                  pronunciations: [
                    {
                      id: IDS.pronunciation1,
                      dict_phonetic: "/braɪt/",
                      actual_pron: "braɪt",
                      style: "normal"
                    },
                    {
                      id: IDS.pronunciation2,
                      dict_phonetic: "/braɪt/",
                      actual_pron: "braɪt",
                      style: "strong"
                    }
                  ]
                }
              }
            },
            {
              id: IDS.form2,
              form_type: "base",
              regional_variants: {
                mode: "uk_us",
                uk: {
                  id: IDS.uk,
                  dialect: "uk",
                  spelling: "colour",
                  origin: "dictionary",
                  pronunciations: []
                },
                us: {
                  id: IDS.us,
                  dialect: "us",
                  spelling: "color",
                  origin: "dictionary",
                  pronunciations: []
                }
              }
            }
          ],
          form_groups: [
            {
              id: IDS.group1,
              is_regular: true,
              members: [
                { id: IDS.member1, form_id: IDS.form1 },
                { id: IDS.member2, form_id: IDS.form2 }
              ]
            },
            {
              id: IDS.group2,
              is_regular: false,
              members: [{ id: IDS.member3, form_id: IDS.form1 }]
            }
          ]
        }
      ]
    },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "basics",
    created_by: IDS.creator,
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z"
  };
}

function validAdminWordV2() {
  const headwords = { mode: "unified", common: "legacy" } as const;
  return {
    schema_version: 2,
    id: IDS.entry,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: false,
    headwords,
    detection_snapshot: {
      detection_id: IDS.group1,
      request: { language: "en", headword: "legacy" },
      normalized_headword: "legacy",
      entry_kind: "word",
      matched_dialect: "common",
      builtin_dictionary_status: "not_found",
      headwords,
      suggested_pos: [],
      detected_at: "2026-08-24T12:00:00Z",
      smart_dictionary_status: "clear"
    },
    forms: { pos: [] },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "basics",
    created_by: IDS.creator,
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z"
  };
}

function validAdminWordListItemV2() {
  return {
    schema_version: 2,
    id: IDS.entry,
    headword: "legacy",
    kind: "word",
    dialects: ["common"],
    headword_variants: [{ dialect: "common", headword: "legacy" }],
    revision: 1,
    lifecycle_revision: 1,
    gloss: "旧词条",
    pos_list: [],
    levels: [],
    status: "draft",
    has_unpublished_changes: false,
    max_reachable_step: "basics",
    created_by_name: "Admin",
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z"
  };
}

function validAdminWordListItemV3() {
  return {
    schema_version: 3,
    id: IDS.form1,
    kind: "word",
    presentation: {
      label: "colour / color",
      matched_surfaces: ["colour", "color"],
      strategy_version: "surface_summary_v1"
    },
    revision: 2,
    lifecycle_revision: 1,
    gloss: "颜色",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    has_unpublished_changes: true,
    max_reachable_step: "forms",
    created_by_name: "Admin",
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z"
  };
}

function captureUnsupported(
  run: () => unknown
): UnsupportedAdminWordSchemaVersionError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedAdminWordSchemaVersionError);
    return error as UnsupportedAdminWordSchemaVersionError;
  }
  throw new Error("expected schema guard to reject the response");
}

function captureInvalid(run: () => unknown): InvalidAdminWordResponseError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidAdminWordResponseError);
    return error as InvalidAdminWordResponseError;
  }
  throw new Error("expected runtime schema guard to reject the response");
}

describe("admin word V2 response schema guard", () => {
  it("只接受精确数字 schema_version=2，并保留原响应引用", () => {
    const envelope = { word: { schema_version: 2, id: "word-1" } };
    const draftEnvelope = {
      ...envelope,
      retired_stable_slots: []
    };
    const list = {
      words: [envelope.word],
      page: { page: 1, page_size: 20, total: 1 }
    };
    const batch = { words: [envelope.word], affected: 1 };

    expect(decodeAdminWordV2Envelope(envelope)).toBe(envelope);
    expect(decodeAdminWordDraftV2Envelope(draftEnvelope)).toBe(draftEnvelope);
    expect(decodeAdminWordV2ListResponse(list)).toBe(list);
    expect(decodeEntryLifecycleBatchV2Response(batch)).toBe(batch);
    expect(SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS).toEqual([2]);
    expect(Object.isFrozen(SUPPORTED_ADMIN_WORD_SCHEMA_VERSIONS)).toBe(true);
  });

  it.each([
    ["缺失", undefined, undefined, "missing", "missing"],
    ["null", null, undefined, "null", "wrong_type"],
    ["V3", 3, 3, "number", "unsupported"],
    ["未来版本", 4, 4, "number", "unsupported"],
    ["字符串 2", "2", undefined, "string", "wrong_type"]
  ] as const)(
    "%s schema_version fail closed",
    (_label, schemaVersion, safeSchemaVersion, receivedType, reason) => {
      const rawResponse = {
        word: { id: "word-1", schema_version: schemaVersion }
      };

      const error = captureUnsupported(() =>
        decodeAdminWordV2Envelope(rawResponse)
      );

      expect(error).toMatchObject({
        name: "UnsupportedAdminWordSchemaVersionError",
        code: "unsupported_schema_version",
        source: "client_response_guard",
        supported_schema_versions: [2],
        received_schema_version: safeSchemaVersion,
        received_schema_version_type: receivedType,
        reason,
        response_path: "word.schema_version",
        message: "当前前端不支持该词条数据版本，请升级后重试"
      });
      expect(error).not.toHaveProperty("raw_response");
    }
  );

  it.each([
    ["object", { secret: "do-not-log" }],
    ["array", ["do-not-log"]]
  ] as const)("%s schema_version 不进入错误诊断载荷", (receivedType, value) => {
    const error = captureUnsupported(() =>
      decodeAdminWordV2Envelope({ word: { schema_version: value } })
    );

    expect(error).toMatchObject({
      received_schema_version: undefined,
      received_schema_version_type: receivedType,
      reason: "wrong_type"
    });
    expect(JSON.stringify(error)).not.toContain("do-not-log");
  });

  it("列表任一行不兼容时拒绝整个响应并报告精确索引", () => {
    const rawResponse = {
      words: [
        { id: "word-1", schema_version: 2 },
        { id: "word-2", schema_version: 3 }
      ],
      page: { page: 1, page_size: 20, total: 2 }
    };

    const error = captureUnsupported(() =>
      decodeAdminWordV2ListResponse(rawResponse)
    );

    expect(error.received_schema_version).toBe(3);
    expect(error.response_path).toBe("words[1].schema_version");
  });

  it.each([
    ["envelope", decodeAdminWordV2Envelope, {}, "word.schema_version"],
    ["draft", decodeAdminWordDraftV2Envelope, null, "word.schema_version"],
    [
      "null word",
      decodeAdminWordV2Envelope,
      { word: null },
      "word.schema_version"
    ],
    [
      "array word",
      decodeAdminWordV2Envelope,
      { word: [] },
      "word.schema_version"
    ],
    ["list", decodeAdminWordV2ListResponse, {}, "words"],
    ["list root", decodeAdminWordV2ListResponse, null, "words"],
    ["batch", decodeEntryLifecycleBatchV2Response, { words: null }, "words"],
    ["batch root", decodeEntryLifecycleBatchV2Response, null, "words"]
  ] as const)("%s 容器缺失时 fail closed", (_name, decode, raw, path) => {
    const error = captureUnsupported(() => decode(raw));

    expect(error.received_schema_version).toBeUndefined();
    expect(error.response_path).toBe(path);
  });
});

describe("admin word V3/Any runtime decoder", () => {
  it("接受复杂 V3、V2/V3 混合列表和生命周期批量响应，并保留原引用", () => {
    const v3Word = validAdminWordV3();
    const v3Envelope = { word: v3Word };
    const draftEnvelope = { word: v3Word, retired_stable_nodes: [] };
    const list = {
      words: [validAdminWordListItemV2(), validAdminWordListItemV3()],
      page: { page: 1, page_size: 20, total: 2 }
    };
    const batch = {
      words: [validAdminWordV2(), v3Word],
      affected: 2
    };

    expect(decodeAdminWordV3Envelope(v3Envelope)).toBe(v3Envelope);
    expect(decodeAdminWordAnyEnvelope(v3Envelope)).toBe(v3Envelope);
    expect(decodeAdminWordDraftAnyEnvelope(draftEnvelope)).toBe(draftEnvelope);
    expect(decodeAdminWordAnyListResponse(list)).toBe(list);
    expect(decodeEntryLifecycleBatchAnyResponse(batch)).toBe(batch);
    expect(SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS).toEqual([3]);
    expect(SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS).toEqual([2, 3]);
    expect(Object.isFrozen(SUPPORTED_ADMIN_WORD_V3_SCHEMA_VERSIONS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_ADMIN_WORD_ANY_SCHEMA_VERSIONS)).toBe(
      true
    );
  });

  it("V3-only decoder 拒绝合法 V2，Any decoder 接受合法 V2", () => {
    const envelope = { word: validAdminWordV2() };

    const error = captureUnsupported(() => decodeAdminWordV3Envelope(envelope));

    expect(error).toMatchObject({
      supported_schema_versions: [3],
      received_schema_version: 2,
      reason: "unsupported",
      response_path: "word.schema_version"
    });
    expect(decodeAdminWordAnyEnvelope(envelope)).toBe(envelope);
  });

  it.each([
    ["missing", undefined, undefined, "missing", "missing"],
    ["null", null, undefined, "null", "wrong_type"],
    ["future", 4, 4, "number", "unsupported"]
  ] as const)(
    "Any envelope 对 %s schema_version fail closed",
    (_name, schemaVersion, safeVersion, receivedType, reason) => {
      const error = captureUnsupported(() =>
        decodeAdminWordAnyEnvelope({
          word: { ...validAdminWordV3(), schema_version: schemaVersion }
        })
      );

      expect(error).toMatchObject({
        supported_schema_versions: [2, 3],
        received_schema_version: safeVersion,
        received_schema_version_type: receivedType,
        reason,
        response_path: "word.schema_version"
      });
    }
  );

  it("混合列表任一行版本未知时拒绝整个响应并定位索引", () => {
    const list = {
      words: [
        validAdminWordListItemV2(),
        { ...validAdminWordListItemV3(), schema_version: 4 }
      ],
      page: { page: 1, page_size: 20, total: 2 }
    };

    const error = captureUnsupported(() =>
      decodeAdminWordAnyListResponse(list)
    );

    expect(error).toMatchObject({
      supported_schema_versions: [2, 3],
      received_schema_version: 4,
      response_path: "words[1].schema_version"
    });
  });

  it.each([
    {
      name: "缺 presentation",
      mutate: (word: Record<string, unknown>) => delete word.presentation,
      path: "$.word.presentation",
      reason: "missing_required_property"
    },
    {
      name: "自由 form_type",
      mutate: (word: Record<string, unknown>) => {
        const forms = word.forms as {
          pos: Array<{ forms: Array<{ form_type: string }> }>;
        };
        forms.pos[0]!.forms[0]!.form_type = "prototype";
      },
      path: "$.word.forms.pos[0].forms[0].form_type",
      reason: "enum_mismatch"
    },
    {
      name: "canonical extra key",
      mutate: (word: Record<string, unknown>) => {
        word.headwords = { secret: "do-not-log" };
      },
      path: "$.word",
      reason: "unexpected_property"
    },
    {
      name: "未知 publication capability",
      mutate: (word: Record<string, unknown>) => {
        const capabilities = word.capabilities as {
          publication: { mode: string };
        };
        capabilities.publication.mode = "future_mode";
      },
      path: "$.word.capabilities.publication",
      reason: "no_union_match"
    }
  ])("$name 按完整 OpenAPI shape fail closed", ({ mutate, path, reason }) => {
    const word = validAdminWordV3() as Record<string, unknown>;
    mutate(word);

    const error = captureInvalid(() => decodeAdminWordV3Envelope({ word }));

    expect(error).toMatchObject({
      name: "InvalidAdminWordResponseError",
      code: "invalid_admin_word_response",
      source: "client_response_guard",
      response_path: path,
      reason
    });
    expect(error).not.toHaveProperty("raw_response");
    expect(JSON.stringify(error)).not.toContain("do-not-log");
    expect(JSON.stringify(error)).not.toContain("prototype");
  });

  it("common/uk_us 混合地区结构不能通过 oneOf", () => {
    const word = validAdminWordV3();
    const regional = word.forms.pos[0]!.forms[0]!.regional_variants as Record<
      string,
      unknown
    >;
    regional.uk =
      validAdminWordV3().forms.pos[0]!.forms[1]!.regional_variants.uk;
    regional.us =
      validAdminWordV3().forms.pos[0]!.forms[1]!.regional_variants.us;

    const error = captureInvalid(() => decodeAdminWordV3Envelope({ word }));

    expect(error).toMatchObject({
      response_path: "$.word.forms.pos[0].forms[0].regional_variants",
      reason: "no_union_match",
      received_type: "object"
    });
  });

  it.each([
    [
      "validation any",
      "DraftValidationResponseAny",
      decodeDraftValidationResponseAny
    ],
    [
      "validation v3",
      "DraftValidationResponseV3",
      decodeDraftValidationResponseV3
    ],
    ["impact any", "FormsImpactResponseAny", decodeFormsImpactResponseAny],
    ["impact v3", "FormsImpactResponseV3", decodeFormsImpactResponseV3],
    ["surface any", "SurfaceMatchPageAny", decodeSurfaceMatchPageAny],
    ["surface v3", "SurfaceMatchPageV3", decodeSurfaceMatchPageV3],
    [
      "detection any",
      "DetectLexiconResponseAny",
      decodeDetectLexiconResponseAny
    ],
    [
      "detection v3",
      "DetectLexiconSurfaceResponseV3",
      decodeDetectLexiconResponseV3
    ],
    ["issue any", "DraftValidationIssueAny", decodeDraftValidationIssueAny],
    ["related any", "RelatedSearchResponse", decodeRelatedSearchResponseAny],
    [
      "publication list",
      "AdminWordPublicationListResponse",
      decodeAdminWordPublicationListResponse
    ],
    [
      "publication detail",
      "AdminWordPublicationEnvelope",
      decodeAdminWordPublicationEnvelope
    ]
  ] as const)("%s decoder 接受生成闭包构造的合法响应", (_name, def, decode) => {
    const value = validRuntimeDefinition(def);
    expect(decode(value)).toBe(value);
  });

  it.each([
    ["缺失", undefined],
    ["null", null],
    ["元素非字符串", ["noun", 1]]
  ] as const)(
    "V3 detection 顶层 suggested_pos %s 时 fail closed",
    (_label, suggestedPos) => {
      const value = validRuntimeDefinition(
        "DetectLexiconSurfaceResponseV3"
      ) as Record<string, unknown>;
      if (suggestedPos === undefined) delete value.suggested_pos;
      else value.suggested_pos = suggestedPos;

      const error = captureInvalid(() => decodeDetectLexiconResponseV3(value));
      expect(error).toMatchObject({
        response_path: "$",
        reason: "no_union_match",
        received_type: "object"
      });
    }
  );

  it("V3 detection runtime schema 将顶层 suggested_pos 固定为必填字符串数组", () => {
    const schema = runtimeFixtureBundle.$defs.DetectLexiconSurfaceResponseV3!;
    expect(schema.required).toContain("suggested_pos");
    expect(schema.properties?.suggested_pos).toEqual({
      type: "array",
      items: { type: "string" },
      maxItems: 2000
    });
  });

  it("V3 surface decoder 接受两种正式 match_kind，并拒绝旧裸 item", () => {
    const page = validRuntimeDefinition("SurfaceMatchPageV3") as {
      items: unknown[];
    };
    const legacyItem = {
      match_kind: "legacy_v2",
      match: validRuntimeDefinition("LegacySurfaceMatchV3")
    };
    const formItem = {
      match_kind: "form_variant_v3",
      match: validRuntimeDefinition("FormSurfaceMatchV3")
    };

    page.items = [legacyItem, formItem];
    expect(decodeSurfaceMatchPageV3(page)).toBe(page);

    page.items = [validRuntimeDefinition("FormSurfaceMatchV3")];
    expect(captureInvalid(() => decodeSurfaceMatchPageV3(page))).toMatchObject({
      response_path: "$",
      reason: "no_union_match"
    });
  });

  it("非 aggregate union 的未知版本同样 fail closed", () => {
    const error = captureUnsupported(() =>
      decodeFormsImpactResponseAny({ schema_version: 4 })
    );

    expect(error).toMatchObject({
      supported_schema_versions: [2, 3],
      received_schema_version: 4,
      response_path: "schema_version"
    });
  });

  it("V3-only response decoder 拒绝合法 V2 分支", () => {
    const v2 = validRuntimeDefinition("FormsImpactResponseV2");
    const error = captureUnsupported(() => decodeFormsImpactResponseV3(v2));

    expect(error).toMatchObject({
      supported_schema_versions: [3],
      received_schema_version: 2,
      response_path: "schema_version"
    });
  });

  it("related result 内未知版本报告精确索引", () => {
    const error = captureUnsupported(() =>
      decodeRelatedSearchResponseAny({ results: [{ schema_version: 4 }] })
    );

    expect(error).toMatchObject({
      supported_schema_versions: [2, 3],
      response_path: "results[0].schema_version",
      received_schema_version: 4
    });
  });

  it("publication list 容器缺失时由完整 runtime schema 拒绝", () => {
    const error = captureInvalid(() =>
      decodeAdminWordPublicationListResponse({})
    );

    expect(error).toMatchObject({
      response_path: "$.publications",
      reason: "missing_required_property",
      received_type: "missing"
    });
  });

  it.each([
    ["v3 envelope", decodeAdminWordV3Envelope, "word.schema_version"],
    ["any envelope", decodeAdminWordAnyEnvelope, "word.schema_version"],
    ["draft envelope", decodeAdminWordDraftAnyEnvelope, "word.schema_version"],
    ["mixed list", decodeAdminWordAnyListResponse, "words"],
    ["mixed batch", decodeEntryLifecycleBatchAnyResponse, "words"],
    [
      "publication envelope",
      decodeAdminWordPublicationEnvelope,
      "publication.schema_version"
    ]
  ] as const)("%s 根不是 object 时安全拒绝", (_name, decode, path) => {
    const error = captureUnsupported(() => decode(null));
    expect(error).toMatchObject({
      response_path: path,
      received_schema_version: undefined
    });
  });

  it.each([
    ["related", decodeRelatedSearchResponseAny, "no_union_match"],
    ["publication list", decodeAdminWordPublicationListResponse, "wrong_type"]
  ] as const)(
    "%s 根不是 object 时由 runtime schema 拒绝",
    (_name, decode, reason) => {
      const error = captureInvalid(() => decode(null));
      expect(error).toMatchObject({
        response_path: "$",
        reason,
        received_type: "null"
      });
    }
  );
});
