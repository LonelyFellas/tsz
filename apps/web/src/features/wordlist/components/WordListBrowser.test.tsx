import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { WordListBrowser } from "./WordListBrowser";
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      interactionStats: vi.fn().mockResolvedValue({ items: [] }),
      interactionStates: vi.fn().mockResolvedValue({ items: [] }),
      tipStates: vi.fn().mockResolvedValue({ items: [] }),
      recommended: vi.fn(),
      list: vi.fn().mockRejectedValue(new Error("offline"))
    }
  }
}));
it("read failure is visible and never falls back to prototype data", async () => {
  renderWithProviders(<WordListBrowser />);
  expect(await screen.findByRole("alert")).toHaveTextContent("词表加载失败");
  expect(screen.queryByText("小学一年级核心词")).not.toBeInTheDocument();
});

it("search can be cleared by its control and Escape without changing the category", async () => {
  const { api } = await import("@/lib/request");
  vi.mocked(api.wordList.recommended).mockResolvedValue({
    items: [],
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }
  });
  renderWithProviders(<WordListBrowser />);
  fireEvent.click(screen.getByText("系统推荐"));
  const search = screen.getByRole("searchbox", { name: "搜索词表" });
  fireEvent.change(search, { target: { value: "apple" } });
  await waitFor(() =>
    expect(api.wordList.recommended).toHaveBeenCalledWith(
      { page: 1, q: "apple" },
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  expect(screen.getByRole("button", { name: "系统推荐" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.change(search, { target: { value: "pear" } });
  fireEvent.keyDown(search, { key: "Escape" });
  expect(search).toHaveValue("");
});

it("system recommendations use their own server query", async () => {
  const { api } = await import("@/lib/request");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  vi.mocked(api.wordList.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }
  });
  vi.mocked(api.wordList.recommended).mockResolvedValue({
    items: [
      {
        id: "platform",
        owner_user_id: null,
        owner_name: "管理员",
        name: "系统精选",
        state: "published",
        revision: 1,
        item_count: 2,
        created_at: "",
        updated_at: ""
      }
    ],
    pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 }
  });
  renderWithProviders(<WordListBrowser />);
  fireEvent.click(screen.getByText("系统推荐"));
  expect(await screen.findByText("系统精选")).toBeInTheDocument();
  await waitFor(() =>
    expect(api.wordList.recommended).toHaveBeenCalledWith(
      { page: 1, q: "" },
      expect.anything()
    )
  );
  expect(screen.getByText(/平台 · 管理员/)).toBeInTheDocument();
});
