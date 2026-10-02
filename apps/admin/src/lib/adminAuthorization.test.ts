import { QueryClient } from "@tanstack/react-query";
import { createAdminAuthStore, createAdminAuthRuntime } from "@tsz/shared/auth";
import type { AdminProfile } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  adminAuthorizationIdentity,
  bindAdminAuthorizationCache
} from "./adminAuthorization";

const profile: AdminProfile = {
  id: "a",
  role: "admin",
  phone: "13800138000",
  display_name: "管理员",
  preferences: { dialect: "uk" },
  permission_version: 1,
  catalog_version: "v1",
  permissions: ["users.access", "users.read_sensitive"]
};

describe("身份和授权缓存边界", () => {
  it("无关grant变化保留words缓存；users失权只取消并移除users模块", async () => {
    const store = createAdminAuthStore();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    store.getState().setProfile({
      ...profile,
      permissions: [...profile.permissions, "words.access"]
    });
    const detach = bindAdminAuthorizationCache(store, client);
    client.setQueryData(["admin-words", "detail", "draft"], { word: "center" });
    store.getState().setProfile({
      ...profile,
      permission_version: 2,
      permissions: [...profile.permissions, "words.access", "sentences.access"]
    });
    expect(client.getQueryData(["admin-words", "detail", "draft"])).toEqual({
      word: "center"
    });
    const aborted = vi.fn();
    let release!: (value: string) => void;
    const pending = client
      .fetchQuery({
        queryKey: ["admin-users", "sensitive"],
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", aborted);
          return new Promise<string>((resolve) => {
            release = resolve;
          });
        }
      })
      .catch(() => undefined);
    store.getState().setProfile({
      ...profile,
      permission_version: 3,
      permissions: ["words.access", "sentences.access"]
    });
    expect(aborted).toHaveBeenCalledOnce();
    expect(client.getQueryData(["admin-words", "detail", "draft"])).toEqual({
      word: "center"
    });
    release("迟到用户敏感信息");
    await pending;
    expect(client.getQueryData(["admin-users", "sensitive"])).toBeUndefined();
    detach();
    client.clear();
  });
  it("同身份同权限的归属拒绝刷新不清缓存；permissions顺序也不影响身份", () => {
    const store = createAdminAuthStore();
    const client = new QueryClient();
    store.getState().setProfile(profile);
    const detach = bindAdminAuthorizationCache(store, client);
    client.setQueryData(["admin-users"], { phone: "13800138000" });
    store.getState().setProfile({
      ...profile,
      permissions: [...profile.permissions].reverse()
    });
    expect(client.getQueryData(["admin-users"])).toEqual({
      phone: "13800138000"
    });
    expect(adminAuthorizationIdentity(profile)).toBe(
      adminAuthorizationIdentity({
        ...profile,
        permissions: [...profile.permissions].reverse()
      })
    );
    detach();
    client.clear();
  });
  it("资源归属403重读同一本人且权限未变，不清其他业务缓存或登出", async () => {
    const rt = createAdminAuthRuntime({ baseUrl: "/api/v1/admin" });
    const client = new QueryClient();
    rt.tokens.setAccessToken("token");
    rt.store.getState().setProfile(profile);
    const detach = bindAdminAuthorizationCache(rt.store, client);
    client.setQueryData(["admin-users"], { phone: "13800138000" });
    const cancel = vi.spyOn(client, "cancelQueries");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/profile")
              ? profile
              : {
                  type: "urn:tsz:problem:entry_annotation_forbidden",
                  title: "Forbidden",
                  status: 403,
                  detail: "not owner",
                  code: "entry_annotation_forbidden"
                }
          ),
          { status: String(url).endsWith("/profile") ? 200 : 403 }
        )
    );
    await expect(
      rt.api.words.updateAnnotation("other-entry", {
        annotation: "x",
        base_annotation_revision: 1
      })
    ).rejects.toMatchObject({
      status: 403,
      code: "entry_annotation_forbidden"
    });
    await vi.waitFor(() =>
      expect(rt.store.getState().profile).not.toBe(profile)
    );
    expect(rt.store.getState().profile).toEqual(profile);
    expect(rt.tokens.getToken()).toBe("token");
    expect(client.getQueryData(["admin-users"])).toEqual({
      phone: "13800138000"
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/profile"))
    ).toHaveLength(1);
    fetch.mockRestore();
    cancel.mockRestore();
    detach();
    rt.tokens.setAccessToken(null);
    client.clear();
  });

  it("撤销read_sensitive取消users查询并清敏感缓存，不触碰原件和词条；超管降级清管理查询", async () => {
    const store = createAdminAuthStore();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    store.getState().setProfile(profile);
    const detach = bindAdminAuthorizationCache(store, client);
    client.setQueryData(["teacher-application", "original"], "保留有权模块");
    const aborted = vi.fn();
    let release!: (value: string) => void;
    const pending = client
      .fetchQuery({
        queryKey: ["admin-users", "detail"],
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", aborted);
          return new Promise<string>((resolve) => {
            release = resolve;
          });
        }
      })
      .catch(() => undefined);
    store.getState().setProfile({
      ...profile,
      permission_version: 2,
      permissions: ["users.access"]
    });
    expect(aborted).toHaveBeenCalledOnce();
    expect(client.getQueryData(["teacher-application", "original"])).toBe(
      "保留有权模块"
    );
    release("迟到敏感数据");
    await pending;
    expect(client.getQueryData(["admin-users", "detail"])).toBeUndefined();
    store.getState().setProfile({ ...profile, role: "super_admin" });
    client.setQueryData(["permission-system", "catalog"], "超管目录");
    client.setQueryData(["admin-words"], "仍有权词条");
    store.getState().setProfile({ ...profile, permissions: ["words.access"] });
    expect(
      client.getQueryData(["permission-system", "catalog"])
    ).toBeUndefined();
    // 降级同时失去词条写权限，词条查询也属于受影响模块，必须清除。
    expect(client.getQueryData(["admin-words"])).toBeUndefined();
    detach();
    client.clear();
  });

  it.each([
    { ...profile, id: "b" },
    { ...profile, catalog_version: "v2" },
    null
  ])("换账号/撤权/目录世代变化取消查询并清敏感缓存", async (next) => {
    const store = createAdminAuthStore();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    store.getState().setProfile(profile);
    const detach = bindAdminAuthorizationCache(store, client);
    client.setQueryData(["admin-users"], { phone: "13800138000" });
    const aborted = vi.fn();
    let release!: (value: string) => void;
    const pending = client
      .fetchQuery({
        queryKey: ["teacher-original"],
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", aborted);
          return new Promise<string>((resolve) => {
            release = resolve;
          });
        }
      })
      .catch(() => undefined);
    store.getState().setProfile(next);
    expect(aborted).toHaveBeenCalledOnce();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    release("迟到原件");
    await pending;
    expect(client.getQueryData(["teacher-original"])).toBeUndefined();
    expect(client.getQueryData(["admin-users"])).toBeUndefined();
    detach();
    client.clear();
  });
});
