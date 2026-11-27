import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError } from "@tsz/api-client";
import { createAuthRuntime } from "./runtime";
import { createAdminAuthRuntime } from "./adminRuntime";

const response = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["web", "admin"] as const)("%s HTTP + auth runtime", (realm) => {
  function setup() {
    vi.useFakeTimers();
    const rt =
      realm === "web"
        ? createAuthRuntime({ baseUrl: "/api/v1" })
        : createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    const request = () =>
      "profile" in rt.api ? rt.api.profile() : rt.api.auth.me();
    rt.persistSession({ access_token: "old", expires_in: 60 });
    rt.store.getState().setHydrated(true);
    const location = { href: "" };
    vi.stubGlobal("window", Object.assign(new EventTarget(), { location }));
    return { rt, request, location };
  }

  it("离线期间不消费刷新凭据，恢复联网后自动续期", async () => {
    vi.useFakeTimers();
    const location = { href: "" };
    const win = Object.assign(new EventTarget(), { location });
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", new EventTarget());
    const navigator = { onLine: false };
    vi.stubGlobal("navigator", navigator);
    const rt =
      realm === "web"
        ? createAuthRuntime({ baseUrl: "/api/v1" })
        : createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.persistSession({ access_token: "old", expires_in: 60 });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (!navigator.onLine) throw new TypeError("Failed to fetch");
      return response(200, { access_token: "recovered", expires_in: 900 });
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(rt.store.getState().refreshUnconfirmed).toBe(false);
    navigator.onLine = true;
    win.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(rt.tokens.getToken()).toBe("recovered"));
    expect(location.href).toBe("");
    rt.tokens.setAccessToken(null);
  });

  it("取 token 后立即换会话时，不发送旧身份的写请求", async () => {
    const { rt } = setup();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(204));
    const pending = rt.api.auth.logout();
    rt.persistSession({ access_token: "new-login", expires_in: 900 });
    await expect(pending).rejects.toThrow("session changed");
    expect(fetch).not.toHaveBeenCalled();
    rt.tokens.setAccessToken(null);
  });

  it("共享 Cookie 切换账号后，拒绝以新身份重放旧页面的写请求", async () => {
    const { rt, location } = setup();
    const jwt = (sub: string) =>
      `header.${btoa(JSON.stringify({ sub, aud: realm }))}.signature`;
    rt.persistSession({ access_token: jwt("account-a"), expires_in: 900 });
    const state = rt.store.getState();
    if ("setProfile" in state)
      state.setProfile({
        id: "account-a",
        phone: "",
        display_name: "账号 A",
        role: "admin",
        permission_version: 1,
        catalog_version: "v1",
        permissions: [],
        preferences: { dialect: "uk" }
      });
    else
      state.setSession(
        {
          id: "account-a",
          display_name: "账号 A",
          avatar_url: "",
          roles: ["student"],
          active_role: "student"
        },
        true
      );
    const generation = rt.tokens.getSessionGeneration();
    let writes = 0;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).endsWith("/auth/refresh"))
          return response(200, {
            access_token: jwt("account-b"),
            expires_in: 900
          });
        writes++;
        return writes === 1 ? response(401) : response(200, {});
      });
    const write = () =>
      "profile" in rt.api
        ? rt.api.updateProfilePreferences({ dialect: "us" })
        : rt.api.auth.updateProfile("新昵称");

    await expect(write()).rejects.toThrow("session changed");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rt.tokens.getToken()).toBeUndefined();
    expect(rt.tokens.getSessionGeneration()).toBeGreaterThan(generation);
    expect(location.href).toBe("/login");
    expect(rt.store.getState()).toMatchObject(
      realm === "admin" ? { profile: null } : { user: null }
    );
  });

  it("同账号正常续期仍可重放原请求", async () => {
    const { rt, request, location } = setup();
    const jwt = (exp: number) =>
      `header.${btoa(JSON.stringify({ sub: "account-a", aud: realm, exp }))}.signature`;
    rt.persistSession({ access_token: jwt(1), expires_in: 900 });
    const generation = rt.tokens.getSessionGeneration();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(
        response(200, { access_token: jwt(2), expires_in: 900 })
      )
      .mockResolvedValueOnce(
        response(
          200,
          realm === "admin"
            ? {
                id: "account-a",
                role: "admin",
                permission_version: 1,
                catalog_version: "v1",
                permissions: []
              }
            : {}
        )
      );

    await request();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(rt.tokens.getToken()).toBe(jwt(2));
    expect(rt.tokens.getSessionGeneration()).toBe(generation);
    expect(location.href).toBe("");
    rt.tokens.setAccessToken(null);
  });

  it("同页并发业务 401 只产生一次 refresh", async () => {
    const { rt, request } = setup();
    let release!: (res: Response) => void;
    let refreshCount = 0;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        if (String(url).endsWith("/auth/refresh")) {
          refreshCount++;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        return new Headers(init?.headers).get("Authorization") === "Bearer old"
          ? response(401)
          : response(
              200,
              realm === "admin"
                ? {
                    id: "admin-1",
                    role: "admin",
                    permission_version: 1,
                    catalog_version: "v1",
                    permissions: []
                  }
                : {}
            );
      });
    const pending = Promise.all([request(), request(), request()]);
    await vi.waitFor(() => expect(refreshCount).toBe(1));
    release(response(200, { access_token: "new", expires_in: 900 }));
    await pending;
    expect(refreshCount).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(7);
    rt.tokens.setAccessToken(null);
  });

  it("并发请求中迟到的旧 token 401 复用已刷新的 token", async () => {
    const { rt, request } = setup();
    let release!: (res: Response) => void;
    let oldRequests = 0;
    let refreshes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshes++;
        return response(200, { access_token: "new", expires_in: 900 });
      }
      if (new Headers(init?.headers).get("Authorization") === "Bearer old") {
        oldRequests++;
        if (oldRequests === 2)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return response(401);
      }
      return response(
        200,
        realm === "admin"
          ? {
              id: "admin-1",
              role: "admin",
              permission_version: 1,
              catalog_version: "v1",
              permissions: []
            }
          : {}
      );
    });
    const first = request();
    const second = request();
    await first;
    release(response(401));
    await second;
    expect(refreshes).toBe(1);
    rt.tokens.setAccessToken(null);
  });

  it("旧业务 401 迟到不刷新新登录会话", async () => {
    const { rt, request, location } = setup();
    let release!: (res: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    const pending = request();
    const assertion = expect(pending).rejects.toThrow("session changed");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    rt.persistSession({ access_token: "new-login", expires_in: 900 });
    release(response(401));
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rt.tokens.getToken()).toBe("new-login");
    expect(location.href).toBe("");
    rt.tokens.setAccessToken(null);
  });

  it.each([429, "offline", 503])(
    "页面恢复可见时 refresh %s 失败，联网后自动续接",
    async (failure) => {
      vi.useFakeTimers();
      const location = { href: "" };
      const win = Object.assign(new EventTarget(), { location });
      const doc = Object.assign(new EventTarget(), {
        visibilityState: "visible"
      });
      vi.stubGlobal("window", win);
      vi.stubGlobal("document", doc);
      const rt =
        realm === "web"
          ? createAuthRuntime({ baseUrl: "/api/v1" })
          : createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
      rt.persistSession({ access_token: "old", expires_in: 10 });
      rt.store.getState().setHydrated(true);
      let available = false;
      const keys: (string | null)[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        if (init?.method === "HEAD")
          return new Response(null, {
            status: 204,
            headers: { "x-refresh-recovery": "v1" }
          });
        keys.push(new Headers(init?.headers).get("x-refresh-request-id"));
        if (!available) {
          if (typeof failure === "number") return response(failure);
          throw new TypeError("offline");
        }
        return new Response(
          JSON.stringify({ access_token: "new", expires_in: 900 }),
          { headers: { "x-refresh-recovery": "v1" } }
        );
      });
      doc.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() =>
        expect(rt.store.getState().connectionError).toBe(true)
      );
      expect(rt.tokens.getToken()).toBe("old");
      expect(rt.store.getState().refreshUnconfirmed).toBe(false);
      available = true;
      win.dispatchEvent(new Event("online"));
      await vi.waitFor(() => expect(rt.tokens.getToken()).toBe("new"));
      expect(location.href).toBe("");
      expect(rt.store.getState().connectionError).toBe(false);
      expect(keys).toHaveLength(2);
      if (failure !== 429) expect(keys[1]).toBe(keys[0]);
      rt.tokens.setAccessToken(null);
    }
  );

  it("主动刷新临时故障只退避重试三次，恢复后重新排期", async () => {
    const { rt, location } = setup();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(429));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(rt.tokens.getToken()).toBe("old");
    expect(location.href).toBe("");
    fetch.mockResolvedValue(
      response(200, { access_token: "new", expires_in: 900 })
    );
    await rt.tokens.refreshTokens();
    await vi.advanceTimersByTimeAsync(870_000);
    expect(fetch).toHaveBeenCalledTimes(6);
    rt.tokens.setAccessToken(null);
  });

  it.each([429, "offline", 503])(
    "业务 401 后 refresh %s 失败，安全续接且不登出",
    async (failure) => {
      const { rt, request, location } = setup();
      let available = false;
      const keys: (string | null)[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (init?.method === "HEAD")
          return new Response(null, {
            status: 204,
            headers: { "x-refresh-recovery": "v1" }
          });
        if (!String(url).endsWith("/auth/refresh"))
          return response(401, { code: "invalid_token" });
        keys.push(new Headers(init?.headers).get("x-refresh-request-id"));
        if (!available) {
          if (typeof failure === "number") return response(failure);
          throw new TypeError("offline");
        }
        return response(200, { access_token: "new", expires_in: 900 });
      });
      await expect(request()).rejects.toThrow();
      expect(location.href).toBe("");
      available = true;
      await expect(rt.tokens.refreshTokens()).resolves.toBe("new");
      expect(keys).toHaveLength(2);
      if (failure !== 429) expect(keys[1]).toBe(keys[0]);
      expect(rt.tokens.getToken()).toBe("new");
      rt.tokens.setAccessToken(null);
    }
  );

  it("明确 refresh 401 结束会话且不循环", async () => {
    const { rt, request, location } = setup();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response(401, { code: "invalid_token" }));
    await expect(request()).rejects.toThrow();
    expect(rt.tokens.getToken()).toBeUndefined();
    expect(location.href).toBe("/login");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([200, 401, 503])("旧 refresh %s 迟到不影响新会话", async (status) => {
    const { rt, request, location } = setup();
    let resolve!: (res: Response) => void;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          })
      );
    const pending = request();
    const assertion = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    rt.persistSession({ access_token: "new-login", expires_in: 900 });
    resolve(response(status, { access_token: "late", expires_in: 900 }));
    await assertion;
    expect(rt.tokens.getToken()).toBe("new-login");
    expect(location.href).toBe("");
    rt.tokens.setAccessToken(null);
  });
});

