import type { User } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { createAuthStore } from "./store";

const USER = {
  id: "u1",
  display_name: "管理员",
  roles: ["admin"],
  avatar_url: "",
  status: "active",
  created_at: "",
  updated_at: ""
} as User;

describe("createAuthStore", () => {
  it("初始为未登录未恢复", () => {
    const s = createAuthStore().getState();
    expect(s.user).toBeNull();
    expect(s.activeRole).toBeNull();
    expect(s.onboarded).toBeNull();
    expect(s.hydrated).toBe(false);
  });

  it("setter 写入对应字段", () => {
    const store = createAuthStore();
    store.getState().setUser(USER);
    store.getState().setActiveRole("admin");
    store.getState().setHydrated(true);
    const s = store.getState();
    expect(s.user).toEqual(USER);
    expect(s.activeRole).toBe("admin");
    expect(s.hydrated).toBe(true);
  });

  it("hasRole 基于 user.roles", () => {
    const store = createAuthStore();
    expect(store.getState().hasRole("admin")).toBe(false);
    store.getState().setUser(USER);
    expect(store.getState().hasRole("admin")).toBe(true);
    expect(store.getState().hasRole("teacher")).toBe(false);
  });

  it("每次创建相互独立", () => {
    const a = createAuthStore();
    const b = createAuthStore();
    a.getState().setActiveRole("admin");
    expect(b.getState().activeRole).toBeNull();
  });
});
