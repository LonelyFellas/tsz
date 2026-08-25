import type { Page, Route } from "@playwright/test";
import { validateRuntimeSchema, type RuntimeSchemaRoot } from "@tsz/api-client";
import type {
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  PartOfSpeechCatalogResponse,
  RichText,
  SurfaceMatchPageV2,
  WordPronunciationV2
} from "@tsz/types";

export const ADMIN_E2E_WORD_ID = "10000000-0000-4000-8000-000000000001";
export const ADMIN_E2E_POS_ID = "50000000-0000-4000-8000-000000000001";
export const ADMIN_E2E_PLURAL_UK_ID = "50000000-0000-4000-8000-000000000002";
export const ADMIN_E2E_PLURAL_US_ID = "50000000-0000-4000-8000-000000000003";
export const ADMIN_E2E_SURFACE_ARCHIVED_ID =
  "61000000-0000-4000-8000-000000000001";
const ADMIN_E2E_SURFACE_ARCHIVED_SECOND_ID =
  "61000000-0000-4000-8000-000000000002";
const ADMIN_E2E_SURFACE_PUBLISHED_ID = "61000000-0000-4000-8000-000000000003";
const ADMIN_E2E_SURFACE_SNAPSHOT_IDS = {
  workspace: "64000000-0000-4000-8000-000000000001",
  workspaces: "64000000-0000-4000-8000-000000000002"
} as const;
const ADMIN_E2E_RELATION_SOURCE_ID = "65000000-0000-4000-8000-000000000001";
export const ADMIN_E2E_LEXICON_PATH = "/lexicon";
export const ADMIN_E2E_ENTRIES_PATH = `${ADMIN_E2E_LEXICON_PATH}/entries`;
export const ADMIN_E2E_DETECTIONS_PATH = `${ADMIN_E2E_LEXICON_PATH}/detections`;

const ADMIN_PROFILE = {
  id: "admin-e2e",
  phone: "13800138000",
  display_name: "E2E Admin",
  role: "admin",
  permissions: ["words.access"],
  // 偏好持久化在服务端（后端提案 P2）；e2e 固定英式。
  preferences: { dialect: "uk" }
};

const NOW = "2026-08-02T03:00:00.000Z";
const PUBLISHED_AT = "2026-08-02T03:10:00.000Z";
const ADMIN_AUDIT_ID = "01900000-0000-7000-8000-000000000001";

const PART_OF_SPEECH_CATALOG: PartOfSpeechCatalogResponse = {
  catalog_version: 1,
  items: [
    {
      id: "pos-config-noun",
      code: "noun",
      name_zh: "名词",
      name_en: "NOUN",
      abbreviation: "n.",
      sort_order: 10,
      allowed_form_types: ["plural"],
      default_form_types: ["plural"],
      sub_parts: [
        {
          id: "sub-pos-config-n-count",
          code: "N-COUNT",
          name_zh: "可数名词",
          name_en: "Countable noun",
          sort_order: 10
        }
      ]
    }
  ]
};

const richText = (text: string): RichText => ({
  version: 1,
  text,
  spans: [],
  liaisons: []
});

const pronunciation = (id: string, phonetic: string): WordPronunciationV2 => ({
  id,
  dict_phonetic: phonetic,
  actual_pron: phonetic,
  style: "normal"
});

