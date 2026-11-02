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
import { LibraryTree } from "./LibraryTree";
vi.mock("./WordListDetail", () => ({
  WordListDetail: ({ id }: { id: string }) => (
    <article aria-label="词表内容">词条内容 {id}</article>
  )
}));
vi.mock("./WordListCreator", () => ({
  WordListCreator: () => <input aria-label="草稿名称" defaultValue="" />
}));
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
  vi.mocked(api.wordList.library.list).mockImplementation(
    async (_space, query) => page(query?.parent_id ? [] : [folder, file])
  );
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

it("shows a selection hint instead of a duplicate file list until a wordlist is opened", async () => {
  renderWithProviders(<WordlistLibrary />);
  const content = screen.getByRole("region", { name: "内容区域" });
  expect(
    within(content).getByRole("heading", { name: "从左侧选择词表" })
  ).toBeInTheDocument();
  expect(within(content).queryByRole("list")).toBeNull();
  expect(within(content).queryByRole("searchbox")).toBeNull();
  expect(
    within(content).queryByRole("button", { name: "新建文件夹" })
  ).toBeNull();
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const fileButton = await within(tree).findByRole("button", {
    name: "我的备注"
  });
  expect(fileButton).toHaveAttribute("data-leaves-page");
  fireEvent.click(fileButton);
  expect(navigation.push).toHaveBeenCalledWith(
    "/account/wordlists?space=owned&wordlist=wordlist"
  );
});

it.each(["read", "edit", "new"])(
  "keeps the %s content open when navigating folders or root in the explorer",
  async (mode) => {
    navigation.params =
      mode === "new" ? "mode=new" : `wordlist=wordlist&mode=${mode}`;
    const available = {
      ...file,
      wordlist: {
        id: "wordlist",
        owner_user_id: "reader",
        owner_name: "读者",
        name: "阅读生词",
        state: "draft" as const,
        revision: 1,
        item_count: 1,
        created_at: "",
        updated_at: ""
      }
    };
    vi.mocked(api.wordList.library.list).mockImplementation(
      async (_space, query) => page(query?.parent_id ? [] : [folder, available])
    );
    renderWithProviders(<WordlistLibrary />);
    const content = screen.getByRole("region", { name: "内容区域" });
    const editor =
      mode === "read"
        ? await within(content).findByRole("article", { name: "词表内容" })
        : await within(content).findByRole("textbox", { name: "草稿名称" });
    if (mode !== "read")
      fireEvent.change(editor, { target: { value: "尚未保存的草稿" } });
    const tree = screen.getByRole("navigation", { name: "工程目录" });
    const folderButton = await within(tree).findByRole("button", {
      name: "英语"
    });
    const rootButton = within(tree).getByRole("button", { name: "创建" });
    expect(folderButton).not.toHaveAttribute("data-leaves-page");
    expect(rootButton).not.toHaveAttribute("data-leaves-page");
    fireEvent.click(folderButton);
    await within(tree).findByText("空文件夹");
    fireEvent.click(rootButton);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(editor).toBeInTheDocument();
    if (mode !== "read") expect(editor).toHaveValue("尚未保存的草稿");
    expect(within(content).queryByRole("list")).toBeNull();
  }
);

it("keeps recursive folder deletion in the explorer with its confirmation snapshot", async () => {
  renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  fireEvent.contextMenu(
    await within(tree).findByRole("button", { name: "英语" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "移入回收站" }));
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
        ids: ["folder"]
      })
    )
  );
});

it("keeps clearing trash on the left and disables it when the whole trash is empty", async () => {
  navigation.params = "trash=true";
  const view = renderWithProviders(<WordlistLibrary />);
  const sidebar = screen.getByRole("complementary", { name: "目录区域" });
  const empty = within(sidebar).getByRole("button", { name: "清空回收站" });
  await waitFor(() => expect(empty).toBeEnabled());
  expect(
    within(screen.getByRole("region", { name: "内容区域" })).queryByRole(
      "button",
      { name: "清空回收站" }
    )
  ).toBeNull();
  vi.mocked(api.wordList.library.list).mockResolvedValue(page([]));
  navigation.params = "space=favorites&trash=true";
  view.rerender(<WordlistLibrary />);
  await waitFor(() =>
    expect(
      within(sidebar).getByRole("button", { name: "清空回收站" })
    ).toBeDisabled()
  );
});

