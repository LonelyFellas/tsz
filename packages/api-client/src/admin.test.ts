import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivatePublicationInput,
  CreateContentCompletionJobInput,
  EntryLifecycleBatchInput,
  EntryLifecycleInput,
  PreviewFormsImpactInputV2,
  PublishAdminWordV2Input,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  SuggestDialectVariantsInputV2
} from "@tsz/types";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";

// 用 mock HttpClient 验证每个 admin endpoint 的 method / path / body。
// 路径相对 baseUrl=/api/v1/admin，故此处只断言相对段（/auth/login → /api/v1/admin/auth/login）。
const http = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn()
} as unknown as HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAdminEndpoints", () => {
  // admin 登录是三要素 2FA（手机号+密码+验证码，后端 AdminLoginRequest 三字段全 required）。
  // 登录标识仅手机号（Q9：admin 无 email，get_by_phone 精确匹配），故字段名是 phone 不是 identifier。
  it("login → POST /auth/login 带 phone + password + code，skipAuth", () => {
    const api = createAdminEndpoints(http);
    api.auth.login("13800138000", "s3cretpass", "123456");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/login",
      { phone: "13800138000", password: "s3cretpass", code: "123456" },
      { skipAuth: true }
    );
  });

  // 2FA 第一步：先发码。后端 login-code 恒 202（反枚举），前端无凭证要求 → skipAuth。
  it("requestLoginCode → POST /auth/login-code 带 phone，skipAuth", () => {
    const api = createAdminEndpoints(http);
    api.auth.requestLoginCode("13800138000");
    expect(http.post).toHaveBeenCalledWith(
      "/auth/login-code",
      { phone: "13800138000" },
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

  it("changePassword → POST /auth/change-password 带 current/new 密码", () => {
    const api = createAdminEndpoints(http);
    api.auth.changePassword("old-temp-pw!!", "brand-new-pw-2026");
    expect(http.post).toHaveBeenCalledWith("/auth/change-password", {
      current_password: "old-temp-pw!!",
      new_password: "brand-new-pw-2026"
    });
  });

  it("profile → GET /profile", () => {
    const api = createAdminEndpoints(http);
    api.profile();
    expect(http.get).toHaveBeenCalledWith("/profile");
  });
});

describe("createAdminEndpoints — speech 试听", () => {
  it("voices → GET /speech/voices 带 AbortSignal", () => {
    const api = createAdminEndpoints(http);
    const controller = new AbortController();
    api.speech.voices(controller.signal);
    expect(http.get).toHaveBeenCalledWith("/speech/voices", {
      signal: controller.signal
    });
  });

  it("preview → POST /speech/previews 原样发送 snake_case wire", () => {
    const api = createAdminEndpoints(http);
    const controller = new AbortController();
    const input = {
      content: {
        version: 2 as const,
        text: "hello",
        annotations: [
          {
            type: "emphasis" as const,
            start: 0,
            end: 5,
            level: "strong" as const
          }
        ]
      },
      voice_alias: "ava",
      style: "cheerful",
      rate_percent: 5,
      pitch_semitones: -1
    };
    api.speech.preview(input, controller.signal);
    expect(http.post).toHaveBeenCalledWith("/speech/previews", input, {
      signal: controller.signal
    });
  });
});

describe("createAdminEndpoints — 智能词库 words", () => {
  it("list 无参 → GET /lexicon/entries(不带 ?)", () => {
    const api = createAdminEndpoints(http);
    api.words.list();
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries");
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
    expect(path.startsWith("/lexicon/entries?")).toBe(true);
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

  it("stats → GET /lexicon/entries/stats", () => {
    const api = createAdminEndpoints(http);
    api.words.stats();
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries/stats");
  });

  it("detect → POST /lexicon/detections 原样透传语言与待检测词头", () => {
    const api = createAdminEndpoints(http);
    const input = {
      language: "en" as const,
      headword: "center"
    };
    api.words.detect(input);
    expect(http.post).toHaveBeenCalledWith("/lexicon/detections", input);
  });

  it("surfaceMatchSnapshotPage → GET 精确 snapshot/cursor 并透传取消信号", () => {
    const api = createAdminEndpoints(http);
    const controller = new AbortController();
    api.words.surfaceMatchSnapshotPage(
      "snapshot-1",
      "cursor/next+1",
      controller.signal
    );
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/surface-match-snapshots/snapshot-1?cursor=cursor%2Fnext%2B1",
      { signal: controller.signal }
    );
  });

  it("suggestDialectVariants → POST /lexicon/dialect-variant-suggestions 原样透传建议项", () => {
    const api = createAdminEndpoints(http);
    const input: SuggestDialectVariantsInputV2 = {
      source_dialect: "uk",
      target_dialect: "us",
      items: [{ client_id: "form-1", field_kind: "form", value: "centre" }]
    };
    api.words.suggestDialectVariants(input);
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/dialect-variant-suggestions",
      input
    );
  });

  it("createV2 → POST /lexicon/entries，幂等键只进 header", () => {
    const api = createAdminEndpoints(http);
    const input = {
      schema_version: 2 as const,
      detection_id: "det-1",
      headwords: {
        mode: "distinguish" as const,
        uk: "centre",
        us: "center",
        source_dialect: "us" as const
      }
    };
    api.words.createV2("op-create-1", input);
    expect(http.post).toHaveBeenCalledWith("/lexicon/entries", input, {
      headers: { "Idempotency-Key": "op-create-1" }
    });
  });

  it("get → GET /lexicon/entries/{id}", () => {
    const api = createAdminEndpoints(http);
    api.words.get("w-1");
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries/w-1");
  });

  it("previewFormsImpact → POST /lexicon/entries/{id}/steps/forms/impact", () => {
    const api = createAdminEndpoints(http);
    const input: PreviewFormsImpactInputV2 = {
      base_revision: 3,
      content: { pos: [] }
    };
    api.words.previewFormsImpact("w-2", input);
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/steps/forms/impact",
      input
    );
  });

  it("saveFormsStep → PUT /lexicon/entries/{id}/steps/forms 原样透传独立双 token", () => {
    const api = createAdminEndpoints(http);
    const input: SaveFormsStepInput = {
      base_revision: 3,
      intent: "save",
      confirmed_impact_token: "impact-token-1",
      confirmed_surface_match_token: "surface-token-1",
      content: { pos: [] }
    };
    api.words.saveFormsStep("w-2", input);
    expect(http.put).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/steps/forms",
      input
    );
  });

  it("saveMeaningsStep → PUT /lexicon/entries/{id}/steps/meanings", () => {
    const api = createAdminEndpoints(http);
    const input: SaveMeaningsStepInput = {
      base_revision: 4,
      intent: "complete",
      content: { sense_groups: [], pos: [] }
    };
    api.words.saveMeaningsStep("w-2", input);
    type HasSurfaceToken =
      "confirmed_surface_match_token" extends keyof SaveMeaningsStepInput
        ? true
        : false;
    type HasImpactToken =
      "confirmed_impact_token" extends keyof SaveMeaningsStepInput
        ? true
        : false;
    const hasSurfaceToken: HasSurfaceToken = false;
    const hasImpactToken: HasImpactToken = false;
    expect(hasSurfaceToken).toBe(false);
    expect(hasImpactToken).toBe(false);
    expect(input).not.toHaveProperty("confirmed_surface_match_token");
    expect(input).not.toHaveProperty("confirmed_impact_token");
    expect(http.put).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/steps/meanings",
      input
    );
  });

  it("content completion create/get/retry 使用权威路径和独立幂等 header", () => {
    const api = createAdminEndpoints(http);
    const input: CreateContentCompletionJobInput = {
      base_revision: 4,
      scope: ["grammar_structures", "meanings", "examples"],
      fill_policy: "missing_only"
    };
    api.words.createContentCompletionJob("w-2", "generate-key", input);
    api.words.getContentCompletionJob("w-2", "job-1");
    api.words.retryContentCompletionJob("w-2", "job-1", "retry-key", {
      pos_ids: ["pos-1"]
    });
    expect(http.post).toHaveBeenNthCalledWith(
      1,
      "/lexicon/entries/w-2/content-completion-jobs",
      input,
      { headers: { "Idempotency-Key": "generate-key" } }
    );
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/content-completion-jobs/job-1"
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      "/lexicon/entries/w-2/content-completion-jobs/job-1/retries",
      { pos_ids: ["pos-1"] },
      { headers: { "Idempotency-Key": "retry-key" } }
    );
  });

  it("validateV2 → POST /lexicon/entries/{id}/validate 带 base_revision", () => {
    const api = createAdminEndpoints(http);
    api.words.validateV2("w-2", { base_revision: 5 });
    expect(http.post).toHaveBeenCalledWith("/lexicon/entries/w-2/validate", {
      base_revision: 5
    });
  });

  it("publishV2 → POST /lexicon/entries/{id}/publications，幂等键只进 header", () => {
    const api = createAdminEndpoints(http);
    const input: PublishAdminWordV2Input = {
      base_revision: 5
    };
    api.words.publishV2("w-2", "op-publish-1", input);
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/publications",
      input,
      { headers: { "Idempotency-Key": "op-publish-1" } }
    );
  });

  it("activatePublication → 历史 publication activation 使用独立幂等键", () => {
    const api = createAdminEndpoints(http);
    const input: ActivatePublicationInput = {
      base_revision: 5,
      base_lifecycle_revision: 2,
      confirmed_surface_match_token: "visibility-token"
    };
    api.words.activatePublication("w-2", "pub-1", "activation-key", input);
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-2/publications/pub-1/activate",
      input,
      { headers: { "Idempotency-Key": "activation-key" } }
    );
  });

  it.each([
    ["archive", "/lexicon/entries/w-2/archive"],
    ["restore", "/lexicon/entries/w-2/restore"]
  ] as const)("%s → lifecycle body 与幂等键分离", (method, path) => {
    const api = createAdminEndpoints(http);
    const input: EntryLifecycleInput = {
      base_revision: 5,
      base_lifecycle_revision: 2
    };
    api.words[method]("w-2", `${method}-key`, input);
    expect(http.post).toHaveBeenCalledWith(path, input, {
      headers: { "Idempotency-Key": `${method}-key` }
    });
  });

  it.each([
    ["archiveBatch", "/lexicon/entries/archive-batch"],
    ["restoreBatch", "/lexicon/entries/restore-batch"]
  ] as const)("%s → 原子批量 body 与幂等键分离", (method, path) => {
    const api = createAdminEndpoints(http);
    const input: EntryLifecycleBatchInput = {
      entries: [{ id: "w-2", base_revision: 5, base_lifecycle_revision: 2 }]
    };
    api.words[method](`${method}-key`, input);
    expect(http.post).toHaveBeenCalledWith(path, input, {
      headers: { "Idempotency-Key": `${method}-key` }
    });
  });

  it("deleteDraft → DELETE /lexicon/entries/{id}", () => {
    const api = createAdminEndpoints(http);
    api.words.deleteDraft("w-2", {
      base_revision: 3,
      base_lifecycle_revision: 2
    });
    expect(http.del).toHaveBeenCalledWith("/lexicon/entries/w-2", {
      base_revision: 3,
      base_lifecycle_revision: 2
    });
  });

  it("relatedSearch 不带可选项 → 只有 q 进 query", () => {
    const api = createAdminEndpoints(http);
    api.words.relatedSearch("big");
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/entries/related-search?q=big"
    );
  });

  it("relatedSearch → GET /lexicon/entries/related-search 带 q/kind/limit", () => {
    const api = createAdminEndpoints(http);
    api.words.relatedSearch("big", { kind: "word", limit: 10 });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/lexicon/entries/related-search?")).toBe(true);
    expect(sp.get("q")).toBe("big");
    expect(sp.get("kind")).toBe("word");
    expect(sp.get("limit")).toBe("10");
  });

  it("relatedSearch V2 透传双模式分页参数", () => {
    const api = createAdminEndpoints(http);
    api.words.relatedSearch("workspace", {
      kind: "word",
      match_mode: "contains",
      exclude_exact: true,
      page_size: 20,
      cursor: "opaque-cursor"
    });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(sp)).toMatchObject({
      q: "workspace",
      kind: "word",
      match_mode: "contains",
      exclude_exact: "true",
      page_size: "20",
      cursor: "opaque-cursor"
    });
  });
});

