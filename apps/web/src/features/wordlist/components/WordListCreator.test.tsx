import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordListCreator } from "./WordListCreator";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      suggestions: vi.fn(),
      matchImport: vi.fn(),
      create: vi.fn(),
      edit: vi.fn(),
      myItems: vi.fn(),
      update: vi.fn()
    }
  }
}));
vi.mock("../excel-client", () => ({
  readExcelFile: vi.fn(),
  downloadExcelTemplate: vi.fn()
}));
import { readExcelFile } from "../excel-client";
import { api } from "@/lib/request";
import { HttpError } from "@tsz/api-client";
const candidate = {
  entry_id: "entry-one",
  publication_id: "pub-one",
  label: "apple",
  glosses: ["苹果"]
};
it("选定候选后焦点保留在词条输入框", async () => {
  renderWithProviders(<WordListCreator />);
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "app" } });
  const option = await screen.findByRole("button", { name: /apple\s*苹果/ });
  option.focus();
  fireEvent.click(option);
  expect(input).toHaveValue("apple");
  expect(input).toHaveFocus();
});

it("删除词条后聚焦相邻词条", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    renderWithProviders(<WordListCreator />);
    fireEvent.click(screen.getByRole("button", { name: "添加词条" }));
    const remove = screen.getAllByRole("button", { name: "删除" })[0]!;
    remove.focus();
    fireEvent.click(remove);
    expect(screen.getAllByPlaceholderText("输入单词或短语")).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("输入单词或短语")).toHaveFocus()
    );
  } finally {
    confirm.mockRestore();
  }
});

it("候选支持方向键与 Esc，单一候选可用回车选定", async () => {
  renderWithProviders(<WordListCreator />);
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "app" } });
  const option = await screen.findByRole("button", { name: /apple\s*苹果/ });
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(option).toHaveFocus();
  fireEvent.keyDown(option, { key: "Escape" });
  expect(input).toHaveFocus();
  expect(
    screen.queryByRole("button", { name: /apple\s*苹果/ })
  ).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "appl" } });
  await screen.findByRole("button", { name: /apple\s*苹果/ });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveValue("apple");
  expect(input).toHaveFocus();
});

it("注释按需展开，筛选后输入仍保留并正常保存", async () => {
  vi.mocked(api.wordList.create).mockResolvedValue({ id: "created" } as never);
  renderWithProviders(<WordListCreator />);
  expect(screen.queryByLabelText("注 1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "添加注释" }));
  await waitFor(() => expect(screen.getByLabelText("注 1")).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "收起注释 1" }));
  expect(screen.queryByLabelText("注 1")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "添加注释" })).toHaveFocus()
  );
  fireEvent.click(screen.getByRole("button", { name: "添加注释" }));
  fireEvent.change(screen.getByLabelText("注 1"), {
    target: { value: "保留的注释" }
  });
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "词表" }
  });
  fireEvent.change(screen.getByPlaceholderText("输入单词或短语"), {
    target: { value: "app" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.change(screen.getByLabelText("表内搜索"), {
    target: { value: "不存在" }
  });
  fireEvent.click(screen.getByRole("button", { name: "清空搜索" }));
  expect(screen.getByLabelText("注 1")).toHaveValue("保留的注释");
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ author_note: "保留的注释" })]
      })
    )
  );
});

function mockRowRects() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const row = this.closest('[id^="row-"]');
      const index = row
        ? Array.from(document.querySelectorAll('[id^="row-"]')).indexOf(row)
        : 0;
      return DOMRect.fromRect({
        x: 0,
        y: 100 + index * 200,
        width: 600,
        height: 180
      });
    });
}

it("键盘拖动可取消，确认排序后注释仍跟随词条", async () => {
  const measure = mockRowRects();
  try {
    renderWithProviders(<WordListCreator />);
    fireEvent.click(screen.getByRole("button", { name: "添加词条" }));
    const inputs = screen.getAllByPlaceholderText("输入单词或短语");
    fireEvent.change(inputs[0]!, { target: { value: "first" } });
    fireEvent.change(inputs[1]!, { target: { value: "second" } });
    fireEvent.click(screen.getAllByRole("button", { name: "添加注释" })[0]!);
    fireEvent.change(screen.getByLabelText("注 1"), {
      target: { value: "第一条的注" }
    });
    const handle = screen.getByRole("button", { name: "拖动排序词条 1" });
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(handle, { key: "Escape", code: "Escape" });
    await screen.findByText("已取消排序。");
    expect(screen.getByLabelText("词条 1")).toHaveValue("first");
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown" });
    await screen.findByText("目标位置：第 2 位。");
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitFor(() =>
      expect(screen.getByLabelText("词条 1")).toHaveValue("second")
    );
    expect(screen.getByLabelText("词条 2")).toHaveValue("first");
    expect(screen.getByLabelText("注 2")).toHaveValue("第一条的注");
  } finally {
    measure.mockRestore();
  }
});

