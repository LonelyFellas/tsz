import type { Page, Route } from "@playwright/test";
import { validateRuntimeSchema, type RuntimeSchemaRoot } from "@tsz/api-client";
import type {
  AdminWordListItemAny,
  AdminWordPublicationAny,
  AdminWordV2,
  AdminWordV3,
  DetectLexiconSurfaceResponseV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  PartOfSpeechCatalogResponse,
  V3DraftValidationIssue
} from "@tsz/types";

export const ADMIN_V3_ENTRIES_PATH = "/lexicon/entries";
export const ADMIN_V3_DETECTIONS_PATH = "/lexicon/detections";
export const ADMIN_V3_NEW_WORD_ID = "01990000-0000-7000-8000-000000000001";
export const ADMIN_V3_MIXED_WORD_ID = "01990000-0000-7000-8000-000000000002";
export const ADMIN_V3_CANARY_WORD_ID = "01990000-0000-7000-8000-000000000003";
export const ADMIN_V2_LEGACY_WORD_ID = "01990000-0000-7000-8000-000000000004";
export const ADMIN_V3_SECOND_POS_ID = "01990000-0000-7000-8000-000000000012";
export const ADMIN_V3_ERROR_PRONUNCIATION_ID =
  "01990000-0000-7000-8000-000000000042";

const NOW = "2026-08-25T02:00:00.000Z";
const ACTOR_ID = "01990000-0000-7000-8000-000000000099";

const nodeId = (value: number) =>
  `01990000-0000-7000-8000-${String(value).padStart(12, "0")}`;

const ADMIN_PROFILE = {
  id: ACTOR_ID,
  phone: "13800138000",
  display_name: "V3 Mock E2E Admin",
  role: "admin",
  permissions: ["words.access"],
  preferences: { dialect: "uk" }
};

const PART_OF_SPEECH_CATALOG = {
  catalog_version: 1,
  items: [
    {
      id: nodeId(100),
      code: "noun",
      name_zh: "名词",
      name_en: "NOUN",
      abbreviation: "n.",
      sort_order: 10,
      allowed_form_types: ["plural"],
      default_form_types: ["plural"],
      sub_parts: [
        {
          id: nodeId(101),
          code: "N-COUNT",
          name_zh: "可数名词",
          name_en: "Countable noun",
          sort_order: 10
        }
      ]
    },
    {
      id: nodeId(102),
      code: "verb",
      name_zh: "动词",
      name_en: "VERB",
      abbreviation: "v.",
      sort_order: 20,
      allowed_form_types: [
        "third_person_singular",
        "present_participle",
        "past_tense",
        "past_participle"
      ],
      default_form_types: [
        "third_person_singular",
        "present_participle",
        "past_tense",
        "past_participle"
      ],
      sub_parts: [
        {
          id: nodeId(103),
          code: "V-I",
          name_zh: "不及物动词",
          name_en: "Intransitive verb",
          sort_order: 10
        }
      ]
    }
  ]
} satisfies PartOfSpeechCatalogResponse;

function richText(text: string) {
  return { version: 2 as const, text, annotations: [] };
}

function pronunciation(
  id: string,
  dict_phonetic: string,
  style: "normal" | "strong" | "weak" = "normal"
) {
  return {
    id,
    dict_phonetic,
    actual_pron: dict_phonetic,
    style
  };
}

