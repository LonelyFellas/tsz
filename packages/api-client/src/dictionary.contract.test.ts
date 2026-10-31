import { describe, expect, it, vi } from "vitest";
import { createEndpoints } from "./endpoints";
import type { HttpClient } from "./http";
import snapshot from "./openapi.snapshot.json";
import { validateRuntimeSchema } from "./runtime-schema";
const uuid = "00000000-0000-4000-8000-000000000001";
describe("词典请求契约", () => {
  it("查询编码及路径对应后端已实现的接口", async () => {
    const empty = {
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
    };
    const get = vi.fn().mockResolvedValue(empty);
    const endpoints = createEndpoints({ get } as unknown as HttpClient);
    const controller = new AbortController();
    await endpoints.dictionary.search("day in, day out", 1, {
      signal: controller.signal
    });
    const url = new URL(get.mock.calls[0]![0], "https://example.test");
    expect(url.pathname).toBe("/dictionary");
    expect(url.searchParams.get("q")).toBe("day in, day out");
    expect(get.mock.calls[0]![1]).toEqual({
      signal: controller.signal,
      headers: {
        "X-TSZ-Voice-Versions": "v4",
        "X-TSZ-Voice-Locales": "v1",
        "X-TSZ-Voice-Models": "v1"
      }
    });
    for (const path of [
      "/dictionary",
      "/dictionary/entries/{id}",
      "/dictionary/entries/{id}/audio/{asset_id}"
    ])
      expect(snapshot.paths[path as keyof typeof snapshot.paths]).toContain(
        "get"
      );
    get.mockResolvedValue({
      url: "https://audio.example.test/a.mp3",
      expires_at: "2026-10-15T00:00:00Z",
      url_expires_in_seconds: 60
    });
    await endpoints.dictionary.audio(uuid, uuid);
    expect(get.mock.calls[1]![0]).toBe(
      `/dictionary/entries/${uuid}/audio/${uuid}`
    );
    expect(get.mock.calls[1]![1]).toMatchObject({
      headers: { "X-TSZ-Voice-Models": "v1" }
    });
  });
  it("拒绝缺字段、后台字段和破损发布响应", () => {
    const content = {
      entry_id: uuid,
      publication_id: uuid,
      label: "apple",
      kind: "word",
      pos: []
    };
    const entry = { content, audio: [], examples: [] };
    expect(validateRuntimeSchema("DictionaryEntry", entry).valid).toBe(true);
    expect(
      validateRuntimeSchema("DictionaryEntry", {
        ...entry,
        audio: [{ target_id: uuid, asset_id: uuid, locale: "en-GB" }]
      }).valid
    ).toBe(true);
    expect(
      validateRuntimeSchema("DictionaryEntry", {
        ...entry,
        audio: [
          {
            target_id: uuid,
            asset_id: uuid,
            locale: "en-IN",
            accent_group: "other"
          }
        ]
      }).valid
    ).toBe(true);
    expect(
      validateRuntimeSchema("DictionaryEntry", {
        ...entry,
        created_by: "private"
      }).valid
    ).toBe(false);
    expect(
      validateRuntimeSchema("DictionaryEntry", { content, audio: [] }).valid
    ).toBe(false);
  });
});
