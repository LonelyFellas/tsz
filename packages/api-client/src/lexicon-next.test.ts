import { describe, expect, it, vi } from "vitest";
import type {
  NextAgentInput,
  NextAgentResult,
  NextDraft,
  NextEntry,
  NextEntryMatchInput
} from "@tsz/types";
import { createAdminEndpoints } from "./admin";
import { createHttpClient, HttpError } from "./http";
import { decodeNextEntry, decodeNextEntryView } from "./lexicon-next";
import { validateRuntimeSchema } from "./runtime-schema";
import snapshot from "./openapi.snapshot.json";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const draft: NextDraft = {
  schema_version: 1,
  headword: "centre",
  forms: [
    { id: uuid(2), locale: "en-GB", text: "centre" },
    { id: uuid(3), locale: "en-US", text: "center" }
  ],
  senses: [
    {
      id: uuid(4),
      part_of_speech: null,
      definitions: [
        {
          id: uuid(5),
          locale: "en-GB",
          text: "the middle",
          style: "definition"
        },
        {
          id: uuid(6),
          locale: "zh-Hans",
          text: "中心位置",
          style: "definition"
        },
        {
          id: uuid(7),
          locale: "zh-Hant",
          text: "中心位置（繁體）",
          style: "definition"
        }
      ],
      equivalents: []
    }
  ]
};
const entry: NextEntry = {
  id: uuid(1),
  target_language: "en",
  kind: "word",
  owner_id: uuid(8),
  revision: 2,
  updated_at: "2026-11-11T00:00:00Z",
  draft
};

function client(reply: unknown, status = 200) {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(reply), {
        status,
        headers: { "content-type": "application/json" }
      })
  );
  vi.stubGlobal("fetch", fetch);
  const api = createAdminEndpoints(
    createHttpClient({ baseUrl: "https://test.invalid/api/v1/admin" })
  ).lexiconNext;
  return { api, fetch };
}

