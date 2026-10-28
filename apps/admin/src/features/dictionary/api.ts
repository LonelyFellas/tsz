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
  creators: () => [...wordKeys.all, "creators"] as const
};

export function useWordList(filters: AdminWordListQuery) {
  const query = { ...filters, include_name_variants: true };
  return useQuery({
    queryKey: wordKeys.list(query),
    queryFn: () => adminWordsDataSource.list(query),
    // 翻页/改筛选时保留上一页数据渲染,避免表格闪空。
    placeholderData: keepPreviousData
  });
}

export function useWordCreators(enabled: boolean) {
  return useQuery({
    queryKey: wordKeys.creators(),
    queryFn: () => adminWordsDataSource.creators(),
    enabled
  });
}

export function useWordStats() {
  return useQuery({
    queryKey: wordKeys.stats(),
    queryFn: () => adminWordsDataSource.stats()
  });
}

/** 写操作共用:词条数据变更后,列表、统计、详情缓存全部失效。 */
function useInvalidateWords() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: wordKeys.all });
}

/** 删除只刷新集合派生数据，避免重取正在使用的 V3 详情。 */
function useInvalidateWordCollections() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: wordKeys.lists() }),
      qc.invalidateQueries({ queryKey: wordKeys.stats() }),
      qc.invalidateQueries({ queryKey: wordKeys.creators() })
    ]);
}

export function useDeleteWordDraft() {
  const invalidate = useInvalidateWordCollections();
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
    onSuccess: invalidate
  });
}

export function useDeleteWordBatch() {
  const invalidate = useInvalidateWordCollections();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      input
    }: {
      idempotencyKey: string;
      input: EntryDeleteBatchInput;
    }) => adminWordsDataSource.deleteBatch(idempotencyKey, input),
    onSuccess: invalidate
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
