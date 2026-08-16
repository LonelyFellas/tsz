import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProblemDetails } from "@tsz/types";
import { createHttpClient, HttpError } from "./http";

const fetchMock = vi.fn();

// 构造一个最小的 Response 桩。
function jsonResponse(
  body: unknown,
  init: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    contentType?: string;
  } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: new Headers({
      "Content-Type": init.contentType ?? "application/json"
    }),
    json: async () => body,
    // 生产代码成功路径按 text() 解析(兼容 202/空 body),桩也要提供。
    text: async () => (body === undefined ? "" : JSON.stringify(body))
  } as unknown as Response;
}

function problem(overrides: Partial<ProblemDetails> = {}): ProblemDetails {
  return {
    type: "urn:tsz:problem:internal_error",
    title: "Internal server error",
    status: 500,
    detail: "internal error",
    code: "internal_error",
    ...overrides
  };
}

function headwordCandidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    candidate_type: "headword",
    candidate_ref: "candidate:headword:common",
    candidate_word_id: "candidate-word-1",
    surface: "workspace",
    normalized_surface: "workspace",
    dialect: "common",
    entry_kind: "word",
    ...overrides
  };
}

function formCandidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    candidate_type: "form",
    candidate_ref: "candidate:form:workspaces",
    candidate_word_id: "candidate-word-1",
    candidate_node_id: "candidate-form-1",
    surface: "workspaces",
    normalized_surface: "workspaces",
    dialect: "us",
    pos_id: "pos-noun",
    pos: "noun",
    form_type: "plural",
    ...overrides
  };
}

function headwordSourceFixture(overrides: Record<string, unknown> = {}) {
  return {
    source_kind: "headword",
    source_id: "existing-headword-1",
    content_scope: "current_publication",
    surface: "workspace",
    dialect: "common",
    ...overrides
  };
}

function formSourceFixture(overrides: Record<string, unknown> = {}) {
  return {
    source_kind: "form",
    source_id: "existing-form-1",
    source_node_id: "existing-form-node-1",
    content_scope: "draft",
    surface: "workspaces",
    dialect: "uk",
    pos_id: "pos-noun",
    pos: "noun",
    form_type: "plural",
    ...overrides
  };
}

function existingSurfaceMatchFixture(overrides: Record<string, unknown> = {}) {
  return {
    word_id: "existing-word-1",
    headword: "workspace",
    kind: "word",
    status: "published",
    source: headwordSourceFixture(),
    ...overrides
  };
}

function lexiconSurfaceMatchFixture(overrides: Record<string, unknown> = {}) {
  return {
    match_id: "match-1",
    match_category: "exact_headword",
    severity: "warning",
    attention_level: "high",
    can_continue: true,
    confirmation_reasons: ["unacknowledged_surface_matches"],
    candidate: headwordCandidateFixture(),
    existing: existingSurfaceMatchFixture(),
    ...overrides
  };
}

function relationCountsFixture(overrides: Record<string, unknown> = {}) {
  return {
    synonym: 1,
    antonym: 0,
    derivative: 0,
    ...overrides
  };
}

function relationPreviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    source_word_id: "related-word-1",
    source_headword: "workplace",
    relation: "synonym",
    ...overrides
  };
}

function relationSummaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    total: 1,
    by_type: relationCountsFixture(),
    previews: [relationPreviewFixture()],
    truncated: false,
    ...overrides
  };
}

function matchedEntryContextFixture(overrides: Record<string, unknown> = {}) {
  return {
    word_id: "existing-word-1",
    pos_labels: ["noun"],
    gloss_previews: ["a place to work"],
    updated_at: "2026-08-15T10:30:00Z",
    inbound_relations: relationSummaryFixture(),
    ...overrides
  };
}

function surfacePageBaseFixture(overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: "snapshot-1",
    items: [
      lexiconSurfaceMatchFixture(),
      lexiconSurfaceMatchFixture({
        match_id: "match-2",
        match_category: "form_headword",
        attention_level: "normal",
        can_continue: true,
        confirmation_reasons: [
          "unacknowledged_surface_matches",
          "visibility_activation"
        ],
        candidate: formCandidateFixture(),
        existing: existingSurfaceMatchFixture({
          word_id: "existing-word-2",
          headword: "workspaces",
          kind: "phrase",
          status: "archived",
          source: formSourceFixture()
        })
      })
    ],
    total: 2,
    matched_entry_contexts: [
      matchedEntryContextFixture(),
      matchedEntryContextFixture({
        word_id: "existing-word-2",
        pos_labels: [],
        gloss_previews: [],
        inbound_relations: relationSummaryFixture({
          total: 0,
          by_type: relationCountsFixture({ synonym: 0 }),
          previews: [],
          truncated: true
        })
      })
    ],
    confirmation_reasons: [
      "unacknowledged_surface_matches",
      "visibility_activation"
    ],
    policy_name: "allow_new_exact_headword_entries",
    policy_epoch: 7,
    ...overrides
  };
}

function terminalSurfacePageFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...surfacePageBaseFixture(),
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: "surface-token-1",
    impact_confirmation_token: "impact-token-1",
    ...overrides
  };
}

function nextSurfacePageFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...surfacePageBaseFixture(),
    continuation_policy: "enabled",
    next_cursor: "cursor-2",
    ...overrides
  };
}

function disabledSurfacePageFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...surfacePageBaseFixture(),
    continuation_policy: "temporarily_disabled",
    next_cursor: null,
    policy_block_code: "exact_headword_creation_temporarily_disabled",
    ...overrides
  };
}

function surfacePageWithMatch(item: unknown) {
  return terminalSurfacePageFixture({ items: [item], total: 1 });
}

function surfacePageWithContext(context: unknown) {
  return terminalSurfacePageFixture({
    matched_entry_contexts: [context]
  });
}

function surfacePageWithCandidate(candidate: unknown) {
  return surfacePageWithMatch(lexiconSurfaceMatchFixture({ candidate }));
}

function surfacePageWithExisting(existing: unknown) {
  return surfacePageWithMatch(lexiconSurfaceMatchFixture({ existing }));
}

function surfacePageWithSource(source: unknown) {
  return surfacePageWithExisting(existingSurfaceMatchFixture({ source }));
}

function surfacePageWithRelationSummary(inbound_relations: unknown) {
  return surfacePageWithContext(
    matchedEntryContextFixture({ inbound_relations })
  );
}

function surfacePageWithRelationCounts(by_type: unknown) {
  return surfacePageWithRelationSummary(relationSummaryFixture({ by_type }));
}

function surfacePageWithRelationPreview(preview: unknown) {
  return surfacePageWithRelationSummary(
    relationSummaryFixture({ previews: [preview] })
  );
}

