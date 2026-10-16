import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createWordlistEndpoints } from "./wordlists";
import snapshot from "./openapi.snapshot.json";
const id = "019a1111-1111-7111-8111-111111111111";
const page = {
  version: "v1",
  ancestors: [],
  items: [
    {
      id,
      parent_id: null,
      wordlist_id: id,
      name: "个人备注",
      revision: 1,
      trashed_at: null,
      path: [],
      wordlist: null
    }
  ],
  pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 }
};
it("uses separate authenticated systems and validates unavailable references without losing user labels", async () => {
  const http = {
    get: vi.fn().mockResolvedValue(page),
    post: vi
      .fn()
      .mockResolvedValue({ version: "v1", folder_count: 1, wordlist_count: 2 }),
    put: vi.fn().mockResolvedValue(undefined)
  } as unknown as HttpClient;
  const api = createWordlistEndpoints(http).library;
  const signal = new AbortController().signal;
  expect(
    await api.list("favorites", { trash: true, parent_id: id }, { signal })
  ).toEqual(page);
  expect(http.get).toHaveBeenLastCalledWith(
    `/me/wordlist-library/favorites?trash=true&parent_id=${id}`,
    { signal }
  );
  const operation = {
    action: "trash" as const,
    expected_version: "v1",
    ids: [id]
  };
  await api.preview("owned", operation);
  expect(http.post).toHaveBeenLastCalledWith(
    "/me/wordlist-library/owned/preview",
    operation
  );
  await api.operate("favorites", {
    ...operation,
    action: "restore",
    original_location: true
  });
  expect(http.post).toHaveBeenLastCalledWith(
    "/me/wordlist-library/favorites/operations",
    expect.objectContaining({ action: "restore", original_location: true })
  );
  await api.createFolder("owned", {
    expected_version: "v1",
    parent_id: id,
    name: "目录"
  });
  await api.rename("favorites", id, { expected_version: "v1", name: "备注" });
  for (const [path, method] of [
    ["", "get"],
    ["/folders", "post"],
    ["/nodes/{id}", "put"],
    ["/preview", "post"],
    ["/operations", "post"]
  ]) {
    expect(
      (snapshot.paths as Record<string, string[]>)[
        `/me/wordlist-library/{space}${path}`
      ]
    ).toContain(method);
  }
  vi.mocked(http.get).mockResolvedValue({
    ...page,
    leaked_private_field: "secret"
  });
  await expect(api.list("owned")).rejects.toThrow("接口契约");
  vi.mocked(http.get).mockResolvedValue({
    ...page,
    items: [{ ...page.items[0], parent_id: "invalid" }]
  });
  await expect(api.list("owned")).rejects.toThrow("接口契约");
});
