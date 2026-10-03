import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthRuntime } from "./runtime";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createAuthRuntime", () => {
  it("装配出 api / store / tokens 三件套", () => {
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    expect(rt.api.auth.login).toBeTypeOf("function");
    expect(rt.store.getState().user).toBeNull();
    expect(rt.tokens.getToken()).toBeUndefined();
  });

  it("persistSession 写入内存 token 并排期刷新", () => {
    vi.useFakeTimers();
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    rt.persistSession({ access_token: "at-1", expires_in: 900 });
    expect(rt.tokens.getToken()).toBe("at-1");
    rt.tokens.setAccessToken(null); // 清掉排期的刷新定时器，避免悬挂
  });

  it("本地登出跨内核重建阻止旧 cookie 恢复，显式登录后解除", async () => {
    vi.useFakeTimers();
    const items = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key)
    });
    const first = createAuthRuntime({ baseUrl: "/api/v1" });
    first.persistSession({ access_token: "first", expires_in: 900 });
    first.clearSession();
    const fetch = vi.spyOn(globalThis, "fetch");
    const loggedOut = createAuthRuntime({ baseUrl: "/api/v1" });
    await loggedOut.restoreSession();
    expect(fetch).not.toHaveBeenCalled();
    expect(loggedOut.store.getState()).toMatchObject({
      user: null,
      hydrated: true,
      connectionError: false
    });

    loggedOut.persistSession({
      access_token: "explicit-login",
      expires_in: 900
    });
    const restored = createAuthRuntime({ baseUrl: "/api/v1" });
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "restored", expires_in: 900 })
      )
    );
    vi.spyOn(restored.api.auth, "me").mockResolvedValue({
      user: {
        id: "u1",
        display_name: "用户",
        avatar_url: "",
        roles: ["student"],
        active_role: "student"
      },
      active_role: "student",
      onboarded: false,
      learning_settings: null
    });
    await restored.restoreSession();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(restored.store.getState().user?.id).toBe("u1");
  });

  it("Web Storage 抛错不阻断内存登出或显式登录", async () => {
    vi.useFakeTimers();
    const denied = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.stubGlobal("sessionStorage", {
      getItem: denied,
      setItem: denied,
      removeItem: denied
    });
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    rt.persistSession({ access_token: "first", expires_in: 900 });
    rt.clearSession();
    const fetch = vi.spyOn(globalThis, "fetch");
    await rt.restoreSession();
    expect(fetch).not.toHaveBeenCalled();
    expect(rt.tokens.getToken()).toBeUndefined();
    expect(rt.store.getState()).toMatchObject({ user: null, hydrated: true });
    rt.persistSession({ access_token: "explicit-login", expires_in: 900 });
    expect(rt.tokens.getToken()).toBe("explicit-login");
  });

  it("clearSession 清除 token 与全部用户会话状态", () => {
    vi.useFakeTimers();
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    rt.persistSession({ access_token: "at-1", expires_in: 900 });
    rt.store.setState({
      user: {
        id: "u1",
        display_name: "用户",
        avatar_url: "",
        roles: ["student"],
        active_role: "student"
      },
      activeRole: "student",
      onboarded: true,
      hydrated: false
    });

    rt.clearSession();

    expect(rt.tokens.getToken()).toBeUndefined();
    expect(rt.store.getState()).toMatchObject({
      user: null,
      activeRole: null,
      onboarded: null,
      hydrated: true
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
