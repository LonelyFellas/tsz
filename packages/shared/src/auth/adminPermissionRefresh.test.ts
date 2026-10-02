import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { createAdminAuthRuntime } from "./adminRuntime";

const profile = {
  id: "a",
  role: "admin" as const,
  phone: "13800138000",
  display_name: "管理员",
  preferences: { dialect: "uk" as const },
  permission_version: 1,
  catalog_version: "v1",
  permissions: ["words.access", "users.access"]
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const forbidden = (code = "forbidden") =>
  json(
    {
      type: `urn:tsz:problem:${code}`,
      title: "拒绝访问",
      status: 403,
      detail: "denied",
      code
    },
    403
  );
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("管理员权限刷新", () => {
  it("旧profile响应在业务403后到达，singleflight必须排队再读并应用撤权后的版本", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("token");
    rt.store.getState().setProfile(profile);
    let releaseOld!: (response: Response) => void;
    let releaseFresh!: (response: Response) => void;
    let reads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (!String(url).endsWith("/profile")) return forbidden();
      reads++;
      return new Promise<Response>((resolve) => {
        if (reads === 1) releaseOld = resolve;
        else releaseFresh = resolve;
      });
    });
    const pending = rt.refreshProfile();
    await vi.waitFor(() => expect(releaseOld).toBeTypeOf("function"));
    await expect(rt.api.users.get("revoked")).rejects.toBeInstanceOf(HttpError);
    releaseOld(json(profile));
    await vi.waitFor(() => expect(reads).toBe(2));
    expect(rt.store.getState().profile).toEqual(profile);
    expect(rt.refreshProfile()).toBe(pending);
    releaseFresh(json({ ...profile, permission_version: 8, permissions: [] }));
    await pending;
    expect(rt.store.getState().profile?.permission_version).toBe(8);
    expect(rt.store.getState().profile?.permissions).toEqual([]);
    rt.tokens.setAccessToken(null);
  });
  it.each([
    "forbidden",
    "entry_edit_forbidden",
    "entry_annotation_forbidden",
    "entry_annotation_not_owner",
    "entry_delete_forbidden",
    "sentence_edit_forbidden",
    "future_business_forbidden"
  ])("并发业务403(%s)、恢复与focus刷新合并，不登出", async (code) => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("token");
    rt.store.getState().setProfile(profile);
    let release!: (response: Response) => void;
    let reads = 0;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (!String(url).endsWith("/profile")) return forbidden(code);
        reads++;
        return reads === 1
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : json({ ...profile, permission_version: 2, permissions: [] });
      });
    await Promise.allSettled([
      rt.api.users.get("1"),
      rt.api.users.get("2"),
      rt.api.users.get("3")
    ]);
    const focus = rt.refreshProfile();
    const restore = rt.restoreSession();
    expect(focus).toBe(restore);
    expect(rt.store.getState().profile).toEqual(profile);
    expect(rt.store.getState().role).toBe("admin");
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/profile"))
    ).toHaveLength(1);
    release(json({ ...profile, permission_version: 2, permissions: [] }));
    await focus;
    expect(reads).toBe(2);
    expect(rt.store.getState().profile?.permissions).toEqual([]);
    expect(rt.tokens.getToken()).toBe("token");
    rt.tokens.setAccessToken(null);
  });
  it("focus触发的token续期期间保留已认证超管，直到新的本人profile确认", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    const own = { ...profile, id: "self-super", role: "super_admin" as const };
    rt.tokens.setAccessToken("expired");
    rt.store.getState().setProfile(own);
    const transitions: Array<{ id?: string; role: string | null }> = [];
    const detach = rt.store.subscribe((state) =>
      transitions.push({ id: state.profile?.id, role: state.role })
    );
    let release!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/auth/refresh"))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return new Headers(init?.headers).get("Authorization") ===
        "Bearer expired"
        ? json(
            {
              type: "urn:tsz:problem:invalid_token",
              title: "expired",
              status: 401,
              detail: "expired",
              code: "invalid_token"
            },
            401
          )
        : json(own);
    });
    const pending = rt.refreshProfile();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(rt.store.getState().profile).toEqual(own);
    expect(rt.store.getState().role).toBe("super_admin");
    release(json({ access_token: "renewed", expires_in: 900 }));
    await pending;
    expect(rt.store.getState().profile).toEqual(own);
    expect(transitions.length).toBeGreaterThan(0);
    expect(
      transitions.every(
        (state) => state.id === "self-super" && state.role === "super_admin"
      )
    ).toBe(true);
    detach();
    rt.tokens.setAccessToken(null);
  });

  it("profile自身403不递归；普通归属拒绝刷新后权限不变也不登出", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("token");
    rt.store.getState().setProfile(profile);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(forbidden());
    await expect(rt.api.profile()).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(rt.store.getState().profile).toEqual(profile);
    expect(rt.tokens.getToken()).toBe("token");
    rt.tokens.setAccessToken(null);
  });
  it("旧后端profile缺授权字段时立即关闭旧身份，而不是回退全权", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("token");
    rt.store.getState().setProfile(profile);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        id: "a",
        role: "super_admin",
        can_publish_lexicon: true,
        permissions: ["words.access"]
      })
    );
    await expect(rt.refreshProfile()).rejects.toThrow(
      "当前后台版本不支持权限设置"
    );
    expect(rt.store.getState().profile).toBeNull();
    expect(rt.store.getState().permissionModelIncompatible).toBe(true);
    expect(rt.store.getState().hydrated).toBe(true);
    expect(rt.store.getState().connectionError).toBe(false);
    rt.tokens.setAccessToken(null);
  });
  it("换账号时清旧profile，迟到的撤权/响应不能覆盖新身份", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    rt.tokens.setAccessToken("old");
    rt.store.getState().setProfile(profile);
    let release!: (response: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    const old = rt.refreshProfile();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rt.persistSession({ access_token: "new", expires_in: 900 });
    expect(rt.store.getState().profile).toBeNull();
    const next = {
      ...profile,
      id: "b",
      permission_version: 8,
      permissions: ["users.access"]
    };
    fetch.mockResolvedValueOnce(json(next));
    await rt.refreshProfile();
    release(json({ ...profile, permission_version: 99, permissions: [] }));
    await old;
    expect(rt.store.getState().profile).toEqual(next);
    rt.tokens.setAccessToken(null);
  });
  it("account_disabled清会话，must_change_password只跳改密而不作普通撤权刷新", async () => {
    for (const code of ["account_disabled", "must_change_password"]) {
      const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
      rt.tokens.setAccessToken("token");
      rt.store.getState().setProfile(profile);
      const location = { pathname: "/users", href: "" };
      vi.stubGlobal("window", { location });
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(forbidden(code));
      await expect(rt.api.users.get("1")).rejects.toBeInstanceOf(HttpError);
      expect(location.href).toBe(
        code === "account_disabled" ? "/login" : "/change-password"
      );
      expect(rt.store.getState().profile).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch.mockRestore();
      rt.tokens.setAccessToken(null);
      vi.unstubAllGlobals();
    }
  });
});
