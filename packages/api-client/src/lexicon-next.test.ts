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