describe("lexicon-next authoritative wire contract", () => {
  it("刷新单个词典时发送草稿版本，并拒绝其他来源的资料", async () => {
    const input = {
      base_revision: 2,
      headword: "real estate",
      source: "Cambridge Dictionary" as const
    };
    const reference = {
      source: input.source,
      locator:
        "https://dictionary.cambridge.org/dictionary/english/real-estate",
      excerpt: "real estate · 词性 noun",
      status: "found"
    };
    const { api, fetch } = client(reference);
    await expect(
      api.refreshDictionaryReference(entry.id, input)
    ).resolves.toEqual(reference);
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://test.invalid/api/v1/admin/lexicon-next/entries/${entry.id}/generation/dictionary-reference`
    );
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual(input);

    const other = client({ ...reference, source: "Merriam-Webster" });
    await expect(
      other.api.refreshDictionaryReference(entry.id, input)
    ).rejects.toThrow("词典参考响应不符合接口契约");
  });

  it.each([undefined, "V-I"])(
    "生成和回读均接受可选的细分词性推荐 %s",
    async (subPos) => {
      const input: NextAgentInput = {
        run_id: uuid(11),
        base_revision: 2,
        snapshot_id: "a".repeat(64),
        headword: "rely",
        target: "en-GB",
        sections: ["grammar"],
        existing_pos: ["verb"],
        examples: [],
        senses: []
      };
      const result: NextAgentResult = {
        run_id: input.run_id,
        base_revision: input.base_revision,
        snapshot_id: input.snapshot_id,
        done: true,
        requires_human_review: true,
        steps: [{ section: "grammar", state: "completed", error: "" }],
        sources: [],
        proposals: {
          forms: [],
          senses: [],
          groups: [],
          grammar: [
            {
              pos: "verb",
              pattern: "rely on somebody",
              ...(subPos && { sub_pos: subPos })
            }
          ],
          definitions: [],
          equivalents: [],
          relations: [],
          examples: [],
          dialect: [],
          translations: []
        }
      };
      const generated = client(result);
      await expect(generated.api.generate(entry.id, input)).resolves.toEqual(
        result
      );
      const cached = {
        candidate: {
          source_run_id: uuid(12),
          generated_at: "2026-11-25T00:00:00Z",
          result
        }
      };
      const lookup = client(cached);
      await expect(
        lookup.api.generationCandidates(entry.id, input)
      ).resolves.toEqual(cached);
      for (const request of [generated, lookup]) {
        expect(
          new Headers(request.fetch.mock.calls[0]![1].headers).get(
            "x-tsz-next-grammar-sub-pos"
          )
        ).toBe("v1");
      }
    }
  );

  it("拓展词支持可选的内部词义关联，拒绝截断的关联", async () => {
    const input: NextAgentInput = {
      run_id: uuid(11),
      base_revision: 2,
      snapshot_id: "a".repeat(64),
      headword: "chat",
      target: "en-GB",
      sections: ["relations"],
      existing_pos: ["noun"],
      examples: [],
      senses: [{ pos: "noun", gloss: "闲谈" }]
    };
    const target = { entry_id: uuid(13), sense_id: uuid(14) };
    const candidate = {
      sense: 0,
      kind: "derivative",
      word: "chatty",
      gloss: "健谈的",
      score: 80,
      target
    };
    const result: NextAgentResult = {
      run_id: input.run_id,
      base_revision: input.base_revision,
      snapshot_id: input.snapshot_id,
      done: true,
      requires_human_review: true,
      steps: [{ section: "relations", state: "completed", error: "" }],
      sources: [],
      proposals: {
        forms: [],
        senses: [],
        groups: [],
        grammar: [],
        definitions: [],
        equivalents: [],
        relations: [candidate],
        examples: [],
        dialect: [],
        translations: []
      }
    };
    const generated = client(result);
    await expect(generated.api.generate(entry.id, input)).resolves.toEqual(
      result
    );
    const cached = {
      candidate: {
        source_run_id: uuid(12),
        generated_at: "2026-11-26T00:00:00Z",
        result
      }
    };
    const lookup = client(cached);
    await expect(
      lookup.api.generationCandidates(entry.id, input)
    ).resolves.toEqual(cached);
    for (const request of [generated, lookup]) {
      expect(
        new Headers(request.fetch.mock.calls[0]![1].headers).get(
          "x-tsz-next-relation-targets"
        )
      ).toBe("v1");
    }
    const malformed = client({
      ...result,
      proposals: {
        ...result.proposals,
        relations: [{ ...candidate, target: { entry_id: target.entry_id } }]
      }
    });
    await expect(malformed.api.generate(entry.id, input)).rejects.toThrow(
      "不符合接口契约"
    );
  });

  it("读取草稿 schema 兼容范围，旧服务缺少端点时保持失败而不保存", async () => {
    const compatibility = {
      draft_schema_version: 1,
      supported_draft_schema_versions: [1]
    };
    const { api, fetch } = client(compatibility);
    await expect(api.draftSchema()).resolves.toEqual(compatibility);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/draft-schema"
    );
  });

  it("旧服务不发送配对命令，协商后同一保存请求携带原目标版本", async () => {
    const { api, fetch } = client(entry);
    const change = {
      sense_id: uuid(7),
      usage: "en-GB" as const,
      no_equivalent: true,
      note: "",
      previous_target_revision: 8,
      target: null
    };
    const input = { draft, expected_revision: 2, dialect_changes: [change] };
    await expect(api.save(entry.id, input)).rejects.toThrow("未开放方言配对");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema_version: 1,
          language_rules_version: "lexicon-next-en-zh-1",
          languages: [],
          manual_drafts: true,
          generation: false,
          publishing: true,
          dialect_pairs: true
        })
      )
    );
    await api.capabilities();
    await api.save(entry.id, input);
    const req = fetch.mock.calls[1]![1];
    expect(new Headers(req.headers).get("x-tsz-next-dialect-pairs")).toBe("v1");
    expect(JSON.parse(req.body)).toEqual(input);
  });
  it("拓展词协商后按 V1 wire 保存回读，旧服务不发送未知字段", async () => {
    const next: NextEntry = structuredClone(entry);
    next.draft.senses[0]!.relations = [
      {
        id: uuid(90),
        relation: "derivative",
        pending_target_headword: "worker",
        pending_target_gloss: "工人",
        score: "86.5"
      }
    ];
    const { api, fetch } = client(next);
    await expect(
      api.save(entry.id, { expected_revision: 1, draft: next.draft })
    ).rejects.toThrow("拓展词能力尚未确认");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema_version: 1,
          language_rules_version: "lexicon-next-en-zh-1",
          languages: [],
          manual_drafts: true,
          generation: false,
          publishing: false,
          relations: true
        }),
        { headers: { "content-type": "application/json" } }
      )
    );
    await api.capabilities();
    expect(
      new Headers(fetch.mock.calls[0]![1].headers).get("x-tsz-next-relations")
    ).toBe("v1");
    expect(
      await api.save(entry.id, { expected_revision: 1, draft: next.draft })
    ).toEqual(next);
    expect(
      JSON.parse(fetch.mock.calls[1]![1].body).draft.senses[0].relations
    ).toEqual(next.draft.senses[0]!.relations);
    expect(await api.get(entry.id)).toEqual(next);
    for (const relations of [
      null,
      [{ ...next.draft.senses[0]!.relations![0], target_headword: "readonly" }]
    ]) {
      const invalid = structuredClone(next);
      Object.assign(invalid.draft.senses[0]!, { relations });
      expect(() => decodeNextEntry(invalid)).toThrow("接口契约");
    }
  });
  it("按能力协商 V1 编辑器，完整保存新版草稿并拒绝畸形嵌套内容", async () => {
    const next = {
      ...entry,
      draft: {
        ...draft,
        form_editor: {
          forms_format: "shared_v1" as const,
          contents: [],
          pos: []
        }
      }
    };
    const { api, fetch } = client(next);
    expect(
      await api.save(entry.id, { expected_revision: 1, draft: next.draft })
    ).toEqual(next);
    expect(JSON.parse(fetch.mock.calls[0]![1].body).draft.form_editor).toEqual(
      next.draft.form_editor
    );
    expect(decodeNextEntry(next).draft.form_editor).toEqual(
      next.draft.form_editor
    );
    for (const form_editor of [
      null,
      { ...next.draft.form_editor, forms_format: "unknown" },
      { ...next.draft.form_editor, contents: [{ id: uuid(9) }] }
    ]) {
      expect(() =>
        decodeNextEntry({ ...next, draft: { ...next.draft, form_editor } })
      ).toThrow();
    }
    client({
      schema_version: 1,
      language_rules_version: "lexicon-next-en-zh-1",
      languages: [],
      manual_drafts: true,
      generation: false,
      publishing: false,
      form_editor: true
    });
    await api.capabilities();
    const request = vi.mocked(globalThis.fetch).mock.calls[0]![1];
    expect(new Headers(request?.headers).get("x-tsz-next-forms")).toBe("v1");
    expect(
      new Headers(request?.headers).get("x-tsz-next-medium-ownership")
    ).toBe("v1");
    expect(
      decodeNextEntry({ ...entry, medium_locale: "zh-Hant" }).medium_locale
    ).toBe("zh-Hant");
    expect(() => decodeNextEntry({ ...entry, medium_locale: null })).toThrow();
  });
  it("已有词条匹配使用新版分页端点和严格响应，不回退 V1", async () => {
    const page = {
      surface: "café",
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
      annotation_required: false
    };
    const { api, fetch } = client(page);
    const input: NextEntryMatchInput = {
      target_language: "en",
      surface: "café",
      page: 2,
      page_size: 20
    };
    expect(await api.matchEntries(input, "word")).toEqual(page);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/entry-matches"
    );
    expect(fetch.mock.calls[0]![1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(input);
    expect(
      new Headers(fetch.mock.calls[0]![1].headers).get(
        "x-tsz-next-annotation-rule"
      )
    ).toBe("v1");
    expect(
      new Headers(fetch.mock.calls[0]![1].headers).get(
        "x-tsz-next-annotation-kind"
      )
    ).toBe("word");
    expect(
      validateRuntimeSchema("NextEntryMatchInput", {
        target_language: "en",
        surface: "café",
        page: null
      }).valid
    ).toBe(true);
    for (const invalid of [
      { ...input, page: 0 },
      { ...input, page_size: 101 }
    ]) {
      expect(validateRuntimeSchema("NextEntryMatchInput", invalid).valid).toBe(
        false
      );
    }
    const malformed = client({ ...page, items: [entry] });
    await expect(malformed.api.matchEntries(input, "word")).rejects.toThrow(
      "接口契约"
    );
    const missing = client({}, 404);
    await expect(
      missing.api.matchEntries(input, "word")
    ).rejects.toBeInstanceOf(HttpError);
    expect(missing.fetch).toHaveBeenCalledTimes(1);
  });
  it("detects through the independent read-only endpoint and rejects incomplete reference records", async () => {
    const reply = {
      surface: "Colour",
      kind: "word",
      matches: [
        {
          id: "1:noun",
          term: "colour",
          part_of_speech: "noun",
          glosses: ["a hue"],
          forms: [],
          phonetics: [],
          source_name: "Test",
          source_version: "v1"
        }
      ]
    };
    const { api, fetch } = client(reply);
    expect(
      await api.detect({ target_language: "en", surface: "Colour" })
    ).toEqual(reply);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/detections"
    );
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      target_language: "en",
      surface: "Colour"
    });
    expect(
      new Headers(fetch.mock.calls[0]![1].headers).get(
        "x-tsz-next-dictionary-pos"
      )
    ).toBe("v1");
    const mappedReply = {
      ...reply,
      part_of_speech_mappings: [
        { source_code: "noun", part_of_speech: "noun", base_form_only: false }
      ]
    };
    await expect(
      client(mappedReply).api.detect({
        target_language: "en",
        surface: "Colour"
      })
    ).resolves.toEqual(mappedReply);
    expect(validateRuntimeSchema("NextDetection", mappedReply).valid).toBe(
      false
    );
    const invalid = client({
      ...reply,
      matches: [{ ...reply.matches[0], glosses: "a hue" }]
    });
    await expect(
      invalid.api.detect({ target_language: "en", surface: "Colour" })
    ).rejects.toThrow("接口契约");
  });
  it("preserves all locales and uses independent documented paths and save revision", async () => {
    const { api, fetch } = client(entry);
    expect(await api.save(entry.id, { expected_revision: 1, draft })).toEqual(
      entry
    );
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://test.invalid/api/v1/admin/lexicon-next/entries/${entry.id}`
    );
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ expected_revision: 1, draft });
    expect(
      validateRuntimeSchema("SaveNextDraft", JSON.parse(options.body)).valid
    ).toBe(true);
    expect(await api.get(entry.id)).toEqual(entry);
    const paths = snapshot.paths as Record<string, string[]>;
    expect(paths["/admin/lexicon-next/entries/{id}"]).toContain("put");
    expect(paths["/admin/lexicon-next/entries/{id}"]).toContain("get");
    const created = client(entry);
    await created.api.create({
      target_language: "en",
      medium_locale: "zh-Hans",
      kind: "word",
      headword: "centre"
    });
    expect(created.fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/entries"
    );
    expect(paths["/admin/lexicon-next/entries"]).toContain("post");
  });

  it("keeps actual fallback locale and missing content explicit", async () => {
    const view = {
      entry_id: entry.id,
      revision: 2,
      target_locale: "en-US",
      medium_locale: "zh-Hant",
      forms: [{ id: uuid(2), locale: "en", text: "job" }],
      missing_forms: false,
      senses: [
        {
          id: uuid(4),
          target_definitions: [],
          medium_definitions: [],
          equivalents: [],
          missing_target_definitions: true,
          missing_medium_definitions: true,
          missing_equivalents: true
        }
      ]
    };
    const { api, fetch } = client(view);
    expect(
      await api.view(entry.id, {
        target_locale: "en-US",
        medium_locale: "zh-Hant"
      })
    ).toEqual(view);
    expect(fetch.mock.calls[0]![0]).toBe(
      `https://test.invalid/api/v1/admin/lexicon-next/entries/${entry.id}/view?target_locale=en-US&medium_locale=zh-Hant`
    );
    expect(snapshot.paths["/admin/lexicon-next/entries/{id}/view"]).toContain(
      "get"
    );
    expect(() =>
      decodeNextEntryView({ ...view, senses: [{ id: uuid(4) }] })
    ).toThrow();
  });

  it("rejects old/unknown wire data rather than dropping fields", () => {
    expect(() =>
      decodeNextEntry({ ...entry, draft: { ...draft, schema_version: 3 } })
    ).toThrow();
    expect(() =>
      decodeNextEntry({ ...entry, review_status: "confirmed" })
    ).toThrow();
    expect(() =>
      decodeNextEntry({
        ...entry,
        draft: { ...draft, forms: [{ ...draft.forms[0], extensions: {} }] }
      })
    ).toThrow();
    expect(() =>
      decodeNextEntry({
        ...entry,
        draft: {
          ...draft,
          senses: [
            {
              ...draft.senses[0],
              definitions: [
                { ...draft.senses[0]!.definitions[0], style: "old-v3" }
              ]
            }
          ]
        }
      })
    ).toThrow();
  });

  it("returns old-backend and revision errors without retrying V3 or resaving", async () => {
    const old = client({ code: "not_found" }, 404);
    await expect(old.api.capabilities()).rejects.toBeInstanceOf(HttpError);
    expect(old.fetch).toHaveBeenCalledTimes(1);
    expect(old.fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/capabilities"
    );
    const conflict = client(
      { code: "revision_conflict", detail: "reload" },
      409
    );
    await expect(
      conflict.api.save(entry.id, { expected_revision: 1, draft })
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    expect(conflict.fetch).toHaveBeenCalledTimes(1);
  });
});

