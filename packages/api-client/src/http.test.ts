import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpClient, HttpError } from "./http";

const fetchMock = vi.fn();

// 构造一个最小的 Response 桩。
function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body
  } as unknown as Response;
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
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
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
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("无 token 时不带 Authorization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });

  it("getToken 返回 Promise 会被 await", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({
      baseUrl: "",
      getToken: async () => "async-token"
    });
    await http.get("/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer async-token");
  });

  it("post:method=POST 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const http = createHttpClient({ baseUrl: "" });
    await http.post("/items", { name: "a" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("put:method=PUT 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.put("/items/1", { name: "b" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ name: "b" }));
  });

  it("del:method=DELETE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.del("/items/1");
    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE");
  });

  it("204 No Content 返回 undefined", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: async () => {
        throw new Error("no body");
      }
    } as unknown as Response);
    const http = createHttpClient({ baseUrl: "" });
    const result = await http.del("/items/1");
    expect(result).toBeUndefined();
  });

  it("HTTP 非 2xx 抛 HttpError,带 status 与 error 信息", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "서버 오류" }, { ok: false, status: 500 })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/boom")).rejects.toMatchObject({
      name: "HttpError",
      status: 500,
      message: "서버 오류"
    });
  });

  it("非 2xx 且无 error 字段时回退到 statusText", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 403, statusText: "Forbidden" })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Forbidden"
    });
  });

  it("init.headers 可覆盖/追加请求头", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "" });
    await http.post("/x", { a: 1 });
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("skipAuth 时不附加 Authorization（即使有 token）", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const http = createHttpClient({ baseUrl: "", getToken: () => "stale" });
    await http.post("/auth/login", {}, { skipAuth: true });
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });

  it("401 无 token 时直接抛 HttpError，不触发 onRefresh", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "invalid credentials" }, { ok: false, status: 401 })
    );
    const onRefresh = vi.fn();
    const http = createHttpClient({ baseUrl: "", onRefresh });

    await expect(http.post("/auth/login", {})).rejects.toMatchObject({
      status: 401,
      message: "invalid credentials"
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("401 有 token 时触发 onRefresh 并重试", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "invalid or expired token" },
          { ok: false, status: 401 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ id: "1" }));

    const onRefresh = vi.fn().mockResolvedValue("new-token");
    const http = createHttpClient({
      baseUrl: "",
      getToken: () => "old-token",
      onRefresh
    });

    const data = await http.get("/me");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ id: "1" });
  });

  it("onRefresh 失败时调 onSessionExpired 并抛错", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: "invalid or expired token" },
        { ok: false, status: 401 }
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
});
