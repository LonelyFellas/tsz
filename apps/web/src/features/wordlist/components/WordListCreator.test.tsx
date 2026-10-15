import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordListCreator } from "./WordListCreator";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      suggestions: vi.fn(),
      create: vi.fn(),
      edit: vi.fn(),
      myItems: vi.fn(),
      update: vi.fn()
    }
  }
}));
import { api } from "@/lib/request";
const candidate = {
  entry_id: "entry-one",
  publication_id: "pub-one",
  label: "apple",
  glosses: ["苹果"]
};
beforeEach(() => {
  vi.clearAllMocks();
  useUserStore.setState({
    user: {
      id: "one",
      display_name: "one",
      avatar_url: "",
      roles: ["student"],
      active_role: "student"
    }
  });
  vi.mocked(api.wordList.suggestions).mockResolvedValue({
    items: [candidate]
  });
});
it("changing a selected spelling clears the entry ID and blocks save", async () => {
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "真实词表" }
  });
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "app" } });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.change(input, { target: { value: "other" } });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "每行都需选定平台词条"
  );
  expect(api.wordList.create).not.toHaveBeenCalled();
});
it("unknown create result freezes changes and retries exactly the same request", async () => {
  vi.mocked(api.wordList.create).mockRejectedValue(new Error("lost response"));
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "真实词表" }
  });
  fireEvent.change(screen.getByPlaceholderText("输入单词或短语"), {
    target: { value: "app" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.change(screen.getByLabelText("注 1"), {
    target: { value: "我的想法" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await screen.findByRole("button", { name: "重试保存" });
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  const first = vi.mocked(api.wordList.create).mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.wordList.create).mock.calls[1]![0]).toEqual(first);
  expect(first.items[0]?.author_note).toBe("我的想法");
});

it("mixed item revisions cannot advance or save the frozen editing snapshot", async () => {
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { render } = await import("@testing-library/react");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "旧名称",
    state: "draft" as const,
    revision: 1,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  const snapshot = { wordlist: meta, entry_ids: [candidate.entry_id] };
  client.setQueryData(["wordlists", "user", "one", "edit", "list"], snapshot);
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: { ...meta, name: "其他页面的新名称", revision: 2 },
    entry_ids: [candidate.entry_id]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        entry_id: candidate.entry_id,
        position: 0,
        entry: { ...candidate, kind: "word", pos: [] },
        private_note: "已有备注",
        note_revision: 7
      }
    ],
    revision: 2,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordList.update).mockResolvedValue({ ...meta, revision: 2 });
  render(
    <QueryClientProvider client={client}>
      <WordListCreator id="list" />
    </QueryClientProvider>
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("词表版本已变化");
  expect(screen.getByLabelText("词表名称")).toHaveValue("旧名称");
  expect(screen.getByRole("button", { name: "保存私密词表" })).toBeDisabled();
  expect(api.wordList.update).not.toHaveBeenCalled();
});

