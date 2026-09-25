import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenManager } from "./tokenManager";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body
  } as Response;
}

describe("createTokenManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始无 token", () => {
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    expect(tm.getToken()).toBeUndefined();
  });

  it("setAccessToken 写入与清除", () => {
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    tm.setAccessToken("at-1");
    expect(tm.getToken()).toBe("at-1");
    tm.setAccessToken(null);
    expect(tm.getToken()).toBeUndefined();
  });

  it("refreshTokens 成功后写入新 token 并返回", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ access_token: "at-new", expires_in: 900 })
      );
    const tm = createTokenManager({ baseUrl: "/api/v1" });

    const token = await tm.refreshTokens();

    expect(token).toBe("at-new");
    expect(tm.getToken()).toBe("at-new");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("并发 refresh 共享同一次请求", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ access_token: "at-x", expires_in: 900 })
      );
    const tm = createTokenManager({ baseUrl: "/api/v1" });

    const [a, b] = await Promise.all([tm.refreshTokens(), tm.refreshTokens()]);

    expect(a).toBe("at-x");
    expect(b).toBe("at-x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("清会话后丢弃已在途 refresh 的迟到结果", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    tm.setAccessToken("at-old");

    const refreshing = tm.refreshTokens();
    tm.setAccessToken(null);
    resolveFetch(jsonResponse({ access_token: "at-late", expires_in: 900 }));

    await expect(refreshing).rejects.toThrow("session changed");
    expect(tm.getToken()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("新登录中止旧刷新，旧请求结算不释放新会话的去重锁", async () => {
    vi.useFakeTimers();
    let finishOld!: (res: Response) => void;
    let finishNew!: (res: Response) => void;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishNew = resolve;
          })
      );
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    tm.setAccessToken("old");
    const old = tm.refreshTokens();
    const stale = expect(old).rejects.toThrow("session changed");
    const signal = fetch.mock.calls[0]?.[1]?.signal;
    tm.setAccessToken("new-login");
    expect(signal?.aborted).toBe(true);
    const current = tm.refreshTokens();
    finishOld(jsonResponse({ access_token: "late", expires_in: 900 }));
    await stale;
    expect(tm.refreshTokens()).toBe(current);
    expect(fetch).toHaveBeenCalledTimes(2);
    finishNew(jsonResponse({ access_token: "new-refreshed", expires_in: 900 }));
    await expect(current).resolves.toBe("new-refreshed");
    expect(tm.getToken()).toBe("new-refreshed");
    tm.setAccessToken(null);
  });

  it("refresh 失败（非 2xx）抛错且不写 token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, false));
    const tm = createTokenManager({ baseUrl: "/api/v1" });

    await expect(tm.refreshTokens()).rejects.toThrow();
    expect(tm.getToken()).toBeUndefined();
  });

  it("scheduleRefresh 在到期前 30 秒触发刷新", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ access_token: "at-refreshed", expires_in: 900 })
      );
    const tm = createTokenManager({ baseUrl: "/api/v1" });

    tm.scheduleRefresh(900); // 应在 870s 后触发
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(870_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["/api/v1", "/api/v1/admin"])(
    "%s 主动刷新遇到 503 保留会话且不跳登录",
    async (baseUrl) => {
      vi.useFakeTimers();
      const tm = createTokenManager({ baseUrl });
      const location = { href: "" };
      vi.stubGlobal("window", { location });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 503 })
      );
      tm.setAccessToken("at-existing");
      tm.scheduleRefresh(60);

      try {
        await vi.advanceTimersByTimeAsync(30_000);
        expect(tm.getToken()).toBe("at-existing");
        expect(location.href).toBe("");
      } finally {
        tm.setAccessToken(null);
        vi.unstubAllGlobals();
      }
    }
  );

  it("expiresIn 过小不排期（交给 401 重试）", () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const tm = createTokenManager({ baseUrl: "/api/v1" });

    tm.scheduleRefresh(10);
    vi.advanceTimersByTime(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirectToLogin 清 token 并跳默认登录页", () => {
    // 先在无 window 的 node 环境构造（跳过 visibilitychange 注册），再注入 window 触发跳转分支。
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    tm.setAccessToken("at-1");
    const location = { href: "" };
    vi.stubGlobal("window", { location });

    tm.redirectToLogin();

    expect(tm.getToken()).toBeUndefined();
    expect(location.href).toBe("/login");
    vi.unstubAllGlobals();
  });

  it("redirectToLogin 跳自定义 loginPath", () => {
    const tm = createTokenManager({ baseUrl: "/api/v1", loginPath: "/admin" });
    const location = { href: "" };
    vi.stubGlobal("window", { location });

    tm.redirectToLogin();

    expect(location.href).toBe("/admin");
    vi.unstubAllGlobals();
  });

  it("无 window（SSR/node）时 redirectToLogin 只清 token、不跳转", () => {
    const tm = createTokenManager({ baseUrl: "/api/v1" });
    tm.setAccessToken("at-1");

    expect(() => tm.redirectToLogin()).not.toThrow();
    expect(tm.getToken()).toBeUndefined();
  });
});