it("列表参数安全编码且摘要响应通过严格运行时契约，拒绝旧库列表形状", async () => {
  const summary = {
    id: entry.id,
    target_language: "en",
    kind: "word",
    headword: "centre",
    owner_id: entry.owner_id,
    revision: 2,
    updated_at: entry.updated_at,
    part_of_speech: ["noun"],
    gloss: "中心位置"
  };
  const response = {
    items: [summary],
    pagination: { page: 2, page_size: 20, total: 21, total_pages: 2 }
  };
  const { api, fetch } = client(response);
  expect(
    await api.list({
      headword: "centre & %",
      kind: "word",
      page: 2,
      page_size: 20
    })
  ).toEqual(response);
  const url = new URL(fetch.mock.calls[0]![0] as string);
  expect(url.pathname).toBe("/api/v1/admin/lexicon-next/entries");
  expect(url.searchParams.get("headword")).toBe("centre & %");
  expect(url.searchParams.get("page")).toBe("2");
  expect(validateRuntimeSchema("NextEntryList", response).valid).toBe(true);
  await expect(
    client({
      items: [{ ...summary, kind: "legacy" }],
      pagination: response.pagination
    }).api.list()
  ).rejects.toThrow();
  await expect(
    client({ items: [entry], pagination: response.pagination }).api.list()
  ).rejects.toThrow();
});