it("selecting another entry and returning preserves the original note version", async () => {
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "词表",
    state: "draft" as const,
    revision: 1,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [candidate.entry_id]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        entry_id: candidate.entry_id,
        position: 0,
        entry: { ...candidate, kind: "word", pos: [] },
        private_note: "原备注",
        note_revision: 7
      }
    ],
    revision: 1,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordList.suggestions).mockImplementation(async (query) => ({
    items:
      query?.q === "banana"
        ? [
            {
              entry_id: "entry-two",
              publication_id: "pub-two",
              label: "banana",
              glosses: ["香蕉"]
            }
          ]
        : [candidate]
  }));
  vi.mocked(api.wordList.update).mockResolvedValue(meta);
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByLabelText("私密备注 1")).toHaveValue("原备注")
  );
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "banana" } });
  fireEvent.click(await screen.findByRole("button", { name: /banana\s*香蕉/ }));
  fireEvent.change(input, { target: { value: "apple" } });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.change(screen.getByLabelText("私密备注 1"), {
    target: { value: "更新备注" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
  expect(vi.mocked(api.wordList.update).mock.calls[0]![1].note_updates).toEqual(
    [
      {
        entry_id: candidate.entry_id,
        expected_note_revision: 7,
        private_note: "更新备注"
      }
    ]
  );
});

it("newly readded entries ignore obsolete pages from the prior editing session", async () => {
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { render } = await import("@testing-library/react");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const other = {
    entry_id: "remaining",
    publication_id: "pub-remaining",
    label: "banana",
    kind: "word" as const,
    pos: []
  };
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "词表",
    state: "draft" as const,
    revision: 3,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  client.setQueryData(["wordlists", "user", "one", "edit-items", "list", 2], {
    items: [
      {
        entry_id: candidate.entry_id,
        position: 100,
        entry: { ...candidate, kind: "word", pos: [] },
        private_note: "旧备注",
        note_revision: 7
      }
    ],
    revision: 1,
    pagination: { page: 2, page_size: 100, total: 101, total_pages: 2 }
  });
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [other.entry_id]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        entry_id: other.entry_id,
        position: 0,
        entry: other,
        private_note: "",
        note_revision: 5
      }
    ],
    revision: 3,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordList.update).mockResolvedValue(meta);
  render(
    <QueryClientProvider client={client}>
      <WordListCreator id="list" />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "增加一行" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "增加一行" }));
  fireEvent.change(screen.getAllByPlaceholderText("输入单词或短语")[1]!, {
    target: { value: "apple" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
  expect(vi.mocked(api.wordList.update).mock.calls[0]![1].note_updates).toEqual(
    [
      {
        entry_id: candidate.entry_id,
        expected_note_revision: 1,
        private_note: ""
      }
    ]
  );
});

it("automatically loads every page, searches notes across pages and preserves hidden rows on save", async () => {
  const items = Array.from({ length: 101 }, (_, index) => ({
    entry_id: `entry-${index}`,
    position: index,
    entry: {
      entry_id: `entry-${index}`,
      publication_id: `pub-${index}`,
      label: `word${index}`,
      kind: "word" as const,
      pos: []
    },
    author_note: index === 100 ? "最后一页给读者的注" : "",
    private_note: index === 100 ? "最后一页的备注" : "",
    note_revision: 3
  }));
  const wordlist = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "完整词表",
    state: "draft" as const,
    revision: 9,
    item_count: 101,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist,
    entry_ids: items.map((item) => item.entry_id)
  });
  vi.mocked(api.wordList.myItems).mockImplementation(async (_, query) => ({
    items: items.slice(
      ((query?.page ?? 1) - 1) * 100,
      (query?.page ?? 1) * 100
    ),
    revision: 9,
    pagination: {
      page: query?.page ?? 1,
      page_size: 100,
      total: 101,
      total_pages: 2
    }
  }));
  vi.mocked(api.wordList.update).mockResolvedValue({
    ...wordlist,
    revision: 10
  });
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() => expect(screen.getByLabelText("表内搜索")).toBeEnabled());
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText("表内搜索"), {
    target: { value: "最后一页" }
  });
  expect(screen.getByPlaceholderText("输入单词或短语")).toHaveValue("word100");
  fireEvent.change(screen.getByLabelText("注 101"), {
    target: { value: "最后一页给读者的新注" }
  });
  fireEvent.change(screen.getByLabelText("私密备注 101"), {
    target: { value: "最后一页的新备注" }
  });
  fireEvent.change(screen.getByLabelText("表内搜索"), {
    target: { value: "" }
  });
  fireEvent.click(screen.getAllByRole("button", { name: "下移" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await waitFor(() => expect(api.wordList.update).toHaveBeenCalled());
  const saved = vi.mocked(api.wordList.update).mock.calls[0]![1];
  expect(saved.content?.entry_ids).toEqual([
    items[1]!.entry_id,
    items[0]!.entry_id,
    ...items.slice(2).map((item) => item.entry_id)
  ]);
  expect(saved.content?.author_notes).toHaveLength(101);
  expect(saved.content?.author_notes?.at(-1)).toEqual({
    entry_id: "entry-100",
    author_note: "最后一页给读者的新注"
  });
  expect(saved.expected_revision).toBe(9);
  expect(saved.note_updates).toEqual([
    {
      entry_id: "entry-100",
      private_note: "最后一页的新备注",
      expected_note_revision: 3
    }
  ]);
});

it("failed loading is retryable and never allows a partial save", async () => {
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: {
      id: "list",
      owner_user_id: "one",
      owner_name: "作者",
      name: "词表",
      state: "draft",
      revision: 1,
      item_count: 1,
      created_at: "",
      updated_at: ""
    },
    entry_ids: [candidate.entry_id]
  });
  vi.mocked(api.wordList.myItems)
    .mockRejectedValueOnce(new Error("读取失败"))
    .mockResolvedValueOnce({
      items: [
        {
          entry_id: candidate.entry_id,
          position: 0,
          entry: { ...candidate, kind: "word", pos: [] },
          private_note: "恢复后的备注",
          note_revision: 4
        }
      ],
      revision: 1,
      pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
    });
  renderWithProviders(<WordListCreator id="list" />);
  fireEvent.click(await screen.findByRole("button", { name: "重试读取" }));
  expect(screen.getByRole("button", { name: "保存私密词表" })).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByLabelText("私密备注 1")).toHaveValue("恢复后的备注")
  );
  expect(screen.getByRole("button", { name: "保存私密词表" })).toBeEnabled();
});

