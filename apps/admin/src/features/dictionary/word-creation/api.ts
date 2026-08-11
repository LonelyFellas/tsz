import type {
  CreateAdminWordV2Input,
  DetectWordInputV2,
  PreviewFormsImpactInputV2,
  PublishAdminWordV2Input,
  SaveFormsStepInput,
  SaveMeaningsStepInput,
  SuggestDialectVariantsInputV2,
  ValidateAdminWordV2Input
} from "@tsz/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminWordsDataSource } from "../dataSource";
import { wordKeys } from "../api";

type CreateWordV2Command = CreateAdminWordV2Input & {
  idempotency_key: string;
};
type PublishWordV2Command = PublishAdminWordV2Input & {
  idempotency_key: string;
};

function useWriteV2Word() {
  const queryClient = useQueryClient();
  return {
    writeDetail: (wordId: string, value: unknown) =>
      queryClient.setQueryData(wordKeys.detail(wordId), value),
    invalidateCollection: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: wordKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: wordKeys.stats() })
      ])
  };
}

export function useDetectWordV2() {
  return useMutation({
    mutationFn: (input: DetectWordInputV2) => adminWordsDataSource.detect(input)
  });
}

export function useSuggestDialectVariants() {
  return useMutation({
    mutationFn: (input: SuggestDialectVariantsInputV2) =>
      adminWordsDataSource.suggestDialectVariants(input)
  });
}

export function useCreateWordV2() {
  const cache = useWriteV2Word();
  return useMutation({
    mutationFn: ({ idempotency_key, ...input }: CreateWordV2Command) =>
      adminWordsDataSource.createV2(idempotency_key, input),
    onSuccess: (envelope) => {
      cache.writeDetail(envelope.word.id, envelope);
      void cache.invalidateCollection();
    }
  });
}

export function usePreviewFormsImpact(wordId: string) {
  return useMutation({
    mutationFn: (input: PreviewFormsImpactInputV2) =>
      adminWordsDataSource.previewFormsImpact(wordId, input)
  });
}

export function useSaveFormsStep(wordId: string) {
  const cache = useWriteV2Word();
  return useMutation({
    mutationFn: (input: SaveFormsStepInput) =>
      adminWordsDataSource.saveFormsStep(wordId, input),
    onSuccess: (envelope) => {
      cache.writeDetail(wordId, envelope);
      void cache.invalidateCollection();
    }
  });
}

export function useSaveMeaningsStep(wordId: string) {
  const cache = useWriteV2Word();
  return useMutation({
    mutationFn: (input: SaveMeaningsStepInput) =>
      adminWordsDataSource.saveMeaningsStep(wordId, input),
    onSuccess: (envelope) => {
      cache.writeDetail(wordId, envelope);
      void cache.invalidateCollection();
    }
  });
}

export function useValidateWordV2(wordId: string) {
  return useMutation({
    mutationFn: (input: ValidateAdminWordV2Input) =>
      adminWordsDataSource.validateV2(wordId, input)
  });
}

export function usePublishWordV2(wordId: string) {
  const cache = useWriteV2Word();
  return useMutation({
    mutationFn: ({ idempotency_key, ...input }: PublishWordV2Command) =>
      adminWordsDataSource.publishV2(wordId, idempotency_key, input),
    onSuccess: (envelope) => {
      cache.writeDetail(wordId, envelope);
      void cache.invalidateCollection();
    }
  });
}
