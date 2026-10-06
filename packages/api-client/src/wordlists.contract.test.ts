import { expect, it, vi } from "vitest";
import {
  createWordlistEndpoints,
  createAdminWordlistEndpoints,
  decodeWordlistResponse
} from "./wordlists";
import type { HttpClient } from "./http";
const id = "019a1111-1111-7111-8111-111111111111";
const meta = {
  id,
  owner_user_id: id,
  owner_name: "作者",
  name: "词表",
  state: "draft",
  revision: 1,
  item_count: 1,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z"
};
const pagination = { page: 1, page_size: 50, total: 1, total_pages: 1 };
it("keeps public, personal and review item routes separate", async () => {
  const http = {
    get: vi.fn().mockResolvedValue({ items: [], revision: 1, pagination }),
    post: vi.fn().mockResolvedValue(meta),
    put: vi.fn().mockResolvedValue(meta)
  } as unknown as HttpClient;
  const api = createWordlistEndpoints(http);
  await api.items(id);
  expect(http.get).toHaveBeenLastCalledWith(
    `/wordlists/${id}/items`,
    undefined
  );
  await api.myItems(id);
  expect(http.get).toHaveBeenLastCalledWith(
    `/me/wordlists/${id}/items`,
    undefined
  );
  await api.create({
    idempotency_key: id,
    name: "词表",
    items: [{ entry_id: id, private_note: "私密" }]
  });
  expect(http.post).toHaveBeenLastCalledWith(
    "/me/wordlists",
    expect.objectContaining({ name: "词表" })
  );
  await createAdminWordlistEndpoints(http).items(id, id);
  expect(http.get).toHaveBeenLastCalledWith(
    `/wordlists/${id}/review-requests/${id}/items`,
    undefined
  );
});
it("rejects accidental private-note fields in a public response", () => {
  const item = { entry_id: id, position: 0, entry: null };
  expect(() =>
    decodeWordlistResponse("WordlistItems", {
      items: [item],
      revision: 1,
      pagination
    })
  ).not.toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistItems", {
      items: [{ ...item, private_note: "secret", note_revision: 1 }],
      revision: 1,
      pagination
    })
  ).toThrow();
  expect(() =>
    decodeWordlistResponse("MyWordlistItems", {
      items: [{ ...item, private_note: "secret", note_revision: 1 }],
      revision: 1,
      pagination
    })
  ).not.toThrow();
});
