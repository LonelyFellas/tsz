import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthState } from "@tsz/shared/auth";
import type { AdminProfile } from "@tsz/types";
import {
  api,
  persistSession,
  selectIsSuperAdmin,
  tokens,
  useAuthStore
} from "./auth";

// 只关心 selectIsSuperAdmin 读的 profile.role，其余 store 字段用最小桩填充。
function stateWith(level: AdminProfile["role"] | null): AdminAuthState {
  return {
    profile: level
      ? {
          id: "a-1",
          phone: "13800138000",
          display_name: "管理员",
          role: level,
          permissions: [],
          preferences: { dialect: "uk" as const }
        }
      : null,
    role: level,
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

// dev-only 的 window.__authStore 是本地无后端时注入登录态的后门，
// 生产构建必须整段消失——这条分支只有换掉 import.meta.env.DEV 才走得到。
// 代价：每次 resetModules + 重新 import 都会新建一个 auth runtime，其 tokenManager 会注册
// 一个不再解绑的 document visibilitychange 监听器。本文件不派发该事件故无害；若日后要在
// 这里加派发 visibilitychange 的用例，先注意会有多个历史 handler 一起跑。
describe("dev-only 调试入口", () => {
  type DevWindow = { __authStore?: unknown };

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as DevWindow).__authStore;
    vi.resetModules();
  });

  it("生产构建（DEV=false）不把 store 挂到 window", async () => {
    delete (window as unknown as DevWindow).__authStore;
    vi.stubEnv("DEV", false);
    vi.resetModules();
    await import("./auth");
    expect((window as unknown as DevWindow).__authStore).toBeUndefined();
  });

  it("开发构建把 store 挂到 window，便于控制台注入登录态", async () => {
    delete (window as unknown as DevWindow).__authStore;
    vi.stubEnv("DEV", true);
    vi.resetModules();
    const mod = await import("./auth");
    expect((window as unknown as DevWindow).__authStore).toBe(mod.useAuthStore);
  });
});