const FORMS: DraftFormsStepContentV3 = {
  pos: [
    {
      pos_id: nodeId(11),
      pos: "noun",
      forms: [
        {
          id: nodeId(21),
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: nodeId(31),
              dialect: "common",
              spelling: "orbit",
              origin: "dictionary",
              pronunciations: [
                pronunciation(nodeId(41), "ˈɔːbɪt"),
                pronunciation(nodeId(43), "ˈɔrbɪt", "weak")
              ]
            }
          }
        },
        {
          id: nodeId(22),
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: {
              id: nodeId(32),
              dialect: "uk",
              spelling: "orbital centre",
              origin: "manual",
              pronunciations: [pronunciation(nodeId(44), "ˈɔːbɪtl ˈsentə")]
            },
            us: {
              id: nodeId(33),
              dialect: "us",
              spelling: "orbital center",
              origin: "manual",
              pronunciations: [pronunciation(nodeId(45), "ˈɔrbɪtl ˈsentər")]
            }
          }
        },
        {
          id: nodeId(23),
          form_type: "plural",
          regional_variants: {
            mode: "common",
            common: {
              id: nodeId(34),
              dialect: "common",
              spelling: "orbits",
              origin: "dictionary",
              pronunciations: [pronunciation(nodeId(46), "ˈɔːbɪts")]
            }
          }
        }
      ],
      form_groups: [
        {
          id: nodeId(51),
          is_regular: true,
          members: [
            { id: nodeId(61), form_id: nodeId(21) },
            { id: nodeId(62), form_id: nodeId(22) }
          ]
        },
        {
          id: nodeId(52),
          is_regular: false,
          members: [
            { id: nodeId(63), form_id: nodeId(21) },
            { id: nodeId(64), form_id: nodeId(23) }
          ]
        }
      ]
    },
    {
      pos_id: ADMIN_V3_SECOND_POS_ID,
      pos: "verb",
      forms: [
        {
          id: nodeId(24),
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: nodeId(35),
              dialect: "common",
              spelling: "orbit",
              origin: "dictionary",
              pronunciations: [
                pronunciation(ADMIN_V3_ERROR_PRONUNCIATION_ID, "ˈɔːbɪt")
              ]
            }
          }
        }
      ],
      form_groups: [
        {
          id: nodeId(53),
          is_regular: true,
          members: [{ id: nodeId(65), form_id: nodeId(24) }]
        }
      ]
    }
  ]
};

const MEANINGS: DraftMeaningsStepContentV3 = {
  sense_groups: [
    { id: nodeId(71), name_zh: "轨道运动", name_en: "Orbital motion" }
  ],
  pos: FORMS.pos.map((pos, index) => ({
    pos_id: pos.pos_id,
    grammar_structures: [
      {
        id: nodeId(72 + index * 10),
        variants: [
          {
            id: nodeId(73 + index * 10),
            dialect: "common",
            content: richText(index === 0 ? "in orbit" : "orbit around")
          }
        ]
      }
    ],
    senses: [
      {
        id: nodeId(74 + index * 10),
        sub_pos: index === 0 ? "N-COUNT" : "V-I",
        level: "B1",
        sense_group_id: nodeId(71),
        frequency: "42.00",
        depends_on_context: false,
        definitions: [
          {
            id: nodeId(75 + index * 10),
            level: "B1",
            definition_mode: "zh_definition",
            content_id: nodeId(76 + index * 10),
            content: richText(index === 0 ? "运行轨道" : "沿轨道运行")
          }
        ],
        sentences: [
          {
            id: nodeId(77 + index * 10),
            level: "B1",
            en_text: {
              mode: "unified",
              common: {
                id: nodeId(78 + index * 10),
                origin: "manual",
                value: richText(
                  index === 0
                    ? "The satellite entered orbit."
                    : "The satellite orbits Earth."
                )
              }
            },
            zh_text_id: nodeId(79 + index * 10),
            zh_text: richText(
              index === 0 ? "卫星进入了轨道。" : "卫星环绕地球运行。"
            ),
            links: [],
            associations: [],
            associations_state: "resolved"
          }
        ],
        relations: []
      }
    ]
  }))
};

