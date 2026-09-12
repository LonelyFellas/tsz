// 智能词库的数据层:React Query hooks 包住 api.words.*(@tsz/api-client)。
// 列表/统计是服务端派生数据,任何写操作(增删改发布)后统一失效重取。
import type {
  EntryDeleteBatchInput,
  EntryLifecycleBatchInput,
  EntryLifecycleBatchResponse,
  EntryLifecycleInput
} from "@tsz/types";
import type { AdminWordListQuery } from "@tsz/types";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { adminWordsDataSource } from "./dataSource";

export const wordKeys = {
  all: ["admin-words"] as const,
  lists: () => [...wordKeys.all, "list"] as const,
  list: (query: AdminWordListQuery) => [...wordKeys.lists(), query] as const,
  stats: () => [...wordKeys.all, "stats"] as const,
  detail: (id: string) => [...wordKeys.all, "detail", id] as const,
  relatedSearch: (
    q: string,
    kind: "word" | "phrase" | undefined,
    matchMode: "exact" | "contains",
    includeDrafts = false
  ) =>
    [
      ...wordKeys.all,
      "related-search",
      q,
      kind,
      matchMode,
      includeDrafts
    ] as const
};

export function useWordList(query: AdminWordListQuery) {
  return useQuery({
    queryKey: wordKeys.list(query),
    queryFn: () => adminWordsDataSource.list(query),
    // 翻页/改筛选时保留上一页数据渲染,避免表格闪空。
    placeholderData: keepPreviousData
  });
}

export function useWordStats() {
  return useQuery({
    queryKey: wordKeys.stats(),
    queryFn: () => adminWordsDataSource.stats()
  });
}

export function useWordDetail(wordId: string, enabled = true) {
  return useQuery({
    queryKey: wordKeys.detail(wordId),
    queryFn: () => adminWordsDataSource.get(wordId),
    enabled,
    // 整棵树是编辑基准(updated_at 为乐观锁 token),进入编辑页必须拿最新,不吃缓存。
    staleTime: 0,
    gcTime: 0
  });
}

export function useRelatedSearch(
  q: string,
  kind: "word" | "phrase" | undefined,
  open: boolean,
  includeDrafts = false
) {
  const normalizedQ = q.trim();
  const enabled = open && normalizedQ !== "";
  const exact = useInfiniteQuery({
    queryKey: [
      ...wordKeys.relatedSearch(normalizedQ, kind, "exact", includeDrafts)
    ],
    queryFn: ({ pageParam }) =>
      adminWordsDataSource.relatedSearch(normalizedQ, {
        kind,
        match_mode: "exact",
        include_drafts: includeDrafts || undefined,
        page_size: 20,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      "next_cursor" in page ? (page.next_cursor ?? undefined) : undefined,
    enabled
  });
  const contains = useInfiniteQuery({
    queryKey: [
      ...wordKeys.relatedSearch(normalizedQ, kind, "contains", includeDrafts)
    ],
    queryFn: ({ pageParam }) =>
      adminWordsDataSource.relatedSearch(normalizedQ, {
        kind,
        match_mode: "contains",
        exclude_exact: true,
        include_drafts: includeDrafts || undefined,
        page_size: 20,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      "next_cursor" in page ? (page.next_cursor ?? undefined) : undefined,
    enabled
  });
  return { exact, contains };
}

/** 写操作共用:词条数据变更后,列表、统计、详情缓存全部失效。 */
function useInvalidateWords() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: wordKeys.all });
}

export function useDeleteWordDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      wordId,
      baseRevision,
      baseLifecycleRevision
    }: {
      wordId: string;
      baseRevision: number;
      baseLifecycleRevision: number;
    }) =>
      adminWordsDataSource.deleteDraft(wordId, {
        base_revision: baseRevision,
        base_lifecycle_revision: baseLifecycleRevision
      }),
    onSuccess: (_data, { wordId }) => {
      // 当前 basics 页仍订阅 detail；全量 invalidate 会主动重取已删除资源并按默认策略
      // 重试 404，阻塞 mutateAsync 后的跳转。删除该详情缓存，仅刷新集合派生数据。
      qc.removeQueries({ queryKey: wordKeys.detail(wordId), exact: true });
      return Promise.all([
        qc.invalidateQueries({ queryKey: wordKeys.lists() }),
        qc.invalidateQueries({ queryKey: wordKeys.stats() })
      ]);
    }
  });
}

export function useDeleteWordBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      input
    }: {
      idempotencyKey: string;
      input: EntryDeleteBatchInput;
    }) => adminWordsDataSource.deleteBatch(idempotencyKey, input),
    onSuccess: (_data, { input }) => {
      // 与单条删除同因：详情缓存必须先移除，否则全量 invalidate 会重取已删资源
      // 并按默认策略重试 404。
      for (const entry of input.entries) {
        qc.removeQueries({ queryKey: wordKeys.detail(entry.id), exact: true });
      }
      return Promise.all([
        qc.invalidateQueries({ queryKey: wordKeys.lists() }),
        qc.invalidateQueries({ queryKey: wordKeys.stats() })
      ]);
    }
  });
}

export interface WordLifecycleCommand {
  wordId: string;
  idempotencyKey: string;
  input: EntryLifecycleInput;
}

export interface WordLifecycleBatchCommand {
  idempotencyKey: string;
  input: EntryLifecycleBatchInput;
}

export function useArchiveWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: ({ wordId, idempotencyKey, input }: WordLifecycleCommand) =>
      adminWordsDataSource.archive(wordId, idempotencyKey, input),
    onSuccess: invalidate
  });
}

export function useRestoreWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: ({ wordId, idempotencyKey, input }: WordLifecycleCommand) =>
      adminWordsDataSource.restore(wordId, idempotencyKey, input),
    onSuccess: invalidate
  });
}

export function useArchiveWordsBatch() {
  const invalidate = useInvalidateWords();
  return useMutation<
    EntryLifecycleBatchResponse,
    Error,
    WordLifecycleBatchCommand
  >({
    mutationFn: ({ idempotencyKey, input }) =>
      adminWordsDataSource.archiveBatch(idempotencyKey, input),
    onSuccess: invalidate
  });
}

export function useRestoreWordsBatch() {
  const invalidate = useInvalidateWords();
  return useMutation<
    EntryLifecycleBatchResponse,
    Error,
    WordLifecycleBatchCommand
  >({
    mutationFn: ({ idempotencyKey, input }) =>
      adminWordsDataSource.restoreBatch(idempotencyKey, input),
    onSuccess: invalidate
  });
}
