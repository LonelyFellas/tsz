import { describe, expect, it } from "vitest";
import type { AdminAuthState } from "@tsz/shared/auth";
import type { AdminProfile } from "@tsz/types";
import {
  api,
  persistSession,
  selectIsSuperAdmin,
  tokens,
  useAuthStore
} from "./auth";

// 只关心 selectIsSuperAdmin 读的 profile.level，其余 store 字段用最小桩填充。
function stateWith(level: AdminProfile["level"] | null): AdminAuthState {
  return {
    profile: level
      ? {
          id: "a-1",
          phone: "13800138000",
          display_name: "管理员",
          level,
          permissions: []
        }
      : null,
    level,
    hydrated: true,
    setProfile: () => {},
    setHydrated: () => {}
  };
}

// 冒烟：模块加载时即装配 admin runtime（baseUrl=/api/v1/admin），
// 校验导出面齐全且 store 初始为未登录，守住装配错误这类回归。
describe("lib/auth", () => {
  it("导出 admin runtime 的 api / tokens / store / persistSession", () => {
    expect(api.auth.login).toBeTypeOf("function");
    expect(api.profile).toBeTypeOf("function");
    expect(tokens.getToken).toBeTypeOf("function");
    expect(persistSession).toBeTypeOf("function");
    expect(useAuthStore.getState().profile).toBeNull();
  });
});

describe("selectIsSuperAdmin", () => {
  it("super_admin → true", () => {
    expect(selectIsSuperAdmin(stateWith("super_admin"))).toBe(true);
  });

  it("普通 admin → false", () => {
    expect(selectIsSuperAdmin(stateWith("admin"))).toBe(false);
  });

  it("未登录（profile 为 null）→ false", () => {
    expect(selectIsSuperAdmin(stateWith(null))).toBe(false);
  });
});