function v3Word(
  id: string,
  label: string,
  capability:
    | { mode: "shadow_only"; blocked_code: "phase2_consumers_not_ready" }
    | { mode: "migration_canary"; whitelisted: true },
  compatibility?: AdminWordV3["compatibility"]
): AdminWordV3 {
  return {
    schema_version: 3,
    id,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: false,
    presentation: {
      label,
      matched_surfaces: [label, "orbit"],
      strategy_version: "phase1_deterministic_v1"
    },
    capabilities: {
      publication: capability,
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    ...(compatibility ? { compatibility } : {}),
    forms: structuredClone(FORMS),
    meanings: structuredClone(MEANINGS),
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: ACTOR_ID,
    created_at: NOW,
    updated_at: NOW
  };
}

const LEGACY_WORD: AdminWordV2 = {
  schema_version: 2,
  id: ADMIN_V2_LEGACY_WORD_ID,
  language: "en",
  kind: "word",
  status: "published",
  revision: 7,
  lifecycle_revision: 2,
  headwords: { mode: "unified", common: "legacy-orbit" },
  detection_snapshot: {
    detection_id: nodeId(205),
    request: { language: "en", headword: "legacy-orbit" },
    normalized_headword: "legacy-orbit",
    entry_kind: "word",
    matched_dialect: "common",
    builtin_dictionary_status: "matched",
    smart_dictionary_status: "clear",
    headwords: { mode: "unified", common: "legacy-orbit" },
    suggested_pos: ["noun"],
    detected_at: NOW
  },
  forms: {
    pos: [
      {
        pos_id: nodeId(201),
        pos: "noun",
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        },
        base_form: {
          id: nodeId(202),
          form_type: "base",
          variants: [
            {
              id: nodeId(203),
              dialect: "common",
              spelling: "legacy-orbit",
              origin: "manual",
              pronunciations: [
                {
                  id: nodeId(204),
                  dict_phonetic: "ˈɔːbɪt",
                  actual_pron: "ˈɔːbɪt",
                  style: "normal"
                }
              ]
            }
          ]
        },
        form_groups: []
      }
    ]
  },
  meanings: {
    sense_groups: [
      {
        id: nodeId(206),
        name_zh: "旧版轨道",
        name_en: "Legacy orbit"
      }
    ],
    pos: [
      {
        pos_id: nodeId(201),
        grammar_structures: [],
        senses: [
          {
            id: nodeId(207),
            sub_pos: "N-COUNT",
            level: "B1",
            sense_group_id: nodeId(206),
            frequency: "12.50",
            depends_on_context: false,
            definitions: [
              {
                id: nodeId(208),
                level: "B1",
                definition_mode: "zh_definition",
                content_id: nodeId(209),
                content: richText("历史旧版轨道释义")
              }
            ],
            sentences: [],
            relations: []
          }
        ]
      }
    ]
  },
  completed_steps: ["basics", "forms", "meanings"],
  max_reachable_step: "preview",
  created_by: ACTOR_ID,
  created_at: NOW,
  updated_at: NOW,
  published_revision: 7,
  has_unpublished_changes: false,
  published_at: NOW
};

const LEGACY_PUBLICATION: AdminWordPublicationAny = {
  schema_version: 2,
  publication_id: nodeId(211),
  entry_id: ADMIN_V3_CANARY_WORD_ID,
  publication_number: 1,
  source_revision: 7,
  published_by_admin_id: ACTOR_ID,
  published_at: NOW,
  is_current: false,
  word: {
    ...structuredClone(LEGACY_WORD),
    id: ADMIN_V3_CANARY_WORD_ID
  }
};

function listItem(word: AdminWordV3): AdminWordListItemAny {
  return {
    schema_version: 3,
    id: word.id,
    kind: "word",
    presentation: structuredClone(word.presentation),
    revision: word.revision,
    lifecycle_revision: word.lifecycle_revision,
    gloss: "轨道",
    pos_list: ["noun", "verb"],
    levels: ["B1"],
    status: word.status,
    has_unpublished_changes: word.has_unpublished_changes,
    max_reachable_step: word.max_reachable_step,
    ...(word.published_revision === undefined
      ? {}
      : { published_revision: word.published_revision }),
    created_by_name: "V3 Mock E2E Admin",
    created_at: word.created_at,
    updated_at: word.updated_at
  };
}

const LEGACY_LIST_ITEM: AdminWordListItemAny = {
  schema_version: 2,
  id: ADMIN_V2_LEGACY_WORD_ID,
  headword: "legacy-orbit",
  kind: "word",
  dialects: ["common"],
  headword_variants: [{ dialect: "common", headword: "legacy-orbit" }],
  gloss: "旧版轨道",
  pos_list: ["noun"],
  levels: ["B1"],
  status: "published",
  revision: 7,
  lifecycle_revision: 2,
  max_reachable_step: "preview",
  published_revision: 7,
  has_unpublished_changes: false,
  created_by_name: "Legacy Admin",
  created_at: NOW,
  updated_at: NOW
};

export interface MockAdminV3Request {
  method: string;
  path: string;
  body?: unknown;
  idempotency_key?: string;
}

export interface MockAdminV3ApiController {
  requests: MockAdminV3Request[];
  getWord: () => AdminWordV3;
  getPublications: () => AdminWordPublicationAny[];
  count: (method: string, path: string) => number;
}

export interface MockAdminV3ApiOptions {
  initial?: "mixed" | "canary";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function body(route: Route): unknown {
  try {
    return route.request().postDataJSON();
  } catch {
    return undefined;
  }
}

function json(route: Route, status: number, value: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value)
  });
}

function assertRuntimeFixture(root: RuntimeSchemaRoot, value: unknown) {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid) {
    throw new Error(
      `invalid Mock V3 ${root}: ${result.path} ${result.reason} (${result.received_type})`
    );
  }
}