it("管理列表使用独立 wire 契约，保留查询参数且拒绝旧列表冒充", async () => {
  const row = {
    id: uuid(1),
    target_language: "en",
    kind: "word",
    headword: "centre",
    owner_id: uuid(8),
    revision: 2,
    lifecycle_revision: 3,
    status: "archived",
    created_at: entry.updated_at,
    updated_at: entry.updated_at,
    created_by_name: "Editor",
    updated_by_name: "Editor",
    annotation: null,
    annotation_revision: 1,
    annotation_visible: false,
    part_of_speech: ["noun"],
    gloss: "中心",
    forms: draft.forms
  };
  const response = {
    items: [row],
    pagination: { page: 2, page_size: 10, total: 11, total_pages: 2 }
  };
  const { api, fetch } = client(response);
  expect(
    await api.workspaceList({
      headword: "100% centre",
      gloss: "中心",
      status: "archived",
      page: 2,
      page_size: 10
    })
  ).toEqual(response);
  const url = new URL(fetch.mock.calls[0]![0] as string);
  expect(
    new Headers(fetch.mock.calls[0]![1]?.headers).get(
      "x-tsz-next-name-variants"
    )
  ).toBe("v1");
  expect(url.pathname).toBe("/api/v1/admin/lexicon-next/workspace/entries");
  expect(url.searchParams.get("headword")).toBe("100% centre");
  expect(url.searchParams.get("status")).toBe("archived");
  const withNames = {
    ...response,
    items: [
      {
        ...row,
        name_variants: [
          { text: "centre", dialects: ["uk"] },
          { text: "center", dialects: ["us"] }
        ]
      }
    ]
  };
  await expect(client(withNames).api.workspaceList()).resolves.toEqual(
    withNames
  );
  const malformed = client({
    ...response,
    items: [{ ...row, status: "invented" }]
  }).api;
  await expect(malformed.workspaceList()).rejects.toThrow("接口契约");
  const missing = client({
    ...response,
    items: [{ id: uuid(1), headword: "centre" }]
  }).api;
  await expect(missing.workspaceList()).rejects.toThrow("接口契约");
});
it("语言筛选作为真实 query 发送，列表、统计和创建人参数与 OpenAPI 一致", async () => {
  const query = {
    target_language: "en",
    medium_locale: "zh-Hant",
    gloss: "a & b",
    updated_by: uuid(9)
  };
  for (const endpoint of [
    "workspaceList",
    "stats",
    "creators",
    "updaters"
  ] as const) {
    const reply =
      endpoint === "workspaceList"
        ? {
            items: [],
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
          }
        : endpoint === "stats"
          ? { total: 0, today: 0, month: 0 }
          : [];
    const { api, fetch } = client(reply);
    await api[endpoint](query);
    const url = new URL(fetch.mock.calls[0]![0] as string);
    const names = snapshot.operationQueryParameters[
      `get ${url.pathname.replace("/api/v1", "")}` as keyof typeof snapshot.operationQueryParameters
    ].map((p) => p.name);
    for (const [key, value] of Object.entries(query)) {
      expect(url.searchParams.get(key)).toBe(value);
      expect(names).toContain(key);
    }
  }
});

