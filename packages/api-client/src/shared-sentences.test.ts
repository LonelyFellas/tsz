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
      api.list({ q: "give up", entry_id: id, candidates: true })
    ).resolves.toEqual({ items: [body], total: 1 });
    expect(get).toHaveBeenCalledWith(
      `/lexicon/sentences?q=give+up&entry_id=${id}&candidates=true`
    );
    await expect(api.get(id)).rejects.toThrow("revision");
    await expect(api.get(id)).rejects.toThrow("unexpected_property");
  });
  it("收录显式发送 revision、具体词条与用户确认的 pending 标记", async () => {
    const post = vi.fn().mockResolvedValue(body);
    const api = createSharedSentenceEndpoints({
      post
    } as unknown as HttpClient);
    const input = { base_revision: 1, entry_id: id, annotation_ids: [id] };
    await api.collect(id, input);
    expect(post).toHaveBeenCalledWith(
      `/lexicon/sentences/${id}/collections`,
      input
    );
  });
});
