import { SENTENCE_FORMATTING_HEADERS } from "./sentence-formatting";
import { expect, it, vi } from "vitest";
import snapshot from "./openapi.snapshot.json";
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
  const signal = new AbortController().signal;
  await api.items(id, {}, { signal });
  expect(http.get).toHaveBeenLastCalledWith(`/wordlists/${id}/items`, {
    signal,
    headers: SENTENCE_FORMATTING_HEADERS
  });
  await api.myItems(id);
  expect(http.get).toHaveBeenLastCalledWith(`/me/wordlists/${id}/items`, {
    headers: SENTENCE_FORMATTING_HEADERS
  });
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
    { headers: SENTENCE_FORMATTING_HEADERS }
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

it("accepts standard and opted-in full shapes while rejecting internal pronunciation fields", async () => {
  const standardPos = {
    pos_id: id,
    pos: "noun",
    senses: [],
    grammar_structures: []
  };
  const entry = {
    entry_id: id,
    publication_id: id,
    label: "apple",
    kind: "word",
    pos: [standardPos]
  };
  const response = (value: unknown) => ({
    items: [{ entry_id: id, position: 0, entry: value }],
    revision: 1,
    pagination
  });
  expect(() =>
    decodeWordlistResponse("WordlistItems", response(entry))
  ).not.toThrow();
  const pronunciation = { id, dict_phonetic: "/æpəl/" };
  const full = {
    ...entry,
    pos: [
      {
        ...standardPos,
        label: "名词",
        forms: [
          {
            id,
            form_type: "base",
            label: "原形",
            sense_ids: [],
            variants: [
              {
                id,
                dialect: "common",
                spelling: "apple",
                pronunciations: [pronunciation]
              }
            ]
          }
        ]
      }
    ]
  };
  expect(() =>
    decodeWordlistResponse("WordlistItems", response(full))
  ).not.toThrow();
  expect(() =>
    decodeWordlistResponse(
      "WordlistItems",
      response({ ...entry, pos: [{ ...standardPos, forms: null }] })
    )
  ).toThrow();
  const http = {
    get: vi.fn().mockResolvedValue(response(full))
  } as unknown as HttpClient;
  await createWordlistEndpoints(http).items(id, {
    view: "full",
    sort: "label_asc",
    page: 2
  });
  expect(http.get).toHaveBeenCalledWith(
    `/wordlists/${id}/items?view=full&sort=label_asc&page=2`,
    { headers: SENTENCE_FORMATTING_HEADERS }
  );
  Object.assign(pronunciation, { actual_pron: "internal" });
  expect(() =>
    decodeWordlistResponse("WordlistItems", response(full))
  ).toThrow();
});

it("resolves the optional reading query enums from the generated contract", () => {
  for (const operation of [
    "get /wordlists/{id}/items",
    "get /me/wordlists/{id}/items"
  ] as const) {
    const params = snapshot.operationQueryParameters[operation];
    for (const [name, schema, values] of [
      ["view", "WordlistView", ["standard", "full"]],
      ["sort", "WordlistSort", ["author", "label_asc", "label_desc"]]
    ] as const) {
      const param = params.find((value) => value.name === name);
      expect(param?.required).toBe(false);
      expect(param?.schema).toEqual({ $ref: `#/components/schemas/${schema}` });
      expect(snapshot.schemas[schema].enum).toEqual(values);
    }
  }
});
