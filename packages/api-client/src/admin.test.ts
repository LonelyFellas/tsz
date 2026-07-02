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
  put: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
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

describe("createAdminEndpoints — 智能词库 words", () => {
  it("list 无参 → GET /words(不带 ?)", () => {
    const api = createAdminEndpoints(http);
    api.words.list();
    expect(http.get).toHaveBeenCalledWith("/words");
  });

  it("list 带筛选 → 仅非空参数进 query,值经 URL 编码", () => {
    const api = createAdminEndpoints(http);
    api.words.list({
      page: 2,
      page_size: 50,
      q: "take off",
      gloss: "",
      kind: "phrase",
      level: "B1",
      status: "draft",
      created_from: "2026-07-01T00:00:00Z"
    });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/words?")).toBe(true);
    expect(sp.get("page")).toBe("2");
    expect(sp.get("page_size")).toBe("50");
    expect(sp.get("q")).toBe("take off");
    expect(sp.get("kind")).toBe("phrase");
    expect(sp.get("level")).toBe("B1");
    expect(sp.get("status")).toBe("draft");
    expect(sp.get("created_from")).toBe("2026-07-01T00:00:00Z");
    // 空串参数(gloss)不应出现
    expect(sp.has("gloss")).toBe(false);
  });

  it("stats → GET /words/stats", () => {
    const api = createAdminEndpoints(http);
    api.words.stats();
    expect(http.get).toHaveBeenCalledWith("/words/stats");
  });

  it("create → POST /words 带 headword + kind", () => {
    const api = createAdminEndpoints(http);
    api.words.create({ headword: "take", kind: "word" });
    expect(http.post).toHaveBeenCalledWith("/words", {
      headword: "take",
      kind: "word"
    });
  });

  it("get → GET /words/{id}", () => {
    const api = createAdminEndpoints(http);
    api.words.get("w-1");
    expect(http.get).toHaveBeenCalledWith("/words/w-1");
  });

  it("saveContent → PUT /words/{id}/content 原样透传保存树", () => {
    const api = createAdminEndpoints(http);
    const input = {
      base_updated_at: "2026-07-01T00:00:00Z",
      frequency: "0.5",
      dialect_mode: "unified" as const,
      dialects: [],
      sense_groups: [],
      pos: []
    };
    api.words.saveContent("w-1", input);
    expect(http.put).toHaveBeenCalledWith("/words/w-1/content", input);
  });

  it("publish → POST /words/{id}/publish 无 body", () => {
    const api = createAdminEndpoints(http);
    api.words.publish("w-1");
    expect(http.post).toHaveBeenCalledWith("/words/w-1/publish");
  });

  it("remove → DELETE /words/{id}", () => {
    const api = createAdminEndpoints(http);
    api.words.remove("w-1");
    expect(http.del).toHaveBeenCalledWith("/words/w-1");
  });

  it("batchDelete → POST /words/batch-delete 带 ids", () => {
    const api = createAdminEndpoints(http);
    api.words.batchDelete(["a", "b"]);
    expect(http.post).toHaveBeenCalledWith("/words/batch-delete", {
      ids: ["a", "b"]
    });
  });

  it("relatedSearch 不带可选项 → 只有 q 进 query", () => {
    const api = createAdminEndpoints(http);
    api.words.relatedSearch("big");
    expect(http.get).toHaveBeenCalledWith("/words/related-search?q=big");
  });

  it("relatedSearch → GET /words/related-search 带 q/kind/limit", () => {
    const api = createAdminEndpoints(http);
    api.words.relatedSearch("big", { kind: "word", limit: 10 });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/words/related-search?")).toBe(true);
    expect(sp.get("q")).toBe("big");
    expect(sp.get("kind")).toBe("word");
    expect(sp.get("limit")).toBe("10");
  });
});
