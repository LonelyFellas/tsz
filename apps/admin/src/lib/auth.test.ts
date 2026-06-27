import { describe, expect, it } from "vitest";
import { api, persistSession, tokens, useAuthStore } from "./auth";

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
