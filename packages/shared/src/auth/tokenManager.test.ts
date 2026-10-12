import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenManager } from "./tokenManager";

it.each(["/api/v1", "/api/v1/admin"])(
  "%s 旧标签页保留未知标记时，刷新后用当前 Cookie 安全恢复",
  async (baseUrl) => {
    vi.useFakeTimers();
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
          {
            headers: { "x-refresh-recovery": "v1" }
          }
        )
      );
    const manager = createTokenManager({ baseUrl });
    await expect(manager.refreshTokens()).resolves.toBe("restored");
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      "HEAD",
      "POST"
    ]);
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get(
        "x-refresh-current-only"
      )
    ).toBe("v1");
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get("x-refresh-request-id")
    ).toMatch(/^[\da-f-]{36}$/);
    expect(values.has(marker)).toBe(false);
    expect(manager.getToken()).toBe("restored");
    manager.setAccessToken(null);
  }
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

it("refresh body timeout releases waiters and blocks Cookie replay until new login", async () => {
  vi.useFakeTimers();
  let deliver!: (value: unknown) => void;
  const body = new Promise((resolve) => {
    deliver = resolve;
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, json: () => body } as Response);
  const manager = createTokenManager({ baseUrl: "/api" });
  manager.setAccessToken("old");
  const first = manager.refreshTokens();
  expect(manager.refreshTokens()).toBe(first);
  const rejected = expect(first).rejects.toThrow("请重新登录");
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
  await expect(manager.refreshTokens()).rejects.toThrow("请重新登录");
  expect(fetch).toHaveBeenCalledTimes(1);
  deliver({ access_token: "late", expires_in: 900 });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(manager.getToken()).toBe("old");
  expect(fetch).toHaveBeenCalledTimes(1);
  manager.setAccessToken("new-login");
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ access_token: "new-session", expires_in: 900 })
    )
  );
  await expect(manager.refreshTokens()).resolves.toBe("new-session");
  manager.setAccessToken(null);
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("unknown Cookie rotation survives runtime recreation but explicit login clears it", async () => {
  vi.restoreAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("offline"));
  const first = createTokenManager({ baseUrl: "/api/reliability" });
  await expect(first.refreshTokens()).rejects.toThrow("offline");
  first.setAccessToken(null);
  expect(first.getToken()).toBeUndefined();
  await expect(first.refreshTokens()).rejects.toThrow("请重新登录");
  const restored = createTokenManager({ baseUrl: "/api/reliability" });
  await expect(restored.refreshTokens()).rejects.toThrow("请重新登录");
  expect(fetch).toHaveBeenCalledTimes(1);
  restored.setAccessToken("explicit-login");
  expect(values.size).toBe(0);
  vi.unstubAllGlobals();
});

it.each([500, 502, 503, 504])(
  "refresh %s cannot prove rotation failed and must not replay",
  async (status) => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (_url, init) =>
          new Response(null, { status: init?.method === "HEAD" ? 405 : status })
      );
    const manager = createTokenManager({ baseUrl: "/unknown-rotation" });
    manager.setAccessToken("valid-access-token");
    await expect(manager.refreshTokens()).rejects.toThrow("会话刷新失败");
    await vi.advanceTimersByTimeAsync(600_000);
    await expect(manager.refreshTokens()).rejects.toThrow("请重新登录");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(manager.getToken()).toBe("valid-access-token");
    manager.setAccessToken(null);
    vi.useRealTimers();
  }
);

it("响应丢失后页面重载仍使用原刷新键，探明能力后续接", async () => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("response lost"))
    .mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: { "x-refresh-recovery": "v1" }
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "recovered", expires_in: 900 }),
        { headers: { "x-refresh-recovery": "v1" } }
      )
    );
  const first = createTokenManager({ baseUrl: "/reload-recovery" });
  await expect(first.refreshTokens()).rejects.toThrow("response lost");
  vi.clearAllTimers(); // 旧页面已卸载。
  const reloaded = createTokenManager({ baseUrl: "/reload-recovery" });
  await expect(reloaded.refreshTokens()).resolves.toBe("recovered");
  const key = new Headers(fetch.mock.calls[0]?.[1]?.headers).get(
    "x-refresh-request-id"
  );
  expect(key).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    new Headers(fetch.mock.calls[2]?.[1]?.headers).get("x-refresh-request-id")
  ).toBe(key);
  expect(fetch.mock.calls[1]?.[1]?.method).toBe("HEAD");
  expect(values.size).toBe(0);
  reloaded.setAccessToken(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("曾支持恢复的后端回退后，必须重新探测而不能重放旧 Cookie", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "valid", expires_in: 900 }), {
        headers: { "x-refresh-recovery": "v1" }
      })
    )
    .mockRejectedValueOnce(new TypeError("response lost after rollback"))
    .mockResolvedValueOnce(new Response(null, { status: 405 }));
  const manager = createTokenManager({ baseUrl: "/rollback-recovery" });
  await expect(manager.refreshTokens()).resolves.toBe("valid");
  await expect(manager.refreshTokens()).rejects.toThrow("response lost");
  await vi.advanceTimersByTimeAsync(600_000);
  expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
    "POST",
    "POST",
    "HEAD"
  ]);
  await expect(manager.refreshTokens()).rejects.toThrow("请重新登录");
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(manager.getToken()).toBe("valid");
  manager.setAccessToken(null);
});

it("旧标签页恢复未获后端安全能力时不发 POST，后端升级后可继续", async () => {
  vi.useFakeTimers();
  const marker = "tsz:refresh-unconfirmed:/legacy";
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
        headers: { "x-refresh-recovery": "v1" }
      })
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: { "x-refresh-recovery": "v1", "x-refresh-current-only": "v1" }
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "restored", expires_in: 900 }),
        { headers: { "x-refresh-recovery": "v1" } }
      )
    );
  const manager = createTokenManager({ baseUrl: "/legacy" });
  await expect(manager.refreshTokens()).rejects.toThrow("请重新登录");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(values.get(marker)).toBe("1");
  await expect(manager.refreshTokens()).resolves.toBe("restored");
  expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
    "HEAD",
    "HEAD",
    "POST"
  ]);
  manager.setAccessToken(null);
});

it("旧标签页恢复响应丢失后自动用同键续接，不永久卡在加载中", async () => {
  vi.useFakeTimers();
  const marker = "tsz:refresh-unconfirmed:/legacy";
  const values = new Map([[marker, "1"]]);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  const capability = () =>
    new Response(null, {
      status: 204,
      headers: { "x-refresh-recovery": "v1", "x-refresh-current-only": "v1" }
    });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(capability())
    .mockRejectedValueOnce(new TypeError("response lost"))
    .mockResolvedValueOnce(capability())
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "restored", expires_in: 900 }),
        { headers: { "x-refresh-recovery": "v1" } }
      )
    );
  const manager = createTokenManager({ baseUrl: "/legacy" });
  await expect(manager.refreshTokens()).rejects.toThrow("response lost");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(manager.getToken()).toBe("restored");
  expect(
    new Headers(fetch.mock.calls[3]?.[1]?.headers).get("x-refresh-request-id")
  ).toBe(
    new Headers(fetch.mock.calls[1]?.[1]?.headers).get("x-refresh-request-id")
  );
  expect(values.has(marker)).toBe(false);
  manager.setAccessToken(null);
});
