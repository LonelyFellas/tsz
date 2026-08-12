// 智能词库的数据层:React Query hooks 包住 api.words.*(@tsz/api-client)。
// 列表/统计是服务端派生数据,任何写操作(增删改发布)后统一失效重取。
import type {
  AdminWordBatchDeleteResponse,
  EntryLifecycleBatchInput,
  EntryLifecycleBatchResponse,
  EntryLifecycleInput
} from "@tsz/types";
import type {
  AdminWordCreateInput,
  AdminWordListQuery,
  AdminWordSaveInput
} from "@tsz/types";
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
  detail: (id: string) => [...wordKeys.all, "detail", id] as const,
  relatedSearch: (q: string) => [...wordKeys.all, "related-search", q] as const
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

/** 「添加关联词」弹窗搜索:回车才提交;弹窗关闭或空查询不发请求。 */
export function useRelatedSearch(q: string, open: boolean) {
  return useQuery({
    queryKey: wordKeys.relatedSearch(q),
    queryFn: () => adminWordsDataSource.relatedSearch(q),
    enabled: open && q.trim() !== ""
  });
}

/** 写操作共用:词条数据变更后,列表、统计、详情缓存全部失效。 */
function useInvalidateWords() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: wordKeys.all });
}

export function useCreateWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (input: AdminWordCreateInput) =>
      adminWordsDataSource.create(input),
    onSuccess: invalidate
  });
}

export function useSaveWordContent() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (vars: { wordId: string; input: AdminWordSaveInput }) =>
      adminWordsDataSource.saveContent(vars.wordId, vars.input),
    onSuccess: invalidate
  });
}

export function usePublishWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (wordId: string) => adminWordsDataSource.publish(wordId),
    onSuccess: invalidate
  });
}

export function useDeleteWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (wordId: string) => adminWordsDataSource.remove(wordId),
    onSuccess: invalidate
  });
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

export function useBatchDeleteWords() {
  const invalidate = useInvalidateWords();
  return useMutation<AdminWordBatchDeleteResponse, Error, string[]>({
    mutationFn: (ids: string[]) => adminWordsDataSource.batchDelete(ids),
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
