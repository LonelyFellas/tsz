import { describe, expect, it, vi } from "vitest";
import { createSharedSentenceEndpoints } from "./shared-sentences";
import type { HttpClient } from "./http";

const id = "00000000-0000-4000-8000-000000000001";
const body = {
  id,
  revision: 1,
  content: {
    sentence: {
      id,
      level: "B1",
      en_text: {
        mode: "unified",
        common: {
          id,
          origin: "manual",
          value: { version: 2, text: "A flower.", annotations: [] }
        }
      },
      zh_text_id: id,
      zh_text: { version: 2, text: "一朵花。", annotations: [] },
      zh_translations: [
        {
          id,
          band: "balanced_fluency",
          language: "zh",
          content: { version: 2, text: "一朵花。", annotations: [] }
        }
      ],
      links: []
    },
    annotations: []
  },
  entries: [],
  created_by: "测试管理员",
  created_at: "2026-09-12T10:00:00Z",
  updated_at: "2026-09-12T10:00:00Z"
};

describe("shared sentence wire contract", () => {
  it("接受后端独立例句结构并编码列表筛选；拒绝缺 revision 和额外字段", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ items: [body], total: 1 })
      .mockResolvedValueOnce({ ...body, revision: undefined })
      .mockResolvedValueOnce({ ...body, unpublished: true });
    const api = createSharedSentenceEndpoints({ get } as unknown as HttpClient);
    await expect(
      api.list({ q: "give up", entry_id: id, sense_id: id })
    ).resolves.toEqual({
      items: [body],
      total: 1
    });
    expect(get).toHaveBeenCalledWith(
      `/lexicon/sentences?q=give+up&entry_id=${id}&sense_id=${id}`
    );
    await expect(api.get(id)).rejects.toThrow("revision");
    await expect(api.get(id)).rejects.toThrow("unexpected_property");
  });
  it("独立编辑携带当前上下文，解除发送词义和 revision；目标查询使用严格契约", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const put = vi.fn().mockResolvedValue(body);
    const targets = {
      items: [
        {
          id,
          kind: "word",
          headword: "flower",
          surfaces: [{ surface: "flower", dialect: "uk" }]
        }
      ],
      total: 1
    };
    const get = vi
      .fn()
      .mockResolvedValueOnce(targets)
      .mockResolvedValueOnce({ ...targets, extra: true });
    const api = createSharedSentenceEndpoints({
      del,
      put,
      get
    } as unknown as HttpClient);
    await api.unlink(id, id, { base_revision: 1, sense_id: id });
    expect(del).toHaveBeenCalledWith(
      `/lexicon/sentences/${id}/associations/${id}`,
      { base_revision: 1, sense_id: id }
    );
    await api.update(id, {
      base_revision: 1,
      context_entry_id: id,
      context_sense_id: id,
      content: body.content as never
    });
    expect(put).toHaveBeenCalledWith(
      `/lexicon/sentences/${id}`,
      expect.objectContaining({ context_entry_id: id, base_revision: 1 })
    );
    await expect(
      api.targets({ q: "flower", context_entry_id: id, page: 2 })
    ).resolves.toEqual(targets);
    expect(get).toHaveBeenCalledWith(
      `/lexicon/sentences/targets?q=flower&context_entry_id=${id}&page=2`
    );
    await expect(api.targets({ entry_id: id })).rejects.toThrow(
      "unexpected_property"
    );
  });
});