async function surfacePageHttpError(
  surface_match_page: unknown
): Promise<HttpError> {
  fetchMock.mockResolvedValueOnce(
    jsonResponse(
      {
        error: "surface match warning",
        code: "surface_matches_changed",
        meta: { surface_match_page }
      },
      { ok: false, status: 409 }
    )
  );
  const http = createHttpClient({ baseUrl: "" });

  try {
    await http.post("/lexicon/entries", {});
    throw new Error("expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
}

function requestHeaders(index = 0): Headers {
  return new Headers(fetchMock.mock.calls[index]![1].headers);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpError", () => {
  it("是 Error 的子类并携带 status", () => {
    const err = new HttpError(404, "not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("HttpError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("not found");
    expect(err.field_issues).toEqual([]);
    expect(err.meta).toBeUndefined();
  });
});

describe("createHttpClient", () => {
  it("get:拼接 baseUrl + path,带默认 Content-Type,返回响应体", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1" }));
    const http = createHttpClient({ baseUrl: "https://api.test" });

    const data = await http.get<{ id: string }>("/users/1");

    expect(data).toEqual({ id: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/users/1");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("get:默认不带 method(走 fetch 默认 GET)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/x");
    expect(fetchMock.mock.calls[0]![1].method).toBeUndefined();
  });

  it("所有请求携带 credentials: include（让浏览器自动发送 refresh cookie）", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/x");
    expect(fetchMock.mock.calls[0]![1].credentials).toBe("include");
  });

  it("有 token 时注入 Authorization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "", getToken: () => "abc" });
    await http.get("/me");
    expect(requestHeaders().get("Authorization")).toBe("Bearer abc");
  });

  it("无 token 时不带 Authorization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/me");
    expect(requestHeaders().has("Authorization")).toBe(false);
  });

  it("getToken 返回 Promise 会被 await", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({
      baseUrl: "",
      getToken: async () => "async-token"
    });
    await http.get("/me");
    expect(requestHeaders().get("Authorization")).toBe("Bearer async-token");
  });

  it("post:method=POST 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const http = createHttpClient({ baseUrl: "" });
    await http.post("/items", { name: "a" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("get/post:把 AbortSignal 原样传给 fetch", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    const controller = new AbortController();

    await http.get("/items", { signal: controller.signal });
    await http.post("/items", { name: "a" }, { signal: controller.signal });

    expect(fetchMock.mock.calls[0]![1].signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[1]![1].signal).toBe(controller.signal);
  });

  it("put:method=PUT 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.put("/items/1", { name: "b" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ name: "b" }));
  });

  it("patch:method=PATCH 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.patch("/me", { display_name: "b" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ display_name: "b" }));
  });

  it("del:method=DELETE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.del("/items/1");
    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE");
    // 无 data 时不带请求体。
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
  });

  it("del:带 data 时序列化为请求体", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.del("/items/1", { channel: "phone", code: "123456" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe(
      JSON.stringify({ channel: "phone", code: "123456" })
    );
  });

  it("204 No Content 返回 undefined", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: async () => {
        throw new Error("no body");
      },
      text: async () => ""
    } as unknown as Response);
    const http = createHttpClient({ baseUrl: "" });
    const result = await http.del("/items/1");
    expect(result).toBeUndefined();
  });

  it("HTTP 非 2xx 抛 HttpError,带 status 与 detail 信息", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(problem({ detail: "서버 오류" }), {
        ok: false,
        status: 500,
        contentType: "application/problem+json"
      })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/boom")).rejects.toMatchObject({
      name: "HttpError",
      status: 500,
      message: "서버 오류"
    });
  });

  it("RFC 9457 响应读取 detail,并保留完整 Problem 元数据", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "urn:tsz:problem:invalid_phone",
          title: "Invalid phone",
          status: 400,
          detail: "phone is invalid",
          code: "invalid_phone",
          field: "phone",
          ignored_extension: true
        },
        { ok: false, status: 400 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.post("/auth/register", {})).rejects.toMatchObject({
      status: 400,
      message: "phone is invalid",
      code: "invalid_phone",
      problem: {
        type: "urn:tsz:problem:invalid_phone",
        title: "Invalid phone",
        status: 400,
        detail: "phone is invalid",
        code: "invalid_phone",
        field: "phone"
      }
    });
  });

  it("application/problem+json 能按最新契约解析", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "urn:tsz:problem:internal_error",
          title: "Internal server error",
          status: 500,
          detail: "internal error",
          code: "internal_error"
        },
        {
          ok: false,
          status: 500,
          contentType: "application/problem+json"
        }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/boom")).rejects.toMatchObject({
      status: 500,
      message: "internal error",
      code: "internal_error",
      problem: {
        type: "urn:tsz:problem:internal_error",
        detail: "internal error"
      }
    });
  });

  it("body.status 与 HTTP 状态不一致时以 HTTP 状态为准且不保存 Problem", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        problem({
          type: "urn:tsz:problem:invalid_token",
          title: "Invalid token",
          status: 401,
          detail: "invalid token",
          code: "invalid_token"
        }),
        {
          ok: false,
          status: 403,
          statusText: "Forbidden",
          contentType: "application/problem+json"
        }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      status: 403,
      message: "invalid token",
      code: "invalid_token",
      problem: undefined
    });
  });

  it.each([0, -1, 400.5, 600])(
    "body.status=%s 非法时拒绝保存 Problem",
    async (bodyStatus) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { ...problem({ status: 400 }), status: bodyStatus },
          {
            ok: false,
            status: 400,
            contentType: "application/problem+json"
          }
        )
      );
      const http = createHttpClient({ baseUrl: "" });

      await expect(http.get("/x")).rejects.toMatchObject({
        status: 400,
        message: "internal error",
        code: "internal_error",
        problem: undefined
      });
    }
  );

  it("detail 只有空白时回退 statusText", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(problem({ status: 500, detail: "  \n " }), {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        contentType: "application/problem+json"
      })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Internal Server Error",
      problem: { detail: "  \n " }
    });
  });

  it("缺少标准字段时回退到 statusText,details 为空数组", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 403, statusText: "Forbidden" })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Forbidden",
      details: []
    });
  });

  it("只有 code、没有可用文案时回退 statusText 且不丢机器错误码", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: "forbidden", detail: "" },
        { ok: false, status: 403, statusText: "Forbidden" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Forbidden",
      code: "forbidden",
      problem: undefined
    });
  });

  it.each([null, [], "error", { detail: 1, title: false, code: 2 }])(
    "畸形错误载荷 %# 安全回退到 statusText",
    async (body) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(body, {
          ok: false,
          status: 502,
          statusText: "Bad Gateway"
        })
      );
      const http = createHttpClient({ baseUrl: "" });

      await expect(http.get("/x")).rejects.toMatchObject({
        message: "Bad Gateway",
        details: [],
        code: undefined,
        problem: undefined
      });
    }
  );

  it("畸形 field 与 details 扩展安全降级", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ...problem({ status: 422 }),
          field: 42,
          details: ["valid", 42]
        },
        { ok: false, status: 422, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      status: 422,
      message: "internal error",
      code: "internal_error",
      details: [],
      problem: undefined
    });
  });

  it("错误响应不是合法 JSON 时安全回退到 statusText", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new SyntaxError("invalid JSON");
      }
    } as unknown as Response);
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Bad Gateway",
      details: [],
      code: undefined,
      problem: undefined
    });
  });

  it("422 Problem 可携带 details 扩展逐条违规", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ...problem({
            type: "urn:tsz:problem:invalid_request_body",
            title: "Request validation failed",
            status: 422,
            detail: "word is incomplete",
            code: "invalid_request_body"
          }),
          details: ["frequency is required", "pos verb: at least one sense"]
        },
        { ok: false, status: 422, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.post("/words/w-1/publish")).rejects.toMatchObject({
      status: 422,
      message: "word is incomplete",
      details: ["frequency is required", "pos verb: at least one sense"]
    });
  });

  it("V2 结构化错误保留 code、field_issues 与 meta", async () => {
    const fieldIssue = {
      step: "meanings" as const,
      node_id: "sense-1",
      field: "definitions",
      code: "native_definition_required",
      message: "至少填写一条本语言释义",
      reference_location: {
        source_entry_id: "source-entry-1",
        source_publication_id: "source-publication-1",
        source_node_id: "source-node-1",
        reference_kind: "definition"
      }
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "word step is invalid",
          code: "validation_failed",
          field_issues: [fieldIssue],
          meta: {
            current_revision: 6,
            current_lifecycle_revision: 2,
            word_id: "w-2",
            max_reachable_step: "meanings",
            affected_node_ids: ["sense-1"],
            usage_count: 3,
            part_of_speech_id: "pos-noun",
            code: "noun",
            reference_locations: [
              {
                target_sense_id: "target-sense-1",
                source_entry_id: "source-entry-1",
                source_publication_id: "source-publication-1",
                source_node_id: "source-node-1",
                reference_kind: "definition"
              }
            ]
          }
        },
        { ok: false, status: 422 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(
      http.put("/words/w-2/steps/meanings", {})
    ).rejects.toMatchObject({
      status: 422,
      message: "word step is invalid",
      code: "validation_failed",
      details: [],
      field_issues: [fieldIssue],
      meta: {
        current_revision: 6,
        current_lifecycle_revision: 2,
        word_id: "w-2",
        max_reachable_step: "meanings",
        affected_node_ids: ["sense-1"],
        usage_count: 3,
        part_of_speech_id: "pos-noun",
        code: "noun",
        reference_locations: [
          {
            target_sense_id: "target-sense-1",
            source_entry_id: "source-entry-1",
            source_publication_id: "source-publication-1",
            source_node_id: "source-node-1",
            reference_kind: "definition"
          }
        ]
      }
    });
  });

  it("RFC 9457 ProblemDetails 与 HttpError 共享同一份通用 meta", async () => {
    const meta = {
      current_revision: 6,
      usage_count: 3,
      part_of_speech_id: "019f0000-0000-7000-8000-000000000001",
      code: "noun"
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ...problem({
            type: "urn:tsz:problem:part_of_speech_in_use",
            title: "Part of speech is in use",
            status: 409,
            detail: "part of speech is referenced",
            code: "part_of_speech_in_use"
          }),
          meta
        },
        { ok: false, status: 409, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(
      http.del("/settings/parts-of-speech/pos-1?base_revision=5")
    ).rejects.toMatchObject({
      status: 409,
      code: "part_of_speech_in_use",
      meta,
      problem: { meta }
    });
  });

  it("通用 ProblemMeta 继续保留词条错误上下文", async () => {
    const meta = {
      current_revision: 8,
      word_id: "word-1",
      max_reachable_step: "meanings",
      affected_node_ids: ["sense-1"]
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ...problem({
            type: "urn:tsz:problem:revision_conflict",
            title: "Revision conflict",
            status: 409,
            detail: "word changed",
            code: "revision_conflict"
          }),
          meta
        },
        { ok: false, status: 409, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(
      http.put("/words/word-1/steps/forms", {})
    ).rejects.toMatchObject({
      meta,
      problem: { meta }
    });
  });

  it("ProblemMeta 保留结构化 surface terminal page 与当前 policy", async () => {
    const surface_match_page = terminalSurfacePageFixture();
    const meta = {
      surface_match_page,
      current_policy_name: "allow_new_exact_headword_entries",
      current_policy_epoch: 7
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ...problem({
            type: "urn:tsz:problem:surface_matches_changed",
            title: "Surface matches changed",
            status: 409,
            detail: "surface matches changed",
            code: "surface_matches_changed"
          }),
          meta
        },
        { ok: false, status: 409, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.post("/lexicon/entries", {})).rejects.toMatchObject({
      status: 409,
      code: "surface_matches_changed",
      meta,
      problem: { meta }
    });
  });

  it.each([
    ["enabled 中页", nextSurfacePageFixture()],
    [
      "enabled 末页无可选 impact token",
      (() => {
        const page = terminalSurfacePageFixture();
        Reflect.deleteProperty(page, "impact_confirmation_token");
        return page;
      })()
    ],
    ["disabled 末页", disabledSurfacePageFixture()],
    [
      "disabled 中页",
      disabledSurfacePageFixture({
        next_cursor: "cursor-2",
        policy_block_code:
          "multiple_active_exact_headword_publications_not_enabled"
      })
    ],
    [
      "headword candidate 无可选 word_id",
      (() => {
        const candidate = headwordCandidateFixture();
        Reflect.deleteProperty(candidate, "candidate_word_id");
        return nextSurfacePageFixture({
          items: [lexiconSurfaceMatchFixture({ candidate })],
          total: 1
        });
      })()
    ]
  ])("ProblemMeta 保留合法 surface page：%s", async (_name, page) => {
    const error = await surfacePageHttpError(page);
    expect(error.meta).toEqual({ surface_match_page: page });
  });

  it.each([
    ["page 非对象", null],
    ["page 多余字段", terminalSurfacePageFixture({ unexpected: true })],
    ["snapshot_id 非空", terminalSurfacePageFixture({ snapshot_id: " " })],
    ["items 必须为数组", terminalSurfacePageFixture({ items: "matches" })],
    ["items minItems=1", terminalSurfacePageFixture({ items: [] })],
    [
      "items maxItems=50",
      terminalSurfacePageFixture({
        items: Array.from({ length: 51 }, () => lexiconSurfaceMatchFixture())
      })
    ],
    ["items 元素完整", surfacePageWithMatch(null)],
    ["total 非负整数", terminalSurfacePageFixture({ total: -1 })],
    [
      "matched_entry_contexts 必须为数组",
      terminalSurfacePageFixture({ matched_entry_contexts: "contexts" })
    ],
    [
      "matched_entry_contexts minItems=1",
      terminalSurfacePageFixture({ matched_entry_contexts: [] })
    ],
    [
      "matched_entry_contexts maxItems=50",
      terminalSurfacePageFixture({
        matched_entry_contexts: Array.from({ length: 51 }, () =>
          matchedEntryContextFixture()
        )
      })
    ],
    ["matched_entry_contexts 元素完整", surfacePageWithContext(null)],
    [
      "page confirmation_reasons 必须为数组",
      terminalSurfacePageFixture({ confirmation_reasons: "reason" })
    ],
    [
      "page confirmation_reasons minItems=1",
      terminalSurfacePageFixture({ confirmation_reasons: [] })
    ],
    [
      "page confirmation_reasons maxItems=2",
      terminalSurfacePageFixture({
        confirmation_reasons: [
          "unacknowledged_surface_matches",
          "visibility_activation",
          "unacknowledged_surface_matches"
        ]
      })
    ],
    [
      "page confirmation_reasons 枚举",
      terminalSurfacePageFixture({ confirmation_reasons: ["unknown"] })
    ],
    [
      "page confirmation_reasons 去重",
      terminalSurfacePageFixture({
        confirmation_reasons: [
          "unacknowledged_surface_matches",
          "unacknowledged_surface_matches"
        ]
      })
    ],
    ["policy_name 枚举", terminalSurfacePageFixture({ policy_name: "old" })],
    ["policy_epoch 非负整数", terminalSurfacePageFixture({ policy_epoch: -1 })],
    [
      "continuation_policy 枚举",
      terminalSurfacePageFixture({ continuation_policy: "legacy" })
    ],
    ["enabled 中页 cursor 非空", nextSurfacePageFixture({ next_cursor: "" })],
    [
      "enabled 中页不能携带 terminal token",
      nextSurfacePageFixture({ surface_confirmation_token: "token-1" })
    ],
    [
      "enabled 末页 next_cursor 必须为 null",
      terminalSurfacePageFixture({ next_cursor: 1 })
    ],
    [
      "enabled 末页 surface token 非空",
      terminalSurfacePageFixture({ surface_confirmation_token: " " })
    ],
    [
      "enabled 末页 impact token 非空",
      terminalSurfacePageFixture({ impact_confirmation_token: "" })
    ],
    [
      "disabled cursor 必须为 null 或非空字符串",
      disabledSurfacePageFixture({ next_cursor: "" })
    ],
    [
      "disabled cursor 不能是其他类型",
      disabledSurfacePageFixture({ next_cursor: 1 })
    ],
    [
      "disabled policy_block_code 枚举",
      disabledSurfacePageFixture({ policy_block_code: "legacy_block" })
    ],
    [
      "disabled page 不能携带确认 token",
      disabledSurfacePageFixture({ surface_confirmation_token: "token-1" })
    ],
    ["match 非对象", surfacePageWithMatch("match")],
    [
      "match 多余字段",
      surfacePageWithMatch(lexiconSurfaceMatchFixture({ unexpected: true }))
    ],
    [
      "match_id 非空",
      surfacePageWithMatch(lexiconSurfaceMatchFixture({ match_id: "" }))
    ],
    [
      "match_category 枚举",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({ match_category: "substring" })
      )
    ],
    [
      "severity 固定 warning",
      surfacePageWithMatch(lexiconSurfaceMatchFixture({ severity: "error" }))
    ],
    [
      "attention_level 枚举",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({ attention_level: "low" })
      )
    ],
    [
      "can_continue 固定为 true",
      surfacePageWithMatch(lexiconSurfaceMatchFixture({ can_continue: false }))
    ],
    [
      "match confirmation_reasons 必须为数组",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({ confirmation_reasons: "reason" })
      )
    ],
    [
      "match confirmation_reasons minItems=1",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({ confirmation_reasons: [] })
      )
    ],
    [
      "match confirmation_reasons maxItems=2",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({
          confirmation_reasons: [
            "unacknowledged_surface_matches",
            "visibility_activation",
            "visibility_activation"
          ]
        })
      )
    ],
    [
      "match confirmation_reasons 枚举",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({ confirmation_reasons: ["legacy"] })
      )
    ],
    [
      "match confirmation_reasons 去重",
      surfacePageWithMatch(
        lexiconSurfaceMatchFixture({
          confirmation_reasons: [
            "visibility_activation",
            "visibility_activation"
          ]
        })
      )
    ],
    ["candidate 非对象", surfacePageWithCandidate(null)],
    ["candidate_type 枚举", surfacePageWithCandidate({ candidate_type: "x" })],
    [
      "headword candidate 多余字段",
      surfacePageWithCandidate(headwordCandidateFixture({ unexpected: true }))
    ],
    ...["candidate_ref", "surface", "normalized_surface"].map(
      (field) =>
        [
          `headword candidate ${field} 非空`,
          surfacePageWithCandidate(headwordCandidateFixture({ [field]: " " }))
        ] as const
    ),
    [
      "headword candidate 可选 word_id 非空",
      surfacePageWithCandidate(
        headwordCandidateFixture({ candidate_word_id: "" })
      )
    ],
    [
      "headword candidate dialect 枚举",
      surfacePageWithCandidate(headwordCandidateFixture({ dialect: "au" }))
    ],
    [
      "headword candidate entry_kind 枚举",
      surfacePageWithCandidate(
        headwordCandidateFixture({ entry_kind: "sentence" })
      )
    ],
    [
      "form candidate 多余字段",
      surfacePageWithCandidate(formCandidateFixture({ unexpected: true }))
    ],
    ...[
      "candidate_ref",
      "candidate_word_id",
      "candidate_node_id",
      "surface",
      "normalized_surface",
      "pos_id",
      "pos",
      "form_type"
    ].map(
      (field) =>
        [
          `form candidate ${field} 非空`,
          surfacePageWithCandidate(formCandidateFixture({ [field]: "" }))
        ] as const
    ),
    [
      "form candidate dialect 枚举",
      surfacePageWithCandidate(formCandidateFixture({ dialect: "au" }))
    ],
    [
      "form candidate form_type 枚举",
      surfacePageWithCandidate(formCandidateFixture({ form_type: "future" }))
    ],
    ["existing 非对象", surfacePageWithExisting(null)],
    [
      "existing 多余字段",
      surfacePageWithExisting(existingSurfaceMatchFixture({ unexpected: true }))
    ],
    ...["word_id", "headword"].map(
      (field) =>
        [
          `existing ${field} 非空`,
          surfacePageWithExisting(existingSurfaceMatchFixture({ [field]: " " }))
        ] as const
    ),
    [
      "existing kind 枚举",
      surfacePageWithExisting(existingSurfaceMatchFixture({ kind: "sentence" }))
    ],
    [
      "existing status 枚举",
      surfacePageWithExisting(
        existingSurfaceMatchFixture({ status: "deleted" })
      )
    ],
    ["source 非对象", surfacePageWithSource(null)],
    ["source_kind 枚举", surfacePageWithSource({ source_kind: "legacy" })],
    [
      "headword source 多余字段",
      surfacePageWithSource(headwordSourceFixture({ unexpected: true }))
    ],
    ...["source_id", "surface"].map(
      (field) =>
        [
          `headword source ${field} 非空`,
          surfacePageWithSource(headwordSourceFixture({ [field]: "" }))
        ] as const
    ),
    [
      "headword source content_scope 枚举",
      surfacePageWithSource(
        headwordSourceFixture({ content_scope: "publication" })
      )
    ],
    [
      "headword source dialect 枚举",
      surfacePageWithSource(headwordSourceFixture({ dialect: "au" }))
    ],
    [
      "form source 多余字段",
      surfacePageWithSource(formSourceFixture({ unexpected: true }))
    ],
    ...[
      "source_id",
      "source_node_id",
      "surface",
      "pos_id",
      "pos",
      "form_type"
    ].map(
      (field) =>
        [
          `form source ${field} 非空`,
          surfacePageWithSource(formSourceFixture({ [field]: " " }))
        ] as const
    ),
    [
      "form source content_scope 枚举",
      surfacePageWithSource(formSourceFixture({ content_scope: "publication" }))
    ],
    [
      "form source dialect 枚举",
      surfacePageWithSource(formSourceFixture({ dialect: "au" }))
    ],
    [
      "form source form_type 枚举",
      surfacePageWithSource(formSourceFixture({ form_type: "future" }))
    ],
    ["context 非对象", surfacePageWithContext(null)],
    [
      "context 多余字段",
      surfacePageWithContext(matchedEntryContextFixture({ unexpected: true }))
    ],
    [
      "context word_id 非空",
      surfacePageWithContext(matchedEntryContextFixture({ word_id: "" }))
    ],
    [
      "pos_labels 必须为数组",
      surfacePageWithContext(matchedEntryContextFixture({ pos_labels: "noun" }))
    ],
    [
      "pos_labels maxItems=5",
      surfacePageWithContext(
        matchedEntryContextFixture({ pos_labels: Array(6).fill("noun") })
      )
    ],
    [
      "pos_labels 元素非空",
      surfacePageWithContext(matchedEntryContextFixture({ pos_labels: [""] }))
    ],
    [
      "gloss_previews 必须为数组",
      surfacePageWithContext(
        matchedEntryContextFixture({ gloss_previews: "gloss" })
      )
    ],
    [
      "gloss_previews maxItems=5",
      surfacePageWithContext(
        matchedEntryContextFixture({
          gloss_previews: Array(6).fill("a place to work")
        })
      )
    ],
    [
      "gloss_previews 元素非空",
      surfacePageWithContext(
        matchedEntryContextFixture({ gloss_previews: [" "] })
      )
    ],
    [
      "updated_at 非空",
      surfacePageWithContext(matchedEntryContextFixture({ updated_at: "" }))
    ],
    [
      "updated_at 符合 date-time 格式",
      surfacePageWithContext(
        matchedEntryContextFixture({ updated_at: "2026-08-15" })
      )
    ],
    [
      "updated_at 是有效时间",
      surfacePageWithContext(
        matchedEntryContextFixture({ updated_at: "2026-99-99T99:99:99Z" })
      )
    ],
    ["relation summary 非对象", surfacePageWithRelationSummary(null)],
    [
      "relation summary 多余字段",
      surfacePageWithRelationSummary(
        relationSummaryFixture({ unexpected: true })
      )
    ],
    [
      "relation total 非负整数",
      surfacePageWithRelationSummary(relationSummaryFixture({ total: -1 }))
    ],
    ["relation counts 非对象", surfacePageWithRelationCounts(null)],
    [
      "relation counts 多余字段",
      surfacePageWithRelationCounts(relationCountsFixture({ unexpected: true }))
    ],
    ...["synonym", "antonym", "derivative"].map(
      (field) =>
        [
          `relation counts ${field} 非负整数`,
          surfacePageWithRelationCounts(relationCountsFixture({ [field]: -1 }))
        ] as const
    ),
    [
      "relation previews 必须为数组",
      surfacePageWithRelationSummary(
        relationSummaryFixture({ previews: "preview" })
      )
    ],
    [
      "relation previews maxItems=5",
      surfacePageWithRelationSummary(
        relationSummaryFixture({
          previews: Array.from({ length: 6 }, () => relationPreviewFixture())
        })
      )
    ],
    ["relation preview 非对象", surfacePageWithRelationPreview(null)],
    [
      "relation preview 多余字段",
      surfacePageWithRelationPreview(
        relationPreviewFixture({ unexpected: true })
      )
    ],
    ...["source_word_id", "source_headword"].map(
      (field) =>
        [
          `relation preview ${field} 非空`,
          surfacePageWithRelationPreview(
            relationPreviewFixture({ [field]: "" })
          )
        ] as const
    ),
    [
      "relation preview relation 枚举",
      surfacePageWithRelationPreview(
        relationPreviewFixture({ relation: "association" })
      )
    ],
    [
      "relation truncated 布尔值",
      surfacePageWithRelationSummary(
        relationSummaryFixture({ truncated: "false" })
      )
    ]
  ] as ReadonlyArray<readonly [string, unknown]>)(
    "surface page 畸形时 meta 安全降级：%s",
    async (_name, surface_match_page) => {
      const error = await surfacePageHttpError(surface_match_page);
      expect(error.meta).toBeUndefined();
    }
  );

  it.each([
    { usage_count: -1 },
    { current_lifecycle_revision: -1 },
    { part_of_speech_id: " " },
    { code: "" },
    { word_id: "" },
    { max_reachable_step: "done" },
    { affected_node_ids: [""] },
    { reference_locations: [{ source_entry_id: "source-entry-1" }] },
    { current_policy_name: "unknown_policy" },
    { current_policy_epoch: -1 },
    {
      surface_match_page: {
        snapshot_id: "snapshot-1",
        items: [],
        total: 0,
        matched_entry_contexts: [],
        confirmation_reasons: [],
        policy_name: "allow_new_exact_headword_entries",
        policy_epoch: 1,
        continuation_policy: "enabled",
        next_cursor: null
      }
    }
  ])("词性配置错误的畸形 meta 安全降级: %o", async (meta) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "invalid configuration meta",
          code: "part_of_speech_in_use",
          meta
        },
        { ok: false, status: 409 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/settings/parts-of-speech")).rejects.toMatchObject({
      status: 409,
      meta: undefined
    });
  });

  it("畸形 V2 field_issues 与 meta 安全降级，不把外部输入伪装成已校验类型", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "word step is invalid",
          code: "validation_failed",
          field_issues: [{ step: "preview" }],
          meta: { current_revision: -1 }
        },
        { ok: false, status: 422 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/words/w-2")).rejects.toMatchObject({
      status: 422,
      message: "word step is invalid",
      code: "validation_failed",
      field_issues: [],
      meta: undefined
    });
  });

  it("畸形 reference_location 会丢弃整组 field_issues", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "word reference is invalid",
          code: "validation_failed",
          field_issues: [
            {
              step: "meanings",
              node_id: "sense-1",
              field: "definitions",
              code: "reference_unavailable",
              message: "引用目标不可用",
              reference_location: { source_entry_id: "source-entry-1" }
            }
          ]
        },
        { ok: false, status: 422 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/words/w-2")).rejects.toMatchObject({
      status: 422,
      field_issues: []
    });
  });

  it.each([
    [
      "record",
      {
        "Content-Type": "application/problem+json",
        "Idempotency-Key": "command-1"
      }
    ],
    [
      "Headers",
      new Headers({
        "Content-Type": "application/problem+json",
        "Idempotency-Key": "command-1"
      })
    ],
    [
      "tuple array",
      [
        ["Content-Type", "application/problem+json"],
        ["Idempotency-Key", "command-1"]
      ] as [string, string][]
    ]
  ] satisfies [string, HeadersInit][])(
    "init.headers 支持 %s 并可覆盖/追加请求头",
    async (_label, headers) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null));
      const http = createHttpClient({ baseUrl: "" });
      await http.post("/x", { a: 1 }, { headers });

      expect(requestHeaders().get("Content-Type")).toBe(
        "application/problem+json"
      );
      expect(requestHeaders().get("Idempotency-Key")).toBe("command-1");
    }
  );

  it("skipAuth 时不附加 Authorization（即使有 token）", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "", getToken: () => "stale" });
    await http.post("/auth/login", {}, { skipAuth: true });
    expect(requestHeaders().has("Authorization")).toBe(false);
  });

  it("401 无 token 时直接抛 HttpError，不触发 onRefresh", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        problem({
          type: "urn:tsz:problem:invalid_credentials",
          title: "Invalid credentials",
          status: 401,
          detail: "invalid credentials",
          code: "invalid_credentials"
        }),
        { ok: false, status: 401, contentType: "application/problem+json" }
      )
    );
    const onRefresh = vi.fn();
    const http = createHttpClient({ baseUrl: "", onRefresh });

    await expect(http.post("/auth/login", {})).rejects.toMatchObject({
      status: 401,
      message: "invalid credentials"
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("401 有 token 时触发 onRefresh，并在重试中保留幂等头", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          problem({
            type: "urn:tsz:problem:invalid_token",
            title: "Invalid token",
            status: 401,
            detail: "invalid or expired token",
            code: "invalid_token"
          }),
          { ok: false, status: 401, contentType: "application/problem+json" }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ id: "1" }));

    let token = "old-token";
    const onRefresh = vi.fn().mockImplementation(async () => {
      token = "new-token";
      return token;
    });
    const http = createHttpClient({
      baseUrl: "",
      getToken: () => token,
      onRefresh
    });

    const data = await http.post(
      "/lexicon/entries",
      { schema_version: 2 },
      { headers: { "Idempotency-Key": "command-2" } }
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ id: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
        "command-2"
      );
    }
    expect(requestHeaders(1).get("Authorization")).toBe("Bearer new-token");
  });

  it("DELETE 可禁用 401 自动刷新，避免高风险请求被重放", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        problem({
          type: "urn:tsz:problem:invalid_account_deletion_code",
          title: "Invalid account deletion code",
          status: 401,
          detail: "invalid account deletion code",
          code: "invalid_account_deletion_code"
        }),
        { ok: false, status: 401, contentType: "application/problem+json" }
      )
    );
    const onRefresh = vi.fn();
    const http = createHttpClient({
      baseUrl: "",
      getToken: () => "access-token",
      onRefresh
    });

    await expect(
      http.del(
        "/auth/account",
        { channel: "phone", code: "000000" },
        { retryOnUnauthorized: false }
      )
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_account_deletion_code"
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("RFC 9457 的 403 触发 onForbidden(code) 且仍抛 HttpError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "urn:tsz:problem:must_change_password",
          title: "Password change required",
          status: 403,
          detail: "password change required",
          code: "must_change_password"
        },
        { ok: false, status: 403 }
      )
    );
    const onForbidden = vi.fn();
    const http = createHttpClient({ baseUrl: "", onForbidden });

    await expect(http.get("/words")).rejects.toMatchObject({
      status: 403,
      message: "password change required",
      code: "must_change_password"
    });
    expect(onForbidden).toHaveBeenCalledWith("must_change_password");
  });

  it("403 无 code：onForbidden 收到 undefined", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: "urn:tsz:problem:account_disabled",
          title: "Account disabled",
          status: 403,
          detail: "account disabled"
        },
        { ok: false, status: 403, contentType: "application/problem+json" }
      )
    );
    const onForbidden = vi.fn();
    const http = createHttpClient({ baseUrl: "", onForbidden });

    await expect(http.get("/x")).rejects.toMatchObject({
      status: 403,
      code: undefined
    });
    expect(onForbidden).toHaveBeenCalledWith(undefined);
  });

  it("非 403 错误不触发 onForbidden", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(problem({ detail: "boom" }), {
        ok: false,
        status: 500,
        contentType: "application/problem+json"
      })
    );
    const onForbidden = vi.fn();
    const http = createHttpClient({ baseUrl: "", onForbidden });

    await expect(http.get("/x")).rejects.toMatchObject({ status: 500 });
    expect(onForbidden).not.toHaveBeenCalled();
  });

  it("未传 onForbidden 时 403 仍正常抛 HttpError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        problem({
          type: "urn:tsz:problem:forbidden",
          title: "Forbidden",
          status: 403,
          detail: "forbidden",
          code: "forbidden"
        }),
        { ok: false, status: 403, contentType: "application/problem+json" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({ status: 403 });
  });

  it("onRefresh 失败时调 onSessionExpired 并抛错", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        problem({
          type: "urn:tsz:problem:invalid_token",
          title: "Invalid token",
          status: 401,
          detail: "invalid or expired token",
          code: "invalid_token"
        }),
        { ok: false, status: 401, contentType: "application/problem+json" }
      )
    );
    const onRefresh = vi.fn().mockRejectedValue(new Error("refresh failed"));
    const onSessionExpired = vi.fn();
    const http = createHttpClient({
      baseUrl: "",
      getToken: () => "tok",
      onRefresh,
      onSessionExpired
    });

    await expect(http.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("网络失败保留原异常,不伪装成 HttpError", async () => {
    const networkError = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(networkError);
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toBe(networkError);
  });
});
