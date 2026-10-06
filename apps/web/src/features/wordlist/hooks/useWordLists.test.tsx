import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QueryWrapper } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { useWordLists } from "./useWordLists";
vi.mock("@/lib/request", () => ({
  api: { wordList: { list: vi.fn(), mine: vi.fn() } }
}));
import { api } from "@/lib/request";
it("public and account list use separate API routes", async () => {
  const response = {
    items: [],
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }
  };
  vi.mocked(api.wordList.list).mockResolvedValue(response);
  vi.mocked(api.wordList.mine).mockResolvedValue(response);
  useUserStore.setState({
    user: {
      id: "one",
      display_name: "one",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
  const publicList = renderHook(() => useWordLists(), {
    wrapper: QueryWrapper
  });
  await waitFor(() => expect(publicList.result.current.isSuccess).toBe(true));
  expect(api.wordList.mine).not.toHaveBeenCalled();
  const mine = renderHook(() => useWordLists(true), { wrapper: QueryWrapper });
  await waitFor(() => expect(mine.result.current.isSuccess).toBe(true));
  expect(api.wordList.mine).toHaveBeenCalled();
});
