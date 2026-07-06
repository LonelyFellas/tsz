import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminAuthRuntime,
  redirectToChangePassword
} from "./adminRuntime";

// ── 工具 ──────────────────────────────────────────────────────────────────────

function resp(status: number, body: unknown, ok = status < 400): Response {
  return {
    ok,
    status,
    statusText: "",
    json: async () => body
  } as unknown as Response;
}

const PROFILE_BODY = {
  id: "a1",
  phone: "13800138000",
  display_name: "Administrator",
  level: "admin"
};

// ── 装配 ──────────────────────────────────────────────────────────────────────

describe("createAdminAuthRuntime · 装配", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("装配出 api / store / tokens 三件套", () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    expect(rt.api.auth.login).toBeTypeOf("function");
    expect(rt.api.profile).toBeTypeOf("function");
    expect(rt.store.getState().profile).toBeNull();
    expect(rt.tokens.getToken()).toBeUndefined();
  });

  it("persistSession 写入内存 token 并排期刷新", () => {
    vi.useFakeTimers();
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.persistSession({ access_token: "at-1", expires_in: 900 });
    expect(rt.tokens.getToken()).toBe("at-1");
    rt.tokens.setAccessToken(null); // 清掉排期的刷新定时器，避免悬挂
  });

  it("每次实例化的 store 互相独立", () => {
    const a = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    const b = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    a.store.getState().setProfile({
      id: "a1",
      phone: "1",
      display_name: "X",
      level: "admin"
    });
    expect(b.store.getState().profile).toBeNull();
  });
});

// ── 401 拦截器 + realm 隔离（端到端）─────────────────────────────────────────────
// 这组用真实 fetch 桩贯穿 adminRuntime，验证「请求→401→refresh→重试」整条链路的
// 端点 URL 始终落在 /api/v1/admin/*（绝不串到 web 的 /api/v1/auth/refresh）。

describe("createAdminAuthRuntime · 401 拦截器与 realm 隔离", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("access 过期(401) → 打 admin refresh 端点续期 → 用新 token 重试原请求", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(401, { error: "invalid or expired token" })) // profile
      .mockResolvedValueOnce(
        resp(200, { access_token: "at-2", expires_in: 900 })
      ) // refresh
      .mockResolvedValueOnce(resp(200, PROFILE_BODY)); // profile 重试

    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("at-1"); // 模拟已登录但 token 过期

    const profile = await rt.api.profile();
    expect(profile).toEqual(PROFILE_BODY);

    const urls = fetchMock.mock.calls.map((c) => c[0]);
    // 关键：refresh 落在 admin 自己的端点，而非 web 的 /api/v1/auth/refresh。
    expect(urls).toEqual([
      "/api/v1/admin/profile",
      "/api/v1/admin/auth/refresh",
      "/api/v1/admin/profile"
    ]);

    // refresh 必须 POST + 带 cookie。
    expect(fetchMock.mock.calls[1]![1].method).toBe("POST");
    expect(fetchMock.mock.calls[1]![1].credentials).toBe("include");

    // 重试请求必须携带刷新后的新 token（而非旧的过期 token）。
    const retryHeaders = fetchMock.mock.calls[2]![1].headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toBe("Bearer at-2");
    expect(rt.tokens.getToken()).toBe("at-2");

    rt.tokens.setAccessToken(null); // 清排期定时器
  });

  it("并发请求同时 401 → 只触发一次 refresh（single-flight，防 refresh token 互相转旋失效）", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(401, { error: "x" })) // 请求 A
      .mockResolvedValueOnce(resp(401, { error: "x" })) // 请求 B
      .mockResolvedValueOnce(
        resp(200, { access_token: "at-2", expires_in: 900 })
      ) // 唯一一次 refresh
      .mockResolvedValue(resp(200, PROFILE_BODY)); // 两个重试

    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("at-1");

    const [a, b] = await Promise.all([rt.api.profile(), rt.api.profile()]);
    expect(a).toEqual(PROFILE_BODY);
    expect(b).toEqual(PROFILE_BODY);

    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/api/v1/admin/auth/refresh")
    );
    expect(refreshCalls).toHaveLength(1);

    rt.tokens.setAccessToken(null);
  });

  it("refresh 自身也 401（admin 被禁用/会话过期）→ 清内存 token，会话结束", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(401, { error: "invalid or expired token" })) // profile
      .mockResolvedValueOnce(
        resp(401, { error: "invalid refresh token" }, false)
      ); // refresh 失败

    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("at-1");

    await expect(rt.api.profile()).rejects.toMatchObject({ status: 401 });
    // 会话彻底结束：token 被清空（守卫据此跳登录页）。
    expect(rt.tokens.getToken()).toBeUndefined();
  });

  it("login 走 skipAuth：401 直接抛凭证错误，不误触发 refresh", async () => {
    fetchMock.mockResolvedValueOnce(
      resp(401, { error: "invalid credentials" })
    );

    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });

    await expect(
      rt.api.auth.login("13800138000", "wrongpass")
    ).rejects.toMatchObject({ status: 401, message: "invalid credentials" });
    // 只发一次请求：登录失败不应触发 refresh 重试。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/admin/auth/login");
  });

  it("受保护请求 403 must_change_password → 整页跳改密页，且仍抛 403", async () => {
    fetchMock.mockResolvedValueOnce(
      resp(403, {
        error: "password change required",
        code: "must_change_password"
      })
    );
    // 本包测试跑在 node 环境（无 window/document）。注入 window.location 观测跳转；
    // tokenManager 见 window 存在会注册 visibilitychange，故一并补 document 桩。
    const location = { href: "", pathname: "/words" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("document", { addEventListener: () => undefined });

    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("at-1");

    await expect(rt.api.profile()).rejects.toMatchObject({
      status: 403,
      code: "must_change_password"
    });
    expect(location.href).toBe("/change-password");
  });
});

// ── 待改密拦截决策（纯逻辑，注入 window.location 桩）───────────────────────────────
describe("redirectToChangePassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("code=must_change_password 且不在改密页：整页跳改密页", () => {
    const location = { href: "", pathname: "/words" };
    vi.stubGlobal("window", { location });
    redirectToChangePassword("must_change_password", "/change-password");
    expect(location.href).toBe("/change-password");
  });

  it("已在改密页：不跳（防会话恢复探 profile 的 403 触发自循环）", () => {
    const location = { href: "", pathname: "/change-password" };
    vi.stubGlobal("window", { location });
    redirectToChangePassword("must_change_password", "/change-password");
    expect(location.href).toBe("");
  });

  it("其它 403 code（如 account disabled 无 code）：不跳", () => {
    const location = { href: "", pathname: "/words" };
    vi.stubGlobal("window", { location });
    redirectToChangePassword(undefined, "/change-password");
    expect(location.href).toBe("");
  });

  it("无 window（SSR/node）：不抛错", () => {
    vi.stubGlobal("window", undefined);
    expect(() =>
      redirectToChangePassword("must_change_password", "/change-password")
    ).not.toThrow();
  });
});
