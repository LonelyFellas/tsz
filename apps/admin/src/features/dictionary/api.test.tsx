import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminWordDraftV3Envelope, AdminWordListItemV3 } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wordFixture } from "./word-creation/wordCreation.test.helper";

const dataSource = vi.hoisted(() => ({
  deleteDraft: vi.fn(),
  get: vi.fn(),
  relatedSearch: vi.fn()
}));

const anyDataSource = vi.hoisted(() => ({
  archiveAny: vi.fn(),
  archiveBatchAny: vi.fn(),
  getAny: vi.fn(),
  listAny: vi.fn(),
  relatedSearchAny: vi.fn(),
  restoreAny: vi.fn(),
  restoreBatchAny: vi.fn()
}));

vi.mock("./dataSource", () => ({
  adminWordsDataSource: dataSource,
  adminWordsAnyDataSource: anyDataSource
}));

import {
  useArchiveWordAny,
  useArchiveWordsBatchAny,
  useDeleteWordDraft,
  useRelatedSearchAny,
  useRelatedSearchV2,
  useRestoreWordAny,
  useRestoreWordsBatchAny,
  useWordDetailAny,
  useWordList,
  useWordDetail,
  wordKeys
} from "./api";

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const relatedWord = (wordId: string, headword: string) => ({
  word_id: wordId,
  headword,
  kind: "word" as const,
  dialects: ["common" as const],
  pos_labels: ["noun"],
  senses: [{ sense_id: `${wordId}-sense`, gloss: wordId }]
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dictionary React Query hooks", () => {
  it("mixed 关联搜索通过 schema-aware facade 并保留精确/包含分页", async () => {
    anyDataSource.relatedSearchAny.mockImplementation(
      async (_q: string, query: Record<string, unknown>) => ({
        results: [],
        total: 0,
        next_cursor:
          query.cursor === undefined ? `${query.match_mode}-next` : null
      })
    );
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => useRelatedSearchAny("  outside  ", "word", true),
      { wrapper }
    );

    await waitFor(() => {
      expect(hook.result.current.exact.isSuccess).toBe(true);
      expect(hook.result.current.contains.isSuccess).toBe(true);
    });
    expect(anyDataSource.relatedSearchAny).toHaveBeenCalledWith("outside", {
      kind: "word",
      match_mode: "exact",
      page_size: 20,
      cursor: undefined
    });
    expect(anyDataSource.relatedSearchAny).toHaveBeenCalledWith("outside", {
      kind: "word",
      match_mode: "contains",
      exclude_exact: true,
      page_size: 20,
      cursor: undefined
    });

    await act(async () => {
      await hook.result.current.exact.fetchNextPage();
      await hook.result.current.contains.fetchNextPage();
    });
    expect(anyDataSource.relatedSearchAny).toHaveBeenCalledWith(
      "outside",
      expect.objectContaining({ cursor: "exact-next" })
    );
    expect(anyDataSource.relatedSearchAny).toHaveBeenCalledWith(
      "outside",
      expect.objectContaining({ cursor: "contains-next" })
    );
  });

  it("mixed 列表与 Any 详情只调用 schema-aware facade", async () => {
    const listItem = {
      schema_version: 3,
      id: "v3-1",
      kind: "word",
      presentation: {
        label: "centre · center",
        matched_surfaces: ["centre", "center"],
        strategy_version: "surface_summary_v1"
      },
      revision: 2,
      lifecycle_revision: 1,
      gloss: "中心",
      pos_list: ["noun"],
      levels: ["A1"],
      status: "draft",
      has_unpublished_changes: false,
      max_reachable_step: "forms",
      created_by_name: "Admin",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z"
    } satisfies AdminWordListItemV3;
    const list = {
      words: [listItem],
      page: { page: 1, page_size: 20, total: 1 }
    };
    const detail: AdminWordDraftV3Envelope = {
      word: {
        ...listItem,
        language: "en" as const,
        capabilities: {
          publication: {
            mode: "shadow_only" as const,
            blocked_code: "phase2_consumers_not_ready" as const
          },
          pronunciation_normalization_version: "nfkc_trim_lower_v1" as const
        },
        forms: { pos: [] },
        meanings: { sense_groups: [], pos: [] },
        completed_steps: [] as const,
        created_by: "admin-1"
      },
      retired_stable_nodes: []
    };
    anyDataSource.listAny.mockResolvedValue(list);
    anyDataSource.getAny.mockResolvedValue(detail);
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => ({
        list: useWordList({ page: 1, page_size: 20 }),
        detail: useWordDetailAny("v3-1")
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(hook.result.current.list.isSuccess).toBe(true);
      expect(hook.result.current.detail.isSuccess).toBe(true);
    });
    expect(anyDataSource.listAny).toHaveBeenCalledWith({
      page: 1,
      page_size: 20
    });
    expect(anyDataSource.getAny).toHaveBeenCalledWith("v3-1");
    expect(hook.result.current.list.data).toEqual(list);
    expect(hook.result.current.detail.data).toEqual(detail);
  });

  it("单条与批量生命周期写入全部调用 Any facade", async () => {
    anyDataSource.archiveAny.mockResolvedValue({ word: {} });
    anyDataSource.restoreAny.mockResolvedValue({ word: {} });
    anyDataSource.archiveBatchAny.mockResolvedValue({ words: [], affected: 1 });
    anyDataSource.restoreBatchAny.mockResolvedValue({ words: [], affected: 1 });
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => ({
        archive: useArchiveWordAny(),
        restore: useRestoreWordAny(),
        archiveBatch: useArchiveWordsBatchAny(),
        restoreBatch: useRestoreWordsBatchAny()
      }),
      { wrapper }
    );
    const input = { base_revision: 2, base_lifecycle_revision: 1 };

    await act(async () => {
      await hook.result.current.archive.mutateAsync({
        wordId: "v3-1",
        idempotencyKey: "archive-key",
        input
      });
      await hook.result.current.restore.mutateAsync({
        wordId: "v3-1",
        idempotencyKey: "restore-key",
        input
      });
      await hook.result.current.archiveBatch.mutateAsync({
        idempotencyKey: "archive-batch-key",
        input: { entries: [{ id: "v3-1", ...input }] }
      });
      await hook.result.current.restoreBatch.mutateAsync({
        idempotencyKey: "restore-batch-key",
        input: { entries: [{ id: "v3-1", ...input }] }
      });
    });

    expect(anyDataSource.archiveAny).toHaveBeenCalledWith(
      "v3-1",
      "archive-key",
      input
    );
    expect(anyDataSource.restoreAny).toHaveBeenCalledWith(
      "v3-1",
      "restore-key",
      input
    );
    expect(anyDataSource.archiveBatchAny).toHaveBeenCalledWith(
      "archive-batch-key",
      { entries: [{ id: "v3-1", ...input }] }
    );
    expect(anyDataSource.restoreBatchAny).toHaveBeenCalledWith(
      "restore-batch-key",
      { entries: [{ id: "v3-1", ...input }] }
    );
  });

  it("V2 exact 与 contains 独立请求，并分别按 cursor 累积全部页", async () => {
    const firstExact = relatedWord("workspace-1", "workspace");
    const secondExact = relatedWord("workspace-2", "workspace");
    const partial = relatedWord("workspace-tools", "workspace tools");
    const secondPartial = relatedWord("workspace-team", "workspace team");
    dataSource.relatedSearch.mockImplementation(
      async (_q: string, query: Record<string, unknown>) => {
        if (query.match_mode === "contains") {
          return query.cursor === "contains-page-2"
            ? { results: [secondPartial], total: 2, next_cursor: null }
            : {
                results: [partial],
                total: 2,
                next_cursor: "contains-page-2"
              };
        }
        if (query.cursor === "exact-page-2") {
          return { results: [secondExact], total: 2, next_cursor: null };
        }
        return {
          results: [firstExact],
          total: 2,
          next_cursor: "exact-page-2"
        };
      }
    );
    const { client, wrapper } = queryWrapper();
    const hook = renderHook(
      () => useRelatedSearchV2("  workspace  ", "word", true),
      { wrapper }
    );

    await waitFor(() => {
      expect(hook.result.current.exact.isSuccess).toBe(true);
      expect(hook.result.current.contains.isSuccess).toBe(true);
    });
    expect(dataSource.relatedSearch).toHaveBeenCalledWith("workspace", {
      kind: "word",
      match_mode: "exact",
      page_size: 20,
      cursor: undefined
    });
    expect(dataSource.relatedSearch).toHaveBeenCalledWith("workspace", {
      kind: "word",
      match_mode: "contains",
      exclude_exact: true,
      page_size: 20,
      cursor: undefined
    });

    await act(async () => {
      await hook.result.current.exact.fetchNextPage();
    });
    expect(dataSource.relatedSearch).toHaveBeenCalledWith("workspace", {
      kind: "word",
      match_mode: "exact",
      page_size: 20,
      cursor: "exact-page-2"
    });
    const exactCache = client.getQueryData<{
      pages: Array<{ results: ReturnType<typeof relatedWord>[] }>;
    }>(wordKeys.relatedSearchV2("workspace", "word", "exact"));
    expect(exactCache?.pages.flatMap((page) => page.results)).toEqual([
      firstExact,
      secondExact
    ]);

    await act(async () => {
      await hook.result.current.contains.fetchNextPage();
    });
    expect(dataSource.relatedSearch).toHaveBeenCalledWith("workspace", {
      kind: "word",
      match_mode: "contains",
      exclude_exact: true,
      page_size: 20,
      cursor: "contains-page-2"
    });
    await waitFor(() => {
      const containsCache = client.getQueryData<{
        pages: Array<{ results: ReturnType<typeof relatedWord>[] }>;
      }>(wordKeys.relatedSearchV2("workspace", "word", "contains"));
      expect(containsCache?.pages.flatMap((page) => page.results)).toEqual([
        partial,
        secondPartial
      ]);
    });
  });

  it("q/kind 切换后使用新 key，旧请求晚响应不会混入当前结果", async () => {
    const oldExact = deferred<{
      results: ReturnType<typeof relatedWord>[];
      total: number;
      next_cursor: null;
    }>();
    const oldContains = deferred<{
      results: ReturnType<typeof relatedWord>[];
      total: number;
      next_cursor: null;
    }>();
    const newExact = deferred<{
      results: ReturnType<typeof relatedWord>[];
      total: number;
      next_cursor: null;
    }>();
    const newContains = deferred<{
      results: ReturnType<typeof relatedWord>[];
      total: number;
      next_cursor: null;
    }>();
    dataSource.relatedSearch.mockImplementation(
      (q: string, query: { match_mode: "exact" | "contains" }) => {
        if (q === "old") {
          return query.match_mode === "exact"
            ? oldExact.promise
            : oldContains.promise;
        }
        return query.match_mode === "exact"
          ? newExact.promise
          : newContains.promise;
      }
    );
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      ({ q, kind }: { q: string; kind: "word" | "phrase" }) =>
        useRelatedSearchV2(q, kind, true),
      { wrapper, initialProps: { q: "old", kind: "word" } }
    );
    await waitFor(() =>
      expect(dataSource.relatedSearch).toHaveBeenCalledTimes(2)
    );

    hook.rerender({ q: "new", kind: "phrase" });
    await waitFor(() =>
      expect(dataSource.relatedSearch).toHaveBeenCalledTimes(4)
    );
    const currentExact = relatedWord("new-exact", "new");
    const currentContains = relatedWord("new-partial", "new phrase");
    await act(async () => {
      newExact.resolve({
        results: [currentExact],
        total: 1,
        next_cursor: null
      });
      newContains.resolve({
        results: [currentContains],
        total: 1,
        next_cursor: null
      });
    });
    await waitFor(() =>
      expect(hook.result.current.exact.data?.pages[0]?.results).toEqual([
        currentExact
      ])
    );

    await act(async () => {
      oldExact.resolve({
        results: [relatedWord("old-exact", "old")],
        total: 1,
        next_cursor: null
      });
      oldContains.resolve({
        results: [relatedWord("old-partial", "old phrase")],
        total: 1,
        next_cursor: null
      });
    });
    expect(hook.result.current.exact.data?.pages[0]?.results).toEqual([
      currentExact
    ]);
    expect(hook.result.current.contains.data?.pages[0]?.results).toEqual([
      currentContains
    ]);
    expect(dataSource.relatedSearch).toHaveBeenCalledWith(
      "new",
      expect.objectContaining({ kind: "phrase", match_mode: "exact" })
    );
  });

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
