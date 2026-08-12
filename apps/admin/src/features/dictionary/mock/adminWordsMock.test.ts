import type {
  AdminProfile,
  AdminWord,
  AdminWordV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  SuggestDialectVariantsInputV2
} from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeMockMeanings,
  createAdminWordsMock,
  isAdminWordsMockPersistedState,
  type AdminWordsMockPersistedState,
  type AdminWordsMock
} from "./adminWordsMock";
import {
  ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
  createSeedLegacyWords,
  richText
} from "./fixtures";
import {
  adminWordsMockStorageKey,
  type AdminWordsMockStorageLike
} from "./storage";

const NOW = new Date("2026-08-02T03:00:00.000Z");

function profile(overrides: Partial<AdminProfile> = {}): AdminProfile {
  return {
    id: "admin-test",
    phone: "13800000000",
    display_name: "Mock Admin",
    role: "admin",
    permissions: ["words.access"],
    ...overrides
  };
}

interface InspectableStorage extends AdminWordsMockStorageLike {
  values: Map<string, string>;
}

function memoryStorage(): InspectableStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key)
  };
}

function readPersistedState(
  storage: InspectableStorage,
  profileId = "admin-test"
): AdminWordsMockPersistedState {
  const raw = storage.values.get(
    adminWordsMockStorageKey(ADMIN_WORDS_MOCK_STORAGE_SCHEMA, profileId)
  );
  if (!raw) throw new Error("mock state was not persisted");
  return (JSON.parse(raw) as { state: AdminWordsMockPersistedState }).state;
}

function writePersistedState(
  storage: InspectableStorage,
  state: AdminWordsMockPersistedState,
  profileId = "admin-test"
): void {
  storage.values.set(
    adminWordsMockStorageKey(ADMIN_WORDS_MOCK_STORAGE_SCHEMA, profileId),
    JSON.stringify({
      schema_version: ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
      admin_profile_id: profileId,
      state
    })
  );
}

function mockFor(
  currentProfile: () => AdminProfile | undefined = () => profile(),
  storage = memoryStorage(),
  partOfSpeechValidation: "internal" | "external" = "internal"
): AdminWordsMock {
  return createAdminWordsMock({
    getAdminProfile: currentProfile,
    now: () => new Date(NOW),
    sessionStorage: storage,
    partOfSpeechValidation
  });
}

async function createCenter(
  mock: AdminWordsMock,
  idempotencyKey = "create-center"
) {
  const detection = await mock.detect({ language: "en", headword: "center" });
  if (detection.builtin_dictionary.status !== "matched") {
    throw new Error("center fixture must match");
  }
  return mock.createV2({
    schema_version: 2,
    idempotency_key: idempotencyKey,
    detection_id: detection.detection_id,
    headwords: detection.builtin_dictionary.headwords
  });
}

async function createDetectedWord(
  mock: AdminWordsMock,
  headword: string,
  idempotencyKey: string
) {
  const detection = await mock.detect({ language: "en", headword });
  if (detection.builtin_dictionary.status !== "matched") {
    throw new Error(`${headword} fixture must match`);
  }
  return mock.createV2({
    schema_version: 2,
    idempotency_key: idempotencyKey,
    detection_id: detection.detection_id,
    headwords: detection.builtin_dictionary.headwords
  });
}

function withCompletePronunciations(
  forms: DraftFormsStepContent
): DraftFormsStepContent {
  const completed = structuredClone(forms);
  for (const pos of completed.pos) {
    const slots = [
      pos.base_form,
      ...pos.form_groups.flatMap((group) => group.slots)
    ];
    for (const slot of slots) {
      const expectedDialects =
        pos.dialect_rules.spelling_mode === "distinguish" ||
        pos.dialect_rules.phonetic_mode === "distinguish"
          ? (["uk", "us"] as const)
          : (["common"] as const);
      if (
        expectedDialects.length === 1 &&
        !slot.variants.some((variant) => variant.dialect === "common")
      ) {
        const source = slot.variants[0];
        if (source) slot.variants = [{ ...source, dialect: "common" }];
      }
      for (const variant of slot.variants) {
        for (const pronunciation of variant.pronunciations) {
          pronunciation.dict_phonetic ||= "mock";
          pronunciation.actual_pron ||= "mock";
        }
      }
    }
  }
  return completed;
}

async function completeDraft(
  mock: AdminWordsMock,
  draft: Awaited<ReturnType<typeof createCenter>>,
  prefix: string
): Promise<AdminWordV2> {
  const forms = await mock.saveFormsStep(draft.word.id, {
    base_revision: draft.word.revision,
    operation_id: `${prefix}-forms`,
    intent: "complete",
    content: withCompletePronunciations(draft.word.forms)
  });
  return (
    await mock.saveMeaningsStep(forms.word.id, {
      base_revision: forms.word.revision,
      operation_id: `${prefix}-meanings`,
      intent: "complete",
      content: completeMockMeanings(forms.word)
    })
  ).word;
}

async function completeCenter(mock: AdminWordsMock): Promise<AdminWordV2> {
  const draft = await createCenter(mock);
  const forms = await mock.saveFormsStep(draft.word.id, {
    base_revision: draft.word.revision,
    operation_id: "complete-forms",
    intent: "complete",
    content: withCompletePronunciations(draft.word.forms)
  });
  const meanings = await mock.saveMeaningsStep(forms.word.id, {
    base_revision: forms.word.revision,
    operation_id: "complete-meanings",
    intent: "complete",
    content: completeMockMeanings(forms.word)
  });
  return meanings.word;
}

function meaningNodeIds(content: DraftMeaningsStepContent): string[] {
  return [
    ...content.sense_groups.map((group) => group.id),
    ...content.pos.flatMap((pos) => [
      ...pos.grammar_structures.flatMap((grammar) => [
        grammar.id,
        ...grammar.variants.map((variant) => variant.id)
      ]),
      ...pos.senses.flatMap((sense) => [
        sense.id,
        ...sense.definitions.map((definition) => definition.id),
        ...sense.sentences.map((sentence) => sentence.id),
        ...sense.relations.map((relation) => relation.id)
      ])
    ])
  ];
}

