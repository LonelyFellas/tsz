import type {
  CreatePartOfSpeechInput,
  CreateSubPartOfSpeechInput,
  PartOfSpeechConfigListQuery,
  SubPartOfSpeechListResponse,
  UpdatePartOfSpeechInput,
  UpdateSubPartOfSpeechInput
} from "@tsz/types";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { partOfSpeechDataSource } from "../dataSource";

export const partOfSpeechKeys = {
  all: ["part-of-speech-config"] as const,
  catalog: () => [...partOfSpeechKeys.all, "catalog"] as const,
  lists: () => [...partOfSpeechKeys.all, "list"] as const,
  list: (query: PartOfSpeechConfigListQuery) =>
    [...partOfSpeechKeys.lists(), query] as const,
  subParts: (id: string) => [...partOfSpeechKeys.all, "sub-parts", id] as const
};

export function usePartOfSpeechCatalog() {
  return useQuery({
    queryKey: partOfSpeechKeys.catalog(),
    queryFn: () => partOfSpeechDataSource.catalog(),
    staleTime: 5 * 60 * 1000
  });
}

export function usePartOfSpeechConfigList(query: PartOfSpeechConfigListQuery) {
  return useQuery({
    queryKey: partOfSpeechKeys.list(query),
    queryFn: () => partOfSpeechDataSource.list(query)
  });
}

/**
 * 同时读取多个基本词性的细分词性并按传入顺序拼成一张表，供「全部」视图使用。
 * 缓存键与单父级列表共用，写操作失效 `partOfSpeechKeys.all` 时两边一起刷新。
 */
// combine 必须是引用稳定的函数，TanStack 才会对结果做结构共享，避免每次 render 都换新 items 引用。
function combineSubPartLists(
  results: UseQueryResult<SubPartOfSpeechListResponse>[]
) {
  return {
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.isError)?.error,
    items: results.flatMap((result) => result.data?.items ?? []),
    refetch: () => Promise.all(results.map((result) => result.refetch()))
  };
}

export function useSubPartOfSpeechLists(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: partOfSpeechKeys.subParts(id),
      queryFn: () => partOfSpeechDataSource.listSubParts(id)
    })),
    combine: combineSubPartLists
  });
}

function useInvalidatePartOfSpeech() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: partOfSpeechKeys.all });
}

export function useCreatePartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (input: CreatePartOfSpeechInput) =>
      partOfSpeechDataSource.create(input),
    onSuccess: invalidate
  });
}

export function useUpdatePartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdatePartOfSpeechInput }) =>
      partOfSpeechDataSource.update(vars.id, vars.input),
    onSuccess: invalidate
  });
}

export function useRemovePartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (vars: { id: string; base_revision: number }) =>
      partOfSpeechDataSource.remove(vars.id, {
        base_revision: vars.base_revision
      }),
    onSuccess: invalidate
  });
}

export function useCreateSubPartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (vars: { partId: string; input: CreateSubPartOfSpeechInput }) =>
      partOfSpeechDataSource.createSubPart(vars.partId, vars.input),
    onSuccess: invalidate
  });
}

export function useUpdateSubPartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (vars: {
      partId: string;
      subId: string;
      input: UpdateSubPartOfSpeechInput;
    }) =>
      partOfSpeechDataSource.updateSubPart(vars.partId, vars.subId, vars.input),
    onSuccess: invalidate
  });
}

export function useRemoveSubPartOfSpeech() {
  const invalidate = useInvalidatePartOfSpeech();
  return useMutation({
    mutationFn: (vars: {
      partId: string;
      subId: string;
      base_revision: number;
    }) =>
      partOfSpeechDataSource.removeSubPart(vars.partId, vars.subId, {
        base_revision: vars.base_revision
      }),
    onSuccess: invalidate
  });
}
