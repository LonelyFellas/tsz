import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts 在模块加载时即读取,故每个用例先 resetModules 再动态 import。
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env", () => {
  it("未配置时回退到 API 默认路径并在非生产默认启用 wizard/mock", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    vi.stubEnv("VITE_WORD_CREATION_WIZARD", undefined);
    vi.stubEnv("VITE_ADMIN_WORDS_MOCK", undefined);
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.API_BASE_URL).toBe("/api/v1");
    expect(env.WORD_CREATION_WIZARD).toBe(true);
    expect(env.ADMIN_WORDS_MOCK).toBe(true);
  });

  it("采用配置的 API 基址", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api/v1");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.API_BASE_URL).toBe("https://api.example.com/api/v1");
  });

  it("生产环境未配置时默认关闭尚未接入真实后端的新向导与 mock", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_WORD_CREATION_WIZARD", undefined);
    vi.stubEnv("VITE_ADMIN_WORDS_MOCK", undefined);
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.WORD_CREATION_WIZARD).toBe(false);
    expect(env.ADMIN_WORDS_MOCK).toBe(false);
  });

  it.each([
    ["VITE_WORD_CREATION_WIZARD", "true", true],
    ["VITE_WORD_CREATION_WIZARD", "false", false],
    ["VITE_ADMIN_WORDS_MOCK", "true", true],
    ["VITE_ADMIN_WORDS_MOCK", "false", false]
  ] as const)("严格解析 %s=%s", async (name, value, expected) => {
    vi.stubEnv(name, value);
    vi.resetModules();
    const { env } = await import("./env");
    const key =
      name === "VITE_WORD_CREATION_WIZARD"
        ? "WORD_CREATION_WIZARD"
        : "ADMIN_WORDS_MOCK";
    expect(env[key]).toBe(expected);
  });

  it.each(["1", "yes", "TRUE", " false "])(
    "拒绝模糊布尔值 %s",
    async (value) => {
      vi.stubEnv("VITE_WORD_CREATION_WIZARD", value);
      vi.resetModules();
      await expect(import("./env")).rejects.toThrow(
        "VITE_WORD_CREATION_WIZARD 只能是"
      );
    }
  );
});

describe("admin words mock production policy", () => {
  it("生产环境开启 mock 时 fail closed", async () => {
    const { assertAdminWordsMockAllowed } = await import("./env-flags");
    expect(() => assertAdminWordsMockAllowed(true, true)).toThrow(
      "生产环境禁止启用 VITE_ADMIN_WORDS_MOCK"
    );
  });

  it("非生产环境或关闭 mock 时允许启动", async () => {
    const { assertAdminWordsMockAllowed } = await import("./env-flags");
    expect(() => assertAdminWordsMockAllowed(true, false)).not.toThrow();
    expect(() => assertAdminWordsMockAllowed(false, true)).not.toThrow();
  });
});