describe("admin words mock", () => {
  let mock: AdminWordsMock;

  beforeEach(() => {
    mock = mockFor();
  });

  it("补全旧空草稿时创建默认语义区间并改绑全部词义", async () => {
    const draft = await createCenter(mock, "complete-empty-sense-groups");
    const legacyEmpty = structuredClone(draft.word.meanings);
    legacyEmpty.sense_groups = [];

    const complete = completeMockMeanings(draft.word, legacyEmpty);

    expect(complete.sense_groups).toEqual([
      expect.objectContaining({
        name_zh: "默认语义区间",
        name_en: "Default semantic range"
      })
    ]);
    expect(
      complete.pos.every((pos) =>
        pos.senses.every(
          (sense) => sense.sense_group_id === complete.sense_groups[0]!.id
        )
      )
    ).toBe(true);
  });

  it("旧空草稿再次保存 forms 时恢复默认语义区间与已有词义引用", async () => {
    const draft = await createCenter(mock, "repair-empty-sense-groups");
    const forms = await mock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "repair-empty-sense-groups-complete-forms",
      intent: "complete",
      content: withCompletePronunciations(draft.word.forms)
    });
    const emptied = await mock.saveMeaningsStep(forms.word.id, {
      base_revision: forms.word.revision,
      operation_id: "repair-empty-sense-groups-save",
      intent: "save",
      content: { ...forms.word.meanings, sense_groups: [] }
    });

    const repaired = await mock.saveFormsStep(emptied.word.id, {
      base_revision: emptied.word.revision,
      operation_id: "repair-empty-sense-groups-resave-forms",
      intent: "save",
      content: emptied.word.forms
    });

    expect(repaired.word.meanings.sense_groups).toHaveLength(1);
    expect(
      repaired.word.meanings.pos.every((pos) =>
        pos.senses.every(
          (sense) =>
            sense.sense_group_id === repaired.word.meanings.sense_groups[0]!.id
        )
      )
    ).toBe(true);
  });

  it("管理员切换、登出、超管旁路与延迟分支保持身份隔离", async () => {
    const storage = memoryStorage();
    let currentProfile: AdminProfile | undefined = profile();
    const stateful = createAdminWordsMock({
      getAdminProfile: () => currentProfile,
      now: () => new Date(NOW),
      latencyMs: 1,
      sessionStorage: storage
    });
    const created = await stateful.create({ headword: "admin-a-only" });
    const adminAKey = adminWordsMockStorageKey(
      ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
      "admin-test"
    );
    expect(storage.values.has(adminAKey)).toBe(true);

    currentProfile = profile({
      id: "admin-b",
      display_name: "Admin B",
      role: "super_admin",
      permissions: []
    });
    await expect(stateful.get(created.word.id)).rejects.toMatchObject({
      status: 404
    });
    expect(storage.values.has(adminAKey)).toBe(false);

    currentProfile = undefined;
    await expect(stateful.stats()).rejects.toMatchObject({
      status: 401,
      code: "unauthorized"
    });
    stateful.clearSession();
    stateful.clearSession();
  });

  it("持久化 state validator 对每个 envelope/word 子结构 fail closed", async () => {
    const storage = memoryStorage();
    const persisted = mockFor(() => profile(), storage);
    const draft = await createCenter(persisted);
    await persisted.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "persisted-operation",
      intent: "save",
      content: withCompletePronunciations(draft.word.forms)
    });
    const valid = readPersistedState(storage);
    expect(isAdminWordsMockPersistedState(valid)).toBe(true);
    expect(isAdminWordsMockPersistedState(null)).toBe(false);

    const v2Id = draft.word.id;
    const detectionId = draft.word.detection_snapshot.detection_id;
    (valid.words[v2Id] as AdminWordV2).meanings.sense_groups = [
      { id: "persisted-v2-group", name_zh: "空间", name_en: "Space" }
    ];
    (valid.words["fixture-colour"] as AdminWord).sense_groups = [
      { id: "persisted-v1-group", name: "颜色" }
    ];
    valid.impact_tokens["valid-impact"] = {
      word_id: v2Id,
      base_revision: draft.word.revision,
      content_json: "{}",
      affected: [
        {
          node_id: "suggested-pos-verb",
          node_type: "pos",
          reason: "test"
        }
      ]
    };
    expect(isAdminWordsMockPersistedState(valid)).toBe(true);
    const mutationCases: Array<
      [string, (state: AdminWordsMockPersistedState) => void]
    > = [
      ["sequence", (state) => Object.assign(state, { sequence: "bad" })],
      ["words container", (state) => Object.assign(state, { words: [] })],
      ["word scalar", (state) => Object.assign(state.words, { bad: null })],
      ["word id", (state) => Object.assign(state.words[v2Id]!, { id: 1 })],
      [
        "word created_by",
        (state) => Object.assign(state.words[v2Id]!, { created_by: 1 })
      ],
      [
        "word created_at",
        (state) => Object.assign(state.words[v2Id]!, { created_at: "invalid" })
      ],
      [
        "word updated_at",
        (state) => Object.assign(state.words[v2Id]!, { updated_at: "invalid" })
      ],
      [
        "word status",
        (state) => Object.assign(state.words[v2Id]!, { status: "deleted" })
      ],
      [
        "v2 revision",
        (state) => Object.assign(state.words[v2Id]!, { revision: "one" })
      ],
      [
        "v2 completed_steps",
        (state) => Object.assign(state.words[v2Id]!, { completed_steps: null })
      ],
      [
        "v2 forms",
        (state) => Object.assign(state.words[v2Id]!, { forms: null })
      ],
      [
        "v2 forms.pos",
        (state) =>
          Object.assign((state.words[v2Id] as AdminWordV2).forms, { pos: null })
      ],
      [
        "v2 meanings",
        (state) => Object.assign(state.words[v2Id]!, { meanings: null })
      ],
      [
        "v2 meanings.pos",
        (state) =>
          Object.assign((state.words[v2Id] as AdminWordV2).meanings, {
            pos: null
          })
      ],
      [
        "v2 sense_groups",
        (state) =>
          Object.assign((state.words[v2Id] as AdminWordV2).meanings, {
            sense_groups: null
          })
      ],
      [
        "v2 sense group shape",
        (state) =>
          Object.assign(
            (state.words[v2Id] as AdminWordV2).meanings.sense_groups[0]!,
            { name_en: 1 }
          )
      ],
      [
        "legacy headword",
        (state) =>
          Object.assign(state.words["fixture-colour"]!, { headword: 1 })
      ],
      [
        "legacy pos",
        (state) => Object.assign(state.words["fixture-colour"]!, { pos: null })
      ],
      [
        "legacy sense groups",
        (state) =>
          Object.assign(state.words["fixture-colour"]!, {
            sense_groups: null
          })
      ],
      [
        "legacy sense group shape",
        (state) =>
          Object.assign(
            (state.words["fixture-colour"] as AdminWord).sense_groups[0]!,
            { name: 1 }
          )
      ],
      [
        "detections container",
        (state) => Object.assign(state, { detections: [] })
      ],
      [
        "detection scalar",
        (state) => Object.assign(state.detections, { bad: null })
      ],
      [
        "detection id",
        (state) =>
          Object.assign(state.detections[detectionId]!, { detection_id: 1 })
      ],
      [
        "detection expiry",
        (state) =>
          Object.assign(state.detections[detectionId]!, {
            expires_at: "invalid"
          })
      ],
      [
        "detection request",
        (state) =>
          Object.assign(state.detections[detectionId]!, { request: null })
      ],
      [
        "detection language",
        (state) =>
          Object.assign(state.detections[detectionId]!.request, {
            language: "fr"
          })
      ],
      [
        "detection headword",
        (state) =>
          Object.assign(state.detections[detectionId]!.request, { headword: 1 })
      ],
      [
        "builtin dictionary",
        (state) =>
          Object.assign(state.detections[detectionId]!, {
            builtin_dictionary: null
          })
      ],
      [
        "smart dictionary",
        (state) =>
          Object.assign(state.detections[detectionId]!, {
            smart_dictionary: null
          })
      ],
      [
        "create idempotency container",
        (state) => Object.assign(state, { create_idempotency: [] })
      ],
      [
        "create idempotency value",
        (state) => Object.assign(state.create_idempotency, { bad: 1 })
      ],
      [
        "operations container",
        (state) => Object.assign(state, { operations: [] })
      ],
      [
        "operation kind",
        (state) =>
          Object.assign(state.operations["persisted-operation"]!, {
            kind: "other"
          })
      ],
      [
        "operation word id",
        (state) =>
          Object.assign(state.operations["persisted-operation"]!, {
            word_id: 1
          })
      ],
      [
        "operation input",
        (state) =>
          Object.assign(state.operations["persisted-operation"]!, {
            input_json: null
          })
      ],
      [
        "operation result",
        (state) =>
          Object.assign(state.operations["persisted-operation"]!, {
            result: null
          })
      ],
      [
        "publish idempotency container",
        (state) => Object.assign(state, { publish_idempotency: [] })
      ],
      [
        "publish idempotency",
        (state) => Object.assign(state.publish_idempotency, { bad: 1 })
      ],
      [
        "impact token container",
        (state) => Object.assign(state, { impact_tokens: [] })
      ],
      [
        "impact token",
        (state) => Object.assign(state.impact_tokens, { bad: null })
      ],
      [
        "impact token word",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!, { word_id: 1 })
      ],
      [
        "impact token revision",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!, {
            base_revision: "one"
          })
      ],
      [
        "impact token content",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!, {
            content_json: null
          })
      ],
      [
        "impact token affected container",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!, {
            affected: null
          })
      ],
      [
        "impact token affected scalar",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!, {
            affected: [null]
          })
      ],
      [
        "impact token affected id",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!.affected[0]!, {
            node_id: 1
          })
      ],
      [
        "impact token affected type",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!.affected[0]!, {
            node_type: 1
          })
      ],
      [
        "impact token affected reason",
        (state) =>
          Object.assign(state.impact_tokens["valid-impact"]!.affected[0]!, {
            reason: 1
          })
      ],
      [
        "lost responses",
        (state) => Object.assign(state, { lost_publish_responses: [1] })
      ]
    ];

    for (const [label, mutate] of mutationCases) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      expect(isAdminWordsMockPersistedState(candidate), label).toBe(false);
    }

    const corrupt = structuredClone(valid);
    Object.assign(corrupt, { sequence: "bad" });
    storage.values.set(
      adminWordsMockStorageKey(ADMIN_WORDS_MOCK_STORAGE_SCHEMA, "admin-test"),
      JSON.stringify({
        schema_version: ADMIN_WORDS_MOCK_STORAGE_SCHEMA,
        admin_profile_id: "admin-test",
        state: corrupt
      })
    );
    const warn = vi.fn();
    const refreshed = createAdminWordsMock({
      getAdminProfile: () => profile(),
      now: () => new Date(NOW),
      sessionStorage: storage,
      warn
    });
    await expect(refreshed.stats()).resolves.toMatchObject({ total: 2 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("已清理"),
      expect.anything()
    );
  });

  it("覆盖 center/far、phrase 与两个检测源的业务状态", async () => {
    const center = await mock.detect({ language: "en", headword: "center" });
    expect(center.request.headword).toBe("center");
    expect(center.matched_dialect).toBe("us");
    expect(center.smart_dictionary.status).toBe("clear");
    expect(center.builtin_dictionary.status).toBe("matched");
    if (center.builtin_dictionary.status === "matched") {
      expect(center.builtin_dictionary.headwords).toEqual({
        mode: "distinguish",
        uk: "centre",
        us: "center",
        source_dialect: "us"
      });
      expect(
        center.builtin_dictionary.suggested_forms.pos.map((pos) => pos.pos)
      ).toEqual(["noun", "verb"]);
    }
    if (center.builtin_dictionary.status !== "matched") {
      throw new Error("center fixture must match");
    }
    const far = await mock.detect({ language: "en", headword: "far" });
    if (far.builtin_dictionary.status !== "matched")
      throw new Error("far fixture");
    expect(
      far.builtin_dictionary.suggested_forms.pos[0]?.form_groups
    ).toHaveLength(2);

    await expect(
      mock.detect({ language: "en", headword: "not-found" })
    ).resolves.toMatchObject({ builtin_dictionary: { status: "not_found" } });
    await expect(
      mock.detect({ language: "en", headword: "builtin-unavailable" })
    ).resolves.toMatchObject({ builtin_dictionary: { status: "unavailable" } });
    await expect(
      mock.detect({ language: "en", headword: "smart-unavailable" })
    ).resolves.toMatchObject({ smart_dictionary: { status: "unavailable" } });
    const matchedPhrase = await mock.detect({
      language: "en",
      headword: "in front of"
    });
    expect(matchedPhrase).toMatchObject({
      entry_kind: "phrase",
      builtin_dictionary: { status: "matched" }
    });
    const phrase = await mock.detect({
      language: "en",
      headword: "unlisted phrase"
    });
    expect(phrase).toMatchObject({
      entry_kind: "phrase",
      builtin_dictionary: { status: "not_found" }
    });
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "create-phrase",
        detection_id: phrase.detection_id,
        headwords: { mode: "unified", common: "unlisted phrase" }
      })
    ).resolves.toMatchObject({
      word: {
        kind: "phrase",
        lifecycle_revision: 1,
        forms: { pos: [] }
      }
    });
    const normalizedPhrase = await mock.detect({
      language: "en",
      headword: "  It’s　Well—Known  "
    });
    expect(normalizedPhrase).toMatchObject({
      request: { headword: "It’s Well—Known" },
      normalized_headword: "it's well-known",
      entry_kind: "phrase",
      builtin_dictionary: { status: "not_found" }
    });
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "create-normalized-phrase",
        detection_id: normalizedPhrase.detection_id,
        headwords: { mode: "unified", common: "It's Well-Known" }
      })
    ).resolves.toMatchObject({
      word: { kind: "phrase", headwords: { common: "It's Well-Known" } }
    });
    await expect(
      mock.detect({ language: "en", headword: "colour" })
    ).resolves.toMatchObject({
      smart_dictionary: {
        status: "duplicate",
        duplicates: [expect.objectContaining({ status: "published" })]
      }
    });
  });

  it("提供 38 词义/例句性能 fixture 与只返回建议的方言转换", async () => {
    const detection = await mock.detect({
      language: "en",
      headword: "large-fixture"
    });
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("large fixture must match");
    }
    const large = await mock.createV2({
      schema_version: 2,
      idempotency_key: "create-large",
      detection_id: detection.detection_id,
      headwords: detection.builtin_dictionary.headwords
    });
    expect(large.word.meanings.pos[0]?.senses).toHaveLength(38);
    expect(
      large.word.meanings.pos[0]?.senses.flatMap((sense) => sense.sentences)
    ).toHaveLength(38);
    expect(large.word.forms.pos[0]?.base_form.variants[0]?.spelling).toBe(
      "large-fixture"
    );

    await expect(
      mock.suggestDialectVariants({
        source_dialect: "us",
        target_dialect: "uk",
        items: [
          { client_id: "form-1", field_kind: "form", value: "center" },
          {
            client_id: "definition-1",
            field_kind: "definition",
            value: {
              version: 1,
              text: "the color center",
              spans: [],
              liaisons: []
            }
          }
        ]
      })
    ).resolves.toMatchObject({
      suggestions: [
        { client_id: "form-1", value: "centre" },
        {
          client_id: "definition-1",
          value: { text: "the colour centre" }
        }
      ]
    });
  });

  it("方言建议仅返回有地区 evidence 的项目，并保留 provider 身份", async () => {
    await expect(
      mock.suggestDialectVariants({
        source_dialect: "uk",
        target_dialect: "us",
        items: [
          { client_id: "evidence-form", field_kind: "form", value: "CENTRE" },
          {
            client_id: "no-evidence-definition",
            field_kind: "definition",
            value: richText("unchanged")
          }
        ]
      })
    ).resolves.toEqual({
      provider: { kind: "dictionary_region_rules", version: "1" },
      suggestions: [
        {
          client_id: "evidence-form",
          field_kind: "form",
          value: "CENTER"
        }
      ]
    });
  });

  it("方言建议转换后重映射 V1/V2 富文本偏移，并保护 phoneme 区间", async () => {
    await expect(
      mock.suggestDialectVariants({
        source_dialect: "uk",
        target_dialect: "us",
        items: [
          {
            client_id: "v1-rich-text",
            field_kind: "definition",
            value: {
              version: 1,
              text: "Colour centre",
              spans: [{ start: 0, end: 6, type: "bold" }],
              liaisons: [6]
            }
          },
          {
            client_id: "v2-rich-text",
            field_kind: "example",
            value: {
              version: 2,
              text: "Colour centre",
              annotations: [
                { type: "emphasis", start: 0, end: 6, level: "strong" },
                {
                  type: "phoneme",
                  start: 7,
                  end: 13,
                  alphabet: "ipa",
                  phoneme: "sɛntə"
                },
                { type: "liaison", start: 0, end: 6 },
                { type: "highlight", start: 0, end: 6, color: "blue" },
                { type: "pause", at: 6, duration_ms: 250 }
              ]
            }
          }
        ]
      })
    ).resolves.toEqual({
      provider: { kind: "dictionary_region_rules", version: "1" },
      suggestions: [
        {
          client_id: "v1-rich-text",
          field_kind: "definition",
          value: {
            version: 1,
            text: "Color center",
            spans: [{ start: 0, end: 5, type: "bold" }],
            liaisons: [5]
          }
        },
        {
          client_id: "v2-rich-text",
          field_kind: "example",
          value: {
            version: 2,
            text: "Color centre",
            annotations: [
              { type: "emphasis", start: 0, end: 5, level: "strong" },
              {
                type: "phoneme",
                start: 6,
                end: 12,
                alphabet: "ipa",
                phoneme: "sɛntə"
              },
              { type: "liaison", start: 0, end: 5 },
              { type: "highlight", start: 0, end: 5, color: "blue" },
              { type: "pause", at: 5, duration_ms: 250 }
            ]
          }
        }
      ]
    });
  });

  it("方言建议对语义非法、重复、超限与畸形 RichText 统一返回 422", async () => {
    const validItem = {
      client_id: "valid",
      field_kind: "form" as const,
      value: "centre"
    };
    const requestWithItem = (item: unknown): SuggestDialectVariantsInputV2 =>
      ({
        source_dialect: "uk",
        target_dialect: "us",
        items: [item]
      }) as SuggestDialectVariantsInputV2;
    const malformedRichText = (clientId: string, value: unknown) =>
      requestWithItem({
        client_id: clientId,
        field_kind: "definition",
        value
      });
    const invalidInputs: Array<{
      field: string;
      input: SuggestDialectVariantsInputV2;
    }> = [
      {
        field: "target_dialect",
        input: {
          source_dialect: "uk",
          target_dialect: "uk",
          items: [validItem]
        }
      },
      {
        field: "items",
        input: { source_dialect: "uk", target_dialect: "us", items: [] }
      },
      {
        field: "items",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: Array.from({ length: 101 }, (_, index) => ({
            client_id: `item-${index}`,
            field_kind: "form" as const,
            value: "centre"
          }))
        }
      },
      {
        field: "items.client_id",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: [validItem, { ...validItem, value: "colour" }]
        }
      },
      {
        field: "items.client_id",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: [{ ...validItem, client_id: " ".repeat(101) }]
        }
      },
      {
        field: "items.client_id",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: [{ ...validItem, client_id: `x${"a".repeat(100)}` }]
        }
      },
      {
        field: "items.value",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: [{ ...validItem, value: "x".repeat(201) }]
        }
      },
      {
        field: "items.value",
        input: {
          source_dialect: "uk",
          target_dialect: "us",
          items: [
            {
              client_id: "invalid-rich-text",
              field_kind: "definition",
              value: {
                version: 1,
                text: "colour",
                spans: [{ start: 5, end: 2, type: "bold" }],
                liaisons: []
              }
            }
          ]
        }
      },
      {
        field: "items.value",
        input: requestWithItem({
          ...validItem,
          client_id: "blank-form",
          value: " "
        })
      },
      {
        field: "items.value",
        input: malformedRichText("not-rich-text", null)
      },
      {
        field: "items.value",
        input: malformedRichText("too-long-rich-text", {
          version: 1,
          text: "x".repeat(5001),
          spans: [],
          liaisons: []
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v1-shape", {
          version: 1,
          text: "colour",
          spans: null,
          liaisons: []
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v1-span-type", {
          version: 1,
          text: "colour",
          spans: [{ start: 0, end: 6, type: "italic" }],
          liaisons: []
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v1-liaison", {
          version: 1,
          text: "colour",
          spans: [],
          liaisons: [6]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-shape", {
          version: 2,
          text: "colour",
          annotations: null
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-range", {
          version: 2,
          text: "colour",
          annotations: [{ type: "emphasis", start: 0, end: 7, level: "strong" }]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-pause", {
          version: 2,
          text: "colour",
          annotations: [{ type: "pause", at: -1, duration_ms: 250 }]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-phoneme", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 6,
              alphabet: "arpabet",
              phoneme: "K"
            }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-highlight", {
          version: 2,
          text: "colour",
          annotations: [
            { type: "highlight", start: 0, end: 6, color: "purple" }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v1-nul", {
          version: 1,
          text: "colour\0center",
          spans: [],
          liaisons: []
        })
      },
      {
        field: "items.value",
        input: malformedRichText("invalid-v2-nul", {
          version: 2,
          text: "colour\0center",
          annotations: []
        })
      },
      {
        field: "items.value",
        input: malformedRichText("zero-pause", {
          version: 2,
          text: "colour",
          annotations: [{ type: "pause", at: 1, duration_ms: 0 }]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("long-pause", {
          version: 2,
          text: "colour",
          annotations: [{ type: "pause", at: 1, duration_ms: 5001 }]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("long-phoneme", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 6,
              alphabet: "ipa",
              phoneme: "a".repeat(201)
            }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("nul-phoneme", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 6,
              alphabet: "ipa",
              phoneme: "k\0"
            }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("cross-paragraph", {
          version: 2,
          text: "color\ncentre",
          annotations: [{ type: "highlight", start: 0, end: 12, color: "blue" }]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("overlapping-phonemes", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 4,
              alphabet: "ipa",
              phoneme: "a"
            },
            {
              type: "phoneme",
              start: 3,
              end: 6,
              alphabet: "ipa",
              phoneme: "b"
            }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("crossing-emphasis", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 1,
              end: 5,
              alphabet: "ipa",
              phoneme: "a"
            },
            { type: "emphasis", start: 0, end: 3, level: "strong" }
          ]
        })
      },
      {
        field: "items.value",
        input: malformedRichText("pause-inside-phoneme", {
          version: 2,
          text: "colour",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 6,
              alphabet: "ipa",
              phoneme: "a"
            },
            { type: "pause", at: 3, duration_ms: 250 }
          ]
        })
      }
    ];

    for (const { field, input } of invalidInputs) {
      await expect(mock.suggestDialectVariants(input)).rejects.toMatchObject({
        status: 422,
        code: "validation_failed",
        meta: { code: field }
      });
    }
  });

  it("V2 生命周期保留内容并支持幂等重放、并发保护与原子批量", async () => {
    const center = await createCenter(mock, "lifecycle-center");
    const archiveInput = {
      base_revision: center.word.revision,
      base_lifecycle_revision: center.word.lifecycle_revision
    };

    const archived = await mock.archive(
      center.word.id,
      "archive-center",
      archiveInput
    );
    expect(archived.word).toMatchObject({
      status: "archived",
      revision: center.word.revision,
      lifecycle_revision: center.word.lifecycle_revision + 1,
      forms: center.word.forms,
      meanings: center.word.meanings
    });
    await expect(
      mock.archive(center.word.id, "archive-center", archiveInput)
    ).resolves.toEqual(archived);
    await expect(
      mock.archive(center.word.id, "archive-center", {
        ...archiveInput,
        base_revision: archiveInput.base_revision + 1
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    await expect(
      mock.archiveBatch("archive-empty", { entries: [] })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    await expect(
      mock.archiveBatch("archive-duplicate", {
        entries: [
          { id: center.word.id, ...archiveInput },
          { id: center.word.id, ...archiveInput }
        ]
      })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    await expect(
      mock.archiveBatch("archive-invalid-revision", {
        entries: [
          {
            id: center.word.id,
            base_revision: 0,
            base_lifecycle_revision: 0
          }
        ]
      })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    await expect(
      mock.archiveBatch("archive-too-many", {
        entries: Array.from({ length: 101 }, (_, index) => ({
          id: `too-many-${index}`,
          base_revision: 1,
          base_lifecycle_revision: 1
        }))
      })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    const legacy = (await mock.list({})).words.find(
      (word) => word.schema_version !== 2
    )!;
    await expect(
      mock.archive(legacy.id, "archive-legacy", {
        base_revision: 1,
        base_lifecycle_revision: 1
      })
    ).rejects.toMatchObject({ status: 409, code: "schema_version_mismatch" });
    await expect(
      mock.restore(center.word.id, "restore-stale-lifecycle", {
        base_revision: archived.word.revision,
        base_lifecycle_revision: archived.word.lifecycle_revision + 1
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    await expect(
      mock.archiveBatch("archive-already-target", {
        entries: [
          {
            id: archived.word.id,
            base_revision: archived.word.revision,
            base_lifecycle_revision: 1
          }
        ]
      })
    ).resolves.toMatchObject({ affected: 0 });
    await expect(
      mock.saveFormsStep(center.word.id, {
        base_revision: center.word.revision,
        operation_id: "archived-edit",
        intent: "save",
        content: center.word.forms
      })
    ).rejects.toMatchObject({ status: 409, code: "entry_archived" });

    const restored = await mock.restore(center.word.id, "restore-center", {
      base_revision: archived.word.revision,
      base_lifecycle_revision: archived.word.lifecycle_revision
    });
    expect(restored.word).toMatchObject({
      status: "draft",
      revision: center.word.revision,
      lifecycle_revision: center.word.lifecycle_revision + 2
    });
    await expect(
      mock.restoreBatch("restore-already-active", {
        entries: [
          {
            id: restored.word.id,
            base_revision: restored.word.revision,
            base_lifecycle_revision: 1
          }
        ]
      })
    ).resolves.toMatchObject({ affected: 0 });

    const far = await createDetectedWord(mock, "far", "lifecycle-far");
    const batchInput = {
      entries: [restored.word, far.word].map((word) => ({
        id: word.id,
        base_revision: word.revision,
        base_lifecycle_revision: word.lifecycle_revision
      }))
    };
    const batch = await mock.archiveBatch("archive-batch", batchInput);
    expect(batch).toMatchObject({ affected: 2 });
    expect(batch.words.every((word) => word.status === "archived")).toBe(true);
    await expect(
      mock.archiveBatch("archive-batch", batchInput)
    ).resolves.toEqual(batch);

    const staleBatch = {
      entries: batch.words.map((word, index) => ({
        id: word.id,
        base_revision: word.revision + (index === 0 ? 1 : 0),
        base_lifecycle_revision: word.lifecycle_revision
      }))
    };
    await expect(
      mock.restoreBatch("restore-stale-batch", staleBatch)
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    const afterConflict = await Promise.all(
      batch.words.map((word) => mock.get(word.id))
    );
    expect(
      afterConflict.every(
        (envelope) =>
          envelope.word.schema_version === 2 &&
          envelope.word.status === "archived"
      )
    ).toBe(true);
  });

  it("仅永久删除 revision 匹配且从未发布的活动 V2 草稿", async () => {
    const center = await createCenter(mock, "delete-draft-center");
    const input = {
      base_revision: center.word.revision,
      base_lifecycle_revision: center.word.lifecycle_revision
    };

    await expect(
      mock.deleteDraft("missing-draft", input)
    ).rejects.toMatchObject({ status: 404, code: "word_not_found" });
    const legacy = (await mock.list({})).words.find(
      (word) => word.schema_version !== 2
    )!;
    await expect(mock.deleteDraft(legacy.id, input)).rejects.toMatchObject({
      status: 409,
      code: "entry_not_deletable"
    });
    await expect(
      mock.deleteDraft(center.word.id, {
        ...input,
        base_revision: input.base_revision + 1
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    await expect(
      mock.deleteDraft(center.word.id, {
        ...input,
        base_lifecycle_revision: input.base_lifecycle_revision + 1
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });

    const archivedDraft = await createDetectedWord(
      mock,
      "hello",
      "delete-draft-archived"
    );
    const archived = await mock.archive(
      archivedDraft.word.id,
      "delete-draft-archive",
      {
        base_revision: archivedDraft.word.revision,
        base_lifecycle_revision: archivedDraft.word.lifecycle_revision
      }
    );
    await expect(
      mock.deleteDraft(archived.word.id, {
        base_revision: archived.word.revision,
        base_lifecycle_revision: archived.word.lifecycle_revision
      })
    ).rejects.toMatchObject({ status: 409, code: "entry_not_deletable" });

    const publishedDraft = await createDetectedWord(
      mock,
      "far",
      "delete-draft-published"
    );
    const publishedReady = await completeDraft(
      mock,
      publishedDraft,
      "delete-draft-published"
    );
    const published = await mock.publishV2(publishedReady.id, {
      base_revision: publishedReady.revision,
      idempotency_key: "delete-draft-published-key"
    });
    await expect(
      mock.deleteDraft(published.word.id, {
        base_revision: published.word.revision,
        base_lifecycle_revision: published.word.lifecycle_revision
      })
    ).rejects.toMatchObject({ status: 409, code: "entry_not_deletable" });

    await expect(
      mock.deleteDraft(center.word.id, input)
    ).resolves.toBeUndefined();
    await expect(mock.get(center.word.id)).rejects.toMatchObject({
      status: 404,
      code: "word_not_found"
    });
  });

  it("生命周期幂等键跨端点复用时拒绝不同 scope 或 body", async () => {
    const center = await createCenter(mock, "lifecycle-global-idempotency");
    const input = {
      base_revision: center.word.revision,
      base_lifecycle_revision: center.word.lifecycle_revision
    };
    const archived = await mock.archive(
      center.word.id,
      "global-lifecycle-key",
      input
    );

    await expect(
      mock.restore(center.word.id, "global-lifecycle-key", {
        base_revision: archived.word.revision,
        base_lifecycle_revision: archived.word.lifecycle_revision
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    await expect(
      mock.archiveBatch("global-lifecycle-key", {
        entries: [{ id: center.word.id, ...input }]
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
  });

  it("归档拒绝当前发布版本的有效入站引用", async () => {
    const targetDraft = await createDetectedWord(
      mock,
      "far",
      "lifecycle-ref-target"
    );
    const targetReady = await completeDraft(
      mock,
      targetDraft,
      "lifecycle-ref-target"
    );
    const targetPublished = await mock.publishV2(targetReady.id, {
      base_revision: targetReady.revision,
      idempotency_key: "lifecycle-ref-target-publish"
    });
    const sourceDraft = await createCenter(mock, "lifecycle-ref-source");
    const sourceForms = await mock.saveFormsStep(sourceDraft.word.id, {
      base_revision: sourceDraft.word.revision,
      operation_id: "lifecycle-ref-source-forms",
      intent: "complete",
      content: withCompletePronunciations(sourceDraft.word.forms)
    });
    const sourceMeanings = completeMockMeanings(sourceForms.word);
    const sourceSense = sourceMeanings.pos[0]!.senses[0]!;
    sourceSense.relations.push({
      id: "lifecycle-relation",
      relation: "synonym",
      target_word_id: targetPublished.word.id,
      target_sense_id: targetPublished.word.meanings.pos[0]!.senses[0]!.id,
      score: "80"
    });
    const sourceReady = (
      await mock.saveMeaningsStep(sourceForms.word.id, {
        base_revision: sourceForms.word.revision,
        operation_id: "lifecycle-ref-source-meanings",
        intent: "complete",
        content: sourceMeanings
      })
    ).word;
    await mock.publishV2(sourceReady.id, {
      base_revision: sourceReady.revision,
      idempotency_key: "lifecycle-ref-source-publish"
    });

    await expect(
      mock.archive(targetPublished.word.id, "archive-referenced-target", {
        base_revision: targetPublished.word.revision,
        base_lifecycle_revision: targetPublished.word.lifecycle_revision
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "entry_has_inbound_publication_refs",
      meta: {
        reference_locations: [
          expect.objectContaining({
            source_entry_id: sourceReady.id,
            source_node_id: "lifecycle-relation"
          })
        ]
      }
    });
  });

  it("关系校验只接受未归档目标的当前发布 sense", async () => {
    const targetDraft = await createDetectedWord(
      mock,
      "far",
      "relation-publication-target"
    );
    const targetReady = await completeDraft(
      mock,
      targetDraft,
      "relation-publication-target"
    );
    const targetPublished = await mock.publishV2(targetReady.id, {
      base_revision: targetReady.revision,
      idempotency_key: "relation-publication-target-publish"
    });
    const targetDraftMeanings = structuredClone(targetPublished.word.meanings);
    targetDraftMeanings.pos[0]!.senses.push({
      ...structuredClone(targetPublished.word.meanings.pos[0]!.senses[0]!),
      id: "relation-unpublished-sense"
    });
    const targetEdited = await mock.saveMeaningsStep(targetReady.id, {
      base_revision: targetPublished.word.revision,
      operation_id: "relation-publication-target-edit",
      intent: "save",
      content: targetDraftMeanings
    });

    const sourceDraft = await createCenter(mock, "relation-publication-source");
    const sourceForms = await mock.saveFormsStep(sourceDraft.word.id, {
      base_revision: sourceDraft.word.revision,
      operation_id: "relation-publication-source-forms",
      intent: "complete",
      content: withCompletePronunciations(sourceDraft.word.forms)
    });
    const sourceMeanings = completeMockMeanings(sourceForms.word);
    const relation = {
      id: "relation-publication-check",
      relation: "synonym" as const,
      target_word_id: targetPublished.word.id,
      target_sense_id: "relation-unpublished-sense",
      score: "80"
    };
    sourceMeanings.pos[0]!.senses[0]!.relations.push(relation);
    await expect(
      mock.saveMeaningsStep(sourceForms.word.id, {
        base_revision: sourceForms.word.revision,
        operation_id: "relation-unpublished-target-sense",
        intent: "complete",
        content: sourceMeanings
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({ code: "relation_invalid" })
      ])
    });

    await mock.archive(
      targetPublished.word.id,
      "archive-relation-validation-target",
      {
        base_revision: targetEdited.word.revision,
        base_lifecycle_revision: targetEdited.word.lifecycle_revision
      }
    );
    relation.target_sense_id =
      targetPublished.word.meanings.pos[0]!.senses[0]!.id;
    await expect(
      mock.saveMeaningsStep(sourceForms.word.id, {
        base_revision: sourceForms.word.revision,
        operation_id: "relation-archived-target",
        intent: "complete",
        content: sourceMeanings
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({ code: "relation_invalid" })
      ])
    });
  });

  it("恢复拒绝发布版本指向归档目标，但同批恢复目标时允许原子通过", async () => {
    const targetDraft = await createDetectedWord(
      mock,
      "far",
      "restore-ref-target"
    );
    const targetReady = await completeDraft(
      mock,
      targetDraft,
      "restore-ref-target"
    );
    const targetPublished = await mock.publishV2(targetReady.id, {
      base_revision: targetReady.revision,
      idempotency_key: "restore-ref-target-publish"
    });
    const sourceDraft = await createCenter(mock, "restore-ref-source");
    const sourceForms = await mock.saveFormsStep(sourceDraft.word.id, {
      base_revision: sourceDraft.word.revision,
      operation_id: "restore-ref-source-forms",
      intent: "complete",
      content: withCompletePronunciations(sourceDraft.word.forms)
    });
    const sourceMeanings = completeMockMeanings(sourceForms.word);
    sourceMeanings.pos[0]!.senses[0]!.relations.push({
      id: "restore-relation",
      relation: "synonym",
      target_word_id: targetPublished.word.id,
      target_sense_id: targetPublished.word.meanings.pos[0]!.senses[0]!.id,
      score: "80"
    });
    const sourceReady = (
      await mock.saveMeaningsStep(sourceForms.word.id, {
        base_revision: sourceForms.word.revision,
        operation_id: "restore-ref-source-meanings",
        intent: "complete",
        content: sourceMeanings
      })
    ).word;
    const sourcePublished = await mock.publishV2(sourceReady.id, {
      base_revision: sourceReady.revision,
      idempotency_key: "restore-ref-source-publish"
    });
    const bothArchived = await mock.archiveBatch("archive-ref-pair", {
      entries: [targetPublished.word, sourcePublished.word].map((word) => ({
        id: word.id,
        base_revision: word.revision,
        base_lifecycle_revision: word.lifecycle_revision
      }))
    });
    const archivedTarget = bothArchived.words.find(
      (word) => word.id === targetPublished.word.id
    )!;
    const archivedSource = bothArchived.words.find(
      (word) => word.id === sourcePublished.word.id
    )!;

    await expect(
      mock.restore(archivedSource.id, "restore-source-alone", {
        base_revision: archivedSource.revision,
        base_lifecycle_revision: archivedSource.lifecycle_revision
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "entry_has_unavailable_publication_refs"
    });
    await expect(
      mock.restoreBatch("restore-ref-pair", {
        entries: [archivedSource, archivedTarget].map((word) => ({
          id: word.id,
          base_revision: word.revision,
          base_lifecycle_revision: word.lifecycle_revision
        }))
      })
    ).resolves.toMatchObject({ affected: 2 });
  });

  it("拒绝非法检测、方言组合、重复创建与超限 payload", async () => {
    await expect(
      mock.detect({ language: "fr" as "en", headword: "centre" })
    ).rejects.toMatchObject({ status: 422, code: "unsupported_language" });
    await expect(
      mock.detect({ language: "en", headword: "   " })
    ).rejects.toMatchObject({ status: 400, code: "invalid_headword" });
    await expect(
      mock.detect({ language: "en", headword: "x".repeat(201) })
    ).rejects.toMatchObject({ status: 400, code: "invalid_headword" });
    await expect(
      mock.detect({ language: "en", headword: "line\nbreak" })
    ).rejects.toMatchObject({ status: 400, code: "invalid_headword" });
    await expect(
      mock.detect({ language: "en", headword: "server-error" })
    ).rejects.toMatchObject({ status: 500, code: "mock_internal_error" });

    await expect(
      mock.suggestDialectVariants({
        source_dialect: "uk",
        target_dialect: "uk",
        items: [
          { client_id: "same-dialect", field_kind: "form", value: "centre" }
        ]
      })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    await expect(
      mock.suggestDialectVariants({
        source_dialect: "uk",
        target_dialect: "us",
        items: [
          { client_id: "reverse-form", field_kind: "form", value: "centre" },
          {
            client_id: "unchanged-definition",
            field_kind: "definition",
            value: richText("unchanged")
          }
        ]
      })
    ).resolves.toMatchObject({
      suggestions: [{ value: "center" }]
    });

    await expect(mock.create({ headword: " " })).rejects.toMatchObject({
      status: 400,
      code: "invalid_headword"
    });
    await expect(mock.create({ headword: "color" })).rejects.toMatchObject({
      status: 409,
      code: "duplicate_word"
    });
    await expect(
      mock.create({ headword: "default-kind" })
    ).resolves.toMatchObject({ word: { kind: "word" } });
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "missing-detection",
        detection_id: "missing",
        headwords: { mode: "unified", common: "missing" }
      })
    ).rejects.toMatchObject({ status: 422, code: "detection_mismatch" });

    for (const [headword, expectedCode] of [
      ["not-found", "detection_mismatch"],
      ["builtin-unavailable", "detection_mismatch"],
      ["smart-unavailable", "detection_mismatch"],
      ["colour", "duplicate_word"]
    ] as const) {
      const detection = await mock.detect({ language: "en", headword });
      const headwords =
        detection.builtin_dictionary.status === "matched"
          ? detection.builtin_dictionary.headwords
          : { mode: "unified" as const, common: headword };
      await expect(
        mock.createV2({
          schema_version: 2,
          idempotency_key: `reject-${headword}`,
          detection_id: detection.detection_id,
          headwords
        })
      ).rejects.toMatchObject({ code: expectedCode });
    }

    const center = await mock.detect({ language: "en", headword: "center" });
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "wrong-source-headword",
        detection_id: center.detection_id,
        headwords: { mode: "unified", common: "centre" }
      })
    ).rejects.toMatchObject({ status: 422, code: "detection_mismatch" });

    const raced = await mock.detect({ language: "en", headword: "raced" });
    await mock.create({ headword: "raced" });
    if (raced.builtin_dictionary.status !== "matched")
      throw new Error("raced fixture must match");
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "raced-create",
        detection_id: raced.detection_id,
        headwords: raced.builtin_dictionary.headwords
      })
    ).rejects.toMatchObject({ status: 409, code: "duplicate_word" });

    const limited = createAdminWordsMock({
      getAdminProfile: () => profile(),
      now: () => new Date(NOW),
      maxPayloadBytes: 1,
      sessionStorage: memoryStorage()
    });
    const limitedDetection = await limited.detect({
      language: "en",
      headword: "limited"
    });
    if (limitedDetection.builtin_dictionary.status !== "matched")
      throw new Error("limited fixture must match");
    await expect(
      limited.createV2({
        schema_version: 2,
        idempotency_key: "limited",
        detection_id: limitedDetection.detection_id,
        headwords: limitedDetection.builtin_dictionary.headwords
      })
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
  });

  it("createV2 幂等键重放首次响应，并绑定原检测与原词头", async () => {
    const storage = memoryStorage();
    const stateful = mockFor(() => profile(), storage);
    const center = await createCenter(stateful, "bound-create-key");
    await stateful.saveFormsStep(center.word.id, {
      base_revision: center.word.revision,
      operation_id: "edit-after-create",
      intent: "save",
      content: center.word.forms
    });
    const refreshed = mockFor(() => profile(), storage);
    await expect(
      refreshed.createV2({
        schema_version: 2,
        idempotency_key: "bound-create-key",
        detection_id: center.word.detection_snapshot.detection_id,
        headwords: center.word.headwords
      })
    ).resolves.toEqual(center);
    const far = await stateful.detect({ language: "en", headword: "far" });
    if (far.builtin_dictionary.status !== "matched")
      throw new Error("far fixture must match");
    await expect(
      stateful.createV2({
        schema_version: 2,
        idempotency_key: "bound-create-key",
        detection_id: far.detection_id,
        headwords: far.builtin_dictionary.headwords
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    if (center.word.headwords.mode !== "distinguish")
      throw new Error("center fixture must distinguish dialects");
    await expect(
      stateful.createV2({
        schema_version: 2,
        idempotency_key: "bound-create-key",
        detection_id: center.word.detection_snapshot.detection_id,
        headwords: { ...center.word.headwords, uk: "changed" }
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
  });

  it("forms complete 一次报告全部结构错误，并为新增词性初始化 meanings", async () => {
    const draft = await createCenter(mock);
    const invalid: DraftFormsStepContent = structuredClone(draft.word.forms);
    const noun = invalid.pos[0]!;
    const verb = invalid.pos[1]!;
    noun.form_groups = [];
    const nounUk = noun.base_form.variants.find(
      (variant) => variant.dialect === "uk"
    )!;
    noun.base_form.variants = [nounUk];
    nounUk.spelling = "wrong-centre";
    nounUk.pronunciations = [];
    const verbGroup = verb.form_groups[0]!;
    verb.form_groups.push({ id: "empty-group", is_regular: true, slots: [] });
    verbGroup.slots.push({
      ...structuredClone(verbGroup.slots[0]!),
      id: "duplicate-form-type"
    });
    const firstUs = verbGroup.slots[0]!.variants.find(
      (variant) => variant.dialect === "us"
    )!;
    firstUs.spelling = "";
    const secondUs = verbGroup.slots[1]!.variants.find(
      (variant) => variant.dialect === "us"
    )!;
    secondUs.pronunciations[0]!.actual_pron = "";

    const expectedCodes = [
      "form_group_required",
      "form_slot_required",
      "duplicate_form_type",
      "dialect_variants_invalid",
      "spelling_required",
      "pronunciation_required",
      "base_spelling_mismatch"
    ];
    await expect(
      mock.saveFormsStep(draft.word.id, {
        base_revision: draft.word.revision,
        operation_id: "all-form-errors",
        intent: "complete",
        content: invalid
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining(
        expectedCodes.map((code) => expect.objectContaining({ code }))
      )
    });

    const withNewPos = structuredClone(draft.word.forms);
    withNewPos.pos.push({
      ...structuredClone(withNewPos.pos[0]!),
      pos_id: "new-pos-id",
      pos: "adjective"
    });
    await expect(
      mock.saveFormsStep(draft.word.id, {
        base_revision: draft.word.revision,
        operation_id: "initialize-new-pos",
        intent: "save",
        content: withNewPos
      })
    ).resolves.toMatchObject({
      word: {
        meanings: {
          pos: expect.arrayContaining([
            expect.objectContaining({ pos_id: "new-pos-id" })
          ])
        }
      }
    });
  });

  it("已有 POS 后新增 POS 时生成全词条稳定唯一的 meanings 节点 ID", async () => {
    const draft = await createCenter(mock);
    const existingIds = new Set(meaningNodeIds(draft.word.meanings));
    const withNewPos = structuredClone(draft.word.forms);
    const addedFormsPos = structuredClone(withNewPos.pos[0]!);
    addedFormsPos.pos_id = "new-pos-id";
    addedFormsPos.pos = "adjective";
    addedFormsPos.base_form.id = "new-pos-base";
    addedFormsPos.base_form.variants.forEach((variant) => {
      variant.id = `new-pos-base-${variant.dialect}`;
      variant.pronunciations.forEach((pronunciation, index) => {
        pronunciation.id = `new-pos-base-${variant.dialect}-pron-${index + 1}`;
      });
    });
    addedFormsPos.form_groups = [];
    withNewPos.pos.push(addedFormsPos);

    const saved = await mock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "initialize-unique-new-pos",
      intent: "save",
      content: withNewPos
    });
    const addedMeanings = saved.word.meanings.pos.find(
      (pos) => pos.pos_id === addedFormsPos.pos_id
    );
    expect(addedMeanings).toMatchObject({
      grammar_structures: [
        {
          id: "mock-grammar-pos-new-pos-id",
          variants: [
            { id: "mock-grammar-pos-new-pos-id-uk" },
            { id: "mock-grammar-pos-new-pos-id-us" }
          ]
        }
      ],
      senses: [
        {
          id: "mock-sense-pos-new-pos-id-1",
          definitions: [{ id: "mock-sense-pos-new-pos-id-1-definition" }],
          sentences: [{ id: "mock-sense-pos-new-pos-id-1-sentence" }]
        }
      ]
    });
    if (!addedMeanings) throw new Error("new POS meanings must be initialized");
    const addedIds = meaningNodeIds({ sense_groups: [], pos: [addedMeanings] });
    expect(addedIds.every((id) => !existingIds.has(id))).toBe(true);
    const allIds = meaningNodeIds(saved.word.meanings);
    expect(new Set(allIds).size).toBe(allIds.length);

    const resaved = await mock.saveFormsStep(saved.word.id, {
      base_revision: saved.word.revision,
      operation_id: "preserve-unique-new-pos",
      intent: "save",
      content: saved.word.forms
    });
    expect(
      resaved.word.meanings.pos.find(
        (pos) => pos.pos_id === addedFormsPos.pos_id
      )
    ).toEqual(addedMeanings);
  });

  it("meanings complete 聚合报告词性、语法、释义、例句与关联错误", async () => {
    const draft = await createCenter(mock);
    const forms = await mock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "meaning-validation-forms",
      intent: "complete",
      content: withCompletePronunciations(draft.word.forms)
    });
    const complete = completeMockMeanings(forms.word);
    await expect(
      mock.saveMeaningsStep(forms.word.id, {
        base_revision: forms.word.revision,
        operation_id: "missing-pos-meanings",
        intent: "complete",
        content: { ...complete, pos: [complete.pos[0]!] }
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({ code: "pos_meanings_required" })
      ])
    });

    const missingAllSenseGroups = structuredClone(complete);
    missingAllSenseGroups.sense_groups = [];
    await expect(
      mock.saveMeaningsStep(forms.word.id, {
        base_revision: forms.word.revision,
        operation_id: "missing-all-sense-groups",
        intent: "complete",
        content: missingAllSenseGroups
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({
          node_id: forms.word.id,
          field: "sense_groups",
          code: "sense_group_required"
        })
      ])
    });

    const missingSenseGroup = structuredClone(complete);
    delete missingSenseGroup.pos[0]!.senses[0]!.sense_group_id;
    await expect(
      mock.saveMeaningsStep(forms.word.id, {
        base_revision: forms.word.revision,
        operation_id: "missing-sense-group",
        intent: "complete",
        content: missingSenseGroup
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({
          node_id: missingSenseGroup.pos[0]!.senses[0]!.id,
          field: "sense_group_id",
          code: "sense_group_required"
        })
      ])
    });

    const invalid: DraftMeaningsStepContent = structuredClone(complete);
    const noun = invalid.pos[0]!;
    const verb = invalid.pos[1]!;
    noun.grammar_structures = [];
    verb.grammar_structures[0]!.variants = [
      verb.grammar_structures[0]!.variants[0]!
    ];
    verb.senses = [];
    const sense = noun.senses[0]!;
    sense.sub_pos = "";
    sense.frequency = "100.001";
    sense.sense_group_id = "missing-group";
    Object.assign(sense.definitions[0]!, {
      definition_mode: "zh_sentence",
      content: richText("")
    });
    sense.definitions.push({
      id: "bad-grammar-reference",
      level: "A1",
      definition_mode: "en_definition",
      grammar_structure_id: "missing-grammar",
      content: {
        mode: "distinguish",
        source_dialect: "us",
        uk: {
          state: "ready",
          variant: {
            id: "bad-grammar-reference-uk",
            origin: "manual",
            value: richText("valid uk")
          }
        },
        us: {
          state: "ready",
          variant: {
            id: "bad-grammar-reference-us",
            origin: "manual",
            value: richText("valid us")
          }
        }
      }
    });

    const baseSentence = structuredClone(sense.sentences[0]!);
    const noZh = structuredClone(baseSentence);
    noZh.id = "sentence-no-zh";
    noZh.zh_text = richText("");
    const noEn = structuredClone(baseSentence);
    noEn.id = "sentence-no-en";
    noEn.en_text = {
      mode: "unified",
      common: {
        id: "sentence-no-en-common",
        origin: "manual",
        value: richText("")
      }
    };
    const noFocus = structuredClone(baseSentence);
    noFocus.id = "sentence-no-focus";
    noFocus.links = [
      { word_id: forms.word.id, sense_id: sense.id, role: "context" }
    ];
    const wrongWord = structuredClone(baseSentence);
    wrongWord.id = "sentence-wrong-word";
    wrongWord.links = [
      { word_id: "missing", sense_id: sense.id, role: "focus" }
    ];
    const wrongSense = structuredClone(baseSentence);
    wrongSense.id = "sentence-wrong-sense";
    wrongSense.links = [
      { word_id: forms.word.id, sense_id: "missing", role: "focus" }
    ];
    const externalV1 = structuredClone(baseSentence);
    externalV1.id = "sentence-external-v1";
    externalV1.links.push({
      word_id: "fixture-colour",
      sense_id: "fixture-colour-sense",
      role: "context"
    });
    sense.sentences = [noZh, noEn, noFocus, wrongWord, wrongSense, externalV1];
    sense.relations = [
      {
        id: "missing-target",
        relation: "synonym",
        target_word_id: "missing",
        target_sense_id: "missing",
        score: "10"
      },
      {
        id: "bad-score",
        relation: "antonym",
        target_word_id: forms.word.id,
        target_sense_id: sense.id,
        score: "100.001"
      },
      {
        id: "valid-v1-target",
        relation: "derivative",
        target_word_id: "fixture-colour",
        target_sense_id: "fixture-colour-sense",
        score: "0"
      }
    ];

    const expectedCodes = [
      "grammar_required",
      "grammar_variants_invalid",
      "sense_required",
      "sub_pos_required",
      "frequency_invalid",
      "sense_group_not_found",
      "native_definition_required",
      "definition_invalid",
      "sentence_incomplete",
      "sentence_link_not_found",
      "relation_invalid"
    ];
    await expect(
      mock.saveMeaningsStep(forms.word.id, {
        base_revision: forms.word.revision,
        operation_id: "all-meaning-errors",
        intent: "complete",
        content: invalid
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining(
        expectedCodes.map((code) => expect.objectContaining({ code }))
      )
    });
  });

  it("双语语义区间草稿可保留半成品，complete、validate 与 publish 精确报告名称错误", async () => {
    const draft = await createCenter(mock, "bilingual-sense-groups");
    const forms = await mock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "bilingual-sense-groups-forms",
      intent: "complete",
      content: withCompletePronunciations(draft.word.forms)
    });
    const content = completeMockMeanings(forms.word);
    content.sense_groups = [
      { id: "missing-zh", name_zh: "  ", name_en: "Space" },
      { id: "missing-en", name_zh: "空间", name_en: "" },
      { id: "long-zh", name_zh: "中".repeat(201), name_en: "Space" },
      { id: "long-en", name_zh: "空间", name_en: "e".repeat(201) }
    ];

    const saved = await mock.saveMeaningsStep(forms.word.id, {
      base_revision: forms.word.revision,
      operation_id: "bilingual-sense-groups-save",
      intent: "save",
      content
    });
    expect(saved.word.meanings.sense_groups).toEqual(content.sense_groups);
    expect(saved.word.completed_steps).not.toContain("meanings");

    const expectedIssues = [
      {
        node_id: "missing-zh",
        field: "name_zh",
        code: "sense_group_name_required"
      },
      {
        node_id: "missing-en",
        field: "name_en",
        code: "sense_group_name_required"
      },
      {
        node_id: "long-zh",
        field: "name_zh",
        code: "sense_group_name_too_long"
      },
      {
        node_id: "long-en",
        field: "name_en",
        code: "sense_group_name_too_long"
      }
    ];
    await expect(
      mock.saveMeaningsStep(saved.word.id, {
        base_revision: saved.word.revision,
        operation_id: "bilingual-sense-groups-complete",
        intent: "complete",
        content
      })
    ).rejects.toMatchObject({
      status: 422,
      field_issues: expect.arrayContaining(
        expectedIssues.map((issue) => expect.objectContaining(issue))
      )
    });
    await expect(
      mock.validateV2(saved.word.id, { base_revision: saved.word.revision })
    ).resolves.toMatchObject({
      valid: false,
      issues: expect.arrayContaining(
        expectedIssues.map((issue) => expect.objectContaining(issue))
      )
    });
    await expect(
      mock.publishV2(saved.word.id, {
        base_revision: saved.word.revision,
        idempotency_key: "bilingual-sense-groups-publish"
      })
    ).rejects.toMatchObject({
      status: 422,
      field_issues: expect.arrayContaining(
        expectedIssues.map((issue) => expect.objectContaining(issue))
      )
    });
  });

  it("createV2 锁定来源方言与来源词形，同时允许修正另一方言", async () => {
    const detection = await mock.detect({ language: "en", headword: "center" });
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("center fixture must match");
    }
    const corrected = await mock.createV2({
      schema_version: 2,
      idempotency_key: "correct-target-dialect",
      detection_id: detection.detection_id,
      headwords: {
        mode: "distinguish",
        source_dialect: "us",
        us: "center",
        uk: "centre-corrected"
      }
    });
    expect(corrected.word.headwords).toMatchObject({
      us: "center",
      uk: "centre-corrected"
    });
    expect(corrected.word.detection_snapshot.headwords).toMatchObject({
      us: "center",
      uk: "centre"
    });
    for (const pos of corrected.word.forms.pos) {
      expect(pos.base_form.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dialect: "uk",
            spelling: "centre-corrected",
            origin: "manual"
          }),
          expect.objectContaining({ dialect: "us", spelling: "center" })
        ])
      );
    }
    await expect(
      mock.saveFormsStep(corrected.word.id, {
        base_revision: corrected.word.revision,
        operation_id: "complete-corrected-target-forms",
        intent: "complete",
        content: withCompletePronunciations(corrected.word.forms)
      })
    ).resolves.toMatchObject({
      word: { completed_steps: ["basics", "forms"] }
    });

    const sourceMismatchMock = mockFor();
    const sourceDetection = await sourceMismatchMock.detect({
      language: "en",
      headword: "center"
    });
    if (sourceDetection.builtin_dictionary.status !== "matched") {
      throw new Error("center fixture must match");
    }
    await expect(
      sourceMismatchMock.createV2({
        schema_version: 2,
        idempotency_key: "change-source-dialect",
        detection_id: sourceDetection.detection_id,
        headwords: {
          mode: "distinguish",
          source_dialect: "us",
          us: "changed-source",
          uk: "centre"
        }
      })
    ).rejects.toMatchObject({ status: 422, code: "detection_mismatch" });
  });

  it("createV2 支持把 unified 检测切为 distinguish 并重建 Step 2 基础词形", async () => {
    const detection = await mock.detect({ language: "en", headword: "far" });
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("far fixture must match");
    }

    const created = await mock.createV2({
      schema_version: 2,
      idempotency_key: "switch-unified-to-distinguish",
      detection_id: detection.detection_id,
      headwords: {
        mode: "distinguish",
        source_dialect: "us",
        uk: "far-uk",
        us: "far"
      }
    });

    expect(created.word.headwords).toEqual({
      mode: "distinguish",
      source_dialect: "us",
      uk: "far-uk",
      us: "far"
    });
    for (const pos of created.word.forms.pos) {
      expect(pos.dialect_rules).toEqual({
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      });
      expect(
        pos.base_form.variants.map(
          ({ dialect, spelling, origin, pronunciations }) => ({
            dialect,
            spelling,
            origin,
            pronunciations
          })
        )
      ).toEqual([
        {
          dialect: "uk",
          spelling: "far-uk",
          origin: "manual",
          pronunciations: [
            expect.objectContaining({
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            })
          ]
        },
        {
          dialect: "us",
          spelling: "far",
          origin: "dictionary",
          pronunciations: [
            expect.objectContaining({
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            })
          ]
        }
      ]);
    }
  });

  it("createV2 支持把 distinguish 检测切为 unified 并重建 Step 2 基础词形", async () => {
    const detection = await mock.detect({
      language: "en",
      headword: "center"
    });
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("center fixture must match");
    }

    const created = await mock.createV2({
      schema_version: 2,
      idempotency_key: "switch-distinguish-to-unified",
      detection_id: detection.detection_id,
      headwords: { mode: "unified", common: "center" }
    });

    expect(created.word.headwords).toEqual({
      mode: "unified",
      common: "center"
    });
    for (const pos of created.word.forms.pos) {
      expect(pos.dialect_rules).toEqual({
        spelling_mode: "unified",
        phonetic_mode: "unified"
      });
      expect(
        pos.base_form.variants.map(
          ({ dialect, spelling, origin, pronunciations }) => ({
            dialect,
            spelling,
            origin,
            pronunciations
          })
        )
      ).toEqual([
        {
          dialect: "common",
          spelling: "center",
          origin: "dictionary",
          pronunciations: [
            expect.objectContaining({
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            })
          ]
        }
      ]);
    }
  });

  it("只有 complete 首次推进步骤；save 仅保留或撤销既有完成态", async () => {
    const draft = await createCenter(mock);
    const savedForms = await mock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "forms-save-before-complete",
      intent: "save",
      content: draft.word.forms
    });
    expect(savedForms.word.completed_steps).toEqual(["basics"]);
    expect(savedForms.word.max_reachable_step).toBe("forms");
    await expect(
      mock.saveMeaningsStep(savedForms.word.id, {
        base_revision: savedForms.word.revision,
        operation_id: "meanings-before-forms-complete",
        intent: "save",
        content: completeMockMeanings(savedForms.word)
      })
    ).rejects.toMatchObject({ status: 409, code: "step_not_reachable" });

    const completedForms = await mock.saveFormsStep(savedForms.word.id, {
      base_revision: savedForms.word.revision,
      operation_id: "forms-complete-after-save",
      intent: "complete",
      content: withCompletePronunciations(savedForms.word.forms)
    });
    const resavedForms = await mock.saveFormsStep(completedForms.word.id, {
      base_revision: completedForms.word.revision,
      operation_id: "forms-save-after-complete",
      intent: "save",
      content: completedForms.word.forms
    });
    expect(resavedForms.word.completed_steps).toEqual(["basics", "forms"]);
    expect(resavedForms.word.max_reachable_step).toBe("meanings");

    const savedMeanings = await mock.saveMeaningsStep(resavedForms.word.id, {
      base_revision: resavedForms.word.revision,
      operation_id: "meanings-save-before-complete",
      intent: "save",
      content: completeMockMeanings(resavedForms.word)
    });
    expect(savedMeanings.word.completed_steps).toEqual(["basics", "forms"]);
    expect(savedMeanings.word.max_reachable_step).toBe("meanings");

    const completedMeanings = await mock.saveMeaningsStep(
      savedMeanings.word.id,
      {
        base_revision: savedMeanings.word.revision,
        operation_id: "meanings-complete-after-save",
        intent: "complete",
        content: savedMeanings.word.meanings
      }
    );
    const resavedMeanings = await mock.saveMeaningsStep(
      completedMeanings.word.id,
      {
        base_revision: completedMeanings.word.revision,
        operation_id: "meanings-save-after-complete",
        intent: "save",
        content: completedMeanings.word.meanings
      }
    );
    expect(resavedMeanings.word.completed_steps).toEqual([
      "basics",
      "forms",
      "meanings"
    ]);
    expect(resavedMeanings.word.max_reachable_step).toBe("preview");

    const invalidForms = structuredClone(resavedMeanings.word.forms);
    invalidForms.pos[0]!.base_form.variants[0]!.pronunciations[0]!.dict_phonetic =
      "";
    const downgraded = await mock.saveFormsStep(resavedMeanings.word.id, {
      base_revision: resavedMeanings.word.revision,
      operation_id: "forms-save-invalid-after-complete",
      intent: "save",
      content: invalidForms
    });
    expect(downgraded.word.completed_steps).toEqual(["basics"]);
    expect(downgraded.word.max_reachable_step).toBe("forms");
  });

  it("以同一实例闭环 V2 create/save/validate/publish/list/stats/get 且保持幂等", async () => {
    expect(await mock.stats()).toMatchObject({ total: 2, today: 2, month: 2 });
    const draft = await createCenter(mock);
    const retryDraft = await mock.createV2({
      schema_version: 2,
      idempotency_key: "create-center",
      detection_id: draft.word.detection_snapshot.detection_id,
      headwords: draft.word.headwords
    });
    expect(retryDraft).toEqual(draft);
    expect((await mock.stats()).total).toBe(3);

    const formsInput = {
      base_revision: draft.word.revision,
      operation_id: "forms-op",
      intent: "complete" as const,
      content: withCompletePronunciations(draft.word.forms)
    };
    const forms = await mock.saveFormsStep(draft.word.id, formsInput);
    expect(forms.word.revision).toBe(2);
    expect(forms.word.completed_steps).toContain("forms");
    await expect(
      mock.saveFormsStep(draft.word.id, formsInput)
    ).resolves.toEqual(forms);
    await expect(
      mock.saveFormsStep(draft.word.id, {
        ...formsInput,
        intent: "save"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "operation_id_reused"
    });

    const meaningsInput = {
      base_revision: forms.word.revision,
      operation_id: "meanings-op",
      intent: "complete" as const,
      content: completeMockMeanings(forms.word)
    };
    const meanings = await mock.saveMeaningsStep(forms.word.id, meaningsInput);
    await expect(
      mock.saveMeaningsStep(forms.word.id, {
        ...meaningsInput,
        intent: "save"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "operation_id_reused"
    });
    await expect(
      mock.validateV2(meanings.word.id, {
        base_revision: meanings.word.revision
      })
    ).resolves.toEqual({
      validated_revision: meanings.word.revision,
      valid: true,
      issues: []
    });

    const publishInput = {
      base_revision: meanings.word.revision,
      idempotency_key: "publish-center"
    };
    const published = await mock.publishV2(meanings.word.id, publishInput);
    expect(published.word.status).toBe("published");
    await expect(
      mock.publishV2(meanings.word.id, publishInput)
    ).resolves.toEqual(published);
    expect((await mock.stats()).total).toBe(3);
    await expect(mock.get(published.word.id)).resolves.toEqual(published);
    const page = await mock.list({ q: "center" });
    expect(page.words).toEqual([
      expect.objectContaining({
        id: published.word.id,
        schema_version: 2,
        status: "published"
      })
    ]);
  });

  it("list 覆盖默认值、全部筛选、V1/V2 映射与分页边界", async () => {
    await createCenter(mock, "list-center");
    await mock.create({ headword: "search phrase", kind: "phrase" });

    const all = await mock.list();
    expect(all.words).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schema_version: 1, headword: "colour" }),
        expect.objectContaining({ schema_version: 2, headword: "center" })
      ])
    );
    expect(all.page).toMatchObject({ page: 1, page_size: 20, total: 4 });

    await expect(mock.list({ q: "mock admin" })).resolves.toMatchObject({
      words: expect.arrayContaining([
        expect.objectContaining({ created_by_name: "Mock Admin" })
      ])
    });
    await expect(mock.list({ q: "absent" })).resolves.toMatchObject({
      words: []
    });
    await expect(mock.list({ gloss: "颜色" })).resolves.toMatchObject({
      page: { total: 2 }
    });
    await expect(mock.list({ gloss: "absent" })).resolves.toMatchObject({
      words: []
    });
    await expect(mock.list({ kind: "phrase" })).resolves.toMatchObject({
      page: { total: 1 }
    });
    await expect(mock.list({ kind: "word" })).resolves.toMatchObject({
      page: { total: 3 }
    });
    await expect(mock.list({ pos: "noun" })).resolves.toMatchObject({
      page: { total: 3 }
    });
    await expect(mock.list({ pos: "adjective" })).resolves.toMatchObject({
      words: []
    });
    await expect(mock.list({ level: "A1" })).resolves.toMatchObject({
      page: { total: 3 }
    });
    await expect(mock.list({ level: "C2" })).resolves.toMatchObject({
      words: []
    });
    await expect(mock.list({ status: "draft" })).resolves.toMatchObject({
      page: { total: 2 }
    });
    await expect(mock.list({ status: "published" })).resolves.toMatchObject({
      page: { total: 2 }
    });
    await expect(
      mock.list({ created_from: "2027-01-01T00:00:00.000Z" })
    ).resolves.toMatchObject({ words: [] });
    await expect(
      mock.list({ created_from: "2025-01-01T00:00:00.000Z" })
    ).resolves.toMatchObject({ page: { total: 4 } });
    await expect(
      mock.list({ created_to: "2026-08-02T03:00:00.000Z" })
    ).resolves.toMatchObject({ words: [] });
    await expect(
      mock.list({ created_to: "2027-01-01T00:00:00.000Z" })
    ).resolves.toMatchObject({ page: { total: 4 } });
    await expect(mock.list({ page: -1, page_size: 0 })).resolves.toMatchObject({
      page: { page: 1, page_size: 1, total: 4 }
    });
    await expect(mock.list({ page: 2, page_size: 200 })).resolves.toMatchObject(
      {
        words: [],
        page: { page: 2, page_size: 100, total: 4 }
      }
    );
  });

  it("报告 revision 冲突、字段校验问题和过期 detection", async () => {
    const draft = await createCenter(mock);
    await expect(
      mock.saveFormsStep(draft.word.id, {
        base_revision: 999,
        operation_id: "stale-op",
        intent: "save",
        content: draft.word.forms
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "revision_conflict",
      meta: expect.objectContaining({ current_revision: 1 })
    });

    await expect(
      mock.saveFormsStep(draft.word.id, {
        base_revision: 1,
        operation_id: "invalid-forms",
        intent: "complete",
        content: { pos: [] }
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "validation_failed",
      field_issues: expect.arrayContaining([
        expect.objectContaining({ code: "pos_required", node_id: "forms" })
      ])
    });

    const expired = await mock.detect({ language: "en", headword: "expired" });
    if (expired.builtin_dictionary.status !== "matched")
      throw new Error("expired fixture");
    await expect(
      mock.createV2({
        schema_version: 2,
        idempotency_key: "expired-create",
        detection_id: expired.detection_id,
        headwords: expired.builtin_dictionary.headwords
      })
    ).rejects.toMatchObject({ status: 410, code: "detection_expired" });
  });

  it("forms 删除已有下游内容时要求绑定 revision/content 的确认 token", async () => {
    const draft = await createCenter(mock);
    const withoutVerb: DraftFormsStepContent = {
      pos: [draft.word.forms.pos[0]!]
    };
    await expect(
      mock.previewFormsImpact(draft.word.id, {
        base_revision: 1,
        content: withoutVerb
      })
    ).resolves.toEqual({
      base_revision: 1,
      requires_confirmation: false,
      affected: []
    });

    const populatedMock = mockFor();
    const populated = await completeCenter(populatedMock);
    const reduced: DraftFormsStepContent = {
      pos: [populated.forms.pos[0]!]
    };
    const impact = await populatedMock.previewFormsImpact(populated.id, {
      base_revision: populated.revision,
      content: reduced
    });
    expect(impact.requires_confirmation).toBe(true);
    expect(impact.affected).toEqual(
      expect.arrayContaining([expect.objectContaining({ node_type: "sense" })])
    );
    await expect(
      populatedMock.saveFormsStep(populated.id, {
        base_revision: populated.revision,
        operation_id: "delete-pos-no-confirm",
        intent: "complete",
        content: reduced
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "downstream_confirmation_required"
    });
    const saved = await populatedMock.saveFormsStep(populated.id, {
      base_revision: populated.revision,
      operation_id: "delete-pos-confirmed",
      intent: "complete",
      confirmed_impact_token: impact.confirmation_token,
      content: reduced
    });
    expect(saved.word.meanings.pos).toHaveLength(1);
  });

  it("impact token 拒绝未知、内容变化和 revision 过期", async () => {
    const ready = await completeCenter(mock);
    const reduced: DraftFormsStepContent = { pos: [ready.forms.pos[0]!] };
    const impact = await mock.previewFormsImpact(ready.id, {
      base_revision: ready.revision,
      content: reduced
    });
    expect(impact.confirmation_token).toEqual(expect.any(String));

    await expect(
      mock.saveFormsStep(ready.id, {
        base_revision: ready.revision,
        operation_id: "unknown-impact-token",
        intent: "complete",
        confirmed_impact_token: "missing-token",
        content: reduced
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "downstream_confirmation_required"
    });
    await expect(
      mock.saveFormsStep(ready.id, {
        base_revision: ready.revision,
        operation_id: "changed-impact-content",
        intent: "complete",
        confirmed_impact_token: impact.confirmation_token,
        content: { pos: [ready.forms.pos[1]!] }
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "downstream_confirmation_required"
    });

    const bumped = await mock.saveMeaningsStep(ready.id, {
      base_revision: ready.revision,
      operation_id: "bump-after-impact-preview",
      intent: "save",
      content: ready.meanings
    });
    await expect(
      mock.saveFormsStep(ready.id, {
        base_revision: bumped.word.revision,
        operation_id: "stale-impact-token",
        intent: "complete",
        confirmed_impact_token: impact.confirmation_token,
        content: reduced
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "downstream_confirmation_required"
    });
  });

  it("publish response 丢失后用同一 key 重试只发布和计数一次", async () => {
    const ready = await completeCenter(mock);
    const input = {
      base_revision: ready.revision,
      idempotency_key: "response-lost-publish"
    };
    await expect(mock.publishV2(ready.id, input)).rejects.toMatchObject({
      status: 500,
      code: "response_lost"
    });
    await expect(mock.publishV2(ready.id, input)).resolves.toMatchObject({
      word: { id: ready.id, status: "published" }
    });
    expect((await mock.stats()).total).toBe(3);
  });

  it("支持 V1 CRUD、批量删除和关联词检索", async () => {
    const created = await mock.create({
      headword: "legacy demo",
      kind: "phrase"
    });
    const fixture = createSeedLegacyWords(NOW.toISOString())[0]!;
    const saved = await mock.saveContent(created.word.id, {
      base_updated_at: created.word.updated_at,
      frequency: "20",
      dialect_mode: fixture.dialect_mode,
      dialects: fixture.dialects,
      sense_groups: fixture.sense_groups,
      pos: fixture.pos
    });
    await expect(mock.publish(saved.word.id)).resolves.toMatchObject({
      word: { status: "published" }
    });
    await expect(mock.relatedSearch("colo")).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          headword: "colour",
          senses: expect.any(Array)
        })
      ])
    });
    await expect(
      mock.batchDelete([saved.word.id, saved.word.id, "missing"])
    ).resolves.toEqual({ deleted: 1 });
    await expect(mock.get(saved.word.id)).rejects.toMatchObject({
      status: 404
    });
  });

  it("覆盖 V1/V2 发布拒绝、幂等绑定、删除与关联检索边界", async () => {
    const draft = await createCenter(mock, "publish-bound-center");
    const fixture = createSeedLegacyWords(NOW.toISOString())[0]!;
    const legacyInput = {
      base_updated_at: fixture.updated_at,
      frequency: fixture.frequency ?? "20",
      dialect_mode: fixture.dialect_mode,
      dialects: fixture.dialects,
      sense_groups: fixture.sense_groups,
      pos: fixture.pos
    };
    await expect(
      mock.saveContent(draft.word.id, legacyInput)
    ).rejects.toMatchObject({ status: 409, code: "schema_version_mismatch" });
    await expect(
      mock.validateV2("fixture-colour", { base_revision: 1 })
    ).rejects.toMatchObject({ status: 409, code: "schema_version_mismatch" });
    await expect(mock.publish(draft.word.id)).rejects.toMatchObject({
      status: 409,
      code: "schema_version_mismatch"
    });
    await expect(
      mock.publishV2(draft.word.id, {
        base_revision: draft.word.revision,
        idempotency_key: "publish-incomplete"
      })
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });

    const incomplete = await mock.create({ headword: "incomplete legacy" });
    await expect(mock.publish(incomplete.word.id)).rejects.toMatchObject({
      status: 422,
      code: "word_incomplete",
      details: expect.arrayContaining(["词频不能为空", "至少需要一个基本词性"])
    });
    await expect(
      mock.saveContent(incomplete.word.id, {
        ...legacyInput,
        base_updated_at: "stale"
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    const withoutSenses = structuredClone(fixture.pos);
    withoutSenses[0]!.senses = [];
    const saved = await mock.saveContent(incomplete.word.id, {
      ...legacyInput,
      base_updated_at: incomplete.word.updated_at,
      pos: withoutSenses
    });
    await expect(mock.publish(saved.word.id)).rejects.toMatchObject({
      status: 422,
      code: "word_incomplete",
      details: expect.arrayContaining(["每个词性至少需要一个词义"])
    });
    await expect(mock.publish("fixture-colour")).resolves.toMatchObject({
      word: { status: "published" }
    });

    const centerReady = await completeDraft(
      mock,
      draft,
      "publish-bound-center"
    );
    const centerPublished = await mock.publishV2(centerReady.id, {
      base_revision: centerReady.revision,
      idempotency_key: "bound-publish-key"
    });
    await expect(
      mock.publishV2(centerReady.id, {
        base_revision: centerPublished.word.revision,
        idempotency_key: "bound-publish-key"
      })
    ).resolves.toEqual(centerPublished);
    const editedPublished = await mock.saveFormsStep(centerReady.id, {
      base_revision: centerPublished.word.revision,
      operation_id: "published-word-save",
      intent: "save",
      content: centerReady.forms
    });
    expect(editedPublished.word).toMatchObject({
      status: "published",
      published_revision: centerPublished.word.revision,
      has_unpublished_changes: true,
      revision: centerPublished.word.revision + 1
    });
    const republished = await mock.publishV2(centerReady.id, {
      base_revision: editedPublished.word.revision,
      idempotency_key: "republish-after-edit"
    });
    await expect(
      mock.publishV2(centerReady.id, {
        base_revision: centerPublished.word.revision,
        idempotency_key: "bound-publish-key"
      })
    ).resolves.toEqual(centerPublished);
    const publicationSense = republished.word.meanings.pos[0]!.senses[0]!;
    const editedMeanings = structuredClone(republished.word.meanings);
    editedMeanings.pos[0]!.senses[0]!.definitions.find(
      (definition) =>
        definition.definition_mode === "zh_definition" ||
        definition.definition_mode === "zh_sentence"
    )!.content = richText("仅存在于未发布草稿");
    editedMeanings.pos[0]!.senses.push({
      ...structuredClone(publicationSense),
      id: "unpublished-sense"
    });
    const meaningsEdited = await mock.saveMeaningsStep(republished.word.id, {
      base_revision: republished.word.revision,
      operation_id: "published-word-meanings-save",
      intent: "save",
      content: editedMeanings
    });
    await expect(
      mock.publishV2(centerReady.id, {
        base_revision: centerPublished.word.revision,
        idempotency_key: "bound-publish-key"
      })
    ).resolves.toEqual(centerPublished);
    await expect(mock.relatedSearch("cent")).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          word_id: centerReady.id,
          senses: expect.arrayContaining([
            expect.objectContaining({
              sense_id: publicationSense.id,
              gloss: expect.not.stringContaining("未发布草稿")
            })
          ])
        })
      ]
    });
    expect((await mock.relatedSearch("cent")).results[0]!.senses).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sense_id: "unpublished-sense" })
      ])
    );
    const farDraft = await createDetectedWord(mock, "far", "publish-bound-far");
    const farReady = await completeDraft(mock, farDraft, "publish-bound-far");
    await expect(
      mock.publishV2(farReady.id, {
        base_revision: farReady.revision,
        idempotency_key: "bound-publish-key"
      })
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });

    await expect(mock.relatedSearch("   ")).resolves.toEqual({ results: [] });
    await expect(
      mock.relatedSearch("cent", { kind: "phrase" })
    ).resolves.toEqual({ results: [] });
    await expect(
      mock.relatedSearch("cent", { kind: "word", limit: 0 })
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({ word_id: centerReady.id, kind: "word" })
      ]
    });
    await expect(
      mock.relatedSearch("colo", { limit: 200 })
    ).resolves.toMatchObject({ results: expect.any(Array) });

    await expect(mock.remove("fixture-color")).resolves.toBeUndefined();
    await expect(mock.remove("fixture-color")).rejects.toMatchObject({
      status: 404,
      code: "word_not_found"
    });
    await expect(mock.batchDelete(["missing"])).resolves.toEqual({
      deleted: 0
    });
    await expect(
      mock.batchDelete(Array.from({ length: 101 }, (_, index) => `id-${index}`))
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large" });

    const archivedCenter = await mock.archive(
      centerPublished.word.id,
      "archive-before-validate",
      {
        base_revision: meaningsEdited.word.revision,
        base_lifecycle_revision: meaningsEdited.word.lifecycle_revision
      }
    );
    await expect(
      mock.validateV2(archivedCenter.word.id, {
        base_revision: archivedCenter.word.revision
      })
    ).rejects.toMatchObject({ status: 409, code: "entry_archived" });
  });

  it("sessionStorage 可硬刷新恢复，并按权限 fail closed", async () => {
    const storage = memoryStorage();
    const first = mockFor(() => profile(), storage);
    const created = await first.create({ headword: "persisted draft" });
    const refreshed = mockFor(() => profile(), storage);
    await expect(refreshed.get(created.word.id)).resolves.toEqual(created);

    first.clearSession();
    const afterLogout = mockFor(() => profile(), storage);
    await expect(afterLogout.get(created.word.id)).rejects.toMatchObject({
      status: 404
    });

    const noSession = mockFor(() => undefined);
    await expect(noSession.stats()).rejects.toMatchObject({ status: 401 });
    const forbidden = mockFor(() => profile({ permissions: [] }));
    await expect(forbidden.stats()).rejects.toMatchObject({ status: 403 });
  });
});

