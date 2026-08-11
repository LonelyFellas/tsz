import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProblemDetails } from "@tsz/types";
import { createHttpClient, HttpError, isIncompleteHttpError } from "./http";

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

  it("isIncompleteHttpError:仅 422 的 HttpError 命中,其余错误不命中", () => {
    expect(
      isIncompleteHttpError(new HttpError(422, "incomplete", ["v1"]))
    ).toBe(true);
    expect(isIncompleteHttpError(new HttpError(409, "conflict"))).toBe(false);
    expect(isIncompleteHttpError(new Error("boom"))).toBe(false);
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

  it.each([
    { usage_count: -1 },
    { current_lifecycle_revision: -1 },
    { part_of_speech_id: " " },
    { code: "" },
    { word_id: "" },
    { max_reachable_step: "done" },
    { affected_node_ids: [""] },
    { reference_locations: [{ source_entry_id: "source-entry-1" }] }
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