it("生命周期请求保留重试标识与精确版本，不回退 V1；标注走独立 PATCH", async () => {
  const { api, fetch } = client({ entry_ids: [uuid(1)] });
  const input = {
    request_id: uuid(10),
    action: "archive" as const,
    items: [{ entry_id: uuid(1), base_revision: 2, base_lifecycle_revision: 1 }]
  };
  await api.command(input);
  await api.command(input);
  expect(fetch.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
    input,
    input
  ]);
  expect(
    fetch.mock.calls.every((call) =>
      String(call[0]).endsWith("/lexicon-next/workspace/commands")
    )
  ).toBe(true);
  const annotation = client({
    entry_id: uuid(1),
    annotation: "2",
    annotation_revision: 2
  });
  await annotation.api.annotation(uuid(1), {
    annotation: "2",
    base_annotation_revision: 1
  });
  expect(annotation.fetch.mock.calls[0]![1].method).toBe("PATCH");
  const missing = client({ message: "not found" }, 404);
  await expect(missing.api.workspaceList()).rejects.toBeInstanceOf(HttpError);
  expect(missing.fetch).toHaveBeenCalledTimes(1);
});

it("协商语义区间并严格回读名称、身份与归属，兼容不含区间的旧草稿", async () => {
  const groups = [{ id: uuid(50), name_zh: "位置", name_en: "position" }];
  const next: NextEntry = {
    ...entry,
    draft: {
      ...draft,
      sense_groups: groups,
      senses: draft.senses.map((sense) => ({
        ...sense,
        sense_group_id: groups[0]!.id
      }))
    }
  };
  const { api, fetch } = client(next);
  expect(
    await api.save(entry.id, { expected_revision: 1, draft: next.draft })
  ).toEqual(next);
  expect(
    new Headers(fetch.mock.calls[0]![1].headers).get("x-tsz-next-sense-groups")
  ).toBe("v1");
  expect(JSON.parse(fetch.mock.calls[0]![1].body).draft.sense_groups).toEqual(
    groups
  );
  expect(await api.get(entry.id)).toEqual(next);
  expect(
    new Headers(fetch.mock.calls[1]![1].headers).get("x-tsz-next-sense-groups")
  ).toBe("v1");
  expect(decodeNextEntry(entry)).toEqual(entry);
  for (const invalid of [
    { ...next, draft: { ...next.draft, sense_groups: null } },
    {
      ...next,
      draft: { ...next.draft, sense_groups: [{ ...groups[0], id: "bad-id" }] }
    },
    {
      ...next,
      draft: {
        ...next.draft,
        sense_groups: [{ ...groups[0], voice_profile: {} }]
      }
    },
    {
      ...next,
      draft: {
        ...next.draft,
        senses: [{ ...next.draft.senses[0], sense_group_id: null }]
      }
    }
  ])
    expect(() => decodeNextEntry(invalid)).toThrow();
  const view = {
    entry_id: entry.id,
    revision: 2,
    target_locale: "en-US",
    medium_locale: "zh-Hant",
    forms: [],
    missing_forms: true,
    sense_groups: groups,
    senses: [
      {
        id: draft.senses[0]!.id,
        sense_group_id: groups[0]!.id,
        target_definitions: [],
        medium_definitions: [],
        equivalents: [],
        missing_target_definitions: true,
        missing_medium_definitions: true,
        missing_equivalents: true
      }
    ]
  };
  const previewClient = client(view);
  expect(
    await previewClient.api.view(entry.id, {
      target_locale: "en-US",
      medium_locale: "zh-Hant"
    })
  ).toEqual(view);
  expect(
    new Headers(previewClient.fetch.mock.calls[0]![1].headers).get(
      "x-tsz-next-sense-groups"
    )
  ).toBe("v1");
});