function validationProblem(route: Route, word: AdminWordV3) {
  const pos = word.forms.pos[1];
  const group = pos?.form_groups[0];
  const membership = group?.members[0];
  const form = pos?.forms.find((item) => item.id === membership?.form_id);
  const variant =
    form?.regional_variants.mode === "common"
      ? form.regional_variants.common
      : form?.regional_variants.uk;
  const pronunciation = variant?.pronunciations[0];
  if (!pos || !group || !membership || !form || !variant || !pronunciation) {
    throw new Error("Mock E01a must build a second-POS pronunciation via UI");
  }
  const issue: V3DraftValidationIssue = {
    schema_version: 3,
    step: "forms",
    node_id: pronunciation.id,
    field: "actual_pron",
    code: "pronunciation_required",
    message: "Mock：第二词性的实际发音需要确认",
    node_location: {
      node_role: `forms.pronunciation:${variant.dialect}`,
      ancestor_node_ids: [
        pos.pos_id,
        group.id,
        membership.id,
        form.id,
        variant.id
      ],
      pos_id: pos.pos_id,
      form_group_id: group.id,
      membership_id: membership.id,
      form_id: form.id,
      form_type: form.form_type,
      variant_id: variant.id,
      dialect: variant.dialect,
      pronunciation_id: pronunciation.id
    }
  };
  return route.fulfill({
    status: 422,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "urn:tsz:problem:validation_failed",
      title: "Validation failed",
      status: 422,
      detail: "Mock V3 form is incomplete",
      code: "validation_failed",
      field_issues: [issue]
    })
  });
}

function detection(surface: string): DetectLexiconSurfaceResponseV3 {
  return {
    schema_version: 3,
    detection_id: nodeId(301),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    request: { language: "en", kind: "word", surface },
    normalized_surface: surface.trim().toLowerCase(),
    builtin_dictionary: {
      status: "matched",
      provider: { name: "mock-dictionary", version: "e01a" },
      suggested_pos: ["noun", "verb"],
      suggested_forms: [
        {
          pos: "noun",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              dialect: "common",
              spelling: surface,
              pronunciations: [
                {
                  dict_phonetic: "ˈɔːbɪt",
                  actual_pron: "ˈɔːbɪt",
                  style: "normal"
                }
              ]
            }
          }
        }
      ],
      coverage: {
        forms: "complete",
        pronunciations: "complete",
        meanings: "complete",
        examples: "complete",
        frequency: "complete"
      },
      provenance: {
        forms: { name: "mock-dictionary", version: "e01a" },
        pronunciations: { name: "mock-dictionary", version: "e01a" },
        meanings: { name: "mock-dictionary", version: "e01a" },
        examples: { name: "mock-dictionary", version: "e01a" },
        frequency: { name: "mock-dictionary", version: "e01a" }
      }
    },
    matches: [],
    requires_acknowledgement: false
  };
}