describe("createAdminEndpoints — 系统设置词性配置", () => {
  it("catalog/list 与基本词性 CRUD 使用稳定路径、query 和 body", () => {
    const api = createAdminEndpoints(http);
    api.partOfSpeechSettings.catalog();
    api.partOfSpeechSettings.list({ q: "noun form", page: 2, page_size: 50 });
    api.partOfSpeechSettings.create({
      code: "particle",
      name_zh: "小品词",
      name_en: "PARTICLE",
      abbreviation: "part.",
      sort_order: 100
    });
    api.partOfSpeechSettings.update("pos-1", {
      base_revision: 2,
      name_zh: "小品词",
      name_en: "Particle",
      abbreviation: "ptcl.",
      sort_order: 20
    });
    api.partOfSpeechSettings.remove("pos-1", { base_revision: 4 });

    expect(http.get).toHaveBeenNthCalledWith(
      1,
      "/settings/parts-of-speech/catalog"
    );
    const listPath = http.get.mock.calls[1]![0] as string;
    const query = new URLSearchParams(listPath.split("?")[1]);
    expect(listPath.startsWith("/settings/parts-of-speech?")).toBe(true);
    expect(query.get("q")).toBe("noun form");
    expect(query.get("page")).toBe("2");
    expect(query.get("page_size")).toBe("50");
    expect(http.post).toHaveBeenCalledWith("/settings/parts-of-speech", {
      code: "particle",
      name_zh: "小品词",
      name_en: "PARTICLE",
      abbreviation: "part.",
      sort_order: 100
    });
    expect(http.patch).toHaveBeenCalledWith("/settings/parts-of-speech/pos-1", {
      base_revision: 2,
      name_zh: "小品词",
      name_en: "Particle",
      abbreviation: "ptcl.",
      sort_order: 20
    });
    expect(http.del).toHaveBeenCalledWith(
      "/settings/parts-of-speech/pos-1?base_revision=4"
    );
  });

  it("list 无参不带 query，细分词性 CRUD 使用父子动态 id", () => {
    const api = createAdminEndpoints(http);
    api.partOfSpeechSettings.list();
    api.partOfSpeechSettings.listSubParts("pos-1");
    api.partOfSpeechSettings.createSubPart("pos-1", {
      code: "N-COLLECTIVE",
      name_zh: "集合名词",
      name_en: "Collective noun",
      sort_order: 10
    });
    api.partOfSpeechSettings.updateSubPart("pos-1", "sub-2", {
      base_revision: 3,
      name_zh: "集合类名词",
      name_en: "Collective noun",
      sort_order: 20
    });
    api.partOfSpeechSettings.removeSubPart("pos-1", "sub-2", {
      base_revision: 7
    });

    expect(http.get).toHaveBeenNthCalledWith(1, "/settings/parts-of-speech");
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      "/settings/parts-of-speech/pos-1/sub-parts"
    );
    expect(http.post).toHaveBeenCalledWith(
      "/settings/parts-of-speech/pos-1/sub-parts",
      {
        code: "N-COLLECTIVE",
        name_zh: "集合名词",
        name_en: "Collective noun",
        sort_order: 10
      }
    );
    expect(http.patch).toHaveBeenCalledWith(
      "/settings/parts-of-speech/pos-1/sub-parts/sub-2",
      {
        base_revision: 3,
        name_zh: "集合类名词",
        name_en: "Collective noun",
        sort_order: 20
      }
    );
    expect(http.del).toHaveBeenCalledWith(
      "/settings/parts-of-speech/pos-1/sub-parts/sub-2?base_revision=7"
    );
  });
});

