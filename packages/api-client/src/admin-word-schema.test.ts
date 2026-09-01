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
  decodeEntryDeleteBatchResponse,
  decodeEntryLifecycleBatchV2Response,
  decodeFormsImpactResponseAny,
  decodeFormsImpactResponseV3,
  decodePendingSentenceAssociationListResponse,
  decodeRelatedSearchResponseAny,
  decodeResolveSentenceTargetsV3Response,
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
                  ],
                  component_usages: []
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
                  pronunciations: [],
                  component_usages: []
                },
                us: {
                  id: IDS.us,
                  dialect: "us",
                  spelling: "color",
                  origin: "dictionary",
                  pronunciations: [],
                  component_usages: []
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

function setV2Associations(
  container: Record<string, unknown>,
  associations: unknown[]
) {
  const pos = buildRuntimeFixture(
    runtimeFixtureBundle.$defs.WordPosMeaningsV2!
  ) as Record<string, unknown>;
  const sense = buildRuntimeFixture(
    runtimeFixtureBundle.$defs.WordSenseV2!
  ) as Record<string, unknown>;
  const sentence = buildRuntimeFixture(
    runtimeFixtureBundle.$defs.WordSentenceV2!
  ) as Record<string, unknown>;
  sentence.associations = associations;
  sense.sentences = [sentence];
  pos.senses = [sense];
  container.meanings = { sense_groups: [], pos: [pos] };
}

function addLegacyV2Association(container: Record<string, unknown>) {
  const association = buildRuntimeFixture(
    runtimeFixtureBundle.$defs.WordSentenceAssociationV2!
  ) as Record<string, unknown>;
  delete association.state;
  Object.assign(association, {
    target_word_id: IDS.entry,
    target_sense_id: IDS.member2,
    target_headword: "center",
    target_gloss: "中心",
    resolved_pos: "noun"
  });
  setV2Associations(container, [association]);
  return association;
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
    created_by: IDS.creator,
    reference_summary: { total: 0, previews: [], truncated: false },
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
    created_by: IDS.creator,
    reference_summary: { total: 0, previews: [], truncated: false },
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

  describe("decodeEntryDeleteBatchResponse", () => {
    it("接受合法的 affected 并保留原引用", () => {
      const response = { affected: 3 };
      expect(decodeEntryDeleteBatchResponse(response)).toBe(response);
      const zero = { affected: 0 };
      expect(decodeEntryDeleteBatchResponse(zero)).toBe(zero);
    });

    it.each([
      ["缺失 affected", {}, "missing_required_property", "missing"],
      ["affected 是字符串", { affected: "3" }, "wrong_type", "string"],
      ["affected 是 null", { affected: null }, "wrong_type", "null"],
      ["根不是对象", null, "missing_required_property", "missing"]
    ])("%s 时 fail closed", (_label, value, reason, receivedType) => {
      // 静默当 0 会让 UI 报「已删除 0 条」而掩盖真实的契约漂移。
      try {
        decodeEntryDeleteBatchResponse(value);
        throw new Error("应当抛出");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidAdminWordResponseError);
        const failure = error as InvalidAdminWordResponseError;
        expect(failure.response_path).toBe("affected");
        expect(failure.reason).toBe(reason);
        expect(failure.received_type).toBe(receivedType);
      }
    });

    it.each([
      ["负数", { affected: -1 }, "below_minimum"],
      ["小数", { affected: 1.5 }, "wrong_type"]
    ])("%s 时 fail closed", (_label, value, reason) => {
      try {
        decodeEntryDeleteBatchResponse(value);
        throw new Error("应当抛出");
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidAdminWordResponseError);
        expect((error as InvalidAdminWordResponseError).reason).toBe(reason);
      }
    });
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
  it("Pending 关联列表完整解码并拒绝缺失 source_segments", () => {
    const item = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.PendingSentenceAssociationItemV3!
    ) as Record<string, unknown>;
    const response = {
      results: [item],
      total: 1,
      next_cursor: null
    };

    expect(decodePendingSentenceAssociationListResponse(response)).toBe(
      response
    );
    const invalid = structuredClone(response);
    delete invalid.results[0]!.source_segments;
    expect(() => decodePendingSentenceAssociationListResponse(invalid)).toThrow(
      InvalidAdminWordResponseError
    );
  });

  it("目标发现响应完整解码并拒绝未知 schema_version", () => {
    const range = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.SentenceTargetRangeResultV3!
    );
    const response = {
      schema_version: 3,
      sentence_hash: "sentence-hash",
      discovery_generation: 7,
      completeness: "complete",
      range_results: [range]
    };

    expect(decodeResolveSentenceTargetsV3Response(response)).toBe(response);
    expect(() =>
      decodeResolveSentenceTargetsV3Response({
        ...response,
        schema_version: 4
      })
    ).toThrow(InvalidAdminWordResponseError);
  });

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

  it("V3 词条接受可选检测基准方言并拒绝 common 或未知值", () => {
    const word = {
      ...validAdminWordV3(),
      detection_basis_dialect: "us"
    };

    expect(decodeAdminWordV3Envelope({ word })).toEqual({ word });
    for (const invalidDialect of ["common", "unknown"]) {
      expect(() =>
        decodeAdminWordV3Envelope({
          word: { ...word, detection_basis_dialect: invalidDialect }
        })
      ).toThrow(InvalidAdminWordResponseError);
    }
  });

  it("关联词运行时 schema 接受四态并拒绝缺字段或混合目标", () => {
    const word = validAdminWordV3() as unknown as Record<string, unknown>;
    const pos = validRuntimeDefinition("WordPosMeaningsV3") as Record<
      string,
      unknown
    >;
    const sense = validRuntimeDefinition("WordSenseV3") as Record<
      string,
      unknown
    >;
    const base = {
      id: IDS.member1,
      relation: "synonym",
      score: "80"
    };
    const validRelations = [
      {
        ...base,
        target_word_id: IDS.entry,
        target_sense_id: IDS.member2,
        target_headword: "reliability",
        target_gloss: "可靠性"
      },
      {
        ...base,
        pending_target_headword: "reliability",
        pending_target_gloss: "可靠性"
      },
      {
        ...base,
        prebound_target_word_id: IDS.entry,
        target_headword: "reliability",
        pending_target_gloss: "可靠性",
        prebinding_state: "waiting_first_sense"
      },
      {
        ...base,
        prebound_target_word_id: IDS.entry,
        target_headword: "reliability",
        prebinding_state: "target_sense_deleted"
      }
    ];
    sense.relations = validRelations;
    pos.senses = [sense];
    word.meanings = { sense_groups: [], pos: [pos] };
    expect(decodeAdminWordV3Envelope({ word })).toEqual({ word });

    for (const invalidRelation of [
      { ...base, prebound_target_word_id: IDS.entry },
      {
        ...validRelations[0],
        prebound_target_word_id: IDS.entry,
        target_headword: "reliability",
        prebinding_state: "waiting_first_sense"
      },
      // 预绑定不得携带待建词面（旧宽形态，已收窄）。
      {
        ...base,
        prebound_target_word_id: IDS.entry,
        target_headword: "reliability",
        pending_target_headword: "reliability",
        prebinding_state: "waiting_first_sense"
      },
      { ...base, prebinding_state: "target_sense_deleted" }
    ]) {
      const invalid = structuredClone(word);
      const invalidSense = (
        invalid.meanings as {
          pos: Array<{ senses: Record<string, unknown>[] }>;
        }
      ).pos[0]!.senses[0]!;
      invalidSense.relations = [invalidRelation];
      expect(() => decodeAdminWordV3Envelope({ word: invalid })).toThrow(
        InvalidAdminWordResponseError
      );
    }
  });

  it("同时接受旧 source_range 和新 source_segments，并为旧消费者补 range alias", () => {
    const legacyWord = validAdminWordV3() as unknown as Record<string, unknown>;
    const pos = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordPosMeaningsV3!
    ) as Record<string, unknown>;
    const sense = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSenseV3!
    ) as Record<string, unknown>;
    const sentence = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSentenceV3!
    ) as Record<string, unknown>;
    sentence.associations = [
      {
        id: IDS.member1,
        source_dialect: "common",
        source_range: { start: 0, end: 6, surface: "center" },
        target_word_id: IDS.entry,
        target_sense_id: IDS.member2,
        origin: "manual",
        target_headword: "center",
        target_gloss: "中心",
        resolved_pos: "noun"
      }
    ];
    sense.sentences = [sentence];
    pos.senses = [sense];
    legacyWord.meanings = { sense_groups: [], pos: [pos] };
    const legacyEnvelope = { word: legacyWord };
    expect(decodeAdminWordV3Envelope(legacyEnvelope)).toBe(legacyEnvelope);

    const currentWord = validAdminWordV3() as unknown as Record<
      string,
      unknown
    >;
    const currentPos = structuredClone(pos);
    const currentSentence = (
      (currentPos.senses as Array<Record<string, unknown>>)[0]!
        .sentences as Array<Record<string, unknown>>
    )[0]!;
    currentSentence.associations = [
      {
        id: IDS.member1,
        association_schema_version: 3,
        source_dialect: "common",
        source_segments: [{ start: 0, end: 6, surface: "center" }],
        state: "linked",
        target_word_id: IDS.entry,
        target_sense_id: IDS.member2,
        target_component_usages: [],
        origin: "manual",
        target_headword: "center",
        target_gloss: "中心",
        resolved_pos: "noun"
      }
    ];
    currentWord.meanings = { sense_groups: [], pos: [currentPos] };
    const currentEnvelope = { word: currentWord };
    expect(decodeAdminWordV3Envelope(currentEnvelope)).toBe(currentEnvelope);
    expect(
      (
        (currentPos.senses as Array<Record<string, unknown>>)[0]!
          .sentences as Array<Record<string, unknown>>
      )[0]!.associations as unknown
    ).toEqual([
      expect.objectContaining({
        source_range: { start: 0, end: 6, surface: "center" },
        source_segments: [{ start: 0, end: 6, surface: "center" }]
      })
    ]);
    expect(decodeAdminWordV3Envelope(currentEnvelope)).toBe(currentEnvelope);
  });

  it("V2 含关联时保留 source_range，不误改写为 V3", () => {
    const word = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.AdminWordV2!
    ) as Record<string, unknown>;
    const association = addLegacyV2Association(word);
    const envelope = { word };

    expect(decodeAdminWordAnyEnvelope(envelope)).toBe(envelope);
    expect(association).toHaveProperty("source_range");
    expect(association).not.toHaveProperty("source_segments");
    expect(association).not.toHaveProperty("state");
  });

  it("V2 含旧关联的批量生命周期与发布响应继续可解码", () => {
    const word = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.AdminWordV2!
    ) as Record<string, unknown>;
    addLegacyV2Association(word);
    expect(
      decodeEntryLifecycleBatchAnyResponse({ words: [word], affected: 1 })
    ).toEqual({ words: [word], affected: 1 });

    const publication = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.AdminWordPublicationV2!
    ) as Record<string, unknown>;
    addLegacyV2Association(publication.word as Record<string, unknown>);
    expect(decodeAdminWordPublicationEnvelope({ publication })).toEqual({
      publication
    });
    expect(
      decodeAdminWordPublicationListResponse({ publications: [publication] })
    ).toEqual({ publications: [publication] });
  });

  it.each([
    ["linked 缺目标", "linked"],
    ["pending 缺词头", "pending"]
  ] as const)("V2 %s 的畸形响应 fail closed", (_name, state) => {
    const word = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.AdminWordV2!
    ) as Record<string, unknown>;
    const common = {
      id: IDS.member1,
      source_dialect: "common",
      source_range: { start: 0, end: 6, surface: "center" },
      origin: "manual",
      state
    };
    setV2Associations(
      word,
      state === "linked"
        ? [common]
        : [
            {
              ...common,
              pending_target_kind: "phrase",
              normalized_pending_target_headword: "center of"
            }
          ]
    );

    expect(() => decodeAdminWordAnyEnvelope({ word })).toThrow(
      InvalidAdminWordResponseError
    );
  });

  it("接受新能力、分层译文、成分用词与待关联响应", () => {
    const word = validAdminWordV3() as unknown as Record<string, unknown>;
    const capabilities = word.capabilities as Record<string, unknown>;
    capabilities.sentence_associations = true;
    capabilities.sentence_target_discovery = true;
    const posForms = (
      (word.forms as Record<string, unknown>).pos as Array<
        Record<string, unknown>
      >
    )[0]!;
    const form = (posForms.forms as Array<Record<string, unknown>>)[0]!;
    const common = (form.regional_variants as Record<string, unknown>)
      .common as Record<string, unknown>;
    common.component_usages = [
      buildRuntimeFixture(runtimeFixtureBundle.$defs.PhraseComponentUsageV3!)
    ];

    const pos = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordPosMeaningsV3!
    ) as Record<string, unknown>;
    const sense = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSenseV3!
    ) as Record<string, unknown>;
    const sentence = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSentenceV3!
    ) as Record<string, unknown>;
    sentence.zh_translations = [
      buildRuntimeFixture(runtimeFixtureBundle.$defs.WordSentenceTranslationV3!)
    ];
    sentence.associations = [
      {
        id: IDS.member1,
        association_schema_version: 3,
        source_dialect: "common",
        source_segments: [{ start: 0, end: 6, surface: "center" }],
        origin: "manual",
        pending_target_kind: "phrase",
        pending_target_headword: "center of",
        state: "pending"
      }
    ];
    sense.sentences = [sentence];
    pos.senses = [sense];
    word.meanings = { sense_groups: [], pos: [pos] };

    expect(decodeAdminWordV3Envelope({ word })).toEqual({ word });
  });

  it.each([
    ["future schema", { association_schema_version: 4 }],
    ["invalid segments", { source_segments: "center" }],
    ["invalid state", { state: "unknown" }],
    ["invalid components", { target_component_usages: "center" }]
  ] as const)("旧 V3 兼容不会覆盖 %s", (_name, extraFields) => {
    const word = validAdminWordV3() as unknown as Record<string, unknown>;
    const pos = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordPosMeaningsV3!
    ) as Record<string, unknown>;
    const sense = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSenseV3!
    ) as Record<string, unknown>;
    const sentence = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSentenceV3!
    ) as Record<string, unknown>;
    sentence.associations = [
      {
        id: IDS.member1,
        source_dialect: "common",
        source_range: { start: 0, end: 6, surface: "center" },
        target_word_id: IDS.entry,
        target_sense_id: IDS.member2,
        origin: "manual",
        target_headword: "center",
        target_gloss: "中心",
        resolved_pos: "noun",
        ...extraFields
      }
    ];
    sense.sentences = [sentence];
    pos.senses = [sense];
    word.meanings = { sense_groups: [], pos: [pos] };

    expect(() => decodeAdminWordV3Envelope({ word })).toThrow(
      InvalidAdminWordResponseError
    );
  });

  it("新旧位置同时存在但不一致时 fail closed", () => {
    const word = validAdminWordV3() as unknown as Record<string, unknown>;
    const pos = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordPosMeaningsV3!
    ) as Record<string, unknown>;
    const sense = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSenseV3!
    ) as Record<string, unknown>;
    const sentence = buildRuntimeFixture(
      runtimeFixtureBundle.$defs.WordSentenceV3!
    ) as Record<string, unknown>;
    sentence.associations = [
      {
        id: IDS.member1,
        association_schema_version: 3,
        source_dialect: "common",
        source_range: { start: 1, end: 6, surface: "enter" },
        source_segments: [{ start: 0, end: 6, surface: "center" }],
        state: "linked",
        target_word_id: IDS.entry,
        target_sense_id: IDS.member2,
        target_component_usages: [],
        origin: "manual",
        target_headword: "center",
        target_gloss: "中心",
        resolved_pos: "noun"
      }
    ];
    sense.sentences = [sentence];
    pos.senses = [sense];
    word.meanings = { sense_groups: [], pos: [pos] };

    expect(() => decodeAdminWordV3Envelope({ word })).toThrow(
      InvalidAdminWordResponseError
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