export async function mockAdminV3Api(
  page: Page,
  options: MockAdminV3ApiOptions = {}
): Promise<MockAdminV3ApiController> {
  let word =
    options.initial === "canary"
      ? v3Word(
          ADMIN_V3_CANARY_WORD_ID,
          "migrated-orbit",
          { mode: "migration_canary", whitelisted: true },
          {
            legacy_headwords: { mode: "unified", common: "legacy-orbit" }
          }
        )
      : v3Word(ADMIN_V3_MIXED_WORD_ID, "orbit-v3", {
          mode: "shadow_only",
          blocked_code: "phase2_consumers_not_ready"
        });
  const requests: MockAdminV3Request[] = [];
  const publications: AdminWordPublicationAny[] = [clone(LEGACY_PUBLICATION)];
  let completeFailurePending = true;
  assertRuntimeFixture("AdminWordV3", word);

  await page.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1\/admin/, "");
    const requestBody = body(route);
    requests.push({
      method,
      path,
      body: requestBody,
      idempotency_key: request.headers()["idempotency-key"]
    });

    if (method === "POST" && path === "/auth/refresh") {
      return json(route, 200, {
        access_token: "mock-admin-v3-access-token",
        expires_in: 900,
        refresh_token_expires_at: 9_999_999_999
      });
    }
    if (method === "GET" && path === "/profile") {
      return json(route, 200, ADMIN_PROFILE);
    }
    if (method === "GET" && path === "/settings/parts-of-speech/catalog") {
      return json(route, 200, PART_OF_SPEECH_CATALOG);
    }
    if (method === "GET" && path === `${ADMIN_V3_ENTRIES_PATH}/stats`) {
      return json(route, 200, { total: 2, today: 1, month: 2 });
    }
    if (method === "GET" && path === ADMIN_V3_ENTRIES_PATH) {
      const words = [LEGACY_LIST_ITEM, listItem(word)];
      const response = {
        words,
        page: { page: 1, page_size: 20, total: words.length }
      };
      assertRuntimeFixture("AdminWordListResponse", response);
      return json(route, 200, response);
    }
    if (method === "POST" && path === ADMIN_V3_DETECTIONS_PATH) {
      const input = requestBody as { surface?: string } | undefined;
      const response = detection(input?.surface ?? "");
      assertRuntimeFixture("DetectLexiconResponseAny", response);
      return json(route, 200, response);
    }
    if (method === "POST" && path === ADMIN_V3_ENTRIES_PATH) {
      word = {
        ...v3Word(ADMIN_V3_NEW_WORD_ID, "orbit", {
          mode: "shadow_only",
          blocked_code: "phase2_consumers_not_ready"
        }),
        forms: { pos: [] },
        meanings: { sense_groups: [], pos: [] },
        completed_steps: ["basics"],
        max_reachable_step: "forms"
      };
      assertRuntimeFixture("AdminWordV3", word);
      return json(route, 200, { word: clone(word) });
    }
    if (
      method === "GET" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V2_LEGACY_WORD_ID}`
    ) {
      return json(route, 200, {
        word: clone(LEGACY_WORD),
        retired_stable_slots: []
      });
    }
    if (method === "GET" && path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}`) {
      const response = { word: clone(word), retired_stable_nodes: [] };
      assertRuntimeFixture("AdminWordDraftAnyEnvelope", response);
      return json(route, 200, response);
    }
    if (
      method === "PUT" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}/steps/forms`
    ) {
      const input = requestBody as
        | {
            intent?: "save" | "complete";
            content?: DraftFormsStepContentV3;
          }
        | undefined;
      if (input?.intent === "complete" && completeFailurePending) {
        completeFailurePending = false;
        return validationProblem(route, word);
      }
      if (input?.content) word.forms = clone(input.content);
      word = {
        ...word,
        revision: word.revision + 1,
        has_unpublished_changes: true,
        updated_at: "2026-08-25T02:05:00.000Z"
      };
      assertRuntimeFixture("AdminWordV3", word);
      return json(route, 200, { word: clone(word) });
    }
    if (
      method === "POST" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}/validate`
    ) {
      return json(route, 200, {
        schema_version: 3,
        validated_revision: word.revision,
        valid: true,
        issues: []
      });
    }
    if (
      method === "POST" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}/steps/forms/impact`
    ) {
      return json(route, 200, {
        schema_version: 3,
        base_revision: word.revision,
        requires_confirmation: false,
        affected: []
      });
    }
    if (
      method === "POST" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}/publications`
    ) {
      word = {
        ...word,
        status: "published",
        published_revision: word.revision,
        published_at: "2026-08-25T02:10:00.000Z",
        has_unpublished_changes: false
      };
      assertRuntimeFixture("AdminWordV3", word);
      publications.push({
        schema_version: 3,
        publication_id: nodeId(212),
        entry_id: word.id,
        publication_number: 2,
        source_revision: word.revision,
        published_by_admin_id: ACTOR_ID,
        published_at: word.published_at,
        is_current: true,
        word: clone(word)
      });
      return json(route, 200, { word: clone(word) });
    }
    if (
      method === "GET" &&
      path === `${ADMIN_V3_ENTRIES_PATH}/${word.id}/publications`
    ) {
      const response = { publications: clone(publications) };
      assertRuntimeFixture("AdminWordPublicationListResponse", response);
      return json(route, 200, response);
    }
    if (method === "GET") {
      const publication = publications.find(
        (candidate) =>
          path ===
          `${ADMIN_V3_ENTRIES_PATH}/${word.id}/publications/${candidate.publication_id}`
      );
      if (publication) {
        const response = { publication: clone(publication) };
        assertRuntimeFixture("AdminWordPublicationEnvelope", response);
        return json(route, 200, response);
      }
    }

    return json(route, 501, {
      code: "unexpected_mock_admin_v3_request",
      method,
      path
    });
  });

  return {
    requests,
    getWord: () => clone(word),
    getPublications: () => clone(publications),
    count: (method, path) =>
      requests.filter(
        (request) => request.method === method && request.path === path
      ).length
  };
}