describe("part-of-speech settings mock", () => {
  const superAdmin = () =>
    profile({
      role: "super_admin",
      permissions: ["words.access"]
    });

  it("提供 11/19 默认目录、搜索分页、动态引用计数与权限保护", async () => {
    const settingsMock = mockFor(superAdmin);
    const catalog = await settingsMock.partOfSpeechSettings.catalog();
    expect(catalog.items).toHaveLength(11);
    expect(
      catalog.items.reduce((total, item) => total + item.sub_parts.length, 0)
    ).toBe(19);
    expect(catalog.catalog_version).toBeGreaterThan(0);

    const nounPage = await settingsMock.partOfSpeechSettings.list({
      q: " NOUN ",
      page: 0,
      page_size: 200
    });
    expect(nounPage.pagination).toMatchObject({
      page: 1,
      page_size: 100,
      total: 2,
      total_pages: 1
    });
    expect(nounPage.items.find((item) => item.code === "noun")).toMatchObject({
      code: "noun",
      sub_part_count: 5
    });
    expect(
      nounPage.items.find((item) => item.code === "noun")!.usage_count
    ).toBeGreaterThan(0);

    const ordinaryAdmin = mockFor();
    await expect(
      ordinaryAdmin.partOfSpeechSettings.list()
    ).rejects.toMatchObject({ status: 403, code: "super_admin_required" });
    await expect(
      ordinaryAdmin.partOfSpeechSettings.catalog()
    ).resolves.toMatchObject({ items: expect.any(Array) });
  });

  it("基本词性支持新增、修改、唯一性、revision 与未引用级联删除", async () => {
    const settingsMock = mockFor(superAdmin);
    const created = await settingsMock.partOfSpeechSettings.create({
      code: " particle ",
      name_zh: " 语气词 ",
      name_en: " Particle ",
      abbreviation: " part. ",
      sort_order: 115
    });
    expect(created).toMatchObject({
      code: "particle",
      name_zh: "语气词",
      name_en: "Particle",
      abbreviation: "part.",
      revision: 1
    });

    await expect(
      settingsMock.partOfSpeechSettings.create({
        code: "particle",
        name_zh: "另一个名称",
        name_en: "Another particle",
        abbreviation: "part2.",
        sort_order: 116
      })
    ).rejects.toMatchObject({ status: 409, code: "part_of_speech_conflict" });
    await expect(
      settingsMock.partOfSpeechSettings.create({
        code: "INVALID",
        name_zh: "无效",
        name_en: "Invalid",
        abbreviation: "inv.",
        sort_order: 1
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_part_of_speech"
    });

    const updated = await settingsMock.partOfSpeechSettings.update(created.id, {
      base_revision: created.revision,
      name_zh: "语气助词",
      name_en: "Discourse particle",
      abbreviation: "ptcl.",
      sort_order: 12
    });
    expect(updated).toMatchObject({
      code: "particle",
      name_zh: "语气助词",
      revision: 2
    });
    await expect(
      settingsMock.partOfSpeechSettings.update(created.id, {
        base_revision: 1,
        name_zh: "旧提交",
        name_en: "Stale",
        abbreviation: "st.",
        sort_order: 1
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });

    await settingsMock.partOfSpeechSettings.createSubPart(created.id, {
      code: "PARTICLE-GENERAL",
      name_zh: "一般语气词",
      name_en: "General particle",
      sort_order: 10
    });
    await settingsMock.partOfSpeechSettings.remove(created.id, {
      base_revision: updated.revision
    });
    expect(
      (await settingsMock.partOfSpeechSettings.catalog()).items.some(
        (item) => item.code === "particle"
      )
    ).toBe(false);
    await expect(
      settingsMock.partOfSpeechSettings.update("missing", {
        base_revision: 1,
        name_zh: "缺失",
        name_en: "Missing",
        abbreviation: "m.",
        sort_order: 1
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "part_of_speech_not_found"
    });
    await expect(
      settingsMock.partOfSpeechSettings.remove("missing", { base_revision: 1 })
    ).rejects.toMatchObject({
      status: 404,
      code: "part_of_speech_not_found"
    });
  });

  it("细分词性按所属基本词性 CRUD，并保护重复、revision 与引用删除", async () => {
    const settingsMock = mockFor(superAdmin);
    const catalog = await settingsMock.partOfSpeechSettings.catalog();
    const noun = catalog.items.find((item) => item.code === "noun")!;
    const created = await settingsMock.partOfSpeechSettings.createSubPart(
      noun.id,
      {
        code: "N-COLLECTIVE",
        name_zh: "集合名词",
        name_en: "Collective noun",
        sort_order: 65
      }
    );
    expect(created).toMatchObject({
      part_of_speech_id: noun.id,
      revision: 1
    });
    expect(
      (
        await settingsMock.partOfSpeechSettings.listSubParts(noun.id)
      ).items.some((item) => item.code === "N-COLLECTIVE")
    ).toBe(true);

    const updated = await settingsMock.partOfSpeechSettings.updateSubPart(
      noun.id,
      created.id,
      {
        base_revision: 1,
        name_zh: "集合类名词",
        name_en: "Collective noun",
        sort_order: 15
      }
    );
    expect(updated).toMatchObject({ name_zh: "集合类名词", revision: 2 });
    await expect(
      settingsMock.partOfSpeechSettings.updateSubPart(noun.id, created.id, {
        base_revision: 1,
        name_zh: "旧提交",
        name_en: "Stale collective",
        sort_order: 1
      })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    await expect(
      settingsMock.partOfSpeechSettings.createSubPart(noun.id, {
        code: "V-T",
        name_zh: "重复编码",
        name_en: "Duplicate code",
        sort_order: 1
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "sub_part_of_speech_conflict"
    });
    await expect(
      settingsMock.partOfSpeechSettings.createSubPart(noun.id, {
        code: "lowercase",
        name_zh: "无效",
        name_en: "Invalid",
        sort_order: 1
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_part_of_speech"
    });

    await settingsMock.partOfSpeechSettings.removeSubPart(noun.id, created.id, {
      base_revision: updated.revision
    });
    const referenced = (
      await settingsMock.partOfSpeechSettings.listSubParts(noun.id)
    ).items.find((item) => item.usage_count > 0)!;
    await expect(
      settingsMock.partOfSpeechSettings.removeSubPart(noun.id, referenced.id, {
        base_revision: referenced.revision
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "sub_part_of_speech_in_use",
      meta: { usage_count: expect.any(Number) }
    });
    const nounConfig = (
      await settingsMock.partOfSpeechSettings.list({ q: "noun" })
    ).items.find((item) => item.id === noun.id)!;
    await expect(
      settingsMock.partOfSpeechSettings.remove(noun.id, {
        base_revision: nounConfig.revision
      })
    ).rejects.toMatchObject({ status: 409, code: "part_of_speech_in_use" });
    await expect(
      settingsMock.partOfSpeechSettings.listSubParts("missing")
    ).rejects.toMatchObject({
      status: 404,
      code: "part_of_speech_not_found"
    });
    await expect(
      settingsMock.partOfSpeechSettings.removeSubPart(noun.id, "missing", {
        base_revision: 1
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "sub_part_of_speech_not_found"
    });
  });

  it("DELETE 在引用检查前校验 revision，冲突时不删除配置", async () => {
    const settingsMock = mockFor(superAdmin);
    const created = await settingsMock.partOfSpeechSettings.create({
      code: "particle",
      name_zh: "小品词",
      name_en: "Particle",
      abbreviation: "part.",
      sort_order: 120
    });
    const subPart = await settingsMock.partOfSpeechSettings.createSubPart(
      created.id,
      {
        code: "PARTICLE-GENERAL",
        name_zh: "一般小品词",
        name_en: "General particle",
        sort_order: 10
      }
    );

    await expect(
      settingsMock.partOfSpeechSettings.remove(created.id, {
        base_revision: created.revision + 1
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "revision_conflict",
      meta: { current_revision: created.revision }
    });
    await expect(
      settingsMock.partOfSpeechSettings.removeSubPart(created.id, subPart.id, {
        base_revision: subPart.revision + 1
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "revision_conflict",
      meta: { current_revision: subPart.revision }
    });
    await expect(
      settingsMock.partOfSpeechSettings.remove(created.id, {
        base_revision: 0
      })
    ).rejects.toMatchObject({ status: 400, code: "invalid_query" });
    await expect(
      settingsMock.partOfSpeechSettings.removeSubPart(created.id, subPart.id, {
        base_revision: 0
      })
    ).rejects.toMatchObject({ status: 400, code: "invalid_query" });
    await expect(
      settingsMock.partOfSpeechSettings.listSubParts(created.id)
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: subPart.id })]
    });
  });

  it("词条 create/save 对未知基本词性和错误所属细分词性 fail closed", async () => {
    const settingsMock = mockFor(superAdmin);
    const draft = await createCenter(settingsMock, "config-validation");
    const unknownForms = structuredClone(draft.word.forms);
    unknownForms.pos[0]!.pos = "unknown-pos";
    await expect(
      settingsMock.saveFormsStep(draft.word.id, {
        base_revision: draft.word.revision,
        operation_id: "unknown-pos-save",
        intent: "save",
        content: unknownForms
      })
    ).rejects.toMatchObject({ status: 422, code: "unknown_part_of_speech" });

    const forms = await settingsMock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "valid-forms-save",
      intent: "complete",
      content: withCompletePronunciations(draft.word.forms)
    });
    const meanings = completeMockMeanings(forms.word);
    meanings.pos[0]!.senses[0]!.sub_pos = "V-T";
    await expect(
      settingsMock.saveMeaningsStep(forms.word.id, {
        base_revision: forms.word.revision,
        operation_id: "wrong-sub-pos-save",
        intent: "save",
        content: meanings
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "invalid_sub_part_of_speech"
    });

    const storage = memoryStorage();
    const first = mockFor(superAdmin, storage);
    const detection = await first.detect({ language: "en", headword: "far" });
    const state = readPersistedState(storage);
    const persistedDetection = state.detections[detection.detection_id]!;
    if (persistedDetection.builtin_dictionary.status !== "matched") {
      throw new Error("far fixture must match");
    }
    persistedDetection.builtin_dictionary.suggested_forms.pos[0]!.pos =
      "unknown-pos";
    writePersistedState(storage, state);
    const refreshed = mockFor(superAdmin, storage);
    await expect(
      refreshed.createV2({
        schema_version: 2,
        idempotency_key: "unknown-detection-pos",
        detection_id: detection.detection_id,
        headwords:
          detection.builtin_dictionary.status === "matched"
            ? detection.builtin_dictionary.headwords
            : { mode: "unified", common: "far" }
      })
    ).rejects.toMatchObject({ status: 422, code: "unknown_part_of_speech" });
  });

  it("外部 catalog 模式不使用内部 seed 否决真实目录编码", async () => {
    const settingsMock = mockFor(superAdmin, memoryStorage(), "external");
    const draft = await createCenter(settingsMock, "external-catalog");
    const externalForms = structuredClone(draft.word.forms);
    externalForms.pos[0]!.pos = "real_custom_pos";

    const forms = await settingsMock.saveFormsStep(draft.word.id, {
      base_revision: draft.word.revision,
      operation_id: "external-pos-save",
      intent: "complete",
      content: withCompletePronunciations(externalForms)
    });
    expect(forms.word.forms.pos[0]!.pos).toBe("real_custom_pos");

    const meanings = structuredClone(forms.word.meanings);
    meanings.pos[0]!.senses[0]!.sub_pos = "REAL-CUSTOM-SUB";
    const saved = await settingsMock.saveMeaningsStep(forms.word.id, {
      base_revision: forms.word.revision,
      operation_id: "external-sub-pos-save",
      intent: "save",
      content: meanings
    });
    expect(saved.word.meanings.pos[0]!.senses[0]!.sub_pos).toBe(
      "REAL-CUSTOM-SUB"
    );
  });
});
