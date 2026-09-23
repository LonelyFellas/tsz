import { describe, expect, it, vi } from "vitest";
import { createSharedSentenceEndpoints } from "./shared-sentences";
import type { HttpClient } from "./http";

const id = "00000000-0000-4000-8000-000000000001";
const body = {
  id,
  revision: 1,
  lifecycle_revision: 1,
  view: "draft",
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
    const visibility = {
      entry_id: id,
      sentence_id: id,
      sense_id: id,
      revision: 2,
      hidden: true
    };
    const put = vi
      .fn()
      .mockResolvedValueOnce(visibility)
      .mockResolvedValue(body);
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
    await api.setVisibility(id, id, {
      base_revision: 1,
      sense_id: id,
      hidden: true
    });
    expect(put).toHaveBeenCalledWith(
      `/lexicon/entries/${id}/sentences/${id}/visibility`,
      { base_revision: 1, sense_id: id, hidden: true }
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

it("发布、回退、下架、恢复分别走独立路径并携带双版本与幂等键", async () => {
  const post = vi.fn().mockResolvedValue(body);
  const api = createSharedSentenceEndpoints({ post } as unknown as HttpClient);
  const input = { base_revision: 1, base_lifecycle_revision: 2 };
  const headers = { headers: { "Idempotency-Key": "command-key" } };
  await api.publish(id, "command-key", input);
  await api.rollback(id, id, "command-key", input);
  await api.withdraw(id, "command-key", {
    ...input,
    reason: "修正",
    impact_fingerprint: "digest"
  });
  await api.restore(id, "command-key", input);
  expect(post.mock.calls).toEqual([
    [`/lexicon/sentences/${id}/publications`, input, headers],
    [`/lexicon/sentences/${id}/publications/${id}/rollback`, input, headers],
    [
      `/lexicon/sentences/${id}/withdraw`,
      { ...input, reason: "修正", impact_fingerprint: "digest" },
      headers
    ],
    [`/lexicon/sentences/${id}/restore`, input, headers]
  ]);
});

it("编辑显式读取草稿，历史支持游标并拒绝畸形响应", async () => {
  const publication = {
    id,
    sentence_id: id,
    publication_number: 1,
    source_revision: 1,
    snapshot: body.content,
    published_at: body.created_at,
    published_by_admin_id: id
  };
  const get = vi
    .fn()
    .mockResolvedValueOnce(body)
    .mockResolvedValueOnce([publication])
    .mockResolvedValueOnce(publication)
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce([{ ...publication, snapshot: null }]);
  const api = createSharedSentenceEndpoints({ get } as unknown as HttpClient);
  await api.get(id, "draft");
  expect(get).toHaveBeenLastCalledWith(`/lexicon/sentences/${id}?view=draft`);
  await expect(api.publications(id, 5)).resolves.toEqual([publication]);
  expect(get).toHaveBeenLastCalledWith(
    `/lexicon/sentences/${id}/publications?before_number=5`
  );
  await expect(api.publication(id, id)).resolves.toEqual(publication);
  await expect(api.publications(id)).rejects.toThrow("数组");
  await expect(api.publications(id)).rejects.toThrow("接口契约");
});

it("下架影响预览保持目标身份并拒绝缺失指纹", async () => {
  const impact = {
    sentence_id: id,
    publication_id: id,
    lifecycle_revision: 2,
    targets: [
      { entry_id: id, sense_id: id, lifecycle_revision: 4, hidden: false }
    ],
    fingerprint: "digest"
  };
  const get = vi
    .fn()
    .mockResolvedValueOnce(impact)
    .mockResolvedValueOnce({ ...impact, fingerprint: undefined });
  const api = createSharedSentenceEndpoints({ get } as unknown as HttpClient);
  await expect(api.withdrawalImpact(id)).resolves.toEqual(impact);
  expect(get).toHaveBeenLastCalledWith(
    `/lexicon/sentences/${id}/withdrawal-impact`
  );
  await expect(api.withdrawalImpact(id)).rejects.toThrow("fingerprint");
});
