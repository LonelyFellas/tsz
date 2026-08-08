import type { Page, Route } from "@playwright/test";

export const ADMIN_E2E_WORD_ID = "e2e-word-center";

const ADMIN_PROFILE = {
  id: "admin-e2e",
  phone: "13800138000",
  display_name: "E2E Admin",
  role: "admin",
  permissions: ["words.access"]
};

const NOW = "2026-08-02T03:00:00.000Z";
const PUBLISHED_AT = "2026-08-02T03:10:00.000Z";

const richText = (text: string) => ({
  version: 1,
  text,
  spans: [],
  liaisons: []
});

const pronunciation = (id: string, phonetic: string) => ({
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
};

const CENTER_MEANINGS = {
  sense_groups: [],
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
          frequency: "12.24",
          depends_on_context: false,
          definitions: [
            {
              id: "definition-1",
              level: "A1",
              definition_mode: "zh_definition",
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
                    value: richText("He walked to the centre of the circle."),
                    origin: "manual"
                  }
                },
                us: {
                  state: "ready",
                  variant: {
                    value: richText("He walked to the center of the circle."),
                    origin: "manual"
                  }
                }
              },
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
};

type MockWord = Record<string, unknown> & {
  id: string;
  revision: number;
  status: "draft" | "published";
  forms: typeof CENTER_FORMS;
  meanings: typeof CENTER_MEANINGS;
  completed_steps: string[];
  max_reachable_step: "basics" | "forms" | "meanings" | "preview";
};

export interface AdminApiRequestLog {
  method: string;
  path: string;
  body?: unknown;
}

export interface MockAdminApiOptions {
  /** 让本次检测命中智能词库重复项。 */
  duplicate?: boolean;
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
    updated_at: NOW
  };
}

function detectionResponse(duplicate: boolean, rawHeadword: string) {
  const isDuplicate = duplicate || rawHeadword.trim().toLowerCase() === "color";
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
            { word_id: "existing-colour", headword: "colour", dialect: "uk" },
            { word_id: "existing-color", headword: "color", dialect: "us" }
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
    max_reachable_step: word.max_reachable_step,
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

  await page.route("**/api/v1/admin/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace(
      /^.*\/api\/v1\/admin/,
      ""
    );
    const body = requestBody(route);
    requests.push({ method, path, body });

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
    if (method === "GET" && path === "/words") {
      const words = word ? [listItem(word)] : [];
      return json(route, 200, {
        words,
        page: { page: 1, page_size: 20, total: words.length }
      });
    }
    if (method === "GET" && path === "/words/stats") {
      const count = word ? 1 : 0;
      return json(route, 200, { total: count, today: count, month: count });
    }
    if (method === "POST" && path === "/words/detect") {
      const input = body as { headword?: string } | undefined;
      return json(
        route,
        200,
        detectionResponse(options.duplicate === true, input?.headword ?? "")
      );
    }
    if (method === "POST" && path === "/words") {
      const input = body as { headwords?: unknown } | undefined;
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
      path === `/words/${ADMIN_E2E_WORD_ID}/steps/forms/impact`
    ) {
      return json(route, 200, {
        base_revision: word?.revision ?? 1,
        requires_confirmation: false,
        affected: []
      });
    }
    if (
      method === "PUT" &&
      path === `/words/${ADMIN_E2E_WORD_ID}/steps/forms`
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
      path === `/words/${ADMIN_E2E_WORD_ID}/steps/meanings`
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
    if (method === "POST" && path === `/words/${ADMIN_E2E_WORD_ID}/validate`) {
      return json(route, 200, {
        validated_revision: word?.revision ?? 1,
        valid: true,
        issues: []
      });
    }
    if (method === "POST" && path === `/words/${ADMIN_E2E_WORD_ID}/publish`) {
      if (!word) return json(route, 404, { error: "word not found" });
      word = {
        ...word,
        status: "published",
        revision: word.revision + 1,
        max_reachable_step: "preview",
        published_at: PUBLISHED_AT,
        updated_at: PUBLISHED_AT
      };
      return json(route, 200, { word: clone(word) });
    }
    if (method === "GET" && path === `/words/${ADMIN_E2E_WORD_ID}`) {
      return word
        ? json(route, 200, { word: clone(word) })
        : json(route, 404, { error: "word not found" });
    }
    if (method === "GET" && path === "/words/related-search") {
      return json(route, 200, { results: [] });
    }
    if (method === "POST" && path === "/words/dialect-variants") {
      return json(route, 200, { suggestions: [] });
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
