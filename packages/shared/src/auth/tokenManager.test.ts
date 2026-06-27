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
