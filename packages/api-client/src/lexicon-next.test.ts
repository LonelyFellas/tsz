import { describe, expect, it, vi } from "vitest";
import type { NextDraft, NextEntry } from "@tsz/types";
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
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
    };
    const { api, fetch } = client(page);
    const input = {
      target_language: "en",
      surface: "café",
      page: 2,
      page_size: 20
    };
    expect(await api.matchEntries(input)).toEqual(page);
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://test.invalid/api/v1/admin/lexicon-next/entry-matches"
    );
    expect(fetch.mock.calls[0]![1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(input);
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
    await expect(malformed.api.matchEntries(input)).rejects.toThrow("接口契约");
    const missing = client({}, 404);
    await expect(missing.api.matchEntries(input)).rejects.toBeInstanceOf(
      HttpError
    );
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
  expect(url.pathname).toBe("/api/v1/admin/lexicon-next/workspace/entries");
  expect(url.searchParams.get("headword")).toBe("100% centre");
  expect(url.searchParams.get("status")).toBe("archived");
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
    gloss: "a & b"
  };
  for (const endpoint of ["workspaceList", "stats", "creators"] as const) {
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