it("unsaved changes block links before router updates even with native navigation support", () => {
  vi.stubGlobal("navigation", new EventTarget());
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderWithProviders(
    <>
      <WordListCreator />
      <a href="/account">离开编辑页</a>
    </>
  );
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "未保存" }
  });
  expect(fireEvent.click(screen.getByText("离开编辑页"))).toBe(false);
  expect(confirm).toHaveBeenCalledWith("尚未保存，确定离开？");
  confirm.mockRestore();
  vi.unstubAllGlobals();
});

it("cancels account actions before they switch identity or clear the session", () => {
  const action = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderWithProviders(
    <>
      <WordListCreator />
      <button data-leaves-page="" onClick={action}>
        切换身份
      </button>
    </>
  );
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "保留草稿" }
  });
  fireEvent.click(screen.getByText("切换身份"));
  expect(action).not.toHaveBeenCalled();
  expect(screen.getByLabelText("词表名称")).toHaveValue("保留草稿");
  confirm.mockRestore();
});

it("published author annotations require withdrawal while existing private notes stay independently editable", async () => {
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "已公开词表",
    state: "published" as const,
    revision: 8,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [candidate.entry_id]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        entry_id: candidate.entry_id,
        position: 0,
        entry: { ...candidate, kind: "word", pos: [] },
        author_note: "给读者的注",
        private_note: "历史私密备注",
        note_revision: 3
      }
    ],
    revision: 8,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordList.update).mockResolvedValue(meta);
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByLabelText("注 1")).toHaveValue("给读者的注")
  );
  expect(screen.getByLabelText("注 1")).toBeDisabled();
  expect(screen.getByLabelText("私密备注 1")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("私密备注 1"), {
    target: { value: "个人的新想法" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await waitFor(() =>
    expect(api.wordList.update).toHaveBeenCalledWith("list", {
      expected_revision: 8,
      content: null,
      note_updates: [
        {
          entry_id: candidate.entry_id,
          expected_note_revision: 3,
          private_note: "个人的新想法"
        }
      ]
    })
  );
});

it("shows an unavailable entry's label when editing without treating it as readable", async () => {
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "词表",
    state: "draft" as const,
    revision: 1,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [candidate.entry_id]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    items: [
      {
        entry_id: candidate.entry_id,
        position: 0,
        entry: null,
        entry_label: "apple",
        private_note: "原备注",
        note_revision: 7
      }
    ],
    revision: 1,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByPlaceholderText("输入单词或短语")).toHaveValue("apple")
  );
  expect(screen.getByLabelText("私密备注 1")).toHaveValue("原备注");
  expect(api.wordList.suggestions).not.toHaveBeenCalled();
});