it("触控轻扫不拦截滚动，长按把手后可以拖动排序", async () => {
  const measure = mockRowRects();
  try {
    renderWithProviders(<WordListCreator />);
    fireEvent.click(screen.getByRole("button", { name: "添加词条" }));
    fireEvent.change(screen.getByLabelText("词条 1"), {
      target: { value: "first" }
    });
    fireEvent.change(screen.getByLabelText("词条 2"), {
      target: { value: "second" }
    });
    const handle = screen.getByRole("button", { name: "拖动排序词条 1" });
    const point = (y: number) => [
      { identifier: 1, clientX: 20, clientY: y, target: handle }
    ];
    fireEvent.touchStart(handle, { touches: point(130) });
    expect(fireEvent.touchMove(handle, { touches: point(160) })).toBe(true);
    fireEvent.touchEnd(handle, { touches: [], changedTouches: point(160) });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(handle).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("词条 1")).toHaveValue("first");
    fireEvent.touchStart(handle, { touches: point(130) });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.touchMove(handle, { touches: point(330) });
    await screen.findByText("目标位置：第 2 位。");
    fireEvent.touchEnd(handle, { touches: [], changedTouches: point(330) });
    await waitFor(() =>
      expect(screen.getByLabelText("词条 1")).toHaveValue("second")
    );
    expect(screen.getByLabelText("词条 2")).toHaveValue("first");
  } finally {
    measure.mockRestore();
  }
});

it("请求超时保留草稿并锁定输入，重试沿用相同的创建请求", async () => {
  vi.mocked(api.wordList.create).mockRejectedValue(
    new HttpError(408, "timeout")
  );
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "超时词表" }
  });
  fireEvent.change(screen.getByPlaceholderText("输入单词或短语"), {
    target: { value: "apple" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  const retry = await screen.findByRole("button", { name: "重试保存" });
  expect(screen.getByLabelText("词表名称")).toBeDisabled();
  expect(screen.getByRole("alert")).not.toHaveTextContent("请求键");
  fireEvent.click(retry);
  await waitFor(() => expect(api.wordList.create).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.wordList.create).mock.calls[1]![0]).toEqual(
    vi.mocked(api.wordList.create).mock.calls[0]![0]
  );
});

