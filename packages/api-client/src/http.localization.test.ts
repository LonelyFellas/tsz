import { expect, it, vi, afterEach } from "vitest";
import { createHttpClient, HttpError } from "./http";

afterEach(() => vi.unstubAllGlobals());

it("opts in with the resolved locale on public and private requests without sharing clients", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  const us = createHttpClient({
    baseUrl: "/api/v1",
    getInterfaceLocale: () => "en-US"
  });
  const tw = createHttpClient({
    baseUrl: "/api/v1/admin",
    getInterfaceLocale: () => "zh-Hant"
  });
  await Promise.all([
    us.post("/auth/login", {}, { skipAuth: true }),
    tw.get("/profile"),
    createHttpClient({ baseUrl: "/api/v1" }).get("/me")
  ]);
  const sent = fetcher.mock.calls.map((call) => new Headers(call[1].headers));
  expect(sent[0]!.get("X-TSZ-Localization")).toBe("v1");
  expect(sent[0]!.get("Accept-Language")).toBe("en-US");
  expect(sent[1]!.get("Accept-Language")).toBe("zh-Hant");
  expect(sent[2]!.has("X-TSZ-Localization")).toBe(false);
});

it("captures a language for a logical request and preserves code and field issues", async () => {
  let locale = "en-US" as "en-US" | "zh-Hant";
  let token = "expired";
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "invalid_token" }), { status: 401 })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "urn:tsz:problem:revision_conflict",
          title: "Revision changed",
          status: 409,
          code: "revision_conflict",
          detail: "Content has changed",
          field: "revision",
          meta: { current_revision: 3 }
        }),
        { status: 409, headers: { "Content-Language": "en-US" } }
      )
    );
  vi.stubGlobal("fetch", fetcher);
  const http = createHttpClient({
    baseUrl: "/api/v1",
    getInterfaceLocale: () => locale,
    getToken: () => token,
    onRefresh: async () => {
      locale = "zh-Hant";
      token = "new";
      return token;
    }
  });
  const error = await http.get("/entry").catch((error: unknown) => error);
  expect(error).toBeInstanceOf(HttpError);
  expect(error).toMatchObject({
    status: 409,
    requestLocale: "en-US",
    code: "revision_conflict",
    message: "Content has changed",
    meta: { current_revision: 3 },
    problem: { field: "revision" }
  });
  expect(
    fetcher.mock.calls.map((call) =>
      new Headers(call[1].headers).get("Accept-Language")
    )
  ).toEqual(["en-US", "en-US"]);
});

it("does not assume the requested language when the response has no language header", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" })
    )
  );
  const http = createHttpClient({
    baseUrl: "/api/v1",
    getInterfaceLocale: () => "zh-Hans"
  });
  expect(
    await http.get("/entry").catch((error: unknown) => error)
  ).toMatchObject({ status: 502, requestLocale: "unknown" });
});

it("records the response language even if the selection changes while the request is pending", async () => {
  let locale: "zh-Hans" | "en-US" = "zh-Hans";
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        })
    )
  );
  const http = createHttpClient({
    baseUrl: "/api/v1",
    getInterfaceLocale: () => locale
  });
  const pending = http.post("/start", {}).catch((error: unknown) => error);
  await vi.waitFor(() => expect(resolve).toBeDefined());
  locale = "en-US";
  resolve(
    new Response(JSON.stringify({ detail: "旧语言错误" }), {
      status: 409,
      headers: { "Content-Language": "zh-Hans" }
    })
  );
  expect(await pending).toMatchObject({
    requestLocale: "zh-Hans",
    message: "旧语言错误"
  });
});

it("marks the response language unknown when no localization header was sent", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  vi.stubGlobal("fetch", fetcher);
  const http = createHttpClient({
    baseUrl: "/api/v1",
    getInterfaceLocale: () => undefined
  });
  const pending = http.post("/start", {}).catch((error: unknown) => error);
  await vi.waitFor(() => expect(resolve).toBeDefined());
  resolve(
    new Response(JSON.stringify({ detail: "原始错误" }), { status: 409 })
  );
  expect(await pending).toMatchObject({
    requestLocale: "unknown",
    message: "原始错误"
  });
  expect(
    new Headers(fetcher.mock.calls[0]![1]?.headers).has("Accept-Language")
  ).toBe(false);
});