it("highlights the destination subtree and moves drops on files into their containing folder", async () => {
  const child = { ...folder, id: "child", parent_id: "folder", name: "雅思" };
  vi.mocked(api.wordList.library.list).mockImplementation(async (_, query) =>
    page(
      query?.parent_id === "child"
        ? [{ ...file, parent_id: "child" }]
        : query?.parent_id === "folder"
          ? [child]
          : [folder, { ...file, id: "source", name: "待移动" }]
    )
  );
  renderWithProviders(<WordlistLibrary />);
  const tree = screen.getByRole("navigation", { name: "工程目录" });
  const parentButton = await within(tree).findByRole("button", {
    name: "英语"
  });
  fireEvent.keyDown(parentButton, { key: "ArrowRight" });
  const childButton = await within(tree).findByRole("button", { name: "雅思" });
  fireEvent.keyDown(childButton, { key: "ArrowRight" });
  const nestedFile = await within(tree).findByRole("button", {
    name: "我的备注"
  });
  const parentScope = parentButton.closest("li")!;
  const childScope = childButton.closest("li")!;
  const dataTransfer = {
    types: ["application/x-tsz-library"],
    getData: () => JSON.stringify({ space: "owned", ids: ["source"] })
  };
  fireEvent.dragOver(parentButton, { dataTransfer });
  expect(parentScope).toHaveAttribute("data-drop-target");
  expect(parentScope).toContainElement(nestedFile);
  fireEvent(
    parentButton,
    new MouseEvent("dragleave", { bubbles: true, relatedTarget: nestedFile })
  );
  expect(parentScope).toHaveAttribute("data-drop-target");
  fireEvent.dragOver(nestedFile, { dataTransfer });
  expect(parentScope).not.toHaveAttribute("data-drop-target");
  expect(childScope).toHaveAttribute("data-drop-target");
  fireEvent.dragLeave(childScope, { relatedTarget: null });
  expect(childScope).not.toHaveAttribute("data-drop-target");
  fireEvent.dragOver(nestedFile, { dataTransfer });
  fireEvent.dragEnd(document);
  expect(childScope).not.toHaveAttribute("data-drop-target");
  fireEvent.dragOver(nestedFile, { dataTransfer });
  fireEvent.drop(nestedFile, { dataTransfer });
  expect(childScope).not.toHaveAttribute("data-drop-target");
  await waitFor(() =>
    expect(api.wordList.library.operate).toHaveBeenCalledExactlyOnceWith(
      "owned",
      expect.objectContaining({
        action: "move",
        ids: ["source"],
        target_id: "child"
      })
    )
  );
});

it.each(["disabled", "trash", "external"] as const)(
  "does not advertise a folder destination for %s drags",
  async (condition) => {
    const onMove = vi.fn();
    renderWithProviders(
      <LibraryTree
        userId="reader"
        space="owned"
        trash={condition === "trash"}
        disabled={condition === "disabled"}
        ancestorIds={[]}
        onFolder={vi.fn()}
        onWordlist={vi.fn()}
        onMove={onMove}
        onCreateFolder={vi.fn()}
        onCreateWordlist={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    const target = await screen.findByRole("button", { name: "英语" });
    const dataTransfer = {
      types: [
        condition === "external" ? "text/plain" : "application/x-tsz-library"
      ],
      getData: () =>
        condition === "external"
          ? ""
          : JSON.stringify({ space: "owned", ids: ["file"] })
    };
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(true);
    expect(target.closest("li")).not.toHaveAttribute("data-drop-target");
    fireEvent.drop(target, { dataTransfer });
    expect(onMove).not.toHaveBeenCalled();
  }
);

it.each(["owned", "favorites"] as const)(
  "moves a nested item to %s root through the blank tree area",
  async (space) => {
    navigation.params = `space=${space}&folder=folder`;
    vi.mocked(api.wordList.library.list).mockImplementation(async (_, query) =>
      page(query?.parent_id ? [{ ...file, parent_id: "folder" }] : [folder])
    );
    renderWithProviders(<WordlistLibrary />);
    const tree = screen.getByRole("navigation", { name: "工程目录" });
    fireEvent.keyDown(
      await within(tree).findByRole("button", { name: "英语" }),
      {
        key: "ArrowRight"
      }
    );
    const source = await within(tree).findByRole("button", {
      name: "我的备注"
    });
    const payload = new Map<string, string>();
    const dataTransfer = {
      types: ["application/x-tsz-library"],
      setData: (key: string, value: string) => payload.set(key, value),
      getData: (key: string) => payload.get(key) ?? ""
    };
    fireEvent.dragStart(source.parentElement!, { dataTransfer });
    const blank = within(tree).getByRole("region", {
      name: "根目录放置区域"
    });
    fireEvent.drop(blank, {
      dataTransfer: {
        getData: () =>
          JSON.stringify({
            space: space === "owned" ? "favorites" : "owned",
            ids: ["file"]
          })
      }
    });
    expect(api.wordList.library.operate).not.toHaveBeenCalled();
    expect(fireEvent.dragOver(blank, { dataTransfer })).toBe(false);
    expect(within(blank).getByText("松开以移到根目录")).toBeInTheDocument();
    fireEvent.dragLeave(blank, { relatedTarget: null });
    expect(within(blank).queryByText("松开以移到根目录")).toBeNull();
    fireEvent.dragOver(blank, { dataTransfer });
    fireEvent.drop(blank, { dataTransfer });
    await waitFor(() =>
      expect(api.wordList.library.operate).toHaveBeenCalledExactlyOnceWith(
        space,
        {
          expected_version: "v1",
          action: "move",
          ids: ["file"],
          target_id: null
        }
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("已移动");
    expect(within(blank).queryByText("松开以移到根目录")).toBeNull();
  }
);

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

it("手机进入回收站后收起目录，返回时保留词表分类", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  );
  navigation.params = "space=favorites";
  const view = renderWithProviders(<WordlistLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "目录" }));
  const drawer = screen.getByRole("dialog", { name: "目录抽屉" });
  fireEvent.click(within(drawer).getByRole("button", { name: "回收站" }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    "/account/wordlists?space=favorites&trash=true"
  );
  expect(
    screen.queryByRole("dialog", { name: "目录抽屉" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "目录" })).toHaveFocus();
  navigation.params = "space=favorites&trash=true";
  view.rerender(<WordlistLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "目录" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "目录抽屉" })).getByRole(
      "button",
      { name: "返回词表" }
    )
  );
  expect(navigation.push).toHaveBeenLastCalledWith(
    "/account/wordlists?space=favorites"
  );
  expect(
    screen.queryByRole("dialog", { name: "目录抽屉" })
  ).not.toBeInTheDocument();
});

