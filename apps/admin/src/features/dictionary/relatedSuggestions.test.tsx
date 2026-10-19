import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import {
  useRelatedSuggestions,
  useRelatedWordSenses
} from "./relatedSuggestions";
vi.mock("./dataSource", () => ({
  adminWordsDataSource: { relatedSuggestions: vi.fn(), relatedSenses: vi.fn() }
}));
import { adminWordsDataSource as api } from "./dataSource";
const item = {
  entry_id: "entry",
  publication_id: "pub",
  label: "apple",
  glosses: ["苹果"],
  sense_count: 2
};
const wrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};
beforeEach(() => {
  vi.resetAllMocks();
});
it("debounces, excludes the source entry and loads no senses while typing", async () => {
  vi.mocked(api.relatedSuggestions).mockResolvedValue({ items: [item] });
  const hook = renderHook(({ q }) => useRelatedSuggestions(q, true, "self"), {
    initialProps: { q: "" },
    wrapper: wrapper()
  });
  hook.rerender({ q: "ap" });
  hook.rerender({ q: "appl" });
  expect(api.relatedSuggestions).not.toHaveBeenCalled();
  await waitFor(() => expect(hook.result.current.words).toHaveLength(1));
  expect(api.relatedSuggestions).toHaveBeenCalledTimes(1);
  expect(api.relatedSuggestions).toHaveBeenCalledWith("appl", {
    exclude_entry_id: "self",
    signal: expect.any(AbortSignal)
  });
  expect(hook.result.current.words[0]).toMatchObject({
    word_id: "entry",
    senseCount: 2,
    senses: []
  });
  expect(api.relatedSenses).not.toHaveBeenCalled();
});
it("hides stale candidates immediately and cancels the superseded query", async () => {
  let complete: (result: { items: (typeof item)[] }) => void = () => {};
  let signal: AbortSignal | undefined;
  vi.mocked(api.relatedSuggestions).mockImplementation((q, o) =>
    q === "app"
      ? new Promise((resolve) => {
          complete = resolve;
          signal = o?.signal;
        })
      : Promise.resolve({
          items: [{ ...item, entry_id: "banana", label: "banana" }]
        })
  );
  const hook = renderHook(({ q }) => useRelatedSuggestions(q, true), {
    initialProps: { q: "app" },
    wrapper: wrapper()
  });
  await waitFor(() => expect(signal).toBeDefined());
  hook.rerender({ q: "banana" });
  expect(hook.result.current.words).toEqual([]);
  await waitFor(() =>
    expect(hook.result.current.words[0]?.word_id).toBe("banana")
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => complete({ items: [item] }));
  expect(hook.result.current.words[0]?.word_id).toBe("banana");
});
it("reads senses by selected entry and publication only, and surfaces stale-publication failure", async () => {
  vi.mocked(api.relatedSenses)
    .mockResolvedValueOnce({
      entry_id: "entry",
      publication_id: "pub",
      senses: [{ sense_id: "sense", gloss: "苹果" }]
    })
    .mockRejectedValueOnce(new HttpError(409, "词条已更新"));
  const hook = renderHook(
    ({ id, pub }: { id?: string; pub?: string }) =>
      useRelatedWordSenses(id, pub),
    { initialProps: {} as { id?: string; pub?: string }, wrapper: wrapper() }
  );
  expect(api.relatedSenses).not.toHaveBeenCalled();
  hook.rerender({ id: "entry", pub: "pub" });
  await waitFor(() =>
    expect(hook.result.current.data?.senses[0]?.sense_id).toBe("sense")
  );
  expect(api.relatedSenses).toHaveBeenCalledWith("entry", {
    publication_id: "pub",
    signal: expect.any(AbortSignal)
  });
  hook.rerender({ id: "other", pub: "new" });
  expect(hook.result.current.data).toBeUndefined();
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(api.relatedSenses).toHaveBeenCalledTimes(2);
});
