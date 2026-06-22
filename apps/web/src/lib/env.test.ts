import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts 在模块加载时即 parse,故每个用例先 resetModules 再动态 import。
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env", () => {
  it("未配置时回退到默认 URL", async () => {
    // undefined(而非空串)才触发 zod 的 .default();空串会被 .url() 判为非法。
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("http://localhost:8080/api");
  });

  it("采用合法的自定义 URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("https://api.example.com");
  });

  it("配成非 URL 字符串时校验抛错", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "not-a-url");
    vi.resetModules();
    await expect(import("./env")).rejects.toThrow();
  });
});
