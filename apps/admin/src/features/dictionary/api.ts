// 智能词库的数据层:React Query hooks 包住 api.words.*(@tsz/api-client)。
// 列表/统计是服务端派生数据,任何写操作(增删改发布)后统一失效重取。
import type { AdminWordBatchDeleteResponse } from "@tsz/types";
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
import { api } from "@/lib/auth";

export const wordKeys = {
  all: ["admin-words"] as const,
  list: (query: AdminWordListQuery) =>
    [...wordKeys.all, "list", query] as const,
  stats: () => [...wordKeys.all, "stats"] as const,
  detail: (id: string) => [...wordKeys.all, "detail", id] as const,
  relatedSearch: (q: string) => [...wordKeys.all, "related-search", q] as const
};

export function useWordList(query: AdminWordListQuery) {
  return useQuery({
    queryKey: wordKeys.list(query),
    queryFn: () => api.words.list(query),
    // 翻页/改筛选时保留上一页数据渲染,避免表格闪空。
    placeholderData: keepPreviousData
  });
}

export function useWordStats() {
  return useQuery({
    queryKey: wordKeys.stats(),
    queryFn: () => api.words.stats()
  });
}

export function useWordDetail(wordId: string) {
  return useQuery({
    queryKey: wordKeys.detail(wordId),
    queryFn: () => api.words.get(wordId),
    // 整棵树是编辑基准(updated_at 为乐观锁 token),进入编辑页必须拿最新,不吃缓存。
    staleTime: 0,
    gcTime: 0
  });
}

/** 「添加关联词」弹窗搜索:回车才提交;弹窗关闭或空查询不发请求。 */
export function useRelatedSearch(q: string, open: boolean) {
  return useQuery({
    queryKey: wordKeys.relatedSearch(q),
    queryFn: () => api.words.relatedSearch(q),
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
    mutationFn: (input: AdminWordCreateInput) => api.words.create(input),
    onSuccess: invalidate
  });
}

export function useSaveWordContent() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (vars: { wordId: string; input: AdminWordSaveInput }) =>
      api.words.saveContent(vars.wordId, vars.input),
    onSuccess: invalidate
  });
}

export function usePublishWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (wordId: string) => api.words.publish(wordId),
    onSuccess: invalidate
  });
}

export function useDeleteWord() {
  const invalidate = useInvalidateWords();
  return useMutation({
    mutationFn: (wordId: string) => api.words.remove(wordId),
    onSuccess: invalidate
  });
}

export function useBatchDeleteWords() {
  const invalidate = useInvalidateWords();
  return useMutation<AdminWordBatchDeleteResponse, Error, string[]>({
    mutationFn: (ids: string[]) => api.words.batchDelete(ids),
    onSuccess: invalidate
  });
}