it("语法扩展读取保持闭合契约、存量可省略且拒绝 null", () => {
  const extended = structuredClone(entry);
  extended.draft.grammar_structures = [
    {
      id: uuid(501),
      part_of_speech: "noun",
      sub_pos: "N-COUNT",
      variants: [
        {
          id: uuid(502),
          locale: "en-GB",
          content: {
            version: 2,
            text: "a job",
            annotations: [{ type: "emphasis", start: 2, end: 5, level: "core" }]
          }
        }
      ]
    }
  ];
  extended.draft.senses[0]!.sub_pos = "N-COUNT";
  extended.draft.senses[0]!.definitions[0]!.grammar_structure_id = uuid(501);
  expect(decodeNextEntry(extended)).toEqual(extended);
  expect(decodeNextEntry(entry)).toEqual(entry);
  for (const field of ["grammar_structures", "unknown_grammar"]) {
    expect(() =>
      decodeNextEntry({
        ...extended,
        draft: { ...extended.draft, [field]: null }
      })
    ).toThrow();
  }
  expect(() =>
    decodeNextEntry({
      ...extended,
      draft: {
        ...extended.draft,
        senses: [{ ...extended.draft.senses[0], sub_pos: null }]
      }
    })
  ).toThrow();
});

it("语法配音协商和持久化字段遵循运行时契约", async () => {
  const extended = structuredClone(entry);
  const variant = {
    id: uuid(602),
    locale: "en-GB",
    content: { version: 2 as const, text: "a job", annotations: [] },
    voice_profile: {
      voices: [{ voice_id: "saved-voice", enabled: true, rate_percent: 25 }]
    },
    audio_assets: [
      {
        id: uuid(603),
        locale: "en-GB" as const,
        gender: "female" as const,
        content_type: "audio/mpeg",
        size_bytes: 3,
        original_name: "fixture.mp3",
        created_at: "2026-11-14T00:00:00Z"
      }
    ]
  };
  extended.draft.grammar_structures = [
    { id: uuid(601), part_of_speech: "noun", variants: [variant] }
  ];
  const request = client(extended);
  expect(
    await request.api.save(entry.id, {
      expected_revision: 1,
      draft: extended.draft
    })
  ).toEqual(extended);
  expect(
    new Headers(request.fetch.mock.calls[0]![1].headers).get(
      "x-tsz-next-grammar-audio"
    )
  ).toBe("v1");
  for (const patch of [
    { voice_profile: null },
    { audio_assets: null },
    { voice_profile: { voices: [], unknown: true } },
    { audio_assets: [{ ...variant.audio_assets[0], unknown: true }] }
  ]) {
    const invalid = structuredClone(extended);
    Object.assign(invalid.draft.grammar_structures![0]!.variants[0]!, patch);
    expect(() => decodeNextEntry(invalid)).toThrow();
  }
});

it("词义总体数据协商新契约，兼容旧响应且拒绝 null 与错误 wire 类型", async () => {
  const updated = structuredClone(entry);
  Object.assign(updated.draft.senses[0]!, {
    level: "B2",
    frequency: "95.50",
    depends_on_context: false
  });
  const { api, fetch } = client(updated);
  expect(await api.get(updated.id)).toEqual(updated);
  const options = fetch.mock.calls[0]![1] as RequestInit;
  expect(new Headers(options.headers).get("x-tsz-next-sense-metadata")).toBe(
    "v1"
  );
  expect(decodeNextEntry(entry)).toEqual(entry);
  for (const [field, value] of [
    ["level", null],
    ["frequency", 95.5],
    ["depends_on_context", "false"]
  ]) {
    const invalid = structuredClone(updated);
    Object.assign(invalid.draft.senses[0]!, { [field as string]: value });
    expect(() => decodeNextEntry(invalid)).toThrow();
  }
});

it("译词元数据与只读目录使用新版契约，保存不物化继承分", async () => {
  const next = structuredClone(entry);
  next.draft.senses[0]!.equivalents = [
    {
      id: uuid(20),
      locale: "zh-Hans",
      text: "中心",
      metadata: {
        register_ids: [uuid(21)],
        domain_ids: [],
        commonness: [{ score: "95.0", assessed_at: "2026-11-15T00:00:00Z" }]
      }
    }
  ];
  next.draft.senses[0]!.no_equivalents = ["zh-Hant"];
  const { api, fetch } = client(next);
  expect(
    await api.save(next.id, { expected_revision: 1, draft: next.draft })
  ).toEqual(next);
  expect(
    new Headers(fetch.mock.calls[0]![1].headers).get("x-tsz-next-equivalents")
  ).toBe("v1");
  const payload = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(
    payload.draft.senses[0].equivalents[0].metadata.commonness
  ).toHaveLength(1);
  const { api: catalogApi, fetch: catalogFetch } = client({
    registers: [],
    domains: []
  });
  expect(await catalogApi.equivalentCatalog()).toEqual({
    registers: [],
    domains: []
  });
  expect(catalogFetch.mock.calls[0]![0]).toBe(
    "https://test.invalid/api/v1/admin/lexicon-next/equivalent-catalog"
  );
  const invalid = structuredClone(next);
  (
    invalid.draft.senses[0]!.equivalents[0] as unknown as Record<
      string,
      unknown
    >
  ).metadata = null;
  expect(() => decodeNextEntry(invalid)).toThrow();
});

