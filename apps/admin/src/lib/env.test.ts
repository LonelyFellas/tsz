import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts 在模块加载时即读取,故每个用例先 resetModules 再动态 import。
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env", () => {
  it("未配置时回退到默认相对路径", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.API_BASE_URL).toBe("/api/v1");
  });

  it("采用配置的 API 基址", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api/v1");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.API_BASE_URL).toBe("https://api.example.com/api/v1");
  });
});