describe("createAdminEndpoints — 用户管理 users", () => {
  it("list 无参 → GET /users(不带 ?)", () => {
    const api = createAdminEndpoints(http);
    api.users.list();
    expect(http.get).toHaveBeenCalledWith("/users");
  });

  it("list 带筛选 → 仅非空参数进 query", () => {
    const api = createAdminEndpoints(http);
    api.users.list({ role: "teacher", q: "alice", page: 3, page_size: 20 });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/users?")).toBe(true);
    expect(sp.get("role")).toBe("teacher");
    expect(sp.get("q")).toBe("alice");
    expect(sp.get("page")).toBe("3");
    expect(sp.get("page_size")).toBe("20");
  });
});

describe("createAdminEndpoints — 管理员管理 admins", () => {
  it("list 无参 → GET /admins(不带 ?)", () => {
    const api = createAdminEndpoints(http);
    api.admins.list();
    expect(http.get).toHaveBeenCalledWith("/admins");
  });

  it("list 带筛选 → role/手机号/昵称/分页进 query", () => {
    const api = createAdminEndpoints(http);
    api.admins.list({
      role: "admin",
      phone: "1380",
      display_name: "王",
      page: 1,
      page_size: 50
    });
    const [path] = http.get.mock.calls[0] as [string];
    const sp = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/admins?")).toBe(true);
    expect(sp.get("role")).toBe("admin");
    expect(sp.get("phone")).toBe("1380");
    expect(sp.get("display_name")).toBe("王");
    expect(sp.get("page")).toBe("1");
    expect(sp.get("page_size")).toBe("50");
  });

  it("create → POST /admins 带建号入参（不含密码/等级，后端生成临时密码）", () => {
    const api = createAdminEndpoints(http);
    const input = {
      phone: "13800138000",
      display_name: "审核员小王",
      code: "123456"
    };
    api.admins.create(input);
    expect(http.post).toHaveBeenCalledWith("/admins", input);
  });

  it("requestCreateCode → POST /admins/create-code 无 body", () => {
    const api = createAdminEndpoints(http);
    api.admins.requestCreateCode();
    expect(http.post).toHaveBeenCalledWith("/admins/create-code");
  });

  it("setStatus → PATCH /admins/{id}/status 带 status", () => {
    const api = createAdminEndpoints(http);
    api.admins.setStatus("a-1", "disabled");
    expect(http.patch).toHaveBeenCalledWith("/admins/a-1/status", {
      status: "disabled"
    });
  });

  it("resetPassword → POST /admins/{id}/reset-password 无 body", () => {
    const api = createAdminEndpoints(http);
    api.admins.resetPassword("a-1");
    expect(http.post).toHaveBeenCalledWith("/admins/a-1/reset-password");
  });

  it("setRole → PATCH /admins/{id}/role 带 role_id", () => {
    const api = createAdminEndpoints(http);
    api.admins.setRole("a-1", "r-9");
    expect(http.patch).toHaveBeenCalledWith("/admins/a-1/role", {
      role_id: "r-9"
    });
  });

  it("setRole(null) → PATCH /admins/{id}/role 收回角色", () => {
    const api = createAdminEndpoints(http);
    api.admins.setRole("a-1", null);
    expect(http.patch).toHaveBeenCalledWith("/admins/a-1/role", {
      role_id: null
    });
  });
});

