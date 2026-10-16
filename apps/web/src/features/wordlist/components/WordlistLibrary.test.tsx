import {
  act,
  fireEvent,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordlistLibrary } from "./WordlistLibrary";
import type { LibraryItem, LibraryPage } from "@tsz/types";
const navigation = vi.hoisted(() => ({ params: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.params),
  useRouter: () => ({ push: navigation.push })
}));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      library: {
        list: vi.fn(),
        createFolder: vi.fn(),
        rename: vi.fn(),
        preview: vi.fn(),
        operate: vi.fn()
      }
    }
  }
}));
import { api } from "@/lib/request";
const folder: LibraryItem = {
  id: "folder",
  parent_id: null,
  wordlist_id: null,
  name: "英语",
  revision: 1,
  trashed_at: null,
  path: [],
  wordlist: null
};
const file: LibraryItem = {
  ...folder,
  id: "file",
  wordlist_id: "wordlist",
  name: "我的备注",
  wordlist: null
};
const page = (items: LibraryItem[]): LibraryPage => ({
  version: "v1",
  ancestors: [],
  items,
  pagination: { page: 1, page_size: 50, total: items.length, total_pages: 1 }
});
beforeEach(() => {
  HTMLElement.prototype.scrollTo = function (
    options: ScrollToOptions | number = 0,
    y: number = 0
  ) {
    this.scrollTop = typeof options === "number" ? y : (options.top ?? 0);
  };
  vi.resetAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(min-width: 1024px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  );
  navigation.params = "";
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  useUserStore.setState({
    user: {
      id: "reader",
      display_name: "reader",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
  vi.mocked(api.wordList.library.list).mockResolvedValue(page([folder, file]));
  vi.mocked(api.wordList.library.preview).mockResolvedValue({
    version: "v1",
    folder_count: 2,
    wordlist_count: 7
  });
  vi.mocked(api.wordList.library.operate).mockResolvedValue({
    version: "v1",
    folder_count: 2,
    wordlist_count: 7
  });
});
it("previews recursive deletion and submits the confirmed snapshot only after confirmation", async () => {
  renderWithProviders(<WordlistLibrary />);
  await screen.findAllByText("英语");
  fireEvent.click(screen.getByLabelText("选择当前页全部项目"));
  fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);
  const dialog = await screen.findByRole("dialog", { name: "移入回收站" });
  expect(dialog).toHaveTextContent("2 个文件夹和 7 份词表");
  expect(api.wordList.library.operate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(api.wordList.library.operate).toHaveBeenCalledWith(
      "owned",
      expect.objectContaining({
        expected_version: "v1",
        action: "trash",
        ids: ["folder", "file"]
      })
    )
  );
  expect(await screen.findByRole("status")).toHaveTextContent("已移入回收站");
});
it("separates systems and restores unavailable favorites at their original location", async () => {
  navigation.params = "space=favorites&trash=true";
  vi.mocked(api.wordList.library.list).mockResolvedValue(
    page([{ ...file, trashed_at: "2026-10-16T00:00:00Z" }])
  );
  renderWithProviders(<WordlistLibrary />);
  expect(
    await within(screen.getByRole("region", { name: "内容区域" })).findByText(
      "原词表不可用"
    )
  ).toBeInTheDocument();
  expect(api.wordList.library.list).toHaveBeenCalledWith(
    "favorites",
    expect.objectContaining({ trash: true }),
    expect.anything()
  );
  fireEvent.click(screen.getByRole("button", { name: "恢复" }));
  const dialog = await screen.findByRole("dialog", { name: "恢复到" });
  fireEvent.click(within(dialog).getByRole("button", { name: "恢复到原位置" }));
  await waitFor(() =>
    expect(api.wordList.library.operate).toHaveBeenCalledWith(
      "favorites",
      expect.objectContaining({
        action: "restore",
        ids: ["file"],
        original_location: true
      })
    )
  );
});
it("keeps failed deletion recoverable and never claims success", async () => {
  vi.mocked(api.wordList.library.operate).mockRejectedValue(
    new Error("目录已改变")
  );
  renderWithProviders(<WordlistLibrary />);
  await screen.findAllByText("英语");
  fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await waitFor(() =>
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("目录已改变")
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("does not deliver results from an old account into the new account", async () => {
  let finish!: (value: {
    version: string;
    folder_count: number;
    wordlist_count: number;
  }) => void;
  vi.mocked(api.wordList.library.operate).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  renderWithProviders(<WordlistLibrary />);
  await screen.findAllByText("英语");
  fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(api.wordList.library.operate).toHaveBeenCalled());
  act(() => useUserStore.setState({ user: null }));
  await act(async () =>
    finish({ version: "v1", folder_count: 1, wordlist_count: 0 })
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps the directory beside the selected wordlist and links editing into the same workspace", async () => {
  const wordlist = {
    id: "wordlist",
    owner_user_id: "reader",
    owner_name: "读者",
    name: "阅读生词",
    state: "draft" as const,
    revision: 1,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordList.library.list).mockResolvedValue(
    page([{ ...file, wordlist, name: wordlist.name }])
  );
  renderWithProviders(<WordlistLibrary />);
  const content = screen.getByRole("region", { name: "内容区域" });
  const link = await within(content).findByRole("link", { name: "阅读生词" });
  expect(link).toHaveAttribute(
    "href",
    "/account/wordlists?space=owned&wordlist=wordlist"
  );
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const treeFile = await within(tree).findByRole("button", {
    name: "阅读生词"
  });
  expect(treeFile).toHaveAttribute("data-leaves-page");
  fireEvent.click(treeFile);
  expect(navigation.push).toHaveBeenCalledWith(
    "/account/wordlists?space=owned&wordlist=wordlist"
  );
  expect(
    screen.getByRole("complementary", { name: "目录区域" })
  ).toBeInTheDocument();
});

it("moves a selection from the content pane into the tree and rejects another system's drag", async () => {
  renderWithProviders(<WordlistLibrary />);
  await screen.findAllByText("英语");
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const target = within(tree).getByRole("button", {
    name: "英语"
  }).parentElement!;
  fireEvent.drop(target, {
    dataTransfer: {
      getData: () => JSON.stringify({ space: "favorites", ids: ["file"] })
    }
  });
  expect(api.wordList.library.operate).not.toHaveBeenCalled();
  const payload = new Map<string, string>();
  const dataTransfer = {
    setData: (key: string, value: string) => payload.set(key, value),
    getData: (key: string) => payload.get(key) ?? ""
  };
  const content = screen.getByRole("region", { name: "内容区域" });
  fireEvent.dragStart(within(content).getByLabelText("拖动 我的备注"), {
    dataTransfer
  });
  fireEvent.drop(target, { dataTransfer });
  await waitFor(() =>
    expect(api.wordList.library.operate).toHaveBeenCalledWith(
      "owned",
      expect.objectContaining({
        action: "move",
        ids: ["file"],
        target_id: "folder"
      })
    )
  );
});

it("creates a child in the context-menu folder rather than the currently open directory", async () => {
  renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const node = await within(tree).findByRole("button", { name: "英语" });
  fireEvent.contextMenu(node);
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "新建子文件夹" })
  );
  const dialog = await screen.findByRole("dialog", { name: "新建文件夹" });
  fireEvent.change(within(dialog).getByLabelText("名称"), {
    target: { value: "雅思" }
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.library.createFolder).toHaveBeenCalledWith("owned", {
      expected_version: "v1",
      parent_id: "folder",
      name: "雅思"
    })
  );
});

it("expands with the keyboard, collapses the explorer, and adjusts the pane width", async () => {
  vi.mocked(api.wordList.library.list).mockImplementation(
    async (_space, query) => page(query?.parent_id ? [file] : [folder])
  );
  renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const node = await within(tree).findByRole("button", { name: "英语" });
  fireEvent.keyDown(node, { key: "ArrowRight" });
  await within(tree).findByRole("button", { name: "我的备注" });
  fireEvent.click(within(tree).getByRole("button", { name: "全部折叠" }));
  expect(within(tree).queryByRole("button", { name: "我的备注" })).toBeNull();
  const divider = screen.getByRole("separator", { name: "调整目录宽度" });
  fireEvent.keyDown(divider, { key: "ArrowRight" });
  expect(divider).toHaveAttribute("aria-valuenow", "276");
});

it("opens root wordlists from a subfolder without inheriting that folder and creates at root", async () => {
  navigation.params = "space=owned&folder=other-folder";
  const view = renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  fireEvent.click(
    await within(tree).findByRole("button", { name: "我的备注" })
  );
  expect(navigation.push).toHaveBeenCalledWith(
    "/account/wordlists?space=owned&wordlist=wordlist"
  );
  navigation.params = "space=owned&wordlist=wordlist";
  view.rerender(<WordlistLibrary />);
  await within(screen.getByRole("region", { name: "内容区域" })).findByText(
    "原词表暂不可用，收藏位置和个人备注仍然保留。"
  );
  fireEvent.click(
    within(tree).getByRole("button", { name: "在当前目录新建文件夹" })
  );
  const dialog = await screen.findByRole("dialog", { name: "新建文件夹" });
  fireEvent.change(within(dialog).getByLabelText("名称"), {
    target: { value: "根目录新文件夹" }
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.library.createFolder).toHaveBeenCalledWith("owned", {
      expected_version: "v1",
      parent_id: null,
      name: "根目录新文件夹"
    })
  );
});

it("shows failed tree moves while a wordlist is open in the content pane", async () => {
  navigation.params = "space=owned&wordlist=wordlist";
  vi.mocked(api.wordList.library.operate).mockRejectedValue(
    new Error("目录版本冲突")
  );
  renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const target = (await within(tree).findByRole("button", { name: "英语" }))
    .parentElement!;
  fireEvent.drop(target, {
    dataTransfer: {
      getData: () => JSON.stringify({ space: "owned", ids: ["file"] })
    }
  });
  expect(
    await within(screen.getByRole("region", { name: "内容区域" })).findByRole(
      "alert"
    )
  ).toHaveTextContent("目录版本冲突");
});
