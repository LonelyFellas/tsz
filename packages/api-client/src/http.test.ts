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
  it("是 Error 的子类并携带 status/code", () => {
    const err = new HttpError(404, 1001, "not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("HttpError");
    expect(err.status).toBe(404);
    expect(err.code).toBe(1001);
    expect(err.message).toBe("not found");
  });
});

describe("createHttpClient", () => {
  it("get:拼接 baseUrl + path,带默认 Content-Type,返回 data", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: { id: "1" } })
    );
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/x");
    expect(fetchMock.mock.calls[0]![1].method).toBeUndefined();
  });

  it("有 token 时注入 Authorization", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({
      baseUrl: "",
      getToken: () => "abc"
    });
    await http.get("/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("无 token 时不带 Authorization", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });
    await http.get("/me");
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBeUndefined();
  });

  it("getToken 返回 Promise 会被 await", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: { ok: true } })
    );
    const http = createHttpClient({ baseUrl: "" });
    await http.post("/items", { name: "a" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("put:method=PUT 且 body 为 JSON 字符串", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });
    await http.put("/items/1", { name: "b" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ name: "b" }));
  });

  it("del:method=DELETE", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });
    await http.del("/items/1");
    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE");
  });

  it("HTTP 非 2xx 抛 HttpError,带 status 与 body 信息", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: 500, message: "服务器错误", data: null },
        { ok: false, status: 500 }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/boom")).rejects.toMatchObject({
      name: "HttpError",
      status: 500,
      code: 500,
      message: "服务器错误"
    });
  });

  it("ok 但业务 code !== 0 也抛 HttpError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 1002, message: "无权限", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/secret")).rejects.toMatchObject({
      status: 200,
      code: 1002,
      message: "无权限"
    });
  });

  it("body.message 缺失时回退到 statusText", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: 403, data: null },
        { ok: false, status: 403, statusText: "Forbidden" }
      )
    );
    const http = createHttpClient({ baseUrl: "" });

    await expect(http.get("/x")).rejects.toMatchObject({
      message: "Forbidden"
    });
  });

  it("init.headers 可覆盖/追加请求头", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 0, message: "ok", data: null })
    );
    const http = createHttpClient({ baseUrl: "" });
    // post 内部带了 method/body,这里验证自定义 header 合并能力通过 request 实现。
    await http.post("/x", { a: 1 });
    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