describe("web 账号安全真实请求层", () => {
  const operations = [
    [
      "/me/contact/bind",
      (rt: ReturnType<typeof createAuthRuntime>) =>
        rt.api.auth.bindContact({
          contact: "new@example.com",
          code: "123456",
          verification_channel: "phone",
          verification_code: "654321"
        })
    ],
    [
      "/me/contact/unbind",
      (rt: ReturnType<typeof createAuthRuntime>) =>
        rt.api.auth.unbindContact({
          channel: "email",
          verification_channel: "phone",
          verification_code: "654321"
        })
    ],
    [
      "/auth/password/change",
      (rt: ReturnType<typeof createAuthRuntime>) =>
        rt.api.auth.changePassword({
          current_password: "old-password",
          new_password: "newPassword123"
        })
    ]
  ] as const;

  it.each(operations)(
    "%s 业务401不刷新、不重复消费凭据",
    async (path, request) => {
      vi.useFakeTimers();
      const rt = createAuthRuntime({ baseUrl: "/api/v1" });
      rt.persistSession({ access_token: "old", expires_in: 900 });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(response(401, { code: "invalid_otp_code" }));
      await expect(request(rt)).rejects.toMatchObject({
        code: "invalid_otp_code"
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1${path}`);
      expect(rt.tokens.getToken()).toBe("old");
      rt.tokens.setAccessToken(null);
    }
  );

  it.each(operations)(
    "%s 仅token过期时刷新并重试一次",
    async (path, request) => {
      vi.useFakeTimers();
      const rt = createAuthRuntime({ baseUrl: "/api/v1" });
      rt.persistSession({ access_token: "old", expires_in: 900 });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(response(401, { code: "invalid_token" }))
        .mockResolvedValueOnce(
          response(200, { access_token: "new", expires_in: 900 })
        )
        .mockResolvedValueOnce(response(204));
      await request(rt);
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        `/api/v1${path}`,
        "/api/v1/auth/refresh",
        `/api/v1${path}`
      ]);
      expect(
        new Headers(fetch.mock.calls[2]?.[1]?.headers).get("Authorization")
      ).toBe("Bearer new");
      expect(fetch.mock.calls[2]?.[1]?.body).toBe(
        fetch.mock.calls[0]?.[1]?.body
      );
      rt.tokens.setAccessToken(null);
    }
  );
});

describe("Admin 请求等待会话刷新", () => {
  function setup(expiresIn = 30) {
    vi.useFakeTimers();
    const rt = createAdminAuthRuntime({
      baseUrl: "/api/v1/admin",
      getTestResourceRun: () => "synthetic-run"
    });
    rt.persistSession({ access_token: "old", expires_in: expiresIn });
    return { rt, fetch: vi.spyOn(globalThis, "fetch") };
  }

  function holdRefresh() {
    let release!: (value: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      release = resolve;
    });
    return { refresh, release };
  }

  it.each(["主动刷新", "401 触发的刷新", "已知到期但尚未刷新"])(
    "%s时，22 个语音解析请求共享一次刷新并首次成功",
    async (scenario) => {
      const expired = scenario === "已知到期但尚未刷新";
      const { rt, fetch } = setup(expired ? 30 : 60);
      const input = {
        profile: { voices: [] },
        source: {
          kind: "text" as const,
          content: { version: 2 as const, text: "hello", annotations: [] }
        },
        accent: "gb" as const
      };
      const resolved = { voices: [], source: { kind: "local" } };
      const { refresh, release } = holdRefresh();
      fetch.mockImplementation(async (url, init) => {
        if (String(url).endsWith("/auth/refresh")) return refresh;
        if (new Headers(init?.headers).get("Authorization") === "Bearer old")
          return response(401, { code: "invalid_token" });
        return response(200, resolved);
      });
      const refreshCalls = () =>
        fetch.mock.calls.filter(
          ([url]) => url === "/api/v1/admin/auth/refresh"
        );
      const resolveCalls = () =>
        fetch.mock.calls.filter(
          ([url]) => url === "/api/v1/admin/speech/resolve"
        );

      const trigger =
        scenario === "401 触发的刷新" ? rt.api.speech.voices() : undefined;
      await vi.advanceTimersByTimeAsync(trigger ? 0 : 30_000);
      expect(refreshCalls()).toHaveLength(expired ? 0 : 1);
      const pending = Promise.all(
        Array.from({ length: 22 }, () => rt.api.speech.resolve(input))
      );
      await vi.advanceTimersByTimeAsync(0);
      const callsWhileRefreshing = resolveCalls().length;
      release(response(200, { access_token: "new", expires_in: 900 }));
      await expect(pending).resolves.toEqual(
        Array.from({ length: 22 }, () => resolved)
      );
      await trigger;
      rt.tokens.setAccessToken(null);

      expect(refreshCalls()).toHaveLength(1);
      expect.soft(callsWhileRefreshing).toBe(0);
      expect.soft(resolveCalls()).toHaveLength(22);
      expect(
        resolveCalls().every(([, init]) => {
          const headers = new Headers(init?.headers);
          return (
            init?.method === "POST" &&
            init.body === JSON.stringify(input) &&
            headers.get("Authorization") === "Bearer new" &&
            headers.get("X-TSZ-Test-Run") === "synthetic-run" &&
            headers.get("X-TSZ-Voice-Versions") === "v6"
          );
        })
      ).toBe(true);
    }
  );

  it("单个等待者取消后，公开端点立即发送且其他等待者继续共享刷新", async () => {
    const { rt, fetch } = setup();
    const { refresh, release } = holdRefresh();
    fetch.mockResolvedValueOnce(response(200, {}));
    await rt.api.speech.voices();
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer old");
    fetch.mockClear();
    fetch
      .mockImplementationOnce(() => refresh)
      .mockResolvedValueOnce(response(202))
      .mockResolvedValueOnce(response(200, { voices: [] }));

    await vi.advanceTimersByTimeAsync(30_000);
    const controller = new AbortController();
    const cancelled = expect(
      rt.api.speech.voices(controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    const waiting = rt.api.speech.voices();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await cancelled;
    await rt.api.auth.requestLoginCode("13800138000");

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/auth/refresh",
      "/api/v1/admin/auth/login-code"
    ]);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    const publicHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(publicHeaders.has("Authorization")).toBe(false);
    expect(publicHeaders.has("X-TSZ-Test-Run")).toBe(false);

    release(response(200, { access_token: "new", expires_in: 900 }));
    await expect(waiting).resolves.toEqual({ voices: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetch.mock.calls[2]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer new");
    rt.clearSession();
  });

  it.each([401, 503])(
    "请求前刷新失败 (%s) 时，等待者共担失败且不发送业务请求",
    async (status) => {
      const { rt, fetch } = setup();
      const location = { href: "" };
      vi.stubGlobal("window", { location });
      fetch.mockResolvedValue(response(status));
      await vi.advanceTimersByTimeAsync(30_000);

      const results = await Promise.allSettled([
        rt.api.profile(),
        rt.api.profile()
      ]);
      expect(results).toEqual(
        Array.from({ length: 2 }, () => ({
          status: "rejected",
          reason: expect.objectContaining({ status })
        }))
      );
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/admin/auth/refresh"
      ]);
      expect(rt.tokens.getToken()).toBe(status === 401 ? undefined : "old");
      expect(location.href).toBe(status === 401 ? "/login" : "");
      rt.clearSession();
    }
  );

  it.each(["登出", "切换会话"])(
    "等待刷新时%s，原业务请求不发送",
    async (action) => {
      const { rt, fetch } = setup();
      const { refresh, release } = holdRefresh();
      fetch.mockImplementationOnce(() => refresh);
      await vi.advanceTimersByTimeAsync(30_000);
      const oldRequest = expect(
        rt.api.updateProfilePreferences({ dialect: "us" })
      ).rejects.toThrow("session changed");
      await vi.advanceTimersByTimeAsync(0);

      if (action === "登出") rt.clearSession();
      else rt.persistSession({ access_token: "new-login", expires_in: 900 });
      release(
        response(200, { access_token: "late-rotation", expires_in: 900 })
      );
      await oldRequest;
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/admin/auth/refresh"
      ]);

      if (action === "登出") {
        fetch.mockResolvedValueOnce(response(401));
        await expect(rt.api.speech.voices()).rejects.toMatchObject({
          status: 401
        });
      } else {
        fetch.mockResolvedValueOnce(response(200, { voices: [] }));
        await expect(rt.api.speech.voices()).resolves.toEqual({ voices: [] });
      }
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/v1/admin/auth/refresh",
        "/api/v1/admin/speech/voices"
      ]);
      expect(
        new Headers(fetch.mock.calls[1]?.[1]?.headers).get("Authorization")
      ).toBe(action === "登出" ? null : "Bearer new-login");
      rt.clearSession();
    }
  );

  it("请求前刷新、401 刷新和重试共用原始超时预算及写入参数", async () => {
    const { rt, fetch } = setup();
    const after = (ms: number, result: Response) =>
      new Promise<Response>((resolve) => setTimeout(() => resolve(result), ms));
    fetch
      .mockImplementationOnce(() =>
        after(
          8_000,
          response(200, { access_token: "preflight", expires_in: 900 })
        )
      )
      .mockImplementationOnce(() =>
        after(20_000, response(401, { code: "invalid_token" }))
      )
      .mockImplementationOnce(() =>
        after(
          1_000,
          response(200, { access_token: "replayed", expires_in: 900 })
        )
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    await vi.advanceTimersByTimeAsync(30_000);
    const body = { schema_version: 3 as const, base_revision: 7 };
    const write = rt.api.words.publishV3("synthetic-entry", "same-key", body);
    const timedOut = expect(write).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await timedOut;

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/auth/refresh",
      "/api/v1/admin/lexicon/entries/synthetic-entry/publications",
      "/api/v1/admin/auth/refresh",
      "/api/v1/admin/lexicon/entries/synthetic-entry/publications"
    ]);
    const first = fetch.mock.calls[1]?.[1];
    const replay = fetch.mock.calls[3]?.[1];
    expect(first?.signal).toBe(replay?.signal);
    expect(replay?.signal?.aborted).toBe(true);
    expect(first?.body).toBe(JSON.stringify(body));
    expect(replay?.body).toBe(first?.body);
    for (const [init, token] of [
      [first, "preflight"],
      [replay, "replayed"]
    ] as const) {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
      expect(headers.get("Idempotency-Key")).toBe("same-key");
      expect(headers.get("X-TSZ-Test-Run")).toBe("synthetic-run");
    }
    rt.clearSession();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("admin 改密真实请求层", () => {
  it.each([false, true])(
    "invalid_credentials 不重试改密（已知到期：%s）",
    async (expired) => {
      vi.useFakeTimers();
      const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
      rt.persistSession({
        access_token: "token",
        expires_in: expired ? 30 : 900
      });
      const wrongPassword = response(401, {
        code: "invalid_credentials",
        message: "当前密码错误"
      });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(wrongPassword);
      if (expired) {
        fetch.mockResolvedValueOnce(
          response(200, { access_token: "new", expires_in: 900 })
        );
        await vi.advanceTimersByTimeAsync(30_000);
      }
      await expect(
        rt.api.auth.changePassword("wrong", "new-password")
      ).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        ...(expired ? ["/api/v1/admin/auth/refresh"] : []),
        "/api/v1/admin/auth/change-password"
      ]);
      rt.tokens.setAccessToken(null);
    }
  );

  it("invalid_token 刷新成功后只重试一次", async () => {
    vi.useFakeTimers();
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.persistSession({ access_token: "old", expires_in: 900 });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(401, { code: "invalid_token" }))
      .mockResolvedValueOnce(
        response(200, { access_token: "new", expires_in: 900 })
      )
      .mockResolvedValueOnce(response(204));
    await rt.api.auth.changePassword("current", "new-password");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/admin/auth/change-password",
      "/api/v1/admin/auth/refresh",
      "/api/v1/admin/auth/change-password"
    ]);
    expect(
      new Headers(fetch.mock.calls[2]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer new");
    rt.tokens.setAccessToken(null);
  });
});

describe("failed admin logout after an uncertain Cookie rotation", () => {
  it("records the pause before cancelling an in-flight refresh on local logout", async () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    const baseUrl = "/api/v1/admin";
    const runtime = createAdminAuthRuntime({ baseUrl });
    runtime.persistSession({ access_token: "old", expires_in: 900 });
    let deliver!: (response: Response) => void;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            deliver = resolve;
          })
      )
      .mockRejectedValueOnce(new TypeError("offline"));
    const refreshing = runtime.tokens.refreshTokens();
    const cancelled = expect(refreshing).rejects.toThrow("session changed");
    await expect(runtime.api.auth.logout()).rejects.toThrow("offline");
    runtime.clearSession();
    await cancelled;
    expect(values.get(`tsz:refresh-unconfirmed:${baseUrl}`)).toBe("cancelled");
    const loginPage = createAdminAuthRuntime({ baseUrl });
    await expect(loginPage.restoreSession()).resolves.toBeUndefined();
    expect(loginPage.store.getState()).toMatchObject({
      profile: null,
      hydrated: true
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    deliver(response(200, { access_token: "late-rotation", expires_in: 900 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.tokens.getToken()).toBeUndefined();
    expect(values.get(`tsz:refresh-unconfirmed:${baseUrl}`)).toBe("cancelled");
    loginPage.persistSession({ access_token: "new-login", expires_in: 900 });
    expect(values.has(`tsz:refresh-unconfirmed:${baseUrl}`)).toBe(false);
    loginPage.tokens.setAccessToken(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the pause through local logout and a new login-page runtime", async () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    const baseUrl = "/api/v1/admin";
    const runtime = createAdminAuthRuntime({ baseUrl });
    runtime.persistSession({ access_token: "old", expires_in: 900 });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
    await expect(runtime.tokens.refreshTokens()).rejects.toThrow("offline");
    await expect(runtime.api.auth.logout()).rejects.toThrow("offline");
    // The normal logout hook performs this local cleanup even if revocation failed.
    runtime.clearSession();
    expect(runtime.tokens.getToken()).toBeUndefined();
    const loginPage = createAdminAuthRuntime({ baseUrl });
    await expect(loginPage.restoreSession()).resolves.toBeUndefined();
    expect(loginPage.store.getState()).toMatchObject({
      profile: null,
      hydrated: true
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(loginPage.tokens.canRestoreSession()).toBe(false);
    expect(values.get(`tsz:refresh-unconfirmed:${baseUrl}`)).toBe("cancelled");
    loginPage.persistSession({
      access_token: "explicit-login",
      expires_in: 900
    });
    expect(values.has(`tsz:refresh-unconfirmed:${baseUrl}`)).toBe(false);
    fetch.mockResolvedValueOnce(
      response(200, { access_token: "refreshed", expires_in: 900 })
    );
    await expect(loginPage.tokens.refreshTokens()).resolves.toBe("refreshed");
    expect(fetch).toHaveBeenCalledTimes(3);
    loginPage.tokens.setAccessToken(null);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("旧标签页标记迁移", () => {
  it.each([200, 401])(
    "恢复返回 %s 时退出加载态，成功加载资料、失效不复活身份",
    async (status) => {
      vi.useFakeTimers();
      const baseUrl = "/api/v1/admin";
      const marker = `tsz:refresh-unconfirmed:${baseUrl}`;
      const values = new Map([[marker, "1"]]);
      vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(null, {
            status: 204,
            headers: {
              "x-refresh-recovery": "v1",
              "x-refresh-current-only": "v1"
            }
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: "restored", expires_in: 900 }),
            { status, headers: { "x-refresh-recovery": "v1" } }
          )
        )
        .mockResolvedValueOnce(
          response(200, {
            id: "admin",
            phone: "13800138000",
            display_name: "测试管理员",
            role: "super_admin",
            can_publish_lexicon: true,
            permission_version: 1,
            catalog_version: "v1",
            permissions: [],
            preferences: { dialect: "uk" }
          })
        );
      const runtime = createAdminAuthRuntime({ baseUrl });
      await runtime.restoreSession();
      expect(runtime.store.getState().hydrated).toBe(true);
      expect(runtime.store.getState().connectionError).toBe(false);
      expect(runtime.store.getState().refreshUnconfirmed).toBe(false);
      expect(runtime.tokens.getToken()).toBe(
        status === 200 ? "restored" : undefined
      );
      expect(fetch).toHaveBeenCalledTimes(status === 200 ? 3 : 2);
      expect(values.has(marker)).toBe(false);
      runtime.tokens.setAccessToken(null);
    }
  );
});
