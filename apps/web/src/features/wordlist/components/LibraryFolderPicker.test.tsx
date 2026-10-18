import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import type { LibraryItem, LibraryPage } from "@tsz/types";
import { LibraryFolderPicker } from "./LibraryFolderPicker";
vi.mock("@/lib/request", () => ({
  api: { wordList: { library: { list: vi.fn() } } }
}));
import { api } from "@/lib/request";
const folder: LibraryItem = {
  id: "folder",
  name: "英语",
  parent_id: null,
  wordlist_id: null,
  wordlist: null,
  path: [],
  revision: 1,
  trashed_at: null
};
const page = (
  items: LibraryItem[],
  ancestors: LibraryPage["ancestors"] = []
): LibraryPage => ({
  version: "v1",
  items,
  ancestors,
  pagination: { page: 1, page_size: 50, total: 100, total_pages: 2 }
});
beforeEach(() => {
  vi.resetAllMocks();
  useUserStore.setState({
    user: {
      id: "reader",
      display_name: "reader",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
  vi.mocked(api.wordList.library.list).mockResolvedValue(page([folder]));
});
it("locks folder navigation and pagination while the operation is pending", async () => {
  renderWithProviders(
    <LibraryFolderPicker space="owned" busy onPick={vi.fn()} />
  );
  expect(await screen.findByRole("button", { name: "英语" })).toBeDisabled();
  const pager = screen.getByRole("navigation", { name: "分页" });
  expect(within(pager).getByRole("button", { name: "下一页" })).toBeDisabled();
});
it("keeps selected folders unavailable as move targets", async () => {
  renderWithProviders(
    <LibraryFolderPicker
      space="owned"
      busy={false}
      exclude={["folder"]}
      onPick={vi.fn()}
    />
  );
  expect(await screen.findByRole("button", { name: "英语" })).toBeDisabled();
});
it("submits the visible destination after navigating rather than the previous folder", async () => {
  const pick = vi.fn();
  vi.mocked(api.wordList.library.list).mockImplementation(
    async (_space, query) =>
      query?.parent_id
        ? page([], [{ id: "folder", name: "英语" }])
        : page([folder])
  );
  renderWithProviders(
    <LibraryFolderPicker space="owned" busy={false} onPick={pick} />
  );
  fireEvent.click(await screen.findByRole("button", { name: "英语" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "选择当前文件夹" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "选择当前文件夹" }));
  expect(pick).toHaveBeenCalledWith("folder");
});
