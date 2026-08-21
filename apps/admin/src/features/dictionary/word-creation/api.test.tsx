import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wordKeys } from "../api";
import {
  contentCompletionPollInterval,
  useCreateWordV2,
  useCreateContentCompletionJob,
  useContentCompletionJob,
  useDetectWordV2,
  usePreviewFormsImpact,
  usePublishWordV2,
  useSaveFormsStep,
  useSaveMeaningsStep,
  useRetryContentCompletionJob,
  useSuggestDialectVariants,
  useValidateWordV2
} from "./api";
import { detectionFixture, wordFixture } from "./wordCreation.test.helper";

const dataSource = vi.hoisted(() => ({
  detect: vi.fn(),
  suggestDialectVariants: vi.fn(),
  createV2: vi.fn(),
  previewFormsImpact: vi.fn(),
  saveFormsStep: vi.fn(),
  saveMeaningsStep: vi.fn(),
  createContentCompletionJob: vi.fn(),
  getContentCompletionJob: vi.fn(),
  retryContentCompletionJob: vi.fn(),
  validateV2: vi.fn(),
  publishV2: vi.fn()
}));

vi.mock("../dataSource", () => ({ adminWordsDataSource: dataSource }));

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("V2 word creation React Query hooks", () => {
  it("detect、方言建议、impact 与 validate 原样转发输入和 wordId", async () => {
    const detection = detectionFixture();
    dataSource.detect.mockResolvedValue(detection);
    dataSource.suggestDialectVariants.mockResolvedValue({ suggestions: [] });
    dataSource.previewFormsImpact.mockResolvedValue({
      base_revision: 3,
      requires_confirmation: false,
      affected: []
    });
    dataSource.validateV2.mockResolvedValue({
      validated_revision: 3,
      valid: true,
      issues: []
    });
    const { wrapper } = setup();
    const detect = renderHook(() => useDetectWordV2(), { wrapper });
    const suggest = renderHook(() => useSuggestDialectVariants(), { wrapper });
    const impact = renderHook(() => usePreviewFormsImpact("word-1"), {
      wrapper
    });
    const validate = renderHook(() => useValidateWordV2("word-1"), {
      wrapper
    });

    await act(async () => {
      await detect.result.current.mutateAsync({
        language: "en",
        headword: "center"
      });
      await suggest.result.current.mutateAsync({
        source_dialect: "us",
        target_dialect: "uk",
        items: [{ client_id: "field-1", field_kind: "form", value: "center" }]
      });
      await impact.result.current.mutateAsync({
        base_revision: 3,
        content: { pos: [] }
      });
      await validate.result.current.mutateAsync({ base_revision: 3 });
    });

    expect(dataSource.detect).toHaveBeenCalledWith({
      language: "en",
      headword: "center"
    });
    expect(dataSource.suggestDialectVariants).toHaveBeenCalledWith({
      source_dialect: "us",
      target_dialect: "uk",
      items: [{ client_id: "field-1", field_kind: "form", value: "center" }]
    });
    expect(dataSource.previewFormsImpact).toHaveBeenCalledWith("word-1", {
      base_revision: 3,
      content: { pos: [] }
    });
    expect(dataSource.validateV2).toHaveBeenCalledWith("word-1", {
      base_revision: 3
    });
  });

  it("create 成功写入新 ID 的 detail cache，并失效列表与统计", async () => {
    const word = wordFixture();
    const envelope = { word };
    dataSource.createV2.mockResolvedValue(envelope);
    const { client, invalidate, wrapper } = setup();
    const hook = renderHook(() => useCreateWordV2(), { wrapper });
    const input = {
      schema_version: 2 as const,
      idempotency_key: "create-key",
      detection_id: "detection-center",
      headwords: word.headwords
    };

    await act(async () => {
      await hook.result.current.mutateAsync(input);
    });

    expect(dataSource.createV2).toHaveBeenCalledWith("create-key", {
      schema_version: 2,
      detection_id: "detection-center",
      headwords: word.headwords
    });
    expect(client.getQueryData(wordKeys.detail(word.id))).toEqual(envelope);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.lists() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.stats() });
  });

  it("内容生成 create/get/retry 透传 word、job、幂等键和 snake_case 输入", async () => {
    const word = wordFixture();
    const envelope = {
      job: {
        id: "job-1",
        entry_id: word.id,
        base_revision: word.revision,
        status: "failed" as const,
        requested_scope: ["grammar_structures" as const],
        fill_policy: "missing_only" as const,
        partitions: [
          {
            pos_id: word.forms.pos[0]!.pos_id,
            pos: word.forms.pos[0]!.pos,
            status: "failed" as const,
            attempt: 1
          }
        ],
        created_at: "2026-08-18T00:00:00Z",
        updated_at: "2026-08-18T00:00:01Z"
      }
    };
    dataSource.createContentCompletionJob.mockResolvedValue(envelope);
    dataSource.getContentCompletionJob.mockResolvedValue(envelope);
    dataSource.retryContentCompletionJob.mockResolvedValue(envelope);
    const { wrapper } = setup();
    const create = renderHook(() => useCreateContentCompletionJob(word.id), {
      wrapper
    });
    await act(async () => {
      await create.result.current.mutateAsync({
        idempotency_key: "generate-key",
        base_revision: word.revision,
        scope: ["grammar_structures"],
        fill_policy: "missing_only"
      });
    });
    renderHook(() => useContentCompletionJob(word.id, "job-1"), { wrapper });
    await waitFor(() =>
      expect(dataSource.getContentCompletionJob).toHaveBeenCalledWith(
        word.id,
        "job-1"
      )
    );
    const retry = renderHook(
      () => useRetryContentCompletionJob(word.id, "job-1"),
      { wrapper }
    );
    await act(async () => {
      await retry.result.current.mutateAsync({
        idempotency_key: "retry-key",
        pos_ids: [word.forms.pos[0]!.pos_id]
      });
    });
    expect(dataSource.createContentCompletionJob).toHaveBeenCalledWith(
      word.id,
      "generate-key",
      {
        base_revision: word.revision,
        scope: ["grammar_structures"],
        fill_policy: "missing_only"
      }
    );
    expect(dataSource.retryContentCompletionJob).toHaveBeenCalledWith(
      word.id,
      "job-1",
      "retry-key",
      { pos_ids: [word.forms.pos[0]!.pos_id] }
    );
  });

  it("内容生成只在 pending/running 状态轮询", () => {
    expect(contentCompletionPollInterval("pending")).toBe(1000);
    expect(contentCompletionPollInterval("running")).toBe(1000);
    expect(contentCompletionPollInterval("completed")).toBe(false);
    expect(contentCompletionPollInterval()).toBe(false);
  });

  it.each([
    ["forms", useSaveFormsStep, "saveFormsStep"],
    ["meanings", useSaveMeaningsStep, "saveMeaningsStep"],
    ["publish", usePublishWordV2, "publishV2"]
  ] as const)(
    "%s 写操作更新同一 detail cache",
    async (_name, useHook, method) => {
      const word = wordFixture({ revision: 4, ready: true });
      const envelope = { word };
      dataSource[method].mockResolvedValue(envelope);
      const { client, invalidate, wrapper } = setup();
      const hook = renderHook(() => useHook(word.id), { wrapper });
      const input =
        method === "saveFormsStep"
          ? {
              base_revision: 3,
              intent: "save" as const,
              content: word.forms
            }
          : method === "saveMeaningsStep"
            ? {
                base_revision: 3,
                intent: "complete" as const,
                content: word.meanings
              }
            : {
                base_revision: 3,
                idempotency_key: "publish-key"
              };

      await act(async () => {
        await hook.result.current.mutateAsync(input as never);
      });

      if (method === "publishV2") {
        expect(dataSource.publishV2).toHaveBeenCalledWith(
          word.id,
          "publish-key",
          { base_revision: 3 }
        );
      } else {
        expect(dataSource[method]).toHaveBeenCalledWith(word.id, input);
      }
      expect(client.getQueryData(wordKeys.detail(word.id))).toEqual(envelope);
      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.lists() });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: wordKeys.stats() });
    }
  );

  it("写操作失败时不污染 detail cache，也不失效集合", async () => {
    const error = new Error("revision conflict");
    dataSource.saveFormsStep.mockRejectedValue(error);
    const { client, invalidate, wrapper } = setup();
    const hook = renderHook(() => useSaveFormsStep("word-1"), { wrapper });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          base_revision: 3,
          intent: "save",
          content: { pos: [] }
        })
      ).rejects.toBe(error);
    });

    expect(client.getQueryData(wordKeys.detail("word-1"))).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