const CENTER_FORMS = {
  pos: [
    {
      pos_id: ADMIN_E2E_POS_ID,
      pos: "noun",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      base_form: {
        id: "base-noun",
        form_type: "base",
        variants: [
          {
            id: "base-noun-uk",
            dialect: "uk",
            spelling: "centre",
            origin: "dictionary",
            pronunciations: [pronunciation("pron-noun-uk", "ˈsentə")]
          },
          {
            id: "base-noun-us",
            dialect: "us",
            spelling: "center",
            origin: "dictionary",
            pronunciations: [pronunciation("pron-noun-us", "ˈsentər")]
          }
        ]
      },
      form_groups: [
        {
          id: "noun-group-1",
          is_regular: true,
          slots: [
            {
              id: "noun-plural",
              form_type: "plural",
              variants: [
                {
                  id: ADMIN_E2E_PLURAL_UK_ID,
                  dialect: "uk",
                  spelling: "centres",
                  origin: "dictionary",
                  pronunciations: [pronunciation("pron-plural-uk", "ˈsentəz")]
                },
                {
                  id: ADMIN_E2E_PLURAL_US_ID,
                  dialect: "us",
                  spelling: "centers",
                  origin: "dictionary",
                  pronunciations: [pronunciation("pron-plural-us", "ˈsentərz")]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
} satisfies DraftFormsStepContent;

const CENTER_MEANINGS = {
  sense_groups: [
    {
      id: "sense-group-1",
      name_zh: "几何空间",
      name_en: "Geometric space"
    }
  ],
  pos: [
    {
      pos_id: ADMIN_E2E_POS_ID,
      grammar_structures: [
        {
          id: "grammar-1",
          variants: [
            // 存量（A1 改造前）的英美双条：编辑器只呈现偏好侧那一份，
            // 保存时收敛为单条 `common`。留着它就是为了覆盖这条收敛路径。
            { id: "grammar-uk", dialect: "uk", content: richText("a centre") },
            { id: "grammar-us", dialect: "us", content: richText("a centre") }
          ]
        }
      ],
      senses: [
        {
          id: "sense-1",
          sub_pos: "N-COUNT",
          level: "A1",
          sense_group_id: "sense-group-1",
          frequency: "12.24",
          depends_on_context: false,
          definitions: [
            {
              id: "definition-1",
              level: "A1",
              definition_mode: "zh_definition",
              content_id: "definition-1-content",
              content: richText("圆心，中心")
            }
          ],
          sentences: [
            {
              id: "sentence-1",
              level: "A2",
              // 英文内容 A1 后恒为单份，口径取管理员的方言偏好（默认英式）。
              en_text: {
                mode: "unified",
                common: {
                  id: "sentence-1-common",
                  value: richText("He walked to the centre of the circle."),
                  origin: "manual"
                }
              },
              zh_text_id: "sentence-1-zh",
              zh_text: richText("他走到了圆的中心。"),
              links: [
                {
                  word_id: ADMIN_E2E_WORD_ID,
                  sense_id: "sense-1",
                  role: "focus"
                }
              ]
            }
          ],
          relations: []
        }
      ]
    }
  ]
} satisfies DraftMeaningsStepContent;

type MockWord = Record<string, unknown> & {
  id: string;
  revision: number;
  lifecycle_revision: number;
  status: "draft" | "published" | "archived";
  published_revision?: number;
  has_unpublished_changes: boolean;
  forms: typeof CENTER_FORMS;
  meanings: typeof CENTER_MEANINGS;
  completed_steps: string[];
  max_reachable_step: "basics" | "forms" | "meanings" | "preview";
};

export interface AdminApiRequestLog {
  method: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export interface MockAdminApiOptions {
  /** 直接提供一条既有 V2 word 草稿，供 V2 editor 回归使用。 */
  seedDraft?: boolean;
  /** V2 创建入口当前仅对 phrase 开放；mock 回显服务端权威 kind。 */
  entryKind?: "word" | "phrase";
  /** 让本次检测命中智能词库重复项。 */
  duplicate?: boolean;
  /** 为 workspace/workspaces 返回可确认的 surface warning 与两页 snapshot。 */
  surfaceWarnings?: boolean;
  /** 第一次携 token 创建返回结构化 410，用于验证 snapshot 过期恢复。 */
  expireSurfaceSnapshotOnce?: boolean;
  /** 第一次 forms 保存返回 500，后续重试成功。 */
  failFormsSaveOnce?: boolean;
  /** 显式 plural=workspaces 时，让 forms impact 返回两页 surface warning。 */
  formsSurfaceWarnings?: boolean;
  /** forms surface warning 同时携带下游影响，并由终页签发 impact token。 */
  formsDownstreamImpact?: boolean;
  /** 第一次携有效 token 保存时模拟锁后命中集合变化，返回结构化 409。 */
  changeFormsSurfaceOnFirstSave?: boolean;
  /** 延迟 forms surface 终页，供浏览器验证终页前确认门禁。 */
  formsSurfaceTerminalDelayMs?: number;
  /** 为关联词 V2 搜索返回两个完全同名、ID 不同的已发布目标。 */
  relatedSearchV2?: boolean;
  /** 列表返回两个完全同名、ID 与上下文不同的 workspace。 */
  sameHeadwordList?: boolean;
}

export interface MockAdminApiController {
  requests: AdminApiRequestLog[];
  getWord: () => MockWord | undefined;
  count: (method: string, path: string) => number;
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

function problem(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify(body)
  });
}

function assertRuntimeFixture(root: RuntimeSchemaRoot, value: unknown) {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid) {
    throw new Error(
      `${root} mock fixture invalid at ${result.path}: ${result.reason}`
    );
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requestBody(route: Route): unknown {
  try {
    return route.request().postDataJSON();
  } catch {
    return undefined;
  }
}

function createDraft(
  headwords: unknown,
  kind: "word" | "phrase" = "word"
): MockWord {
  return {
    schema_version: 2,
    id: ADMIN_E2E_WORD_ID,
    language: "en",
    kind,
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    headwords,
    detection_snapshot: {
      detection_id: "detect-center",
      request: { language: "en", headword: "center" },
      normalized_headword: "center",
      entry_kind: kind,
      matched_dialect: "us",
      builtin_dictionary_status: "matched",
      smart_dictionary_status: "clear",
      headwords,
      suggested_pos: ["noun"],
      detected_at: NOW
    },
    forms: clone(CENTER_FORMS),
    meanings: clone(CENTER_MEANINGS),
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: ADMIN_PROFILE.id,
    created_at: NOW,
    updated_at: NOW,
    has_unpublished_changes: false
  };
}

function existingEntryDetail(wordId: string): MockWord | undefined {
  const isWorkspaceEntry = [
    ADMIN_E2E_SURFACE_ARCHIVED_ID,
    ADMIN_E2E_SURFACE_ARCHIVED_SECOND_ID,
    ADMIN_E2E_SURFACE_PUBLISHED_ID
  ].includes(wordId);
  const headword = wordId.includes("colour")
    ? "colour"
    : wordId.includes("color")
      ? "color"
      : isWorkspaceEntry
        ? "workspace"
        : undefined;
  if (!headword) return undefined;
  const word = createDraft({ mode: "unified", common: headword });
  const status =
    wordId === ADMIN_E2E_SURFACE_PUBLISHED_ID || wordId === "existing-color"
      ? "published"
      : "archived";
  return {
    ...word,
    id: wordId,
    status,
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    ...(status === "published" ? { published_revision: word.revision } : {})
  };
}

function surfaceMatchItem(
  rawHeadword: string,
  wordId: string,
  status: "draft" | "published" | "archived",
  sourceKind: "headword" | "form",
  entryKind: "word" | "phrase"
) {
  const plural = rawHeadword.trim().toLowerCase() === "workspaces";
  return {
    match_id: `${rawHeadword}:${wordId}:${sourceKind}`,
    match_category: plural ? "headword_form" : "exact_headword",
    severity: "warning",
    attention_level: plural ? "normal" : "high",
    can_continue: true,
    confirmation_reasons: ["unacknowledged_surface_matches"],
    candidate: {
      candidate_type: "headword",
      candidate_ref: `detect-${rawHeadword}:headword:common`,
      surface: rawHeadword,
      normalized_surface: rawHeadword.trim().toLowerCase(),
      dialect: "common",
      entry_kind: entryKind
    },
    existing: {
      word_id: wordId,
      headword: "workspace",
      kind: "word",
      status,
      source:
        sourceKind === "headword"
          ? {
              source_kind: "headword",
              source_id: `${wordId}:headword:common`,
              content_scope: "draft",
              surface: "workspace",
              dialect: "common"
            }
          : {
              source_kind: "form",
              source_id: `${wordId}:form:plural`,
              source_node_id: wordId.replace(/^61/, "62"),
              content_scope: "current_publication",
              surface: "workspaces",
              dialect: "common",
              pos_id: wordId.replace(/^61/, "63"),
              pos: "noun",
              form_type: "plural"
            }
    }
  };
}

function surfacePage(
  rawHeadword: string,
  terminal: boolean,
  entryKind: "word" | "phrase" = "word"
): SurfaceMatchPageV2 {
  const plural = rawHeadword.trim().toLowerCase() === "workspaces";
  const items = terminal
    ? [
        surfaceMatchItem(
          rawHeadword,
          ADMIN_E2E_SURFACE_ARCHIVED_SECOND_ID,
          "archived",
          plural ? "form" : "headword",
          entryKind
        )
      ]
    : [
        surfaceMatchItem(
          rawHeadword,
          ADMIN_E2E_SURFACE_ARCHIVED_ID,
          "archived",
          plural ? "form" : "headword",
          entryKind
        ),
        surfaceMatchItem(
          rawHeadword,
          ADMIN_E2E_SURFACE_PUBLISHED_ID,
          "published",
          plural ? "form" : "headword",
          entryKind
        )
      ];
  const page: SurfaceMatchPageV2 = {
    schema_version: 2 as const,
    snapshot_id: plural
      ? ADMIN_E2E_SURFACE_SNAPSHOT_IDS.workspaces
      : ADMIN_E2E_SURFACE_SNAPSHOT_IDS.workspace,
    items,
    total: 3,
    matched_entry_contexts: items.map((item) => ({
      word_id: item.existing.word_id,
      pos_labels: ["noun"],
      gloss_previews: ["工作空间"],
      updated_at: NOW,
      inbound_relations: {
        total: 1,
        by_type: { synonym: 1, antonym: 0, derivative: 0 },
        previews: [
          {
            source_word_id: ADMIN_E2E_RELATION_SOURCE_ID,
            source_headword: "space",
            relation: "synonym",
            source_status: "published"
          }
        ],
        truncated: false
      }
    })),
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "allow_new_exact_headword_entries",
    policy_epoch: 1,
    continuation_policy: "enabled",
    next_cursor: terminal ? null : "surface-page-2",
    ...(terminal
      ? { surface_confirmation_token: `surface-token-${rawHeadword}` }
      : {})
  };
  assertRuntimeFixture("SurfaceMatchPageAny", page);
  return page;
}

const FORMS_SURFACE_CURSOR = "forms-surface-page-2";

function formsImpactToken(version: number): string {
  return `66000000-0000-4000-8000-00000000000${version}`;
}

function formsSurfaceMatchItem(
  version: number,
  category: "form_headword" | "form_form"
) {
  const existingWordId =
    category === "form_headword"
      ? `60000000-0000-4000-8000-00000000000${version}`
      : `60000000-0000-4000-8000-00000000001${version}`;
  const existingHeadword =
    category === "form_headword"
      ? "workspaces"
      : version === 1
        ? "workspace"
        : "workspace-updated";
  return {
    match_id: `forms-${category}-v${version}`,
    match_category: category,
    severity: "warning" as const,
    attention_level: "normal" as const,
    can_continue: true as const,
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    candidate: {
      candidate_type: "form" as const,
      candidate_ref: `${ADMIN_E2E_WORD_ID}:${ADMIN_E2E_POS_ID}:noun-plural:${ADMIN_E2E_PLURAL_US_ID}`,
      candidate_word_id: ADMIN_E2E_WORD_ID,
      candidate_node_id: ADMIN_E2E_PLURAL_US_ID,
      surface: "workspaces",
      normalized_surface: "workspaces",
      dialect: "us" as const,
      pos_id: ADMIN_E2E_POS_ID,
      pos: "noun",
      form_type: "plural" as const
    },
    existing: {
      word_id: existingWordId,
      headword: existingHeadword,
      kind: "word" as const,
      status:
        category === "form_headword"
          ? ("draft" as const)
          : ("published" as const),
      source:
        category === "form_headword"
          ? {
              source_kind: "headword" as const,
              source_id: `${existingWordId}:headword:common`,
              content_scope: "draft" as const,
              surface: "workspaces",
              dialect: "common" as const
            }
          : {
              source_kind: "form" as const,
              source_id: `${existingWordId}:form:plural:us`,
              source_node_id: `70000000-0000-4000-8000-00000000000${version}`,
              content_scope: "current_publication" as const,
              surface: "workspaces",
              dialect: "us" as const,
              pos_id: `80000000-0000-4000-8000-00000000000${version}`,
              pos: "noun",
              form_type: "plural" as const
            }
    }
  };
}

function formsSurfacePage(
  version: number,
  terminal: boolean,
  includeImpactToken: boolean
): SurfaceMatchPageV2 {
  const item = formsSurfaceMatchItem(
    version,
    terminal ? "form_form" : "form_headword"
  );
  const base = {
    schema_version: 2 as const,
    snapshot_id: `40000000-0000-4000-8000-00000000000${version}`,
    items: [item],
    total: 2,
    matched_entry_contexts: [
      {
        word_id: item.existing.word_id,
        pos_labels: ["noun"],
        gloss_previews: ["工作区"],
        updated_at: NOW,
        inbound_relations: {
          total: 0,
          by_type: { synonym: 0, antonym: 0, derivative: 0 },
          previews: [],
          truncated: false
        }
      }
    ],
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "surface_warning_acknowledgement" as const,
    policy_epoch: version,
    continuation_policy: "enabled" as const
  };
  const page: SurfaceMatchPageV2 = terminal
    ? {
        ...base,
        next_cursor: null,
        surface_confirmation_token: `forms-surface-token-v${version}`,
        ...(includeImpactToken
          ? { impact_confirmation_token: formsImpactToken(version) }
          : {})
      }
    : { ...base, next_cursor: FORMS_SURFACE_CURSOR };
  assertRuntimeFixture("SurfaceMatchPageAny", page);
  return page;
}

function hasExplicitWorkspacePlural(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const content = Reflect.get(body, "content");
  if (!content || typeof content !== "object") return false;
  const posItems = Reflect.get(content, "pos");
  if (!Array.isArray(posItems)) return false;
  return posItems.some((pos) => {
    if (!pos || typeof pos !== "object") return false;
    const groups = Reflect.get(pos, "form_groups");
    if (!Array.isArray(groups)) return false;
    return groups.some((group) => {
      if (!group || typeof group !== "object") return false;
      const slots = Reflect.get(group, "slots");
      if (!Array.isArray(slots)) return false;
      return slots.some((slot) => {
        if (!slot || typeof slot !== "object") return false;
        if (Reflect.get(slot, "form_type") !== "plural") return false;
        const variants = Reflect.get(slot, "variants");
        return (
          Array.isArray(variants) &&
          variants.some(
            (variant) =>
              variant !== null &&
              typeof variant === "object" &&
              Reflect.get(variant, "id") === ADMIN_E2E_PLURAL_US_ID &&
              Reflect.get(variant, "spelling") === "workspaces"
          )
        );
      });
    });
  });
}

// 命中结果的词典覆盖度:e2e 桩按全覆盖返回,partial/missing 的呈现由单测覆盖。
const FULL_COVERAGE = {
  forms: "complete",
  pronunciations: "complete",
  meanings: "complete",
  examples: "complete",
  frequency: "complete"
} as const;

function detectionResponse(
  duplicate: boolean,
  rawHeadword: string,
  surfaceWarnings = false,
  entryKind: "word" | "phrase" = "word"
) {
  const isDuplicate = duplicate || rawHeadword.trim().toLowerCase() === "color";
  const normalized = rawHeadword.trim().toLowerCase();
  if (
    surfaceWarnings &&
    (normalized === "workspace" || normalized === "workspaces")
  ) {
    return {
      detection_id: `detect-${normalized}`,
      expires_at: "2099-08-02T03:05:00.000Z",
      request: { language: "en", headword: rawHeadword },
      normalized_headword: normalized,
      entry_kind: entryKind,
      matched_dialect: "common",
      builtin_dictionary: {
        status: "matched",
        headwords: { mode: "unified", common: rawHeadword },
        suggested_forms: clone(CENTER_FORMS),
        coverage: clone(FULL_COVERAGE)
      },
      smart_dictionary: {
        status: "warning",
        duplicates: [],
        surface_match_page: surfacePage(rawHeadword, false, entryKind),
        matched_entry_contexts: []
      }
    };
  }
  const headwords = isDuplicate
    ? {
        mode: "distinguish",
        uk: "colour",
        us: "color",
        source_dialect: "us"
      }
    : {
        mode: "distinguish",
        uk: "centre",
        us: "center",
        source_dialect: "us"
      };
  return {
    detection_id: isDuplicate ? "detect-color" : "detect-center",
    expires_at: "2099-08-02T03:05:00.000Z",
    request: { language: "en", headword: rawHeadword },
    normalized_headword: rawHeadword.trim().toLowerCase(),
    entry_kind: entryKind,
    matched_dialect: "us",
    builtin_dictionary: {
      status: "matched",
      headwords,
      suggested_forms: clone(CENTER_FORMS),
      coverage: clone(FULL_COVERAGE)
    },
    smart_dictionary: isDuplicate
      ? {
          status: "duplicate",
          duplicates: [
            {
              word_id: "existing-colour",
              headword: "colour",
              dialect: "uk",
              status: "archived"
            },
            {
              word_id: "existing-color",
              headword: "color",
              dialect: "us",
              status: "published"
            }
          ]
        }
      : { status: "clear", duplicates: [] }
  };
}

function listItem(word: MockWord) {
  const headwords = word.headwords;
  if (!headwords || typeof headwords !== "object") {
    throw new Error("Admin E2E word fixture is missing headwords");
  }
  const mode = Reflect.get(headwords, "mode");
  const sourceDialect = Reflect.get(headwords, "source_dialect");
  const presentation =
    mode === "unified"
      ? {
          headword: String(Reflect.get(headwords, "common")),
          dialects: ["common"] as const,
          headword_variants: [
            {
              dialect: "common" as const,
              headword: String(Reflect.get(headwords, "common"))
            }
          ]
        }
      : sourceDialect === "uk" || sourceDialect === "us"
        ? {
            headword: `${String(Reflect.get(headwords, sourceDialect))} / ${String(Reflect.get(headwords, sourceDialect === "uk" ? "us" : "uk"))}`,
            dialects: [
              sourceDialect,
              sourceDialect === "uk" ? ("us" as const) : ("uk" as const)
            ],
            source_dialect: sourceDialect,
            headword_variants: [
              {
                dialect: sourceDialect,
                headword: String(Reflect.get(headwords, sourceDialect))
              },
              {
                dialect:
                  sourceDialect === "uk" ? ("us" as const) : ("uk" as const),
                headword: String(
                  Reflect.get(headwords, sourceDialect === "uk" ? "us" : "uk")
                )
              }
            ]
          }
        : undefined;
  if (!presentation) {
    throw new Error("Admin E2E word fixture has invalid headwords");
  }
  return {
    schema_version: 2,
    id: word.id,
    ...presentation,
    kind: word.kind === "phrase" ? "phrase" : "word",
    gloss: word.status === "published" ? "圆心，中心" : "",
    pos_list: ["noun"],
    levels: word.status === "published" ? ["A1"] : [],
    status: word.status,
    revision: word.revision,
    lifecycle_revision: word.lifecycle_revision,
    max_reachable_step: word.max_reachable_step,
    ...(word.published_revision !== undefined
      ? { published_revision: word.published_revision }
      : {}),
    has_unpublished_changes: word.has_unpublished_changes,
    created_by_name: ADMIN_PROFILE.display_name,
    created_at: NOW,
    updated_at: word.updated_at
  };
}

/**
 * Admin E2E 的共享鉴权与 words API 桩。所有未知请求返回 501，绝不回落真实后端。
 * 每个测试得到独立内存状态，支持创建 → 保存 → 刷新恢复 → 发布 → 列表查看。
 */
export async function mockAdminApi(
  page: Page,
  options: MockAdminApiOptions = {}
): Promise<MockAdminApiController> {
  const requests: AdminApiRequestLog[] = [];
  let word = options.seedDraft
    ? createDraft(
        {
          mode: "distinguish",
          uk: "centre",
          us: "center",
          source_dialect: "us"
        },
        "word"
      )
    : undefined;
  let formsFailureRemaining = options.failFormsSaveOnce ? 1 : 0;
  let surfaceSnapshotExpiryRemaining = options.expireSurfaceSnapshotOnce
    ? 1
    : 0;
  let formsSurfaceVersion = 1;
  let formsSurfaceChangeRemaining = options.changeFormsSurfaceOnFirstSave
    ? 1
    : 0;

  await page.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname.replace(/^.*\/api\/v1\/admin/, "");
    const body = requestBody(route);
    requests.push({
      method,
      path,
      body,
      idempotencyKey: request.headers()["idempotency-key"]
    });

    if (method === "POST" && path === "/auth/refresh") {
      return json(route, 200, {
        access_token: "admin-e2e-access-token",
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
    if (method === "GET" && path === ADMIN_E2E_ENTRIES_PATH) {
      const words = options.sameHeadwordList
        ? [
            {
              ...listItem(
                createDraft({
                  mode: "unified",
                  common: "workspace"
                })
              ),
              id: "10000000-0000-4000-8000-0000a1b2c3d4",
              gloss: "工作空间"
            },
            {
              ...listItem(
                createDraft(
                  {
                    mode: "distinguish",
                    uk: "workspace",
                    us: "workspace",
                    source_dialect: "uk"
                  },
                  "phrase"
                )
              ),
              id: "10000000-0000-4000-8000-0000e5f6a7b8",
              gloss: "协作空间"
            }
          ]
        : word
          ? [listItem(word)]
          : [];
      const response = {
        words,
        page: { page: 1, page_size: 20, total: words.length }
      };
      assertRuntimeFixture("AdminWordListResponse", response);
      return json(route, 200, response);
    }
    if (method === "GET" && path === `${ADMIN_E2E_ENTRIES_PATH}/stats`) {
      const count = word ? 1 : 0;
      return json(route, 200, { total: count, today: count, month: count });
    }
    if (method === "POST" && path === ADMIN_E2E_DETECTIONS_PATH) {
      const input = body as { headword?: string } | undefined;
      return json(
        route,
        200,
        detectionResponse(
          options.duplicate === true,
          input?.headword ?? "",
          options.surfaceWarnings === true,
          options.entryKind
        )
      );
    }
    if (
      method === "GET" &&
      path.startsWith(`${ADMIN_E2E_LEXICON_PATH}/surface-match-snapshots/`)
    ) {
      const snapshotId = path.split("/").at(-1) ?? "";
      const formsSnapshotMatch =
        /^40000000-0000-4000-8000-00000000000(\d)$/.exec(snapshotId);
      if (options.formsSurfaceWarnings && formsSnapshotMatch) {
        if (requestUrl.searchParams.get("cursor") !== FORMS_SURFACE_CURSOR) {
          return problem(route, 410, {
            type: "urn:tsz:problem:surface_match_snapshot_expired",
            title: "Surface match snapshot expired",
            status: 410,
            detail: "surface match snapshot expired",
            code: "surface_match_snapshot_expired"
          });
        }
        const delayMs = options.formsSurfaceTerminalDelayMs ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return json(
          route,
          200,
          formsSurfacePage(
            Number(formsSnapshotMatch[1]),
            true,
            options.formsDownstreamImpact === true
          )
        );
      }
      const rawHeadword = Object.entries(ADMIN_E2E_SURFACE_SNAPSHOT_IDS).find(
        ([, id]) => id === snapshotId
      )?.[0];
      if (
        rawHeadword === undefined ||
        requestUrl.searchParams.get("cursor") !== "surface-page-2"
      ) {
        return problem(route, 410, {
          type: "urn:tsz:problem:surface_match_snapshot_expired",
          title: "Surface match snapshot expired",
          status: 410,
          detail: "surface match snapshot expired",
          code: "surface_match_snapshot_expired"
        });
      }
      return json(
        route,
        200,
        surfacePage(rawHeadword, true, options.entryKind)
      );
    }
    if (method === "POST" && path === ADMIN_E2E_ENTRIES_PATH) {
      const input = body as
        | {
            headwords?: unknown;
            detection_id?: string;
            confirmed_surface_match_token?: string;
          }
        | undefined;
      if (
        options.surfaceWarnings &&
        input?.detection_id?.startsWith("detect-workspace") &&
        input.confirmed_surface_match_token !==
          `surface-token-${input.detection_id.replace(/^detect-/, "")}`
      ) {
        const rawHeadword = input.detection_id.replace(/^detect-/, "");
        const page = surfacePage(rawHeadword, false, options.entryKind);
        return problem(route, 409, {
          type: "urn:tsz:problem:surface_match_acknowledgement_required",
          title: "Surface match acknowledgement required",
          status: 409,
          detail: "surface match acknowledgement required",
          code: "surface_match_acknowledgement_required",
          meta: {
            surface_match_page: page,
            current_policy_name: page.policy_name,
            current_policy_epoch: page.policy_epoch
          }
        });
      }
      if (
        options.surfaceWarnings &&
        surfaceSnapshotExpiryRemaining > 0 &&
        input?.detection_id?.startsWith("detect-workspace")
      ) {
        surfaceSnapshotExpiryRemaining -= 1;
        return problem(route, 410, {
          type: "urn:tsz:problem:surface_match_snapshot_expired",
          title: "Surface match snapshot expired",
          status: 410,
          detail: "surface match snapshot expired",
          code: "surface_match_snapshot_expired"
        });
      }
      word ??= createDraft(
        input?.headwords ?? {
          mode: "distinguish",
          uk: "centre",
          us: "center",
          source_dialect: "us"
        },
        options.entryKind
      );
      if (
        options.surfaceWarnings &&
        input?.detection_id?.startsWith("detect-workspace")
      ) {
        const rawHeadword = input.detection_id.replace(/^detect-/, "");
        const matches = [
          ...surfacePage(rawHeadword, false, options.entryKind).items,
          ...surfacePage(rawHeadword, true, options.entryKind).items
        ];
        word.detection_snapshot = {
          detection_id: input.detection_id,
          request: { language: "en", headword: rawHeadword },
          normalized_headword: rawHeadword,
          entry_kind: word.kind === "phrase" ? "phrase" : "word",
          matched_dialect: "common",
          builtin_dictionary_status: "matched",
          smart_dictionary_status: "warning",
          surface_warning: {
            total: matches.length,
            match_digest: `surface-digest-${rawHeadword}`,
            acknowledged: true,
            acknowledged_at: NOW,
            acknowledged_by: ADMIN_AUDIT_ID,
            policy_name: "allow_new_exact_headword_entries",
            policy_epoch: 1,
            preview: matches.map((item) => ({
              match_id: item.match_id,
              match_category: item.match_category,
              existing_word_id: item.existing.word_id,
              existing_headword: item.existing.headword,
              existing_kind: item.existing.kind,
              existing_status: item.existing.status,
              existing_dialect: item.existing.source.dialect,
              pos_labels: ["noun"],
              gloss_previews: ["工作空间"]
            })),
            truncated: false
          },
          headwords: input.headwords,
          suggested_pos: ["noun"],
          detected_at: NOW
        };
      }
      return json(route, 201, { word: clone(word) });
    }
    if (
      method === "POST" &&
      path ===
        `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms/impact`
    ) {
      if (options.formsSurfaceWarnings && hasExplicitWorkspacePlural(body)) {
        const requiresImpact = options.formsDownstreamImpact === true;
        return json(route, 200, {
          base_revision: word?.revision ?? 1,
          requires_confirmation: requiresImpact,
          affected: requiresImpact
            ? [
                {
                  node_id: "sense-1",
                  node_type: "sense",
                  reason: "复数词形变化会影响词义引用"
                }
              ]
            : [],
          surface_match_page: formsSurfacePage(
            formsSurfaceVersion,
            false,
            requiresImpact
          )
        });
      }
      return json(route, 200, {
        base_revision: word?.revision ?? 1,
        requires_confirmation: false,
        affected: []
      });
    }
    if (
      method === "PUT" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`
    ) {
      if (formsFailureRemaining > 0) {
        formsFailureRemaining -= 1;
        return json(route, 500, {
          error: "临时保存失败",
          code: "temporary_failure"
        });
      }
      const input = body as
        | {
            content?: typeof CENTER_FORMS;
            intent?: "save" | "complete";
            confirmed_surface_match_token?: string;
            confirmed_impact_token?: string;
          }
        | undefined;
      if (!word) return json(route, 404, { error: "word not found" });
      if (options.formsSurfaceWarnings && hasExplicitWorkspacePlural(input)) {
        const requiresImpact = options.formsDownstreamImpact === true;
        const expectedSurfaceToken = `forms-surface-token-v${formsSurfaceVersion}`;
        const expectedImpactToken = formsImpactToken(formsSurfaceVersion);
        const hasExpectedTokens =
          input?.confirmed_surface_match_token === expectedSurfaceToken &&
          (!requiresImpact ||
            input.confirmed_impact_token === expectedImpactToken);
        if (!hasExpectedTokens) {
          const page = formsSurfacePage(
            formsSurfaceVersion,
            false,
            requiresImpact
          );
          return problem(route, 409, {
            type: "urn:tsz:problem:surface_match_acknowledgement_required",
            title: "Surface match acknowledgement required",
            status: 409,
            detail: "surface match acknowledgement required",
            code: "surface_match_acknowledgement_required",
            meta: {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          });
        }
        if (formsSurfaceChangeRemaining > 0) {
          formsSurfaceChangeRemaining -= 1;
          formsSurfaceVersion += 1;
          const page = formsSurfacePage(
            formsSurfaceVersion,
            false,
            requiresImpact
          );
          return problem(route, 409, {
            type: "urn:tsz:problem:surface_matches_changed",
            title: "Surface matches changed",
            status: 409,
            detail: "surface matches changed after the entry lock was acquired",
            code: "surface_matches_changed",
            meta: {
              surface_match_page: page,
              current_policy_name: page.policy_name,
              current_policy_epoch: page.policy_epoch
            }
          });
        }
      }
      word = {
        ...word,
        forms: clone(input?.content ?? CENTER_FORMS),
        revision: word.revision + 1,
        completed_steps:
          input?.intent === "complete"
            ? Array.from(new Set([...word.completed_steps, "forms"]))
            : word.completed_steps,
        max_reachable_step:
          input?.intent === "complete" ? "meanings" : word.max_reachable_step,
        updated_at: NOW
      };
      return json(route, 200, { word: clone(word) });
    }
    if (
      method === "PUT" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/meanings`
    ) {
      const input = body as
        | { content?: typeof CENTER_MEANINGS; intent?: "save" | "complete" }
        | undefined;
      if (!word) return json(route, 404, { error: "word not found" });
      word = {
        ...word,
        meanings: clone(input?.content ?? CENTER_MEANINGS),
        revision: word.revision + 1,
        completed_steps:
          input?.intent === "complete"
            ? Array.from(new Set([...word.completed_steps, "meanings"]))
            : word.completed_steps,
        max_reachable_step:
          input?.intent === "complete" ? "preview" : word.max_reachable_step,
        updated_at: NOW
      };
      return json(route, 200, { word: clone(word) });
    }
    if (
      method === "POST" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/validate`
    ) {
      return json(route, 200, {
        validated_revision: word?.revision ?? 1,
        valid: true,
        issues: []
      });
    }
    if (
      method === "POST" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/publications`
    ) {
      if (!word) return json(route, 404, { error: "word not found" });
      word = {
        ...word,
        status: "published",
        published_revision: word.revision,
        has_unpublished_changes: false,
        max_reachable_step: "preview",
        published_at: PUBLISHED_AT,
        updated_at: PUBLISHED_AT
      };
      return json(route, 201, { word: clone(word) });
    }
    if (
      method === "GET" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}`
    ) {
      return word
        ? json(route, 200, {
            word: clone(word),
            // 契约要求恒在：编辑器靠它找回已退役的稳定槽位身份。
            retired_stable_slots: []
          })
        : json(route, 404, { error: "word not found" });
    }
    if (method === "GET") {
      const detailMatch = new RegExp(
        `^${ADMIN_E2E_ENTRIES_PATH}/([^/]+)$`
      ).exec(path);
      const detail = detailMatch
        ? existingEntryDetail(detailMatch[1] ?? "")
        : undefined;
      if (detail) {
        return json(route, 200, {
          word: clone(detail),
          retired_stable_slots: []
        });
      }
    }
    if (
      method === "GET" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/related-search`
    ) {
      if (options.relatedSearchV2) {
        const matchMode = requestUrl.searchParams.get("match_mode");
        const results =
          matchMode === "exact"
            ? [
                {
                  schema_version: 2,
                  word_id: "11111111-0000-4000-8000-000000000001",
                  headword: "workspace",
                  kind: "word",
                  dialects: ["common"],
                  headword_variants: [
                    { dialect: "common", headword: "workspace" }
                  ],
                  pos_labels: ["noun"],
                  senses: [
                    {
                      sense_id: "30000000-0000-4000-8000-000000000001",
                      gloss: "工作区甲"
                    }
                  ]
                },
                {
                  schema_version: 2,
                  word_id: "22222222-0000-4000-8000-000000000002",
                  headword: "workspace",
                  kind: "word",
                  dialects: ["uk", "us"],
                  headword_variants: [
                    { dialect: "uk", headword: "workspace" },
                    { dialect: "us", headword: "workspace" }
                  ],
                  pos_labels: ["noun"],
                  senses: [
                    {
                      sense_id: "30000000-0000-4000-8000-000000000002",
                      gloss: "工作区乙一"
                    },
                    {
                      sense_id: "30000000-0000-4000-8000-000000000003",
                      gloss: "工作区乙二"
                    }
                  ]
                }
              ]
            : [];
        const response = {
          results,
          total: results.length,
          next_cursor: null
        };
        assertRuntimeFixture("RelatedSearchResponse", response);
        return json(route, 200, response);
      }
      const response = { results: [] };
      assertRuntimeFixture("RelatedSearchResponse", response);
      return json(route, 200, response);
    }
    if (
      method === "POST" &&
      path === `${ADMIN_E2E_LEXICON_PATH}/dialect-variant-suggestions`
    ) {
      return json(route, 200, {
        provider: { kind: "dictionary_region_rules", version: "1" },
        suggestions: []
      });
    }
    if (method === "DELETE" && path === `/words/${ADMIN_E2E_WORD_ID}`) {
      word = undefined;
      return route.fulfill({ status: 204, body: "" });
    }

    return json(route, 501, {
      error: `unhandled admin E2E route: ${method} ${path}`
    });
  });

  return {
    requests,
    getWord: () => word,
    count: (method, path) =>
      requests.filter((entry) => entry.method === method && entry.path === path)
        .length
  };
}
