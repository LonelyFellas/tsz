import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http";
import { RequestTimeoutError } from "./deadline";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("logical request deadlines", () => {
  it.each(["headers", "body", "error-body", "blob"])(
    "bounds stalled %s without exposing request data",
    async (phase) => {
      vi.useFakeTimers();
      const stalled = () => new Promise<never>(() => {});
      const response = {
        ok: phase !== "error-body",
        status: phase === "error-body" ? 503 : 200,
        text: stalled,
        json: stalled,
        blob: stalled
      };
      const fetch = vi.fn(async (_path: string, _init: RequestInit) =>
        phase === "headers" ? stalled() : response
      );
      vi.stubGlobal("fetch", fetch);
      const http = createHttpClient({ baseUrl: "/api" });
      const pending =
        phase === "blob"
          ? http.getBlob("/secret")
          : http.post("/secret", { password: "sensitive-sentinel" });
      const rejected =
        expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
      await vi.advanceTimersByTimeAsync(30_000);
      await rejected;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("caller cancellation ends one waiter without aborting shared refresh", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const refresh = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let token = "old";
    const fetch = vi.fn(
      async (_path, init) =>
        new Response(JSON.stringify({ value: "ok" }), {
          status: init.headers.get("Authorization") === "Bearer old" ? 401 : 200
        })
    );
    vi.stubGlobal("fetch", fetch);
    const onRefresh = vi.fn(async () => {
      await refresh;
      token = "new";
      return token;
    });
    const http = createHttpClient({
      baseUrl: "/api",
      getToken: () => token,
      onRefresh
    });
    const controller = new AbortController();
    const first = http.get("/one", { signal: controller.signal });
    const second = http.get("/two");
    await vi.advanceTimersByTimeAsync(0);
    const cancelled = expect(first).rejects.toMatchObject({
      name: "AbortError"
    });
    controller.abort();
    await cancelled;
    finish();
    await expect(second).resolves.toEqual({ value: "ok" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("401, shared refresh and replay share the original budget and preserve write intent", async () => {
    vi.useFakeTimers();
    let token = "old";
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () => resolve(new Response("{}", { status: 401 })),
              20_000
            )
          )
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const http = createHttpClient({
      baseUrl: "/api",
      getToken: () => token,
      onRefresh: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return (token = "new");
      }
    });
    const pending = http.post(
      "/publication",
      { revision: 7 },
      { headers: { "Idempotency-Key": "same-key" } }
    );
    const rejected = expect(pending).rejects.toThrow("结果尚未确认");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].body).toBe(fetch.mock.calls[0]![1].body);
    expect(fetch.mock.calls[1]![1].headers.get("Idempotency-Key")).toBe(
      "same-key"
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
