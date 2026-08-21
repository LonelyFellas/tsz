import { describe, expect, it } from "vitest";
import { createAdminEndpoints } from "./admin";
import { createEndpoints } from "./endpoints";
import snapshot from "./openapi.snapshot.json";

// 契约测试:把 createEndpoints 实际发出的每条 (method, path) 与后端权威 spec 的
// 路径快照(openapi.snapshot.json,由 `pnpm --filter @tsz/api-client sync:openapi` 生成)对账。
//
// 为什么需要它:其余所有测试都把 http/api 层 mock 掉,只能证明「前端调了自己定义的路径」——
// 自证自话。臆造的路径、写错的方法、拼错的 URL,在那些 mock 测试里全是绿的,直到线上 404。
// 这里引入前端之外的事实来源(后端 spec)做证伪。
//
// 注意它抓的是「契约漂移」(路径/方法在 spec 里不存在),不是「后端实现缺口」
// (spec 有、服务器还没实现 → 仍会 404)。后者需要打真后端的冒烟测试,见 smoke。

const specPaths = snapshot.paths as Record<string, string[]>;
const IDEMPOTENT_LEXICON_OPERATIONS = [
  "post /admin/lexicon/entries",
  "post /admin/lexicon/entries/archive-batch",
  "post /admin/lexicon/entries/restore-batch",
  "post /admin/lexicon/entries/{id}/archive",
  "post /admin/lexicon/entries/{id}/content-completion-jobs",
  "post /admin/lexicon/entries/{id}/content-completion-jobs/{job_id}/retries",
  "post /admin/lexicon/entries/{id}/publications",
  "post /admin/lexicon/entries/{id}/publications/{publication_id}/activate",
  "post /admin/lexicon/entries/{id}/restore"
] as const;

// 已知「后端尚未提供 / 待对接」的端点白名单。每条都必须真不在 spec 里——
// 等后端实现后,本测试会反过来要求你把它从这里删掉(见下方「台账保鲜」断言),
// 删掉后它就自动纳入正式校验。新增端点若既不在 spec 也不在此处,测试会红。
//
// 形如 "<method> <path>";路径里的占位段用 "_"(见下方 SENTINEL)。
const PENDING = new Set<string>([
  // ---- 后端已切换为 tsz-rust(重写进行中),spec 只含 auth 核心 7 条路由。 ----
  // 以下按 tsz-rust 落地节奏逐步从白名单移除(T 系列见 tsz-rust/docs/frontend-integration.md §6)。

  // 个人资料 / 学习设置 / 联系方式 / 头像(tsz-rust 未实现)。
  "patch /me",
  "post /me/contact/bind-code",
  "post /me/contact/bind",
  "put /me/learning-settings",
  "post /me/avatar/upload-url",
  "post /me/avatar",
  // 找回密码(tsz-rust 未实现)。
  "post /auth/password/forgot",
  "post /auth/password/reset",
  // 教师申请:ApplyTeacherForm 在用,但后端 spec 暂无此路由。
  "post /auth/apply-teacher",
  // 词库 / 词表 / 评论 / 任务:目前全是前端 mock(useWordLists 等),后端未实现。
  "get /words",
  "get /wordlists",
  "get /wordlists/_",
  "post /wordlists",
  "post /wordlists/_/publish",
  "post /comments",
  "get /tasks",
  "post /tasks",
  // 平台后台(admin)RBAC:产品已定案不做(见 tsz-rust admin-design Q10),后端不会实现,
  // 因此这几条不是「待实现」而是「已取消」。createEndpoints 目前仍会发出它们(Roles 页面在用),
  // 白名单条目必须保留,否则「无臆造端点」断言会红。待前端下架 Roles 页面后,
  // 连同 admin.ts 里对应的方法一起删。
  "patch /admin/admins/_/role",
  "get /admin/permissions",
  "get /admin/roles",
  "post /admin/roles",
  "patch /admin/roles/_",
  "delete /admin/roles/_"
]);

// 调用端点函数时给位置参数填的哨兵值,使 `/wordlists/${id}` 这类模板渲染成 `/wordlists/_`。
const SENTINEL = "_";

