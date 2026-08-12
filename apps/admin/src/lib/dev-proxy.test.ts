import { describe, expect, it } from "vitest";
import { buildAdminDevProxy, DEFAULT_ADMIN_BACKEND_API_URL } from "./dev-proxy";

describe("admin dev proxy", () => {
  it("默认代理到本地 tsz-rust 8383，并保留 /api/v1 基址", () => {
    expect(DEFAULT_ADMIN_BACKEND_API_URL).toBe("http://localhost:8383/api/v1");
    const proxy = buildAdminDevProxy()["/api/v1"];

    expect(proxy.target).toBe("http://localhost:8383");
    expect(proxy.changeOrigin).toBe(true);
    expect(proxy.cookieDomainRewrite).toBe("");
    expect(proxy.rewrite("/api/v1/admin/lexicon/detections")).toBe(
      "/api/v1/admin/lexicon/detections"
    );
  });

  it("支持带自定义基址的测试后端", () => {
    const proxy = buildAdminDevProxy("https://test.example.com/backend/v1/")[
      "/api/v1"
    ];

    expect(proxy.target).toBe("https://test.example.com");
    expect(proxy.rewrite("/api/v1/admin/profile")).toBe(
      "/backend/v1/admin/profile"
    );
  });

  it.each([
    ["not a url", "不是合法 URL"],
    ["ftp://localhost/api/v1", "缺少 http(s) 协议"],
    ["http://localhost:8383", "缺少路径前缀"]
  ])("拒绝非法代理地址 %s", (value, message) => {
    expect(() => buildAdminDevProxy(value)).toThrow(message);
  });
});
