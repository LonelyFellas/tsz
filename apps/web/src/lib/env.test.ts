import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts 在模块加载时即 parse,故每个用例先 resetModules 再动态 import。
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** 以「服务端 + 指定环境/站点地址」重新加载 env.ts,返回捕获到的 console.warn。 */
async function loadOnServer(nodeEnv: string, siteUrl?: string) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // 服务端渲染时没有 window;jsdom 里用 stub 制造同样的 typeof 判定。
  vi.stubGlobal("window", undefined);
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
  vi.resetModules();
  const { env } = await import("./env");
  return { env, warn };
}

describe("env", () => {
  it("未配置时回退到默认相对路径", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("/api/v1");
  });

  it("采用合法的绝对 URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("https://api.example.com");
  });

  it("采用合法的相对路径", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/api/v1");
    vi.resetModules();
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("/api/v1");
  });
});

// 站点地址只在服务端的生产构建里校验:忘了注入真实域名会让 canonical/sitemap/OG
// 静默指向 localhost,这里守住「该告警时告警、不该告警时闭嘴」。
describe("env:SEO 站点地址告警", () => {
  it("未配置时回退到本地开发地址", async () => {
    const { env } = await loadOnServer("development");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("生产构建仍指向 localhost:打印告警", async () => {
    const { warn } = await loadOnServer("production");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_SITE_URL")
    );
  });

  it("生产构建指向 127.0.0.1 同样告警", async () => {
    const { warn } = await loadOnServer("production", "http://127.0.0.1:3000");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("生产构建注入了真实域名:不告警", async () => {
    const { env, warn } = await loadOnServer(
      "production",
      "https://tiansheng.example.com"
    );
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://tiansheng.example.com");
    expect(warn).not.toHaveBeenCalled();
  });

  it("开发环境用 localhost 属正常,不告警", async () => {
    const { warn } = await loadOnServer("development");
    expect(warn).not.toHaveBeenCalled();
  });

  it("浏览器端不做这项校验(告警只面向构建日志)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    vi.resetModules();
    await import("./env");
    expect(warn).not.toHaveBeenCalled();
  });

  it("站点地址不是合法 URL 时直接抛错,不放行到运行期", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "tiansheng.example.com");
    vi.resetModules();
    await expect(import("./env")).rejects.toThrow();
  });
});