it("逐条释义扩展保持独立等级、明确不绑定与英文正文，拒绝畸形 wire", () => {
  const extended = structuredClone(entry);
  extended.draft.senses[0]!.level = "C2";
  Object.assign(extended.draft.senses[0]!.definitions[0]!, {
    level: "A1",
    grammar_unbound: true,
    content: { version: 2, text: "the middle", annotations: [] },
    voice_profile: { voices: [] }
  });
  expect(decodeNextEntry(extended)).toEqual(extended);
  const invalidCases: [string, unknown][] = [
    ["level", "A0"],
    ["grammar_unbound", false],
    [
      "content",
      { version: 2, text: "the middle", annotations: [{ type: "unknown" }] }
    ],
    ...[
      "level",
      "grammar_unbound",
      "content",
      "voice_profile",
      "audio_assets"
    ].map((field): [string, unknown] => [field, null])
  ];
  for (const [field, value] of invalidCases) {
    const invalid = structuredClone(extended);
    Object.assign(invalid.draft.senses[0]!.definitions[0]!, { [field]: value });
    expect(() => decodeNextEntry(invalid), String(field)).toThrow();
  }
});

it("协商释义能力后发送扩展；旧 API 或能力未确认时阻止扩展保存且不发送请求", async () => {
  const capabilities = {
    schema_version: 1,
    language_rules_version: "lexicon-next-en-zh-1",
    languages: [],
    manual_drafts: true,
    generation: false,
    publishing: false
  };
  const extended = structuredClone(entry);
  Object.assign(extended.draft.senses[0]!.definitions[0]!, {
    level: "B2",
    grammar_unbound: true,
    content: { version: 2, text: "the middle", annotations: [] }
  });
  const old = client(capabilities);
  await old.api.capabilities();
  const request = { expected_revision: 2, draft: extended.draft };
  await expect(old.api.save(entry.id, request)).rejects.toThrow(
    "释义扩展能力尚未确认"
  );
  expect(old.fetch).toHaveBeenCalledTimes(1);
  old.fetch.mockImplementation(
    async () => new Response(JSON.stringify(entry), { status: 200 })
  );
  await old.api.save(entry.id, { expected_revision: 2, draft });
  expect(JSON.parse(old.fetch.mock.calls[1]![1]!.body as string).draft).toEqual(
    draft
  );

  const next = client({ ...capabilities, definition_details: true });
  await expect(next.api.save(entry.id, request)).rejects.toThrow(
    "释义扩展能力尚未确认"
  );
  expect(next.fetch).not.toHaveBeenCalled();
  await next.api.capabilities();
  expect(
    new Headers(next.fetch.mock.calls[0]![1]?.headers).get(
      "x-tsz-next-definitions"
    )
  ).toBe("v1");
  next.fetch.mockImplementation(
    async () => new Response(JSON.stringify(extended), { status: 200 })
  );
  await expect(next.api.save(entry.id, request)).resolves.toEqual(extended);
  expect(JSON.parse(next.fetch.mock.calls[1]![1]!.body as string)).toEqual(
    request
  );
});

it("统一例句草稿须先确认能力，并随词条一次提交、严格解析资源", async () => {
  const variant = {
    id: uuid(13),
    locale: "en-GB",
    level: "A1",
    content: { version: 2 as const, text: "A bank.", annotations: [] },
    translations: []
  };
  const sentence = {
    id: uuid(12),
    target_language: "en",
    owner_id: uuid(8),
    revision: 1,
    updated_at: "2026-11-15T00:00:00Z",
    reference_count: 1,
    draft: { schema_version: 1, variants: [variant] }
  };
  const input = {
    expected_revision: 2,
    draft,
    sentence_changes: [
      {
        id: sentence.id,
        expected_revision: 1,
        target_locale: "en-GB",
        medium_locale: "zh-Hans",
        variant
      }
    ]
  };
  const connected = client({
    schema_version: 1,
    language_rules_version: "lexicon-next-en-zh-1",
    languages: [],
    manual_drafts: true,
    generation: false,
    publishing: false
  });
  await expect(connected.api.save(entry.id, input)).rejects.toThrow(
    "能力尚未确认"
  );
  expect(connected.fetch).not.toHaveBeenCalled();
  await connected.api.capabilities();
  await expect(connected.api.save(entry.id, input)).rejects.toThrow(
    "能力尚未确认"
  );
  expect(connected.fetch).toHaveBeenCalledTimes(1);
  connected.fetch.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({
          schema_version: 1,
          language_rules_version: "lexicon-next-en-zh-1",
          languages: [],
          manual_drafts: true,
          generation: false,
          publishing: false,
          sentence_drafts: true
        }),
        { status: 200 }
      )
  );
  await connected.api.capabilities();
  expect(
    new Headers(connected.fetch.mock.calls[1]![1].headers).get(
      "x-tsz-next-sentence-drafts"
    )
  ).toBe("v1");
  const saved = { ...entry, sentence_resources: [sentence] };
  connected.fetch.mockImplementationOnce(
    async () => new Response(JSON.stringify(saved), { status: 200 })
  );
  await expect(connected.api.save(entry.id, input)).resolves.toEqual(saved);
  expect(JSON.parse(connected.fetch.mock.calls[2]![1].body)).toEqual(input);
  expect(() =>
    decodeNextEntry({
      ...saved,
      sentence_resources: [{ ...sentence, revision: "bad" }]
    })
  ).toThrow();
});

