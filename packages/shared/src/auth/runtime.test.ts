import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthRuntime } from "./runtime";

afterEach(() => {
  vi.useRealTimers();
});

describe("createAuthRuntime", () => {
  it("装配出 api / store / tokens 三件套", () => {
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    expect(rt.api.auth.login).toBeTypeOf("function");
    expect(rt.store.getState().user).toBeNull();
    expect(rt.tokens.getToken()).toBeUndefined();
  });

  it("persistSession 写入内存 token 并排期刷新", () => {
    vi.useFakeTimers();
    const rt = createAuthRuntime({ baseUrl: "/api/v1" });
    rt.persistSession({ access_token: "at-1", expires_in: 900 });
    expect(rt.tokens.getToken()).toBe("at-1");
    rt.tokens.setAccessToken(null); // 清掉排期的刷新定时器，避免悬挂
  });
});