it("separates systems and restores unavailable favorites at their original location", async () => {
  navigation.params = "space=favorites&trash=true";
  vi.mocked(api.wordList.library.list).mockResolvedValue(
    page([{ ...file, trashed_at: "2026-10-16T00:00:00Z" }])
  );
  renderWithProviders(<WordlistLibrary />);
  await within(screen.getByRole("navigation", { name: "工程目录" })).findByRole(
    "button",
    { name: "我的备注" }
  );
  expect(api.wordList.library.list).toHaveBeenCalledWith(
    "favorites",
    expect.objectContaining({ trash: true }),
    expect.anything()
  );
  fireEvent.contextMenu(
    await within(
      screen.getByRole("navigation", { name: "工程目录" })
    ).findByRole("button", { name: "我的备注" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "恢复…" }));
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
  fireEvent.contextMenu(
    await within(
      screen.getByRole("navigation", { name: "工程目录" })
    ).findByRole("button", { name: "我的备注" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "移入回收站" }));
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
  fireEvent.contextMenu(
    await within(
      screen.getByRole("navigation", { name: "工程目录" })
    ).findByRole("button", { name: "我的备注" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "移入回收站" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await waitFor(() => expect(api.wordList.library.operate).toHaveBeenCalled());
  act(() => useUserStore.setState({ user: null }));
  await act(async () =>
    finish({ version: "v1", folder_count: 1, wordlist_count: 0 })
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it("renames a row from its menu and preserves its version and identity", async () => {
  renderWithProviders(<WordlistLibrary />);
  fireEvent.contextMenu(
    await within(
      screen.getByRole("navigation", { name: "工程目录" })
    ).findByRole("button", { name: "我的备注" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "重命名…" }));
  const dialog = await screen.findByRole("dialog", { name: "修改名称" });
  expect(within(dialog).getByLabelText("名称")).toHaveValue("我的备注");
  await waitFor(() =>
    expect(within(dialog).getByLabelText("名称")).toHaveFocus()
  );
  fireEvent.change(within(dialog).getByLabelText("名称"), {
    target: { value: "阅读积累" }
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.library.rename).toHaveBeenCalledWith("owned", "file", {
      expected_version: "v1",
      name: "阅读积累"
    })
  );
  expect(await screen.findByRole("status")).toHaveTextContent("已保存名称");
});

it("keeps a failed save in one dialog and locks its draft during the request", async () => {
  let rejectSave!: (error: Error) => void;
  vi.mocked(api.wordList.library.rename).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      })
  );
  renderWithProviders(<WordlistLibrary />);
  fireEvent.contextMenu(
    await within(
      screen.getByRole("navigation", { name: "工程目录" })
    ).findByRole("button", { name: "我的备注" })
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "重命名…" }));
  const dialog = await screen.findByRole("dialog", { name: "修改名称" });
  const input = within(dialog).getByLabelText("名称");
  fireEvent.change(input, { target: { value: "阅读积累" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(api.wordList.library.rename).toHaveBeenCalled());
  expect(input).toBeDisabled();
  await act(async () => rejectSave(new Error("名称已存在")));
  expect(input).toHaveValue("阅读积累");
  expect(input).toBeEnabled();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "操作未完成：名称已存在。"
  );
  expect(input).toHaveFocus();
});