it("保存期间锁定返回与页内导航，失败后恢复离开保护", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.wordList.create).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  const cancel = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    renderWithProviders(
      <>
        <WordListCreator onCancel={cancel} />
        <a href="/account">离开</a>
      </>
    );
    fireEvent.change(screen.getByLabelText("词表名称"), {
      target: { value: "词表" }
    });
    fireEvent.change(screen.getByPlaceholderText("输入单词或短语"), {
      target: { value: "apple" }
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /apple\s*苹果/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("button", { name: "返回" })).toBeDisabled();
    expect(fireEvent.click(screen.getByRole("link", { name: "离开" }))).toBe(
      false
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => reject(new HttpError(413, "too large")));
    expect(screen.getByRole("button", { name: "返回" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
  }
});

it("名称校验定位输入框，修正后清除错误", async () => {
  renderWithProviders(<WordListCreator />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByLabelText("词表名称")).toHaveFocus();
  expect(screen.getByLabelText("词表名称")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "有效名称" }
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("嵌入编辑器的取消操作保留未保存保护", () => {
  const cancel = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    renderWithProviders(<WordListCreator embedded onCancel={cancel} />);
    expect(
      screen.queryByRole("button", { name: "返回" })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("词表名称"), {
      target: { value: "未保存的词表" }
    });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("词表名称")).toHaveValue("未保存的词表");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
  }
});

it("词条组合输入期间不搜索未确认文本", async () => {
  renderWithProviders(<WordListCreator />);
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "ping" } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(api.wordList.suggestions).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "苹果" } });
  fireEvent.compositionEnd(input);
  await waitFor(() =>
    expect(api.wordList.suggestions).toHaveBeenCalledWith(
      { q: "苹果" },
      expect.anything()
    )
  );
});
it("保存体积超限明确提示拆分，保留内容并允许继续修改", async () => {
  vi.mocked(api.wordList.create).mockRejectedValue(
    new HttpError(413, "request body too large")
  );
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "大词表" }
  });
  fireEvent.change(screen.getByPlaceholderText("输入单词或短语"), {
    target: { value: "apple" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("词表内容过大");
  expect(screen.getByLabelText("词表名称")).toHaveValue("大词表");
  expect(screen.getByLabelText("词表名称")).toBeEnabled();
});
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
it("Excel 追加替换初始空行，保存真实词条引用和作者注释；取消不改变原输入", async () => {
  vi.mocked(readExcelFile).mockResolvedValue([
    {
      rowNumber: 2,
      word: "apple",
      gloss: "文件释义",
      note: "公开给读者的注",
      invalidFields: {}
    }
  ]);
  vi.mocked(api.wordList.matchImport).mockResolvedValue({
    items: [{ status: "matched", candidates: [candidate] }]
  });
  vi.mocked(api.wordList.create).mockResolvedValue({ id: "created" } as never);
  const saved = vi.fn();
  renderWithProviders(<WordListCreator onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "Excel 词表" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Excel 导入" }));
  fireEvent.click(screen.getByRole("button", { name: "取消导入" }));
  expect(screen.getByLabelText("词表名称")).toHaveValue("Excel 词表");
  expect(screen.getByPlaceholderText("输入单词或短语")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Excel 导入" }));
  fireEvent.change(screen.getByLabelText("选择 Excel 文件"), {
    target: { files: [new File(["data"], "导入.xlsx")] }
  });
  fireEvent.click(await screen.findByRole("button", { name: "匹配词汇" }));
  await screen.findByText(/已选定：apple/);
  fireEvent.click(screen.getByRole("button", { name: "确认追加到词表" }));
  expect(screen.getAllByPlaceholderText("输入单词或短语")).toHaveLength(1);
  expect(screen.getByLabelText("注 1")).toHaveValue("公开给读者的注");
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith("created"));
  expect(api.wordList.create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Excel 词表",
      items: [
        {
          entry_id: candidate.entry_id,
          private_note: "",
          author_note: "公开给读者的注"
        }
      ]
    })
  );
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
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
  fireEvent.click(screen.getByRole("button", { name: "添加注释" }));
  fireEvent.change(screen.getByLabelText("注 1"), {
    target: { value: "我的想法" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
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
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
    expect(screen.getByRole("button", { name: "添加词条" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "添加词条" }));
  fireEvent.change(screen.getAllByPlaceholderText("输入单词或短语")[1]!, {
    target: { value: "apple" }
  });
  fireEvent.click(await screen.findByRole("button", { name: /apple\s*苹果/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByLabelText("私密备注 1")).toHaveValue("恢复后的备注")
  );
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
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
  fireEvent.click(screen.getByRole("button", { name: "保存备注" }));
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

it("shows and searches an unavailable entry's label without treating it as readable", async () => {
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
        entry_label: "worker",
        unavailable_reason: "archived",
        private_note: "原备注",
        note_revision: 7
      }
    ],
    revision: 1,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 }
  });
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByPlaceholderText("输入单词或短语")).toHaveValue("worker")
  );
  fireEvent.change(screen.getByLabelText("表内搜索"), {
    target: { value: " WORKER " }
  });
  expect(screen.getByPlaceholderText("输入单词或短语")).toHaveValue("worker");
  expect(screen.getByLabelText("私密备注 1")).toHaveValue("原备注");
  expect(
    screen.getByText("内容不可用（已移入垃圾桶），请删除或替换此项。")
  ).toBeVisible();
  expect(api.wordList.suggestions).not.toHaveBeenCalled();
});

it("无匹配时创建自定义词，校验释义并保存稳定标识及注", async () => {
  vi.mocked(api.wordList.suggestions).mockResolvedValue({ items: [] });
  vi.mocked(api.wordList.create).mockResolvedValue({
    id: "created",
    owner_user_id: "one",
    owner_name: "one",
    name: "自定义",
    state: "draft",
    revision: 1,
    item_count: 1,
    created_at: "",
    updated_at: ""
  });
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "自定义" }
  });
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "my own phrase" } });
  fireEvent.blur(input);
  fireEvent.click(
    await screen.findByRole("button", { name: "创建自定义词汇" })
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "释义须为 1–200 字"
  );
  await waitFor(() =>
    expect(screen.getByLabelText("自定义释义 1")).toHaveFocus()
  );
  expect(api.wordList.create).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("自定义释义 1"), {
    target: { value: "我的自定义释义" }
  });
  fireEvent.click(screen.getByRole("button", { name: "添加注释" }));
  fireEvent.change(screen.getByLabelText("注 1"), {
    target: { value: "给读者的注" }
  });
  fireEvent.change(input, { target: { value: "renamed phrase" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.create).toHaveBeenCalledWith({
      idempotency_key: expect.any(String),
      name: "自定义",
      items: [
        {
          item_id: expect.any(String),
          custom_word: { word: "renamed phrase", definition: "我的自定义释义" },
          private_note: "",
          author_note: "给读者的注"
        }
      ]
    })
  );
});

