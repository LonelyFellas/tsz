import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wordFixture } from "./word-creation/wordCreation.test.helper";

const dataSource = vi.hoisted(() => ({
  deleteDraft: vi.fn(),
  get: vi.fn()
}));

vi.mock("./dataSource", () => ({ adminWordsDataSource: dataSource }));

import { useDeleteWordDraft, useWordDetail, wordKeys } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dictionary React Query hooks", () => {
  it("删除草稿后移除 active detail，仅失效列表与统计且不重取 404", async () => {
    const word = wordFixture();
    dataSource.get
      .mockResolvedValueOnce({ word })
      .mockRejectedValue(new Error("word not found"));
    dataSource.deleteDraft.mockResolvedValue(undefined);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 3, retryDelay: 1 },
        mutations: { retry: false }
      }
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const remove = vi.spyOn(client, "removeQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => ({
        detail: useWordDetail(word.id),
        deletion: useDeleteWordDraft()
      }),
      { wrapper }
    );
    await waitFor(() =>
      expect(hook.result.current.detail.isSuccess).toBe(true)
    );

    await act(async () => {
      await hook.result.current.deletion.mutateAsync({
        wordId: word.id,
        baseRevision: word.revision,
        baseLifecycleRevision: word.lifecycle_revision
      });
    });

    expect(dataSource.deleteDraft).toHaveBeenCalledWith(word.id, {
      base_revision: word.revision,
      base_lifecycle_revision: word.lifecycle_revision
    });
    expect(remove).toHaveBeenCalledWith({
      queryKey: wordKeys.detail(word.id),
      exact: true
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.stats() });
    expect(dataSource.get).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(wordKeys.detail(word.id))).toBeUndefined();
  });
});
