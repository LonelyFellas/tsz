import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryWrapper } from "@/test/render";
import { MOCK_WORDLISTS } from "../data/mockWordLists";
import { useCreateWordList, useWordLists } from "./useWordLists";

describe("useWordLists", () => {
  it("最终拿到 mock 词表列表", async () => {
    const { result } = renderHook(() => useWordLists(), {
      wrapper: QueryWrapper
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(MOCK_WORDLISTS);
  });
});

describe("useCreateWordList", () => {
  it("创建后列表新增一条", async () => {
    const before = MOCK_WORDLISTS.length;
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    await result.current.mutateAsync({
      name: "私密词表",
      word_ids: ["w1"],
      custom_words: [],
      visibility: "private"
    });

    expect(MOCK_WORDLISTS.length).toBe(before + 1);
    expect(MOCK_WORDLISTS[0]!.name).toBe("私密词表");
  });

  it("公开 + 自定义词汇 → review_status 为 pending", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "公开含自定义",
      word_ids: ["w1"],
      custom_words: [{ text: "彩虹" }],
      visibility: "public"
    });

    expect(created.review_status).toBe("pending");
  });

  it("公开 + 无自定义词汇 → review_status 为 approved", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "公开无自定义",
      word_ids: ["w1", "w2"],
      custom_words: [],
      visibility: "public"
    });

    expect(created.review_status).toBe("approved");
  });

  it("私密 → review_status 为 undefined", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "私密",
      word_ids: ["w1"],
      custom_words: [{ text: "月亮" }],
      visibility: "private"
    });

    expect(created.review_status).toBeUndefined();
  });
});
