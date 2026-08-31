import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActivatePublicationInput,
  AdminWordV2,
  ClaimPendingSentenceAssociationInputV3,
  CreateContentCompletionJobInput,
  EntryLifecycleBatchInput,
  EntryLifecycleInput,
  PreviewFormsImpactInputV2,
  PublishAdminWordV2Input,
  ReplaceSentenceAssociationsInputV3,
  ResolveSentenceTargetsV3Input,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  WordRelationWritableV3,
  WordSentenceWritableV3,
  SuggestDialectVariantsInputV2
} from "@tsz/types";
import { createAdminEndpoints } from "./admin";
import { UnsupportedAdminWordSchemaVersionError } from "./admin-word-schema";
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

const LIFECYCLE_WORD_A = "018f47b8-e3c1-7bd1-9f0a-123456789aa1";
const LIFECYCLE_WORD_B = "018f47b8-e3c1-7bd1-9f0a-123456789aa2";
const LIFECYCLE_WORD_C = "018f47b8-e3c1-7bd1-9f0a-123456789aa3";

function lifecycleWord(id: string): AdminWordV2 {
  const headwords = { mode: "unified", common: "legacy" } as const;
  return {
    schema_version: 2,
    id,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: false,
    headwords,
    detection_snapshot: {
      detection_id: "018f47b8-e3c1-7bd1-9f0a-123456789ab3",
      request: { language: "en", headword: "legacy" },
      normalized_headword: "legacy",
      entry_kind: "word",
      matched_dialect: "common",
      builtin_dictionary_status: "not_found",
      headwords,
      suggested_pos: [],
      detected_at: "2026-08-25T00:00:00Z",
      smart_dictionary_status: "clear"
    },
    forms: { pos: [] },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "basics",
    created_by: "018f47b8-e3c1-7bd1-9f0a-123456789abd",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function lifecycleBatchInput(): EntryLifecycleBatchInput {
  return {
    entries: [
      {
        id: LIFECYCLE_WORD_A,
        base_revision: 1,
        base_lifecycle_revision: 1
      },
      {
        id: LIFECYCLE_WORD_B,
        base_revision: 1,
        base_lifecycle_revision: 1
      }
    ]
  };
}

function lifecycleBatchResponse(ids: string[], affected = ids.length) {
  return { words: ids.map(lifecycleWord), affected };
}

beforeEach(() => {
  vi.clearAllMocks();
  const wordEnvelope = { word: { schema_version: 2 } };
  http.get.mockImplementation((path: string) => {
    if (path.startsWith("/lexicon/entries/related-search?")) {
      return Promise.resolve({ results: [] });
    }
    if (path === "/lexicon/entries" || path.startsWith("/lexicon/entries?")) {
      return Promise.resolve({
        words: [],
        page: { page: 1, page_size: 20, total: 0 }
      });
    }
    return Promise.resolve({ ...wordEnvelope, retired_stable_slots: [] });
  });
  http.post.mockImplementation((path: string) => {
    if (
      path === "/lexicon/entries/archive-batch" ||
      path === "/lexicon/entries/restore-batch"
    ) {
      return Promise.resolve({ words: [], affected: 0 });
    }
    return Promise.resolve(wordEnvelope);
  });
  http.put.mockResolvedValue(wordEnvelope);
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

  // 个人偏好挂在 profile 而不是 /admin/settings/*：后者是全局目录配置（仅超管可写），
  // 这里改的恒是自己的，请求体里没有管理员 ID。
  it("updateProfilePreferences → PATCH /profile/preferences 只带 dialect", () => {
    const api = createAdminEndpoints(http);
    api.updateProfilePreferences({ dialect: "us" });
    expect(http.patch).toHaveBeenCalledWith("/profile/preferences", {
      dialect: "us"
    });
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

  it("list 在成功响应边界拒绝任一未知 schema 版本", async () => {
    http.get.mockResolvedValueOnce({
      words: [
        { id: "w-1", schema_version: 2 },
        { id: "w-2", schema_version: 3 }
      ],
      page: { page: 1, page_size: 20, total: 2 }
    });

    const api = createAdminEndpoints(http);

    await expect(api.words.list()).rejects.toMatchObject({
      name: "UnsupportedAdminWordSchemaVersionError",
      response_path: "words[1].schema_version",
      received_schema_version: 3
    });
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

  it.each([
    {
      name: "createV2",
      httpMethod: "post",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.createV2("op-create-1", {
          schema_version: 2,
          detection_id: "det-1",
          headwords: { mode: "unified", common: "center" }
        })
    },
    {
      name: "saveFormsStep",
      httpMethod: "put",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.saveFormsStep("w-1", {
          base_revision: 1,
          intent: "save",
          content: { pos: [] }
        })
    },
    {
      name: "saveMeaningsStep",
      httpMethod: "put",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.saveMeaningsStep("w-1", {
          base_revision: 1,
          intent: "save",
          content: { sense_groups: [], pos: [] }
        })
    },
    {
      name: "publishV2",
      httpMethod: "post",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.publishV2("w-1", "publish-key", { base_revision: 1 })
    },
    {
      name: "activatePublication",
      httpMethod: "post",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.activatePublication("w-1", "pub-1", "activate-key", {
          base_revision: 1,
          base_lifecycle_revision: 1
        })
    },
    {
      name: "archive",
      httpMethod: "post",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.archive("w-1", "archive-key", {
          base_revision: 1,
          base_lifecycle_revision: 1
        })
    },
    {
      name: "restore",
      httpMethod: "post",
      invoke: (api: ReturnType<typeof createAdminEndpoints>) =>
        api.words.restore("w-1", "restore-key", {
          base_revision: 1,
          base_lifecycle_revision: 1
        })
    }
  ] as const)(
    "$name 对未知响应版本 fail closed",
    async ({ httpMethod, invoke }) => {
      http[httpMethod].mockResolvedValueOnce({
        word: { id: "w-1", schema_version: 4 }
      });
      const api = createAdminEndpoints(http);

      await expect(invoke(api)).rejects.toBeInstanceOf(
        UnsupportedAdminWordSchemaVersionError
      );
    }
  );

  it("get → GET /lexicon/entries/{id}", () => {
    const api = createAdminEndpoints(http);
    api.words.get("w-1");
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries/w-1");
  });

  it("get 在详情进入缓存前拒绝缺失 schema_version 的响应", async () => {
    http.get.mockResolvedValueOnce({ word: { id: "w-1" } });
    const api = createAdminEndpoints(http);

    await expect(api.words.get("w-1")).rejects.toMatchObject({
      code: "unsupported_schema_version",
      response_path: "word.schema_version",
      received_schema_version: undefined
    });
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

  it("正式例句 resolve/replace/list/claim 使用权威路径、分页与幂等 header", () => {
    const pending = new Promise<never>(() => {});
    http.get.mockReturnValue(pending);
    http.post.mockReturnValue(pending);
    http.put.mockReturnValue(pending);
    const api = createAdminEndpoints(http);
    const resolveInput: ResolveSentenceTargetsV3Input = {
      schema_version: 3,
      sentence_text: "It is centered on the center of the wall.",
      source_dialect: "common",
      mode: "selected_segments",
      selected_segments: [
        { start: 22, end: 40, surface: "center of the wall" }
      ],
      include_drafts: true,
      page_size_per_range: 20,
      cursor: "resolve-cursor"
    };
    const replaceInput: ReplaceSentenceAssociationsInputV3 = {
      association_schema_version: 3,
      base_revision: 7,
      base_lifecycle_revision: 3,
      associations: [
        {
          id: "association-1",
          source_dialect: "common",
          source_segments: [
            { start: 22, end: 40, surface: "center of the wall" }
          ],
          pending_target_kind: "phrase",
          pending_target_headword: "center of the wall",
          pending_target_gloss: "墙的中心位置"
        }
      ]
    };
    const claimInput: ClaimPendingSentenceAssociationInputV3 = {
      target_word_id: "target-entry",
      target_sense_id: "target-sense",
      target_publication_id: "target-publication",
      target_form_variant_id: "target-variant",
      base_owner_entry_revision: 7,
      base_owner_lifecycle_revision: 4
    };

    api.words.resolveSentenceTargetsV3(resolveInput);
    api.words.replaceSentenceAssociations(
      "owner-entry",
      "sentence-1",
      "replace-key",
      replaceInput
    );
    api.words.listPendingSentenceAssociations("target-entry", {
      page_size: 20,
      cursor: "pending-cursor"
    });
    api.words.claimPendingSentenceAssociation(
      "association-1",
      "claim-key",
      claimInput
    );

    expect(http.post).toHaveBeenNthCalledWith(
      1,
      "/lexicon/entries/sentence-targets/resolve",
      resolveInput
    );
    expect(http.put).toHaveBeenCalledWith(
      "/lexicon/entries/owner-entry/sentences/sentence-1/associations",
      replaceInput,
      { headers: { "Idempotency-Key": "replace-key" } }
    );
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/entries/target-entry/pending-sentence-associations?page_size=20&cursor=pending-cursor"
    );
    expect(http.post).toHaveBeenNthCalledWith(
      2,
      "/lexicon/pending-sentence-associations/association-1/claim",
      claimInput,
      { headers: { "Idempotency-Key": "claim-key" } }
    );
  });

  it("replace 解码响应并校验 owner path identity", async () => {
    http.put.mockResolvedValue({ word: lifecycleWord(LIFECYCLE_WORD_A) });
    const api = createAdminEndpoints(http);

    const response = await api.words.replaceSentenceAssociations(
      LIFECYCLE_WORD_A,
      "018f47b8-e3c1-7bd1-9f0a-123456789ac1",
      "018f47b8-e3c1-7bd1-9f0a-123456789ac2",
      {
        association_schema_version: 3,
        base_revision: 1,
        base_lifecycle_revision: 1,
        associations: []
      }
    );

    expect(response.word.id).toBe(LIFECYCLE_WORD_A);
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

  it.each(["archiveBatch", "restoreBatch"] as const)(
    "%s 响应任一词条版本未知时拒绝整批",
    async (method) => {
      http.post.mockResolvedValueOnce({
        words: [
          { id: "w-1", schema_version: 2 },
          { id: "w-2", schema_version: null }
        ],
        affected: 2
      });
      const api = createAdminEndpoints(http);

      await expect(
        api.words[method](`${method}-key`, {
          entries: [
            { id: "w-1", base_revision: 1, base_lifecycle_revision: 1 },
            { id: "w-2", base_revision: 1, base_lifecycle_revision: 1 }
          ]
        })
      ).rejects.toMatchObject({
        response_path: "words[1].schema_version",
        received_schema_version: undefined,
        received_schema_version_type: "null",
        reason: "wrong_type"
      });
    }
  );

  it("deleteBatch 的 affected 与请求条数不符时 fail closed", async () => {
    // 原子批量本应全删；affected 对不上说明契约漂移，
    // 静默接受会让 UI 谎报「已永久删除 N 个词条」。
    const api = createAdminEndpoints(http);
    http.post.mockResolvedValueOnce({ affected: 1 });
    await expect(
      api.words.deleteBatch("key", {
        entries: [
          {
            id: LIFECYCLE_WORD_A,
            base_revision: 1,
            base_lifecycle_revision: 1
          },
          { id: LIFECYCLE_WORD_B, base_revision: 1, base_lifecycle_revision: 1 }
        ]
      })
    ).rejects.toMatchObject({ code: "invalid_admin_word_response" });
  });

  it("deleteBatch 的 affected 超过请求条数时同样 fail closed", async () => {
    // 多删了比少删更可疑——后端不该删掉没请求的词条。
    const api = createAdminEndpoints(http);
    http.post.mockResolvedValueOnce({ affected: 5 });
    await expect(
      api.words.deleteBatch("key", {
        entries: [
          { id: LIFECYCLE_WORD_A, base_revision: 1, base_lifecycle_revision: 1 }
        ]
      })
    ).rejects.toMatchObject({ code: "invalid_admin_word_response" });
  });

  it("deleteBatch 的 affected 等于请求条数时通过", async () => {
    const api = createAdminEndpoints(http);
    http.post.mockResolvedValueOnce({ affected: 2 });
    await expect(
      api.words.deleteBatch("key", {
        entries: [
          {
            id: LIFECYCLE_WORD_A,
            base_revision: 1,
            base_lifecycle_revision: 1
          },
          { id: LIFECYCLE_WORD_B, base_revision: 1, base_lifecycle_revision: 1 }
        ]
      })
    ).resolves.toEqual({ affected: 2 });
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
      include_drafts: false,
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
      include_drafts: "false",
      page_size: "20",
      cursor: "opaque-cursor"
    });
  });

  it("relatedSearch legacy facade 过滤 mixed wire 中的 V3 结果并保留分页字段", async () => {
    const v2 = {
      schema_version: 2 as const,
      word_id: "018f47b8-e3c1-7bd1-9f0a-123456789aa1",
      headword: "legacy",
      kind: "word" as const,
      dialects: ["common" as const],
      headword_variants: [{ dialect: "common" as const, headword: "legacy" }],
      pos_labels: ["noun"],
      senses: [
        {
          sense_id: "018f47b8-e3c1-7bd1-9f0a-123456789ab1",
          gloss: "旧版词条"
        }
      ]
    };
    const v3 = {
      schema_version: 3 as const,
      entry_id: "018f47b8-e3c1-7bd1-9f0a-123456789aa3",
      kind: "word" as const,
      presentation: {
        label: "modern",
        matched_surfaces: ["modern"],
        strategy_version: "surface_summary_v1"
      },
      matches: [],
      senses: [
        {
          sense_id: "018f47b8-e3c1-7bd1-9f0a-123456789ab3",
          gloss: "新版词条"
        }
      ]
    };
    http.get.mockResolvedValueOnce({
      results: [v2, v3],
      total: 27,
      next_cursor: "opaque-next"
    });
    const api = createAdminEndpoints(http);

    await expect(api.words.relatedSearch("mixed")).resolves.toEqual({
      results: [v2],
      total: 27,
      next_cursor: "opaque-next"
    });
  });

  it("relatedSearch legacy facade 在过滤前拒绝未知响应 shape", async () => {
    http.get.mockResolvedValueOnce({ results: "not-an-array" });
    const api = createAdminEndpoints(http);

    await expect(api.words.relatedSearch("broken")).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "$",
      reason: "no_union_match"
    });
  });

  it("V3/Any 契约方法复用正式路径并保留 schema_version 与幂等 header", () => {
    const pending = new Promise<never>(() => {});
    http.get.mockReturnValue(pending);
    http.post.mockReturnValue(pending);
    http.put.mockReturnValue(pending);
    const api = createAdminEndpoints(http);
    const forms = { pos: [] };
    const meanings = { sense_groups: [], pos: [] };
    const lifecycle = { base_revision: 7, base_lifecycle_revision: 3 };
    const batch = { entries: [{ id: "w-3", ...lifecycle }] };
    const controller = new AbortController();
    type WritableSentenceHasAssociations =
      "associations" extends keyof WordSentenceWritableV3 ? true : false;
    type WritableRelationHasTargetPresentation =
      "target_headword" extends keyof WordRelationWritableV3 ? true : false;
    const writableSentenceHasAssociations: WritableSentenceHasAssociations = false;
    const writableRelationHasTargetPresentation: WritableRelationHasTargetPresentation = false;

    expect(writableSentenceHasAssociations).toBe(false);
    expect(writableRelationHasTargetPresentation).toBe(false);

    api.words.listAny({ status: "draft" });
    api.words.detectV3({
      schema_version: 3,
      language: "en",
      kind: "word",
      surface: "bright"
    });
    api.words.surfaceMatchSnapshotPageAny(
      "snapshot-3",
      "cursor-3",
      controller.signal
    );
    api.words.surfaceMatchSnapshotPageV3(
      "snapshot-3",
      "cursor-3",
      controller.signal
    );
    api.words.createV3("create-v3-key", {
      schema_version: 3,
      detection_id: "detection-3",
      kind: "word",
      headwords: { mode: "unified", common: "center" }
    });
    api.words.getAny("w-3");
    api.words.previewFormsImpactV3("w-3", {
      schema_version: 3,
      base_revision: 7,
      content: forms
    });
    api.words.saveFormsStepV3("w-3", {
      schema_version: 3,
      base_revision: 7,
      intent: "save",
      content: forms
    });
    api.words.saveMeaningsStepV3("w-3", {
      schema_version: 3,
      base_revision: 7,
      intent: "save",
      content: meanings
    });
    api.words.validateV3("w-3", { schema_version: 3, base_revision: 7 });
    api.words.listPublications("w-3");
    api.words.getPublication("w-3", "publication-3");
    api.words.publishV3("w-3", "publish-v3-key", {
      schema_version: 3,
      base_revision: 7
    });
    api.words.activatePublicationV3("w-3", "publication-3", "activate-v3-key", {
      schema_version: 3,
      ...lifecycle
    });
    api.words.archiveAny("w-3", "archive-any-key", lifecycle);
    api.words.restoreAny("w-3", "restore-any-key", lifecycle);
    api.words.archiveBatchAny("archive-batch-any-key", batch);
    api.words.restoreBatchAny("restore-batch-any-key", batch);
    api.words.relatedSearchAny("bright", {
      kind: "word",
      match_mode: "contains",
      exclude_exact: true,
      include_drafts: true,
      page_size: 20,
      cursor: "related-cursor"
    });

    expect(http.get).toHaveBeenCalledWith("/lexicon/entries?status=draft");
    expect(http.post).toHaveBeenCalledWith("/lexicon/detections", {
      schema_version: 3,
      language: "en",
      kind: "word",
      surface: "bright"
    });
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/surface-match-snapshots/snapshot-3?cursor=cursor-3",
      { signal: controller.signal }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries",
      {
        schema_version: 3,
        detection_id: "detection-3",
        kind: "word",
        headwords: { mode: "unified", common: "center" }
      },
      { headers: { "Idempotency-Key": "create-v3-key" } }
    );
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries/w-3");
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/steps/forms/impact",
      { schema_version: 3, base_revision: 7, content: forms }
    );
    expect(http.put).toHaveBeenCalledWith("/lexicon/entries/w-3/steps/forms", {
      schema_version: 3,
      base_revision: 7,
      intent: "save",
      content: forms
    });
    expect(http.put).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/steps/meanings",
      {
        schema_version: 3,
        base_revision: 7,
        intent: "save",
        content: meanings
      }
    );
    expect(http.post).toHaveBeenCalledWith("/lexicon/entries/w-3/validate", {
      schema_version: 3,
      base_revision: 7
    });
    expect(http.get).toHaveBeenCalledWith("/lexicon/entries/w-3/publications");
    expect(http.get).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/publications/publication-3"
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/publications",
      { schema_version: 3, base_revision: 7 },
      { headers: { "Idempotency-Key": "publish-v3-key" } }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/publications/publication-3/activate",
      { schema_version: 3, ...lifecycle },
      { headers: { "Idempotency-Key": "activate-v3-key" } }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/archive",
      lifecycle,
      { headers: { "Idempotency-Key": "archive-any-key" } }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/w-3/restore",
      lifecycle,
      { headers: { "Idempotency-Key": "restore-any-key" } }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/archive-batch",
      batch,
      { headers: { "Idempotency-Key": "archive-batch-any-key" } }
    );
    expect(http.post).toHaveBeenCalledWith(
      "/lexicon/entries/restore-batch",
      batch,
      { headers: { "Idempotency-Key": "restore-batch-any-key" } }
    );
    const relatedPath = http.get.mock.calls
      .map((call) => call[0] as string)
      .find((path) => path.startsWith("/lexicon/entries/related-search?"));
    expect(
      Object.fromEntries(new URLSearchParams(relatedPath?.split("?")[1]))
    ).toMatchObject({
      q: "bright",
      kind: "word",
      match_mode: "contains",
      exclude_exact: "true",
      include_drafts: "true",
      page_size: "20",
      cursor: "related-cursor"
    });
  });

  it("V3-only command 对 V2 成功响应 fail closed，不静默降级", async () => {
    http.post.mockResolvedValueOnce({ word: { schema_version: 2 } });
    const api = createAdminEndpoints(http);

    await expect(
      api.words.createV3("create-v3-key", {
        schema_version: 3,
        detection_id: "detection-3",
        kind: "word"
      })
    ).rejects.toMatchObject({
      name: "UnsupportedAdminWordSchemaVersionError",
      supported_schema_versions: [3],
      received_schema_version: 2,
      response_path: "word.schema_version"
    });
  });

  it("getAny 返回的 word.id 与 path 不一致时 fail closed", async () => {
    http.get.mockResolvedValueOnce({
      word: lifecycleWord(LIFECYCLE_WORD_B),
      retired_stable_slots: []
    });
    const api = createAdminEndpoints(http);

    await expect(api.words.getAny(LIFECYCLE_WORD_A)).rejects.toMatchObject({
      name: "InvalidAdminWordResponseError",
      response_path: "get.word.id",
      reason: "enum_mismatch",
      received_type: "string"
    });
  });

  it("get/archive/restore Any 保留 identity 一致的正式响应", async () => {
    const word = lifecycleWord(LIFECYCLE_WORD_A);
    http.get.mockResolvedValueOnce({ word, retired_stable_slots: [] });
    http.post.mockResolvedValue({ word });
    const api = createAdminEndpoints(http);
    const input = { base_revision: 1, base_lifecycle_revision: 1 };

    await expect(api.words.getAny(LIFECYCLE_WORD_A)).resolves.toMatchObject({
      word: { id: LIFECYCLE_WORD_A }
    });
    await expect(
      api.words.archiveAny(LIFECYCLE_WORD_A, "archive-key", input)
    ).resolves.toMatchObject({ word: { id: LIFECYCLE_WORD_A } });
    await expect(
      api.words.restoreAny(LIFECYCLE_WORD_A, "restore-key", input)
    ).resolves.toMatchObject({ word: { id: LIFECYCLE_WORD_A } });
  });

  it.each([
    { operation: "archive", responsePath: "archive.word.id" },
    { operation: "restore", responsePath: "restore.word.id" }
  ] as const)(
    "$operation Any 单条响应 word.id 与 path 不一致时 fail closed",
    async ({ operation, responsePath }) => {
      http.post.mockResolvedValueOnce({
        word: lifecycleWord(LIFECYCLE_WORD_B)
      });
      const api = createAdminEndpoints(http);
      const input = { base_revision: 1, base_lifecycle_revision: 1 };
      const request =
        operation === "archive"
          ? api.words.archiveAny(LIFECYCLE_WORD_A, "archive-key", input)
          : api.words.restoreAny(LIFECYCLE_WORD_A, "restore-key", input);

      await expect(request).rejects.toMatchObject({
        name: "InvalidAdminWordResponseError",
        response_path: responsePath,
        reason: "enum_mismatch",
        received_type: "string"
      });
    }
  );

  it.each([
    { operation: "archive", responsePath: "archive_batch" },
    { operation: "restore", responsePath: "restore_batch" }
  ] as const)(
    "$operation Any 批量响应拒绝缺失、额外、重复 identity 和越界 affected",
    async ({ operation, responsePath }) => {
      const api = createAdminEndpoints(http);
      const input = lifecycleBatchInput();
      const call = () =>
        operation === "archive"
          ? api.words.archiveBatchAny("archive-batch-key", input)
          : api.words.restoreBatchAny("restore-batch-key", input);
      const cases = [
        {
          response: lifecycleBatchResponse([LIFECYCLE_WORD_A]),
          expected: {
            response_path: `${responsePath}.words`,
            reason: "too_few_items",
            received_type: "array"
          }
        },
        {
          response: lifecycleBatchResponse([
            LIFECYCLE_WORD_A,
            LIFECYCLE_WORD_B,
            LIFECYCLE_WORD_C
          ]),
          expected: {
            response_path: `${responsePath}.words`,
            reason: "too_many_items",
            received_type: "array"
          }
        },
        {
          response: lifecycleBatchResponse([
            LIFECYCLE_WORD_A,
            LIFECYCLE_WORD_C
          ]),
          expected: {
            response_path: `${responsePath}.words[1].id`,
            reason: "enum_mismatch",
            received_type: "string"
          }
        },
        {
          response: lifecycleBatchResponse([
            LIFECYCLE_WORD_A,
            LIFECYCLE_WORD_A
          ]),
          expected: {
            response_path: `${responsePath}.words[1].id`,
            reason: "enum_mismatch",
            received_type: "string"
          }
        },
        {
          response: lifecycleBatchResponse(
            [LIFECYCLE_WORD_A, LIFECYCLE_WORD_B],
            3
          ),
          expected: {
            response_path: `${responsePath}.affected`,
            reason: "above_maximum",
            received_type: "number"
          }
        }
      ] as const;

      for (const testCase of cases) {
        http.post.mockResolvedValueOnce(testCase.response);
        await expect(call()).rejects.toMatchObject({
          name: "InvalidAdminWordResponseError",
          ...testCase.expected
        });
      }
    }
  );

  it.each(["archive", "restore"] as const)(
    "%s Any 批量响应允许与请求集合相同但顺序不同，affected 可小于数量",
    async (operation) => {
      http.post.mockResolvedValueOnce(
        lifecycleBatchResponse([LIFECYCLE_WORD_B, LIFECYCLE_WORD_A], 1)
      );
      const api = createAdminEndpoints(http);
      const input = lifecycleBatchInput();

      const result =
        operation === "archive"
          ? api.words.archiveBatchAny("archive-batch-key", input)
          : api.words.restoreBatchAny("restore-batch-key", input);
      await expect(result).resolves.toMatchObject({ affected: 1 });
    }
  );

  it("mixed list 对未来 schema_version fail closed", async () => {
    http.get.mockResolvedValueOnce({
      words: [{ schema_version: 4 }],
      page: { page: 1, page_size: 20, total: 1 }
    });
    const api = createAdminEndpoints(http);

    await expect(api.words.listAny()).rejects.toMatchObject({
      supported_schema_versions: [2, 3],
      received_schema_version: 4,
      response_path: "words[0].schema_version"
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