/** 录下端点工厂真正发出的 (method, path),不触网。prefix 用于补回 baseUrl 里的段。 */
function collectCalls(
  factory: (http: never) => unknown,
  prefix = ""
): { method: string; path: string }[] {
  const calls: { method: string; path: string }[] = [];
  const record =
    (method: string) =>
    (path: string): unknown => {
      calls.push({ method, path: `${prefix}${path}` });
      // 永不 settle 的 Promise:有的端点在 http.* 结果上链 .then 做响应装配
      // (如 me),返回 undefined 会让链式调用同步炸掉;永挂起则链上回调
      // 永不执行——收集器只关心「发出的调用」,不关心响应。
      return new Promise(() => {});
    };
  const http = {
    get: record("get"),
    post: record("post"),
    put: record("put"),
    patch: record("patch"),
    del: record("delete") // http.del → HTTP DELETE
  };

  // 遍历端点树,用哨兵参数调用每个函数,触发其内部的 http.* 记录。
  const walk = (node: unknown) => {
    if (typeof node === "function") {
      (node as (...a: unknown[]) => unknown)(
        SENTINEL,
        SENTINEL,
        SENTINEL,
        SENTINEL
      );
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(factory(http as never));
  return calls;
}

/** 把 spec 路径(可能含 {param})编成匹配具体路径的正则。 */
function specMatchers(): { re: RegExp; methods: Set<string> }[] {
  return Object.entries(specPaths).map(([path, methods]) => ({
    re: new RegExp(
      "^" + path.replace(/\{[^}]+\}/g, "[^/]+").replace(/[.]/g, "\\.") + "$"
    ),
    methods: new Set(methods)
  }));
}

function normalize(call: { method: string; path: string }) {
  const path = call.path.split("?")[0]!; // 去掉 query
  return { method: call.method, path, key: `${call.method} ${path}` };
}

// admin 端点绑定在 baseUrl=/api/v1/admin 上,相对路径须补回 /admin 前缀才能对上快照。
const calls = [
  ...collectCalls((http) => createEndpoints(http)),
  ...collectCalls((http) => createAdminEndpoints(http), "/admin")
];
const matchers = specMatchers();

function inSpec(method: string, path: string): boolean {
  return matchers.some((m) => m.methods.has(method) && m.re.test(path));
}

describe("api-client 契约:前端端点 vs 后端 openapi 快照", () => {
  it("V2 命令端点的 Idempotency-Key 必须是必填 UUID header", () => {
    const expectedHeader = {
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", format: "uuid" }
    };

    expect(snapshot.operationHeaders).toEqual(
      Object.fromEntries(
        IDEMPOTENT_LEXICON_OPERATIONS.map((operation) => [
          operation,
          [expectedHeader]
        ])
      )
    );
  });

  it("AdminWordV2 发布与生命周期字段的 required/可选性和后端一致", () => {
    const adminWordV2 = snapshot.schemas.AdminWordV2;

    expect(adminWordV2.required).toContain("has_unpublished_changes");
    expect(adminWordV2.required).toContain("lifecycle_revision");
    expect(adminWordV2.required).not.toContain("published_revision");
    expect(adminWordV2.properties.has_unpublished_changes).toEqual({
      type: "boolean"
    });
    expect(adminWordV2.properties.published_revision).toEqual({
      type: "integer",
      format: "int64"
    });
    expect(adminWordV2.properties.lifecycle_revision).toEqual({
      type: "integer",
      format: "int64"
    });
    expect(snapshot.schemas.AdminWordListItem.required).toEqual(
      expect.arrayContaining([
        "schema_version",
        "revision",
        "lifecycle_revision",
        "max_reachable_step",
        "has_unpublished_changes"
      ])
    );
    expect(snapshot.schemas.EntryLifecycleInput.required).toEqual([
      "base_revision",
      "base_lifecycle_revision"
    ]);
    expect(snapshot.schemas.ActivatePublicationInput.required).toEqual([
      "base_revision",
      "base_lifecycle_revision"
    ]);
    expect(
      snapshot.paths[
        "/admin/lexicon/entries/{id}/publications/{publication_id}/activate"
      ]
    ).toEqual(["post"]);
    expect(snapshot.schemas.DeleteDraftInput).toEqual({
      type: "object",
      required: ["base_revision", "base_lifecycle_revision"],
      properties: {
        base_lifecycle_revision: {
          type: "integer",
          format: "int64",
          minimum: 1
        },
        base_revision: {
          type: "integer",
          format: "int64",
          minimum: 1
        }
      },
      additionalProperties: false
    });
    expect(snapshot.schemas.EntryLifecycleBatchResponse.required).toEqual([
      "words",
      "affected"
    ]);
    expect(snapshot.schemas.SuggestDialectVariantsResponseV2.required).toEqual([
      "provider",
      "suggestions"
    ]);
    expect(snapshot.schemas.DuplicateWordMatchV2.required).toEqual([
      "word_id",
      "headword",
      "dialect",
      "status"
    ]);
    expect(snapshot.schemas.DuplicateWordMatchV2.properties.status).toEqual({
      $ref: "#/components/schemas/AdminWordStatus"
    });
    expect(snapshot.schemas.FormsImpactItemV2.properties.node_type).toEqual({
      $ref: "#/components/schemas/FormsImpactNodeType"
    });
    expect(snapshot.schemas.FormsImpactNodeType.enum).toEqual([
      "pos",
      "grammar_structure",
      "text_variant",
      "sense",
      "definition",
      "sentence",
      "relation"
    ]);
  });

  it("关联词搜索 V2 分页字段与匹配模式来自 Rust snapshot", () => {
    expect(
      snapshot.operationQueryParameters[
        "get /admin/lexicon/entries/related-search"
      ]
    ).toEqual([
      {
        name: "cursor",
        in: "query",
        required: false,
        schema: { type: "string" }
      },
      {
        name: "exclude_exact",
        in: "query",
        required: false,
        schema: { type: "boolean" }
      },
      {
        name: "kind",
        in: "query",
        required: false,
        schema: { $ref: "#/components/schemas/EntryKind" }
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int32",
          default: 20,
          minimum: 1,
          maximum: 100
        }
      },
      {
        name: "match_mode",
        in: "query",
        required: false,
        schema: { $ref: "#/components/schemas/RelatedSearchMatchMode" }
      },
      {
        name: "page_size",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          format: "int32",
          minimum: 1,
          maximum: 100
        }
      },
      {
        name: "q",
        in: "query",
        required: false,
        schema: { type: "string" }
      }
    ]);
    expect(snapshot.schemas.RelatedSearchMatchMode.enum).toEqual([
      "exact",
      "contains"
    ]);
    expect(snapshot.schemas.RelatedSearchResponse.oneOf).toEqual([
      { $ref: "#/components/schemas/RelatedSearchLegacyResponse" },
      { $ref: "#/components/schemas/RelatedSearchV2Response" }
    ]);
    expect(
      snapshot.schemas.RelatedSearchLegacyResponse.additionalProperties
    ).toBe(false);
    expect(snapshot.schemas.RelatedSearchV2Response.additionalProperties).toBe(
      false
    );
    expect(snapshot.schemas.RelatedSearchV2Response.required).toEqual([
      "results",
      "total",
      "next_cursor"
    ]);
    expect(
      snapshot.schemas.RelatedSearchV2Response.properties.next_cursor
    ).toEqual({ type: ["string", "null"] });
    expect(snapshot.schemas.RelatedSearchV2Response.properties.total).toEqual({
      type: "integer",
      format: "int64",
      minimum: 0
    });
  });

  it("surface warning/page/create/problem 契约全部来自同一 Rust snapshot", () => {
    expect(
      specPaths["/admin/lexicon/surface-match-snapshots/{snapshot_id}"]
    ).toEqual(["get"]);
    expect(snapshot.schemas.SurfaceMatchPageV2.oneOf).toHaveLength(3);
    expect(
      snapshot.schemas.SurfaceMatchEnabledTerminalPageV2.properties
        .impact_confirmation_token
    ).toEqual({ type: "string", format: "uuid" });
    expect(snapshot.schemas.WordFormTypeV2.enum).toEqual([
      "base",
      "third_person_singular",
      "present_participle",
      "past_tense",
      "past_participle",
      "plural",
      "comparative",
      "superlative"
    ]);
    expect(
      snapshot.schemas.SurfaceMatchPageBaseV2.properties.items
    ).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 50
    });
    expect(snapshot.schemas.DuplicateWordMatchV2.deprecated).toBe(true);
    expect(
      snapshot.schemas.CreateAdminWordV2Input.properties
        .confirmed_surface_match_token
    ).toEqual({ type: "string" });
    expect(snapshot.schemas.CreateAdminWordV2Input.required).not.toContain(
      "confirmed_surface_match_token"
    );
    expect(snapshot.schemas.ProblemMeta.properties).toEqual(
      expect.objectContaining({
        surface_match_page: {
          $ref: "#/components/schemas/SurfaceMatchPageV2"
        },
        current_policy_name: {
          $ref: "#/components/schemas/SurfacePolicyNameV2"
        },
        current_policy_epoch: {
          type: "integer",
          format: "int64",
          minimum: 0
        }
      })
    );
    const statuses = snapshot.schemas.SmartDictionaryResultV2.oneOf.map(
      (branch) => branch.properties.status.enum[0]
    );
    expect(statuses).toEqual(["clear", "duplicate", "warning", "unavailable"]);

    const snapshotBranches = snapshot.schemas.WordDetectionSnapshotV2.oneOf;
    expect(snapshotBranches).toHaveLength(2);
    const [clearSnapshot, warningSnapshot] = snapshotBranches;
    if (!clearSnapshot || !warningSnapshot) {
      throw new Error(
        "WordDetectionSnapshotV2 必须恰好包含 clear/warning 两个分支"
      );
    }
    expect(
      snapshotBranches.map(
        (branch) => branch.properties.smart_dictionary_status.enum[0]
      )
    ).toEqual(["clear", "warning"]);
    expect(
      snapshotBranches.every((branch) => branch.additionalProperties === false)
    ).toBe(true);
    expect(clearSnapshot.properties.surface_warning).toEqual({
      type: "null"
    });
    expect(clearSnapshot.required).not.toContain("surface_warning");
    expect(warningSnapshot.required).toContain("surface_warning");
    expect(
      snapshot.schemas.DetectionSurfaceWarningAuditV2.properties.acknowledged
        .enum
    ).toEqual([true]);
    expect(
      snapshot.schemas.DetectionSurfaceWarningAuditV2.additionalProperties
    ).toBe(false);
  });

  it("speech 目录与试听 wire 和后端一致", () => {
    expect(snapshot.schemas.VoiceResponse.required).toEqual([
      "alias",
      "locale",
      "gender",
      "capabilities"
    ]);
    expect(snapshot.schemas.VoiceCapabilities.required).toEqual([
      "styles",
      "min_rate_percent",
      "max_rate_percent",
      "min_pitch_semitones",
      "max_pitch_semitones"
    ]);
    expect(snapshot.schemas.CreatePreviewRequest.required).toEqual([
      "content",
      "voice_alias"
    ]);
    expect(snapshot.schemas.CreatePreviewRequest.additionalProperties).toBe(
      false
    );
    expect(snapshot.schemas.PreviewCacheStatus.enum).toEqual([
      "hit",
      "generated"
    ]);
    expect(snapshot.schemas.PreviewResponse.required).toEqual([
      "cache_status",
      "audio_url",
      "expires_at",
      "url_expires_in_seconds"
    ]);
  });

  it("错误码枚举含 payload_too_large(413 分支的契约依据)", () => {
    // 词条整步保存的请求体上限是 8,192,000 字节;超限后端固定回 413 +
    // payload_too_large,不再伪装成 422 invalid_request_body。前端据此分支给出
    // 「内容过大,请拆分」而不是「格式错误」,所以这个码必须真在契约里。
    expect(snapshot.schemas.ErrorCode.enum).toContain("payload_too_large");
    expect(snapshot.schemas.ErrorCode.enum).toContain("invalid_request_body");
  });

  it("每条前端端点要么命中 spec,要么在 PENDING 白名单里(无臆造端点)", () => {
    const orphans = calls
      .map(normalize)
      .filter((c) => !inSpec(c.method, c.path) && !PENDING.has(c.key))
      .map((c) => c.key);

    expect(
      orphans,
      `以下端点既不在后端 spec、也不在 PENDING 白名单——可能是路径/方法写错或臆造。\n` +
        `若确属后端尚未实现,显式加入 endpoints.contract.test.ts 的 PENDING:\n  ${orphans.join("\n  ")}`
    ).toEqual([]);
  });

  it("命中 spec 的端点,其 HTTP 方法也必须与 spec 一致", () => {
    // 路径在 spec 但方法不符(如把 PATCH /me 写成 PUT)也要红。
    const methodMismatch = calls
      .map(normalize)
      .filter((c) => !PENDING.has(c.key))
      .filter((c) => {
        const pathExists = matchers.some((m) => m.re.test(c.path));
        return pathExists && !inSpec(c.method, c.path);
      })
      .map((c) => c.key);

    expect(
      methodMismatch,
      `以下端点路径在 spec 里存在,但用了 spec 未声明的方法:\n  ${methodMismatch.join("\n  ")}`
    ).toEqual([]);
  });

  it("收集器无死白名单:PENDING 里每条都确由 createEndpoints 实际发出", () => {
    // 防止收集器静默漏看某个端点:若 PENDING 写了一条但根本没被发出(拼写漂移/
    // 端点被删),这里会红,提醒清理——也反证收集器确实覆盖到了这些路径。
    const emitted = new Set(calls.map((c) => normalize(c).key));
    const dead = [...PENDING].filter((entry) => !emitted.has(entry));

    expect(
      dead,
      `PENDING 里以下端点未被任何 createEndpoints 函数发出(已删除或拼错):\n  ${dead.join("\n  ")}`
    ).toEqual([]);
  });

  it("台账保鲜:PENDING 里的端点确实仍不在 spec(后端补上后须从白名单移除)", () => {
    const nowInSpec = [...PENDING].filter((entry) => {
      const [method, path] = entry.split(" ");
      return inSpec(method!, path!);
    });

    expect(
      nowInSpec,
      `以下端点后端已在 spec 中提供,请从 PENDING 白名单移除以纳入正式校验:\n  ${nowInSpec.join("\n  ")}`
    ).toEqual([]);
  });
});
