import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createRelatedSuggestionEndpoints } from "./related-suggestions";
const id = "019a1111-1111-7111-8111-111111111111";
it("separates light candidates from lazy publication-bound senses and forwards abort", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce({
      items: [
        {
          entry_id: id,
          publication_id: id,
          label: "apple",
          glosses: ["苹果"],
          sense_count: 2
        }
      ]
    })
    .mockResolvedValueOnce({
      entry_id: id,
      publication_id: id,
      senses: [{ sense_id: id, gloss: "苹果" }]
    });
  const api = createRelatedSuggestionEndpoints({
    get
  } as unknown as HttpClient);
  const signal = new AbortController().signal;
  await api.relatedSuggestions("aple", { exclude_entry_id: id, signal });
  expect(get).toHaveBeenLastCalledWith(
    `/lexicon/entries/related-suggestions?q=aple&exclude_entry_id=${id}`,
    { signal }
  );
  await api.relatedSenses(id, { publication_id: id, signal });
  expect(get).toHaveBeenLastCalledWith(
    `/lexicon/entries/${id}/relation-senses?publication_id=${id}`,
    { signal }
  );
});
it("rejects full snapshots or sense lists accidentally added to a candidate", async () => {
  const item = {
    entry_id: id,
    publication_id: id,
    label: "apple",
    glosses: [],
    sense_count: 2
  };
  const get = vi
    .fn()
    .mockResolvedValueOnce({ items: [{ ...item, senses: [] }] })
    .mockResolvedValueOnce({ items: [item, item, item, item] });
  const api = createRelatedSuggestionEndpoints({
    get
  } as unknown as HttpClient);
  await expect(api.relatedSuggestions("app")).rejects.toThrow("接口契约");
  await expect(api.relatedSuggestions("app")).rejects.toThrow("接口契约");
});
