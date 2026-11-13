import { describe, expect, it, vi } from "vitest";
import { createAdminEndpoints } from "./admin";
import type { HttpClient } from "./http";
import { ClientResponseError } from "./client-response-error";

const row = {
  id: "018e5188-3210-7000-8000-000000000001",
  code: "formal",
  name_zh: "正式",
  name_en: "Formal",
  sort_order: 10,
  revision: 1,
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z"
};
function setup() {
  const http = {
    get: vi.fn().mockResolvedValue({
      items: [row],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
    }),
    post: vi.fn().mockResolvedValue(row),
    patch: vi.fn().mockResolvedValue(row),
    del: vi.fn().mockResolvedValue(undefined)
  };
  return {
    http,
    api: createAdminEndpoints(http as unknown as HttpClient).lexiconTaxonomies
  };
}
describe("lexicon taxonomy contract", () => {
  it.each(["registers", "domains"] as const)(
    "%s uses real routes and serializes search/revision queries",
    async (kind) => {
      const { api, http } = setup();
      await api.list(kind, { q: "a&b 中文", page: 2, page_size: 10 });
      expect(http.get).toHaveBeenCalledWith(
        `/lexicon/taxonomies/${kind}?q=a%26b+%E4%B8%AD%E6%96%87&page=2&page_size=10`
      );
      const input = {
        code: "formal",
        name_zh: "正式",
        name_en: "Formal",
        sort_order: 10
      };
      await expect(api.create(kind, input)).resolves.toEqual(row);
      expect(http.post).toHaveBeenCalledWith(
        `/lexicon/taxonomies/${kind}`,
        input
      );
      const fields = {
        name_zh: input.name_zh,
        name_en: input.name_en,
        sort_order: input.sort_order
      };
      await api.update(kind, row.id, { ...fields, base_revision: 1 });
      expect(http.patch).toHaveBeenCalledWith(
        `/lexicon/taxonomies/${kind}/${row.id}`,
        { ...fields, base_revision: 1 }
      );
      await api.remove(kind, row.id, 1);
      expect(http.del).toHaveBeenCalledWith(
        `/lexicon/taxonomies/${kind}/${row.id}?base_revision=1`
      );
    }
  );
  it("rejects malformed lists and records rather than accepting broken revisions", async () => {
    const { api, http } = setup();
    http.get.mockResolvedValue({ items: [row] });
    await expect(api.list("domains")).rejects.toBeInstanceOf(
      ClientResponseError
    );
    http.patch.mockResolvedValue({ ...row, revision: "2" });
    await expect(
      api.update("registers", row.id, {
        name_zh: "正式",
        name_en: "Formal",
        sort_order: 10,
        base_revision: 1
      })
    ).rejects.toBeInstanceOf(ClientResponseError);
  });
});