it("新版例句使用独立身份和当前语言写入范围，严格拒绝畸形响应", async () => {
  const variant = {
    id: uuid(13),
    locale: "en-GB",
    level: "A2",
    content: {
      version: 2 as const,
      text: "The centre is here.",
      annotations: []
    },
    translations: []
  };
  const sentence = {
    id: uuid(12),
    target_language: "en",
    owner_id: uuid(8),
    revision: 1,
    updated_at: "2026-11-15T00:00:00Z",
    reference_count: 0,
    draft: { schema_version: 1, variants: [variant] }
  };
  const scope = { target_locale: "en-GB", medium_locale: "zh-Hans", variant };
  const { api, fetch } = client(sentence);
  expect(
    await api.createSentence({
      id: sentence.id,
      target_language: "en",
      ...scope
    })
  ).toEqual(sentence);
  expect(fetch.mock.calls[0]![0]).toBe(
    "https://test.invalid/api/v1/admin/lexicon-next/sentences"
  );
  await api.saveSentence(sentence.id, { expected_revision: 1, ...scope });
  expect(fetch.mock.calls[1]![1].method).toBe("PUT");
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
    expected_revision: 1,
    ...scope
  });
  const broken = client({
    ...sentence,
    draft: { schema_version: 1, variants: [{ ...variant, level: "Z9" }] }
  });
  await expect(broken.api.sentence(sentence.id)).rejects.toThrow();
  const refs = {
    ...entry,
    draft: {
      ...draft,
      senses: draft.senses.map((s) => ({ ...s, sentence_ids: [sentence.id] }))
    }
  };
  const connected = client(refs);
  expect(
    await connected.api.save(entry.id, {
      expected_revision: 1,
      draft: refs.draft
    })
  ).toEqual(refs);
  expect(
    new Headers(connected.fetch.mock.calls[0]![1].headers).get(
      "x-tsz-next-sentences"
    )
  ).toBe("v1");
});

it("新版例句协商扩展字段，并拒绝超范围或非一位小数的自由度响应", async () => {
  const sentence = {
    id: uuid(12),
    target_language: "en",
    owner_id: uuid(8),
    revision: 1,
    updated_at: "2026-11-15T00:00:00Z",
    reference_count: 0,
    draft: {
      schema_version: 1,
      variants: [
        {
          id: uuid(13),
          locale: "en-GB",
          level: "A2",
          content: { version: 2, text: "A job.", annotations: [] },
          metadata: {
            register_ids: [],
            domain_ids: [],
            sources: [
              {
                id: uuid(15),
                source_type: "human_composed",
                title: "人工",
                url: "",
                locator: ""
              }
            ]
          },
          translations: [
            {
              id: uuid(14),
              locale: "zh-Hans",
              style: "balanced_fluency",
              content: { version: 2, text: "工作。", annotations: [] },
              metadata: { freedom: 33.4, sources: [] }
            }
          ]
        }
      ]
    }
  };
  const { api, fetch } = client(sentence);
  expect(await api.sentence(sentence.id)).toEqual(sentence);
  expect(
    new Headers(fetch.mock.calls[0]![1].headers).get(
      "x-tsz-next-sentence-details"
    )
  ).toBe("v1");
  for (const freedom of [null, 0, 33.3, 66.7, 100]) {
    const value = structuredClone(sentence);
    value.draft.variants[0]!.translations[0]!.metadata.freedom =
      freedom as number;
    expect(await client(value).api.sentence(sentence.id)).toEqual(value);
  }
  for (const freedom of [33.33, -0.1, 100.1]) {
    const value = structuredClone(sentence);
    value.draft.variants[0]!.translations[0]!.metadata.freedom = freedom;
    await expect(client(value).api.sentence(sentence.id)).rejects.toThrow();
  }
});

it("新版发布走独立契约，保留幂等身份和冻结内容；拒绝损坏的发布回包", async () => {
  const base = { base_revision: 2, base_lifecycle_revision: 1 };
  const preview = {
    entry_id: entry.id,
    revision: 2,
    lifecycle_revision: 1,
    preview_token: "a".repeat(64),
    can_publish: true,
    issues: [],
    warnings: []
  };
  const checked = client(preview);
  await expect(checked.api.publicationPreview(entry.id, base)).resolves.toEqual(
    preview
  );
  expect(new URL(checked.fetch.mock.calls[0]![0]).pathname).toBe(
    `/api/v1/admin/lexicon-next/entries/${entry.id}/publication-preview`
  );
  expect(JSON.parse(checked.fetch.mock.calls[0]![1].body as string)).toEqual(
    base
  );
  const publication = {
    id: uuid(100),
    entry_id: entry.id,
    revision: 2,
    lifecycle_revision: 2,
    published_by_admin_id: uuid(8),
    published_at: entry.updated_at,
    snapshot: { draft, sentence_resources: [], relation_targets: [] }
  };
  const published = client(publication);
  const input = {
    ...base,
    request_id: uuid(101),
    preview_token: preview.preview_token
  };
  await published.api.publish(entry.id, input);
  await published.api.publish(entry.id, input);
  expect(
    published.fetch.mock.calls.map((call) => JSON.parse(call[1].body as string))
  ).toEqual([input, input]);
  const current = {
    entry_id: entry.id,
    status: "published",
    lifecycle_revision: 2,
    has_unpublished_changes: false,
    current: publication
  };
  await expect(client(current).api.publication(entry.id)).resolves.toEqual(
    current
  );
  for (const corrupt of [
    { ...publication, snapshot: {} },
    { ...publication, revision: "2" },
    { ...publication, extra: true }
  ]) {
    await expect(client(corrupt).api.publish(entry.id, input)).rejects.toThrow(
      /接口契约/
    );
  }
  expect(
    snapshot.paths[`/admin/lexicon-next/entries/{id}/publications`]
  ).toEqual(["post"]);
});
