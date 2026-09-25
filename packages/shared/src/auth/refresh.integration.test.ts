import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.stubGlobal("window", { location });
    return { rt, request, location };
  }

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
          : response(200, {});
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
      return response(200, {});
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

  it.each([503, "offline"])(
    "页面恢复可见时 refresh %s 保留会话，online 后恢复",
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
      const fetch = vi.spyOn(globalThis, "fetch");
      if (failure === 503) fetch.mockResolvedValueOnce(response(503));
      else fetch.mockRejectedValueOnce(new TypeError("offline"));
      doc.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() =>
        expect(rt.store.getState().connectionError).toBe(true)
      );
      expect(rt.tokens.getToken()).toBe("old");
      expect(location.href).toBe("");
      fetch.mockResolvedValueOnce(
        response(200, { access_token: "new", expires_in: 900 })
      );
      win.dispatchEvent(new Event("online"));
      await vi.waitFor(() => expect(rt.tokens.getToken()).toBe("new"));
      expect(rt.store.getState().connectionError).toBe(false);
      rt.tokens.setAccessToken(null);
    }
  );

  it("主动刷新临时故障只退避重试三次，恢复后重新排期", async () => {
    const { rt, location } = setup();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
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

  it.each([503, "offline"])(
    "业务 401 后 refresh %s 不登出、不重放，恢复后可刷新",
    async (failure) => {
      const { rt, request, location } = setup();
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(response(401, { code: "invalid_token" }));
      if (failure === 503) fetch.mockResolvedValueOnce(response(503));
      else fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(request()).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(rt.tokens.getToken()).toBe("old");
      expect(location.href).toBe("");
      fetch.mockResolvedValueOnce(
        response(200, { access_token: "new", expires_in: 900 })
      );
      await expect(rt.tokens.refreshTokens()).resolves.toBe("new");
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

describe("admin 改密真实请求层", () => {
  it("invalid_credentials 仅改密一次、refresh 零次", async () => {
    vi.useFakeTimers();
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.persistSession({ access_token: "token", expires_in: 900 });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        response(401, { code: "invalid_credentials", message: "当前密码错误" })
      );
    await expect(
      rt.api.auth.changePassword("wrong", "new-password")
    ).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toMatch(/change-password$/);
    rt.tokens.setAccessToken(null);
  });

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
