import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordListCreator } from "./WordListCreator";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      catalog: vi.fn(),
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
  vi.mocked(api.wordList.catalog).mockResolvedValue({
    items: [candidate],
    pagination: { page: 1, page_size: 3, total: 1, total_pages: 1 }
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
  fireEvent.change(screen.getByLabelText("私密备注 1"), {
    target: { value: "我的想法" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await screen.findByRole("button", { name: "重试保存" });
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  const first = vi.mocked(api.wordList.create).mock.calls[0]![0];
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.wordList.create).mock.calls[1]![0]).toEqual(first);
  expect(first.items[0]?.private_note).toBe("我的想法");
});

it("late item responses populate notes without advancing the frozen edit revision", async () => {
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
  await waitFor(() =>
    expect(screen.getByLabelText("私密备注 1")).toHaveValue("已有备注")
  );
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "本页更改" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存私密词表" }));
  await waitFor(() =>
    expect(api.wordList.update).toHaveBeenCalledWith(
      "list",
      expect.objectContaining({ expected_revision: 1, note_updates: [] })
    )
  );
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
  vi.mocked(api.wordList.catalog).mockImplementation(async (query) => ({
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
        : [candidate],
    pagination: { page: 1, page_size: 3, total: 1, total_pages: 1 }
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
