import { WORDLIST_READING_HEADERS } from "./wordlists";
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
it("reads whole-list availability through separate authorized routes and rejects malformed counts", async () => {
  const counts = { revision: 1, available_count: 50, unavailable_count: 1 };
  const http = {
    get: vi.fn().mockResolvedValue(counts)
  } as unknown as HttpClient;
  const api = createWordlistEndpoints(http);
  const signal = new AbortController().signal;
  expect(await api.availability(id, { signal })).toEqual(counts);
  expect(http.get).toHaveBeenLastCalledWith(`/wordlists/${id}/availability`, {
    signal
  });
  await api.myAvailability(id, { signal });
  expect(http.get).toHaveBeenLastCalledWith(
    `/me/wordlists/${id}/availability`,
    { signal }
  );
  expect(() =>
    decodeWordlistResponse("WordlistAvailability", {
      ...counts,
      unavailable_count: -1
    })
  ).toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistAvailability", {
      ...counts,
      private_note: "secret"
    })
  ).toThrow();
});

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
    headers: WORDLIST_READING_HEADERS
  });
  await api.myItems(id);
  expect(http.get).toHaveBeenLastCalledWith(`/me/wordlists/${id}/items`, {
    headers: WORDLIST_READING_HEADERS
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
    { headers: WORDLIST_READING_HEADERS }
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
    { headers: WORDLIST_READING_HEADERS }
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

it("management wire supports platform authors and keeps private notes out of public DTOs", async () => {
  const detail = {
    wordlist: { ...meta, owner_user_id: null },
    review_state: "none",
    recommended: false,
    tip_amount: "9007199254740993"
  };
  expect(() => decodeWordlistResponse("AdminWordlist", detail)).not.toThrow();
  expect(() =>
    decodeWordlistResponse("Wordlist", detail.wordlist)
  ).not.toThrow();
  expect(() =>
    decodeWordlistResponse("Wordlist", {
      ...detail.wordlist,
      admin_note: "secret"
    })
  ).toThrow();
  const http = {
    get: vi.fn().mockResolvedValue({ items: [detail], pagination }),
    post: vi.fn().mockResolvedValue(detail),
    put: vi.fn().mockResolvedValue(detail)
  } as unknown as HttpClient;
  const admin = createAdminWordlistEndpoints(http);
  await admin.management({
    q: "作者",
    public: false,
    recommended: false,
    created_from: "2026-10-12T00:00:00Z",
    page: 2,
    page_size: 20
  });
  const url = new URL(
    vi.mocked(http.get).mock.calls[0]![0],
    "https://example.test"
  );
  expect(url.pathname).toBe("/wordlists/management");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "作者",
    public: "false",
    recommended: "false",
    created_from: "2026-10-12T00:00:00Z",
    page: "2",
    page_size: "20"
  });
  await admin.visibility(id, { expected_revision: 7, public: true });
  expect(http.post).toHaveBeenLastCalledWith(`/wordlists/${id}/visibility`, {
    expected_revision: 7,
    public: true
  });
  await admin.recommend(id, { expected_revision: 8, recommended: true });
  expect(http.post).toHaveBeenLastCalledWith(
    `/wordlists/${id}/recommendation`,
    { expected_revision: 8, recommended: true }
  );
  await admin.delete(id, { expected_revision: 9 });
  expect(http.post).toHaveBeenLastCalledWith(`/wordlists/${id}/delete`, {
    expected_revision: 9
  });
});

it("autocomplete has a bounded response, no pagination and forwards cancellation", async () => {
  const candidate = {
    entry_id: id,
    publication_id: id,
    label: "apple",
    glosses: ["苹果"]
  };
  const http = {
    get: vi.fn().mockResolvedValue({ items: [candidate] })
  } as unknown as HttpClient;
  const signal = new AbortController().signal;
  await createWordlistEndpoints(http).suggestions({ q: "appl" }, { signal });
  expect(http.get).toHaveBeenLastCalledWith("/wordlists/suggestions?q=appl", {
    signal
  });
  await createWordlistEndpoints(http).suggestions(
    { q: "look forward" },
    { signal }
  );
  expect(http.get).toHaveBeenLastCalledWith(
    "/wordlists/suggestions?q=look+forward",
    { signal }
  );
  expect(() =>
    decodeWordlistResponse("WordlistSuggestions", {
      items: [candidate, candidate, candidate, candidate]
    })
  ).toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistSuggestions", {
      items: [candidate],
      pagination
    })
  ).toThrow();
});

it("author annotation negotiation accepts legacy omission and never admits public private-note fields", () => {
  expect(WORDLIST_READING_HEADERS["X-TSZ-Wordlist-Annotations"]).toBe("v1");
  const response = (annotation: unknown) => ({
    items: [
      { entry_id: id, position: 0, entry: null, author_note: annotation }
    ],
    revision: 1,
    pagination
  });
  expect(() =>
    decodeWordlistResponse("WordlistItems", response("给读者的注"))
  ).not.toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistItems", response(null))
  ).toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistItems", response("字".repeat(1001)))
  ).toThrow();
  expect(() =>
    decodeWordlistResponse("WordlistItems", {
      ...response("说明"),
      items: [{ ...response("说明").items[0], private_note: "机密" }]
    })
  ).toThrow();
});
