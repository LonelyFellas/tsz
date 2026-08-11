import type {
  CreatePartOfSpeechInput,
  CreateSubPartOfSpeechInput,
  PartOfSpeechConfigListQuery,
  UpdatePartOfSpeechInput,
  UpdateSubPartOfSpeechInput
} from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useSubPartOfSpeechList(id: string, enabled: boolean) {
  return useQuery({
    queryKey: partOfSpeechKeys.subParts(id),
    queryFn: () => partOfSpeechDataSource.listSubParts(id),
    enabled
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