it("搜索失败不把输入当作自定义词，也不能保存未选定行", async () => {
  vi.mocked(api.wordList.suggestions).mockRejectedValue(new Error("offline"));
  renderWithProviders(<WordListCreator />);
  fireEvent.change(screen.getByLabelText("词表名称"), {
    target: { value: "失败保护" }
  });
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "unknown phrase" } });
  fireEvent.blur(input);
  expect(await screen.findByRole("alert")).toHaveTextContent("搜索失败");
  expect(
    screen.queryByRole("button", { name: "创建自定义词汇" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(api.wordList.create).not.toHaveBeenCalled();
});

it("重新打开混合词表后改词及重排，私密备注仍按自定义项标识更新", async () => {
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "混合",
    state: "draft" as const,
    revision: 4,
    item_count: 2,
    created_at: "",
    updated_at: ""
  };
  const custom = {
    item_id: "custom-id",
    custom_word: { word: "original", definition: "原释义" },
    author_note: "自定义注"
  };
  vi.mocked(api.wordList.edit).mockResolvedValue({
    wordlist: meta,
    entry_ids: [candidate.entry_id],
    items: [
      {
        item_id: candidate.entry_id,
        entry_id: candidate.entry_id,
        author_note: ""
      },
      custom
    ]
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    revision: 4,
    pagination: { page: 1, page_size: 100, total: 2, total_pages: 1 },
    items: [
      {
        item_id: candidate.entry_id,
        entry_id: candidate.entry_id,
        position: 0,
        entry: { ...candidate, kind: "word", pos: [] },
        private_note: "平台私密",
        note_revision: 1
      },
      {
        ...custom,
        entry_id: null,
        position: 1,
        entry: null,
        private_note: "原私密",
        note_revision: 7
      }
    ]
  });
  vi.mocked(api.wordList.update).mockResolvedValue({ ...meta, revision: 5 });
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  );
  fireEvent.change(screen.getAllByPlaceholderText("输入单词或短语")[1]!, {
    target: { value: "renamed" }
  });
  fireEvent.change(screen.getByLabelText("私密备注 2"), {
    target: { value: "新私密" }
  });
  fireEvent.click(screen.getAllByRole("button", { name: "上移" })[1]!);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.update).toHaveBeenCalledWith("list", {
      expected_revision: 4,
      content: {
        name: "混合",
        items: [
          { ...custom, custom_word: { word: "renamed", definition: "原释义" } },
          {
            item_id: candidate.entry_id,
            entry_id: candidate.entry_id,
            author_note: ""
          }
        ]
      },
      note_updates: [
        {
          item_id: "custom-id",
          private_note: "新私密",
          expected_note_revision: 7
        }
      ]
    })
  );
  expect(api.wordList.suggestions).not.toHaveBeenCalled();
});

it("将已有高版本私密备注的平台行改为自定义词时使用新项的备注版本", async () => {
  const meta = {
    id: "list",
    owner_user_id: "one",
    owner_name: "作者",
    name: "改为自定义",
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
    revision: 1,
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 },
    items: [
      {
        entry_id: candidate.entry_id,
        entry: { ...candidate, kind: "word", pos: [] },
        position: 0,
        author_note: "原注",
        private_note: "原私密",
        note_revision: 7
      }
    ]
  });
  vi.mocked(api.wordList.suggestions).mockResolvedValue({ items: [] });
  vi.mocked(api.wordList.update).mockResolvedValue({ ...meta, revision: 2 });
  renderWithProviders(<WordListCreator id="list" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  );
  const input = screen.getByPlaceholderText("输入单词或短语");
  fireEvent.change(input, { target: { value: "my replacement phrase" } });
  fireEvent.blur(input);
  fireEvent.click(
    await screen.findByRole("button", { name: "创建自定义词汇" })
  );
  fireEvent.change(screen.getByLabelText("自定义释义 1"), {
    target: { value: "新的自定义释义" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(api.wordList.update).toHaveBeenCalledWith(
      "list",
      expect.objectContaining({
        content: {
          name: "改为自定义",
          items: [
            {
              item_id: expect.any(String),
              custom_word: {
                word: "my replacement phrase",
                definition: "新的自定义释义"
              },
              author_note: "原注"
            }
          ]
        },
        note_updates: [
          {
            item_id: expect.any(String),
            private_note: "原私密",
            expected_note_revision: 1
          }
        ]
      })
    )
  );
});
