import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryWrapper } from "@/test/render";
import { useCustomAudio } from "./useCustomAudio";
vi.mock("@/lib/request", () => ({
  api: { wordList: { myCustomAudio: vi.fn(), customAudio: vi.fn() } }
}));
import { api } from "@/lib/request";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
it.each(["queued", "processing", "refunding"] as const)(
  "only %s continues polling, ready stops",
  async (status) => {
    const job = {
      item_id: "item",
      job_id: "job",
      word: "word",
      status,
      locales: []
    };
    vi.mocked(api.wordList.myCustomAudio)
      .mockResolvedValueOnce({ items: [job] })
      .mockResolvedValue({
        items: [{ ...job, status: "ready", locales: ["en-GB", "en-US"] }]
      });
    vi.useFakeTimers();
    const { result, unmount } = renderHook(
      () => useCustomAudio("list", ["item"], true, "user"),
      { wrapper: QueryWrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.data?.items[0]?.status).toBe(status);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(api.wordList.myCustomAudio).toHaveBeenCalledTimes(2);
    expect(result.current.data?.items[0]?.status).toBe("ready");
    unmount();
  }
);
it("does not request audio for an empty visible custom selection, even on explicit refresh", async () => {
  const { result } = renderHook(
    () => useCustomAudio("list", [], true, "user"),
    { wrapper: QueryWrapper }
  );
  await act(async () => {
    await result.current.refetch();
  });
  expect(api.wordList.myCustomAudio).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.data).toEqual({ items: [] }));
});
it("splits visible item IDs into batches of at most 100 and excludes other IDs", async () => {
  vi.mocked(api.wordList.customAudio).mockResolvedValue({ items: [] });
  const ids = Array.from({ length: 205 }, (_, index) => `item-${index}`);
  const { result } = renderHook(() => useCustomAudio("list", ids, false), {
    wrapper: QueryWrapper
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const batches = vi
    .mocked(api.wordList.customAudio)
    .mock.calls.map((call) => call[1]!);
  expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
  expect(batches.flat().sort()).toEqual(ids.sort());
});
