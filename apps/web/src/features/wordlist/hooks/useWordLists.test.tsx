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
      wordIds: ["w1"],
      customWords: [],
      visibility: "private"
    });

    expect(MOCK_WORDLISTS.length).toBe(before + 1);
    expect(MOCK_WORDLISTS[0]!.name).toBe("私密词表");
  });

  it("公开 + 自定义词汇 → reviewStatus 为 pending", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "公开含自定义",
      wordIds: ["w1"],
      customWords: [{ text: "彩虹" }],
      visibility: "public"
    });

    expect(created.reviewStatus).toBe("pending");
  });

  it("公开 + 无自定义词汇 → reviewStatus 为 approved", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "公开无自定义",
      wordIds: ["w1", "w2"],
      customWords: [],
      visibility: "public"
    });

    expect(created.reviewStatus).toBe("approved");
  });

  it("私密 → reviewStatus 为 undefined", async () => {
    const { result } = renderHook(() => useCreateWordList(), {
      wrapper: QueryWrapper
    });

    const created = await result.current.mutateAsync({
      name: "私密",
      wordIds: ["w1"],
      customWords: [{ text: "月亮" }],
      visibility: "private"
    });

    expect(created.reviewStatus).toBeUndefined();
  });
});
