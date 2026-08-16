import type { Page, Route } from "@playwright/test";
import type {
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  PartOfSpeechCatalogResponse,
  RichText,
  WordPronunciationV2
} from "@tsz/types";

export const ADMIN_E2E_WORD_ID = "e2e-word-center";
export const ADMIN_E2E_LEXICON_PATH = "/lexicon";
export const ADMIN_E2E_ENTRIES_PATH = `${ADMIN_E2E_LEXICON_PATH}/entries`;
export const ADMIN_E2E_DETECTIONS_PATH = `${ADMIN_E2E_LEXICON_PATH}/detections`;

const ADMIN_PROFILE = {
  id: "admin-e2e",
  phone: "13800138000",
  display_name: "E2E Admin",
  role: "admin",
  permissions: ["words.access"]
};

const NOW = "2026-08-02T03:00:00.000Z";
const PUBLISHED_AT = "2026-08-02T03:10:00.000Z";

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
      pos_id: "pos-noun",
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
                  id: "noun-plural-uk",
                  dialect: "uk",
                  spelling: "centres",
                  origin: "dictionary",
                  pronunciations: [pronunciation("pron-plural-uk", "ˈsentəz")]
                },
                {
                  id: "noun-plural-us",
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
      pos_id: "pos-noun",
      grammar_structures: [
        {
          id: "grammar-1",
          variants: [
            { id: "grammar-uk", dialect: "uk", content: richText("a centre") },
            { id: "grammar-us", dialect: "us", content: richText("a center") }
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
              en_text: {
                mode: "distinguish",
                source_dialect: "us",
                uk: {
                  state: "ready",
                  variant: {
                    id: "sentence-1-uk",
                    value: richText("He walked to the centre of the circle."),
                    origin: "manual"
                  }
                },
                us: {
                  state: "ready",
                  variant: {
                    id: "sentence-1-us",
                    value: richText("He walked to the center of the circle."),
                    origin: "manual"
                  }
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
  /** 让本次检测命中智能词库重复项。 */
  duplicate?: boolean;
  /** 为 workspace/workspaces 返回可确认的 surface warning 与两页 snapshot。 */
  surfaceWarnings?: boolean;
  /** 第一次携 token 创建返回结构化 410，用于验证 snapshot 过期恢复。 */
  expireSurfaceSnapshotOnce?: boolean;
  /** 第一次 forms 保存返回 500，后续重试成功。 */
  failFormsSaveOnce?: boolean;
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

function createDraft(headwords: unknown): MockWord {
  return {
    schema_version: 2,
    id: ADMIN_E2E_WORD_ID,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    headwords,
    detection_snapshot: {
      detection_id: "detect-center",
      request: { language: "en", headword: "center" },
      normalized_headword: "center",
      entry_kind: "word",
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

function surfaceMatchItem(
  rawHeadword: string,
  wordId: string,
  status: "draft" | "published" | "archived",
  sourceKind: "headword" | "form"
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
      entry_kind: "word"
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
              source_node_id: `${wordId}-plural`,
              content_scope: "current_publication",
              surface: "workspaces",
              dialect: "common",
              pos_id: `${wordId}-noun`,
              pos: "noun",
              form_type: "plural"
            }
    }
  };
}

function surfacePage(rawHeadword: string, terminal: boolean) {
  const plural = rawHeadword.trim().toLowerCase() === "workspaces";
  const items = terminal
    ? [
        surfaceMatchItem(
          rawHeadword,
          "existing-workspace-archived-b",
          "archived",
          plural ? "form" : "headword"
        )
      ]
    : [
        surfaceMatchItem(
          rawHeadword,
          "existing-workspace-archived-a",
          "archived",
          plural ? "form" : "headword"
        ),
        surfaceMatchItem(
          rawHeadword,
          "existing-workspace-published",
          "published",
          plural ? "form" : "headword"
        )
      ];
  return {
    snapshot_id: `snapshot-${rawHeadword}`,
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
            source_word_id: "relation-source-word",
            source_headword: "space",
            relation: "synonym"
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
}

function detectionResponse(
  duplicate: boolean,
  rawHeadword: string,
  surfaceWarnings = false
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
      entry_kind: "word",
      matched_dialect: "common",
      builtin_dictionary: {
        status: "matched",
        headwords: { mode: "unified", common: rawHeadword },
        suggested_forms: clone(CENTER_FORMS)
      },
      smart_dictionary: {
        status: "warning",
        duplicates: [],
        surface_match_page: surfacePage(rawHeadword, false),
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
    entry_kind: "word",
    matched_dialect: "us",
    builtin_dictionary: {
      status: "matched",
      headwords,
      suggested_forms: clone(CENTER_FORMS)
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
  return {
    schema_version: 2,
    id: word.id,
    headword: "center",
    kind: "word",
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
  let word: MockWord | undefined;
  let formsFailureRemaining = options.failFormsSaveOnce ? 1 : 0;
  let surfaceSnapshotExpiryRemaining = options.expireSurfaceSnapshotOnce
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
      const words = word ? [listItem(word)] : [];
      return json(route, 200, {
        words,
        page: { page: 1, page_size: 20, total: words.length }
      });
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
          options.surfaceWarnings === true
        )
      );
    }
    if (
      method === "GET" &&
      path.startsWith(`${ADMIN_E2E_LEXICON_PATH}/surface-match-snapshots/`)
    ) {
      const snapshotId = path.split("/").at(-1) ?? "";
      const rawHeadword = snapshotId.replace(/^snapshot-/, "");
      if (
        !["workspace", "workspaces"].includes(rawHeadword) ||
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
      return json(route, 200, surfacePage(rawHeadword, true));
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
        const page = surfacePage(rawHeadword, false);
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
        }
      );
      return json(route, 201, { word: clone(word) });
    }
    if (
      method === "POST" &&
      path ===
        `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms/impact`
    ) {
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
        | { content?: typeof CENTER_FORMS; intent?: "save" | "complete" }
        | undefined;
      if (!word) return json(route, 404, { error: "word not found" });
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
        ? json(route, 200, { word: clone(word) })
        : json(route, 404, { error: "word not found" });
    }
    if (
      method === "GET" &&
      path === `${ADMIN_E2E_ENTRIES_PATH}/related-search`
    ) {
      return json(route, 200, { results: [] });
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
