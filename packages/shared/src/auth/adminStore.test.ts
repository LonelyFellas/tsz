import type { AdminProfile } from "@tsz/api-client";
import { describe, expect, it } from "vitest";
import { createAdminAuthStore } from "./adminStore";

const PROFILE: AdminProfile = {
  id: "a1",
  phone: "13800138000",
  display_name: "Administrator",
  level: "super_admin"
};

describe("createAdminAuthStore", () => {
  it("初始为未登录未恢复", () => {
    const s = createAdminAuthStore().getState();
    expect(s.profile).toBeNull();
    expect(s.level).toBeNull();
    expect(s.hydrated).toBe(false);
  });

  it("setProfile 同步派生 level", () => {
    const store = createAdminAuthStore();
    store.getState().setProfile(PROFILE);
    expect(store.getState().profile).toEqual(PROFILE);
    expect(store.getState().level).toBe("super_admin");
  });

  it("setProfile(null) 清空 profile 与 level", () => {
    const store = createAdminAuthStore();
    store.getState().setProfile(PROFILE);
    store.getState().setProfile(null);
    expect(store.getState().profile).toBeNull();
    expect(store.getState().level).toBeNull();
  });

  it("setHydrated 标记会话恢复完成", () => {
    const store = createAdminAuthStore();
    expect(store.getState().hydrated).toBe(false);
    store.getState().setHydrated(true);
    expect(store.getState().hydrated).toBe(true);
  });

  it("每次创建相互独立", () => {
    const a = createAdminAuthStore();
    const b = createAdminAuthStore();
    a.getState().setProfile(PROFILE);
    expect(b.getState().profile).toBeNull();
  });
});
