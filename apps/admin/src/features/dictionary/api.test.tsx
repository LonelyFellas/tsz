import {
  QueryClient,
  QueryClientProvider,
  useQuery
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminWordListItemV3 } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataSource = vi.hoisted(() => ({
  archive: vi.fn(),
  archiveBatch: vi.fn(),
  creators: vi.fn(),
  deleteBatch: vi.fn(),
  deleteDraft: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  stats: vi.fn(),
  restore: vi.fn(),
  restoreBatch: vi.fn()
}));

vi.mock("./dataSource", () => ({
  adminWordsDataSource: dataSource
}));

import {
  useArchiveWord,
  useArchiveWordsBatch,
  useDeleteWordDraft,
  useDeleteWordBatch,
  useRestoreWord,
  useRestoreWordsBatch,
  useWordCreators,
  useWordList,
  useWordStats
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

function listItemFixture(): AdminWordListItemV3 {
  return {
    annotation_visible: false,
    annotation: null,
    annotation_revision: 1,
    schema_version: 3,
    id: "v3-1",
    kind: "word",
    presentation: {
      label: "centre · center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "surface_summary_v1"
    },
    dialects: ["uk", "us"],
    revision: 2,
    lifecycle_revision: 1,
    gloss: "中心",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    has_unpublished_changes: false,
    max_reachable_step: "forms",
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dictionary React Query hooks", () => {
  it("列表调用 schema-aware facade 并包含展示词形", async () => {
    const list = {
      words: [listItemFixture()],
      page: { page: 1, page_size: 20, total: 1 }
    };
    dataSource.list.mockResolvedValue(list);
    const { wrapper } = queryWrapper();
    const hook = renderHook(() => useWordList({ page: 1, page_size: 20 }), {
      wrapper
    });

    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(dataSource.list).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
      include_name_variants: true
    });
    expect(hook.result.current.data).toEqual(list);
    expect(dataSource.get).not.toHaveBeenCalled();
  });

  it("单条与批量生命周期写入全部调用 Any facade", async () => {
    dataSource.archive.mockResolvedValue({ word: {} });
    dataSource.restore.mockResolvedValue({ word: {} });
    dataSource.archiveBatch.mockResolvedValue({ words: [], affected: 1 });
    dataSource.restoreBatch.mockResolvedValue({ words: [], affected: 1 });
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => ({
        archive: useArchiveWord(),
        restore: useRestoreWord(),
        archiveBatch: useArchiveWordsBatch(),
        restoreBatch: useRestoreWordsBatch()
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

    expect(dataSource.archive).toHaveBeenCalledWith(
      "v3-1",
      "archive-key",
      input
    );
    expect(dataSource.restore).toHaveBeenCalledWith(
      "v3-1",
      "restore-key",
      input
    );
    expect(dataSource.archiveBatch).toHaveBeenCalledWith("archive-batch-key", {
      entries: [{ id: "v3-1", ...input }]
    });
    expect(dataSource.restoreBatch).toHaveBeenCalledWith("restore-batch-key", {
      entries: [{ id: "v3-1", ...input }]
    });
  });

  it("归档、恢复和删除后实际重取列表显示标志，支持单条与批量", async () => {
    let visible = true;
    dataSource.list.mockImplementation(async () => ({
      words: [
        { ...listItemFixture(), annotation: "007", annotation_visible: visible }
      ],
      page: { page: 1, page_size: 20, total: 1 }
    }));
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => ({
        list: useWordList({ page: 1 }),
        archive: useArchiveWord(),
        restore: useRestoreWord(),
        archiveBatch: useArchiveWordsBatch(),
        restoreBatch: useRestoreWordsBatch(),
        deletion: useDeleteWordDraft(),
        deleteBatch: useDeleteWordBatch()
      }),
      { wrapper }
    );
    await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true));
    const input = { base_revision: 1, base_lifecycle_revision: 1 };
    const actions = [
      () =>
        hook.result.current.archive.mutateAsync({
          wordId: "peer",
          idempotencyKey: "a",
          input
        }),
      () =>
        hook.result.current.restore.mutateAsync({
          wordId: "peer",
          idempotencyKey: "r",
          input
        }),
      () =>
        hook.result.current.archiveBatch.mutateAsync({
          idempotencyKey: "ab",
          input: { entries: [{ id: "peer", ...input }] }
        }),
      () =>
        hook.result.current.restoreBatch.mutateAsync({
          idempotencyKey: "rb",
          input: { entries: [{ id: "peer", ...input }] }
        }),
      () =>
        hook.result.current.deletion.mutateAsync({
          wordId: "peer",
          baseRevision: 1,
          baseLifecycleRevision: 1
        }),
      () =>
        hook.result.current.deleteBatch.mutateAsync({
          idempotencyKey: "db",
          input: { entries: [{ id: "peer", ...input }] }
        })
    ];
    for (const [index, mutate] of actions.entries()) {
      visible = index === 1 || index === 3;
      const previousCalls = dataSource.list.mock.calls.length;
      await act(async () => {
        await mutate();
      });
      await waitFor(() =>
        expect(dataSource.list.mock.calls.length).toBe(previousCalls + 1)
      );
      expect(hook.result.current.list.data?.words[0]).toMatchObject({
        annotation: "007",
        annotation_visible: visible
      });
    }
  });

  it.each(["single", "batch"] as const)(
    "%s 删除后刷新列表、统计与创建人，不重取活动 V3 详情",
    async (mode) => {
      const word = listItemFixture();
      let deleted = false;
      dataSource.list.mockImplementation(async () => ({
        words: deleted ? [] : [word],
        page: { page: 1, page_size: 20, total: deleted ? 0 : 1 }
      }));
      dataSource.stats.mockImplementation(async () => ({
        total: deleted ? 0 : 1,
        today: deleted ? 0 : 1,
        month: deleted ? 0 : 1
      }));
      dataSource.creators.mockImplementation(async () =>
        deleted ? [] : [{ id: word.created_by, display_name: "创建人" }]
      );
      dataSource.deleteDraft.mockImplementation(async () => {
        deleted = true;
      });
      dataSource.deleteBatch.mockImplementation(async () => {
        deleted = true;
      });
      dataSource.get.mockResolvedValue({ word });
      const { wrapper, client } = queryWrapper();
      const hook = renderHook(
        () => ({
          detail: useQuery({
            queryKey: ["admin-words", "detail-v3", word.id],
            queryFn: () => dataSource.get(word.id)
          }),
          list: useWordList({ page: 1 }),
          stats: useWordStats(),
          creators: useWordCreators(true),
          deletion: useDeleteWordDraft(),
          deleteBatch: useDeleteWordBatch()
        }),
        { wrapper }
      );
      await waitFor(() => {
        expect(hook.result.current.detail.isSuccess).toBe(true);
        expect(hook.result.current.list.data?.words).toEqual([word]);
        expect(hook.result.current.stats.data?.total).toBe(1);
        expect(hook.result.current.creators.data).toEqual([
          { id: word.created_by, display_name: "创建人" }
        ]);
      });
      const input = {
        base_revision: word.revision,
        base_lifecycle_revision: word.lifecycle_revision
      };

      await act(async () => {
        if (mode === "single") {
          await hook.result.current.deletion.mutateAsync({
            wordId: word.id,
            baseRevision: word.revision,
            baseLifecycleRevision: word.lifecycle_revision
          });
        } else {
          await hook.result.current.deleteBatch.mutateAsync({
            idempotencyKey: "delete-key",
            input: { entries: [{ id: word.id, ...input }] }
          });
        }
      });

      await waitFor(() => {
        expect(hook.result.current.list.data?.words).toEqual([]);
        expect(hook.result.current.stats.data).toEqual({
          total: 0,
          today: 0,
          month: 0
        });
        expect(hook.result.current.creators.data).toEqual([]);
      });
      if (mode === "single") {
        expect(dataSource.deleteDraft).toHaveBeenCalledWith(word.id, input);
      } else {
        expect(dataSource.deleteBatch).toHaveBeenCalledWith("delete-key", {
          entries: [{ id: word.id, ...input }]
        });
      }
      expect(dataSource.get).toHaveBeenCalledTimes(1);
      expect(
        client.getQueryState(["admin-words", "detail-v3", word.id])
          ?.isInvalidated
      ).toBe(false);
    }
  );
});
