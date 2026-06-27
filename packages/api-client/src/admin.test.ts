import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";

// 用 mock HttpClient 验证每个 admin endpoint 的 method / path / body。
// 路径相对 baseUrl=/api/v1/admin，故此处只断言相对段（/auth/login → /api/v1/admin/auth/login）。
const http = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn()
} as unknown as HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAdminEndpoints", () => {
  it("login → POST /auth/login 带 identifier + password，skipAuth", () => {
    const api = createAdminEndpoints(http);
    api.auth.login("13800138000", "s3cretpass");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/login",
      { identifier: "13800138000", password: "s3cretpass" },
      { skipAuth: true }
    );
  });

  it("refresh → POST /auth/refresh 无 body", () => {
    const api = createAdminEndpoints(http);
    api.auth.refresh();
    expect(http.post).toHaveBeenCalledWith("/auth/refresh");
  });

  it("logout → POST /auth/logout 无 body", () => {
    const api = createAdminEndpoints(http);
    api.auth.logout();
    expect(http.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("logoutAll → POST /auth/logout-all 无 body", () => {
    const api = createAdminEndpoints(http);
    api.auth.logoutAll();
    expect(http.post).toHaveBeenCalledWith("/auth/logout-all");
  });

  it("profile → GET /profile", () => {
    const api = createAdminEndpoints(http);
    api.profile();
    expect(http.get).toHaveBeenCalledWith("/profile");
  });
});