describe("createAdminEndpoints — 角色治理 roles", () => {
  it("permissions → GET /permissions", () => {
    const api = createAdminEndpoints(http);
    api.roles.permissions();
    expect(http.get).toHaveBeenCalledWith("/permissions");
  });

  it("list → GET /roles", () => {
    const api = createAdminEndpoints(http);
    api.roles.list();
    expect(http.get).toHaveBeenCalledWith("/roles");
  });

  it("create → POST /roles 带 name/description/permissions", () => {
    const api = createAdminEndpoints(http);
    const input = {
      name: "词库管理员",
      description: "管理智能词库与词表",
      permissions: ["words.access", "wordlists.access"] as const
    };
    api.roles.create({ ...input, permissions: [...input.permissions] });
    expect(http.post).toHaveBeenCalledWith("/roles", {
      name: "词库管理员",
      description: "管理智能词库与词表",
      permissions: ["words.access", "wordlists.access"]
    });
  });

  it("update → PATCH /roles/{id} 全量替换权限集", () => {
    const api = createAdminEndpoints(http);
    api.roles.update("r-1", { name: "高级词库管理员", permissions: [] });
    expect(http.patch).toHaveBeenCalledWith("/roles/r-1", {
      name: "高级词库管理员",
      permissions: []
    });
  });

  it("remove → DELETE /roles/{id}", () => {
    const api = createAdminEndpoints(http);
    api.roles.remove("r-1");
    expect(http.del).toHaveBeenCalledWith("/roles/r-1");
  });
});
