import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AdminWordDraftV3Envelope, AdminWordListItemV3 } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataSource = vi.hoisted(() => ({
  archive: vi.fn(),
  archiveBatch: vi.fn(),
  creators: vi.fn(),
  deleteBatch: vi.fn(),
  deleteDraft: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
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
  useWordDetail,
  useWordList,
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

function detailFixture(): AdminWordDraftV3Envelope {
  return {
    word: {
      ...listItemFixture(),
      language: "en" as const,
      capabilities: {
        publication: {
          mode: "native" as const
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
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dictionary React Query hooks", () => {
  it("mixed 列表与 Any 详情只调用 schema-aware facade", async () => {
    const listItem = listItemFixture();
    const list = {
      words: [listItem],
      page: { page: 1, page_size: 20, total: 1 }
    };
    const detail = detailFixture();
    dataSource.list.mockResolvedValue(list);
    dataSource.get.mockResolvedValue(detail);
    const { wrapper } = queryWrapper();
    const hook = renderHook(
      () => ({
        list: useWordList({ page: 1, page_size: 20 }),
        detail: useWordDetail("v3-1")
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(hook.result.current.list.isSuccess).toBe(true);
      expect(hook.result.current.detail.isSuccess).toBe(true);
    });
    expect(dataSource.list).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
      include_name_variants: true
    });
    expect(dataSource.get).toHaveBeenCalledWith("v3-1");
    expect(hook.result.current.list.data).toEqual(list);
    expect(hook.result.current.detail.data).toEqual(detail);
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
    "%s 删除最后一条词条后刷新创建人选项",
    async (mode) => {
      dataSource.creators
        .mockResolvedValueOnce([{ id: "creator-1", display_name: "创建人" }])
        .mockResolvedValue([]);
      dataSource.deleteDraft.mockResolvedValue(undefined);
      dataSource.deleteBatch.mockResolvedValue(undefined);
      const { wrapper } = queryWrapper();
      const hook = renderHook(
        () => ({
          creators: useWordCreators(true),
          deletion: useDeleteWordDraft(),
          deleteBatch: useDeleteWordBatch()
        }),
        { wrapper }
      );
      await waitFor(() =>
        expect(hook.result.current.creators.data).toEqual([
          { id: "creator-1", display_name: "创建人" }
        ])
      );

      await act(async () => {
        if (mode === "single") {
          await hook.result.current.deletion.mutateAsync({
            wordId: "last-entry",
            baseRevision: 1,
            baseLifecycleRevision: 1
          });
        } else {
          await hook.result.current.deleteBatch.mutateAsync({
            idempotencyKey: "delete-last-entry",
            input: {
              entries: [
                {
                  id: "last-entry",
                  base_revision: 1,
                  base_lifecycle_revision: 1
                }
              ]
            }
          });
        }
      });

      await waitFor(() =>
        expect(hook.result.current.creators.data).toEqual([])
      );
    }
  );

  it("删除草稿后移除 active detail，失效集合派生数据且不重取 404", async () => {
    const detail = detailFixture();
    const { word } = detail;
    dataSource.get
      .mockResolvedValueOnce(detail)
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
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.stats() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.creators() });
    expect(dataSource.get).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(wordKeys.detail(word.id))).toBeUndefined();
  });
});
