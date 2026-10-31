import { HttpError } from "@tsz/api-client";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { MeResponse, WordlistEntry, Wordlist } from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { WordListDetail } from "./WordListDetail";
const identity = vi.hoisted(() => ({
  identity: "student",
  ready: true,
  error: null
}));
vi.mock("@/features/teacher-certification/TeacherIdentityProvider", () => ({
  useTeacherIdentity: () => identity
}));
vi.mock("./WordlistInteractions", () => ({ DetailInteractions: () => null }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      get: vi.fn(),
      myDetail: vi.fn(),
      availability: vi.fn(),
      myAvailability: vi.fn(),
      items: vi.fn(),
      myItems: vi.fn(),
      reviews: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      customAudio: vi.fn().mockResolvedValue({ items: [] }),
      myCustomAudio: vi.fn().mockResolvedValue({ items: [] }),
      customAudioUrl: vi.fn(),
      myCustomAudioUrl: vi.fn()
    },
    auth: { me: vi.fn() }
  }
}));
import { api } from "@/lib/request";
const list: Wordlist = {
  id: "list",
  name: "阅读测试",
  owner_name: "作者",
  owner_user_id: "owner",
  state: "published",
  revision: 1,
  item_count: 51,
  created_at: "",
  updated_at: ""
};
const rich = (text: string) => ({
  version: 1 as const,
  text,
  spans: [],
  liaisons: []
});
const entry: WordlistEntry = {
  entry_id: "entry",
  publication_id: "publication",
  kind: "word",
  label: "apple",
  pos: [
    {
      pos_id: "pos",
      pos: "noun",
      forms: [],
      grammar_structures: [],
      senses: [
        {
          id: "sense",
          sub_pos: "countable",
          level: "C2",
          definitions: ["A1", "C2"].map((level) => ({
            id: level,
            level,
            definition_mode: "en_definition",
            grammar_structure_id: null,
            texts: [
              { dialect: "uk", content: rich(`${level}-UK`) },
              { dialect: "us", content: rich(`${level}-US`) }
            ]
          }))
        }
      ]
    }
  ]
};
const profile = (settings: MeResponse["learning_settings"]) =>
  ({ learning_settings: settings }) as MeResponse;
const settings = {
  cefr_level: "A1",
  english_variant: "BrE"
} as MeResponse["learning_settings"];
const user = (id: string) => ({
  id,
  display_name: id,
  avatar_url: "",
  roles: ["student" as const],
  active_role: "student" as const
});
const observers: TestObserver[] = [];
class TestObserver {
  connected = false;
  target: Element | null = null;
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.target = target;
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}
function reachBottom() {
  const observer = observers
    .filter((observer) => observer.connected && observer.target?.isConnected)
    .pop();
  expect(observer).toBeDefined();
  act(() =>
    observer!.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver
    )
  );
}
const pageResult = (page: number, revision = 1) => ({
  items: [
    {
      entry_id: page === 1 ? "entry" : "second-entry",
      position: page === 1 ? 0 : 50,
      entry: {
        ...entry,
        entry_id: page === 1 ? "entry" : "second-entry",
        label: page === 1 ? "apple" : "banana"
      },
      author_note: "作者给读者的补充说明"
    }
  ],
  revision,
  pagination: { page, page_size: 50, total: 51, total_pages: 2 }
});
const myPageResult = (page: number) => {
  const result = pageResult(page);
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      private_note: "作者秘密",
      note_revision: 1
    }))
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.wordList.customAudio).mockResolvedValue({ items: [] });
  vi.mocked(api.wordList.myCustomAudio).mockResolvedValue({ items: [] });
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", TestObserver);
  identity.identity = "student";
  useUserStore.setState({ hydrated: true, user: user("owner") });
  vi.mocked(api.wordList.get).mockResolvedValue(list);
  vi.mocked(api.wordList.myDetail).mockResolvedValue(list);
  vi.mocked(api.wordList.availability).mockResolvedValue({
    revision: 1,
    available_count: 51,
    unavailable_count: 0
  });
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 51,
    unavailable_count: 0
  });
  vi.mocked(api.wordList.items).mockImplementation(async (_id, query) =>
    pageResult(query?.page ?? 1)
  );
  vi.mocked(api.wordList.myItems).mockImplementation(async (_id, query) =>
    myPageResult(query?.page ?? 1)
  );
  vi.mocked(api.wordList.reviews).mockResolvedValue({
    items: [],
    withdraw_reason: null
  });
  vi.mocked(api.auth.me).mockResolvedValue(profile(settings));
});
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])(
  "links practice to the current wordlist with mine=%s without publishing",
  async (mine) => {
    if (mine)
      vi.mocked(api.wordList.myDetail).mockResolvedValue({
        ...list,
        state: "draft"
      });
    open(mine);
    expect(
      await screen.findByRole("link", { name: "开始练习" })
    ).toHaveAttribute(
      "href",
      `/student/tasks/new?wordlist=list&source=${mine ? "owned" : "public"}`
    );
    expect(api.wordList.publish).not.toHaveBeenCalled();
  }
);
function open(mine = false, staleTime = 0) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime } }
  });
  const element = () => (
    <QueryClientProvider client={client}>
      <WordListDetail id="list" mine={mine} />
    </QueryClientProvider>
  );
  const result = render(element());
  return { client, ...result, refresh: () => result.rerender(element()) };
}
it("清空详情搜索后恢复全部词条且保留输入焦点", async () => {
  open();
  await screen.findByRole("heading", { name: "apple" });
  const input = screen.getByRole("searchbox", { name: "搜索词条" });
  fireEvent.change(input, { target: { value: "apple" } });
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "apple", view: "full" },
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "", view: "full" },
      expect.anything()
    )
  );
});

it("详情搜索等待组合输入结束，读取期间保留旧词条且不续载旧搜索", async () => {
  open();
  await screen.findByRole("heading", { name: "apple" });
  const input = screen.getByLabelText("搜索词条");
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "ping" } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(api.wordList.items).toHaveBeenCalledTimes(1);
  let resolve!: (value: ReturnType<typeof pageResult>) => void;
  vi.mocked(api.wordList.items).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  fireEvent.change(input, { target: { value: "苹果" } });
  fireEvent.compositionEnd(input);
  await waitFor(() => expect(api.wordList.items).toHaveBeenCalledTimes(2));
  expect(api.wordList.items).toHaveBeenLastCalledWith(
    "list",
    { page: 1, q: "苹果", view: "full" },
    expect.anything()
  );
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  expect(screen.getByText("正在搜索…")).toBeVisible();
  expect(observers.every((observer) => !observer.connected)).toBe(true);
  await act(async () => resolve(pageResult(2)));
  expect(await screen.findByRole("heading", { name: "banana" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "apple" })
  ).not.toBeInTheDocument();
});
it("collapses unavailable references, keeps notes and positions, and loads later usable entries", async () => {
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 49,
    unavailable_count: 2
  });
  vi.mocked(api.wordList.myItems).mockResolvedValueOnce({
    ...myPageResult(1),
    items: [
      {
        ...myPageResult(1).items[0]!,
        entry: null,
        entry_label: "apple",
        unavailable_reason: "archived"
      }
    ]
  });
  open(true);
  await screen.findByText(/整张词表：49 个可用词条，2 个暂不可用/);
  const summary = await screen.findByText(/查看暂不可用的词条/);
  expect(summary.closest("details")).not.toHaveAttribute("open");
  const details = summary.closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  expect(screen.getByText(/原位置 1/)).toHaveTextContent(
    "apple · 原位置 1 · 词条暂不可用"
  );
  expect(screen.getByText("原因：已移入垃圾桶")).toBeVisible();
  expect(screen.getByText("私密备注：作者秘密")).toHaveClass("border-dashed");
  expect(screen.getByRole("link", { name: "移除或替换" })).toHaveAttribute(
    "href",
    "/account/wordlists/list/edit"
  );
  expect(
    screen.queryByRole("heading", { name: "apple" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("当前已加载的词条均不可用。")).toBeVisible();
  reachBottom();
  await screen.findByRole("heading", { name: "banana" });
  expect(
    screen.queryByText("当前已加载的词条均不可用。")
  ).not.toBeInTheDocument();
});

it("reloads metadata, entries and counts after an availability revision mismatch", async () => {
  vi.mocked(api.wordList.myDetail)
    .mockResolvedValueOnce(list)
    .mockResolvedValue({ ...list, revision: 2 });
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 2,
    available_count: 51,
    unavailable_count: 0
  });
  vi.mocked(api.wordList.myItems).mockImplementation(async (_id, query) => ({
    ...myPageResult(query?.page ?? 1),
    revision: 2
  }));
  open(true);
  await screen.findByText(/可用数量暂时无法读取|词表内容已变化/);
  fireEvent.click(screen.getByRole("button", { name: "重新加载词表" }));
  await screen.findByText("整张词表：51 个可用词条");
  expect(api.wordList.myDetail).toHaveBeenCalledTimes(2);
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
  expect(api.wordList.myAvailability).toHaveBeenCalledTimes(2);
  expect(api.wordList.availability).not.toHaveBeenCalled();
});

it("元数据版本未变时，重新加载仍刷新同版本的词条与可用数量", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.myAvailability).mockResolvedValueOnce({
    revision: 2,
    available_count: 51,
    unavailable_count: 0
  });
  open(true, 60_000);
  fireEvent.click(await screen.findByRole("button", { name: "重新加载词表" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "申请公开" })).toBeEnabled()
  );
  expect(screen.getByText("整张词表：51 个可用词条")).toBeVisible();
  expect(api.wordList.myDetail).toHaveBeenCalledTimes(2);
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
  expect(api.wordList.myAvailability).toHaveBeenCalledTimes(2);
});

it("does not automatically page an entirely unavailable list and loads hidden references on demand", async () => {
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 0,
    unavailable_count: 51
  });
  vi.mocked(api.wordList.myItems).mockImplementation(async (_id, query) => {
    const result = myPageResult(query?.page ?? 1);
    return {
      ...result,
      items: result.items.map((item) => ({ ...item, entry: null }))
    };
  });
  open(true);
  const summary = await screen.findByText(/查看暂不可用的词条/);
  await screen.findByText(/整张词表：0 个可用词条/);
  expect(observers.every((observer) => !observer.connected)).toBe(true);
  expect(api.wordList.myItems).toHaveBeenCalledOnce();
  expect(screen.queryByText("私密备注：作者秘密")).not.toBeInTheDocument();
  const details = summary.closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  expect(await screen.findByText("私密备注：作者秘密")).toHaveClass(
    "border-dashed"
  );
  fireEvent.click(screen.getByRole("button", { name: "加载更多不可用词条" }));
  await screen.findByText(/原位置 51/);
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
  expect(observers.every((observer) => !observer.connected)).toBe(true);
});

it("rejects counts below loaded unavailable references and refreshes once without a retry loop", async () => {
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    ...myPageResult(1),
    items: [{ ...myPageResult(1).items[0]!, entry: null }]
  });
  open(true);
  await screen.findByText(/查看暂不可用的词条.*已加载 1 个/);
  await waitFor(() =>
    expect(api.wordList.myAvailability).toHaveBeenCalledTimes(2)
  );
  await act(async () => {});
  expect(api.wordList.myAvailability).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/整张词表共 0 个/)).not.toBeInTheDocument();
  expect(screen.queryByText("整张词表：51 个可用词条")).not.toBeInTheDocument();
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 50,
    unavailable_count: 1
  });
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText(/查看暂不可用的词条.*整张词表共 1 个/);
  expect(api.wordList.myAvailability).toHaveBeenCalledTimes(3);
});

it("old backend availability 404 never invents zero counts or blocks reading, and can retry", async () => {
  const { HttpError } = await import("@tsz/api-client");
  vi.mocked(api.wordList.availability).mockRejectedValueOnce(
    new HttpError(404, "not found")
  );
  open();
  await screen.findByRole("heading", { name: "apple" });
  await screen.findByText(/可用数量暂时无法读取/);
  expect(screen.queryByText(/整张词表：/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("整张词表：51 个可用词条");
  expect(api.wordList.myAvailability).not.toHaveBeenCalled();
});

it("简洁与标准模式共用已加载分页，切换后保留备注与搜索", async () => {
  open(true);
  await screen.findByRole("heading", { name: "apple" });
  reachBottom();
  await screen.findByRole("heading", { name: "banana" });
  const calls = vi.mocked(api.wordList.myItems).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "简洁模式" }));
  expect(screen.getByRole("table", { name: "简洁模式词条列表" })).toBeVisible();
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  expect(screen.getByRole("heading", { name: "banana" })).toBeVisible();
  expect(screen.getAllByText("私密备注：作者秘密")[0]).toBeVisible();
  expect(
    screen.getAllByText("注：作者给读者的补充说明")[0]!.closest("td")
  ).toHaveAttribute("colspan", "3");
  expect(api.wordList.myItems).toHaveBeenCalledTimes(calls);
  fireEvent.change(screen.getByLabelText("搜索词条"), {
    target: { value: "apple" }
  });
  await waitFor(() =>
    expect(api.wordList.myItems).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "apple", view: "full" },
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "标准模式" }));
  expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  expect(screen.getByLabelText("搜索词条")).toHaveValue("apple");
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await waitFor(() =>
    expect(api.wordList.myItems).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "apple", view: "full" },
      expect.anything()
    )
  );
  await screen.findByRole("columnheader", { name: "词形变化" });
  fireEvent.click(screen.getByRole("button", { name: "简洁模式" }));
  await screen.findByRole("table", { name: "简洁模式词条列表" });
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
});

it("switches real modes and reading context without writing preferences or leaking private responses", async () => {
  const view = open(true);
  await screen.findByText("A1-UK");
  expect(screen.getByText("私密备注：作者秘密")).toBeVisible();
  expect(screen.getByText("注：作者给读者的补充说明")).toBeVisible();
  expect(screen.getByRole("button", { name: "标准模式" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await waitFor(() =>
    expect(api.wordList.myItems).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "", view: "full" },
      expect.anything()
    )
  );
  await screen.findByText("细分词性");
  identity.identity = "teacher";
  view.refresh();
  await screen.findByText("C2-UK");
  expect(screen.queryByText("A1-UK")).not.toBeInTheDocument();
  identity.identity = "student";
  await act(async () => {
    view.client.setQueryData(
      ["wordlists", "user", "owner", "reading-settings"],
      profile({
        ...settings,
        english_variant: "AmE"
      } as MeResponse["learning_settings"])
    );
  });
  view.refresh();
  await screen.findByText("A1-US");
  vi.mocked(api.auth.me).mockResolvedValue(profile(null));
  await act(async () => {
    useUserStore.setState({ user: user("other") });
  });
  await screen.findByText("C2-US");
  expect(screen.getByText(/C2 预览/)).toBeVisible();
  view.unmount();
  useUserStore.setState({ user: null });
  open();
  await screen.findByText("C2-UK");
  expect(screen.queryByText(/作者秘密/)).not.toBeInTheDocument();
  expect(screen.getByText("注：作者给读者的补充说明")).toBeVisible();
  expect(api.wordList.items).toHaveBeenCalled();
});
it("search resets pagination and a failed full-mode fetch can return to cached standard content", async () => {
  open();
  await screen.findByText("A1-UK");
  reachBottom();
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 2, q: "", view: "full" },
      expect.anything()
    )
  );
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  await screen.findByRole("heading", { name: "banana" });
  fireEvent.change(screen.getByLabelText("搜索词条"), {
    target: { value: "app" }
  });
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "app", view: "full" },
      expect.anything()
    )
  );
  expect(
    screen.queryByRole("heading", { name: "banana" })
  ).not.toBeInTheDocument();
  vi.mocked(api.wordList.items).mockRejectedValueOnce(
    new Error("unsupported view")
  );
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await screen.findByText(/完整内容暂不可用，可切回标准模式/);
  fireEvent.click(screen.getByRole("button", { name: "标准模式" }));
  await screen.findByText("A1-UK");
});

it("词表信息重试恢复后，新鲜缓存仍能触底加载下一页", async () => {
  const { client } = open(false, 60_000);
  await screen.findByRole("heading", { name: "apple" });
  const oldTarget =
    screen.getByText("继续向下滚动，自动加载更多词条").parentElement;
  await waitFor(() =>
    expect(
      observers.some(
        (observer) => observer.connected && observer.target === oldTarget
      )
    ).toBe(true)
  );
  vi.mocked(api.wordList.get).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["wordlists", "public", "detail", "list"],
      exact: true
    });
  });
  await screen.findByText("词表不存在、不可访问或暂时无法加载。");
  expect(oldTarget).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByRole("heading", { name: "apple" });
  expect(api.wordList.items).toHaveBeenCalledTimes(1);
  const newTarget =
    screen.getByText("继续向下滚动，自动加载更多词条").parentElement;
  expect(newTarget).not.toBe(oldTarget);
  await waitFor(() =>
    expect(
      observers.some(
        (observer) =>
          observer.connected &&
          observer.target === newTarget &&
          observer.target?.isConnected
      )
    ).toBe(true)
  );
  reachBottom();
  await screen.findByRole("heading", { name: "banana" });
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  expect(
    vi.mocked(api.wordList.items).mock.calls.map((call) => call[1]?.page)
  ).toEqual([1, 2]);
});

it("空结果后台刷新失败时显示错误，并可重试恢复词条", async () => {
  vi.mocked(api.wordList.items).mockResolvedValueOnce({
    ...pageResult(1),
    items: [],
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }
  });
  const { client } = open();
  await screen.findByText("暂无词条");
  vi.mocked(api.wordList.items).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: [
        "wordlists",
        "public",
        "items",
        "infinite",
        "list",
        1,
        "",
        "standard",
        "author"
      ],
      exact: true
    });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("条目加载失败");
  expect(screen.queryByText("暂无词条")).not.toBeInTheDocument();
  let finish!: (value: ReturnType<typeof pageResult>) => void;
  let retrySignal: AbortSignal | undefined;
  vi.mocked(api.wordList.items).mockImplementationOnce(
    (_id, _query, options) => {
      retrySignal = options?.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    }
  );
  const retry = screen.getByRole("button", { name: "重试" });
  fireEvent.click(retry);
  await waitFor(() => expect(retry).toBeDisabled());
  fireEvent.click(retry);
  expect(api.wordList.items).toHaveBeenCalledTimes(3);
  expect(retrySignal?.aborted).toBe(false);
  await act(async () => finish(pageResult(1)));
  await screen.findByRole("heading", { name: "apple" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    vi.mocked(api.wordList.items).mock.calls.map((call) => call[1]?.page)
  ).toEqual([1, 1, 1]);
});

it("元数据恢复到新版本时清除旧分页，并从第一页重新读取", async () => {
  const { client } = open(false, 60_000);
  await screen.findByRole("heading", { name: "apple" });
  reachBottom();
  await screen.findByRole("heading", { name: "banana" });
  await screen.findByText("已加载全部 2 个词条");
  vi.mocked(api.wordList.get).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["wordlists", "public", "detail", "list"],
      exact: true
    });
  });
  await screen.findByText("词表不存在、不可访问或暂时无法加载。");
  vi.mocked(api.wordList.get).mockResolvedValue({
    ...list,
    name: "新版词表",
    revision: 2,
    item_count: 1
  });
  vi.mocked(api.wordList.availability).mockResolvedValue({
    revision: 2,
    available_count: 1,
    unavailable_count: 0
  });
  let finish!: (value: ReturnType<typeof pageResult>) => void;
  vi.mocked(api.wordList.items).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByRole("heading", { name: "新版词表" });
  await waitFor(() => expect(api.wordList.items).toHaveBeenCalledTimes(3));
  expect(
    screen.queryByRole("heading", { name: "apple" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "banana" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("正在读取条目…")).toBeVisible();
  const next = pageResult(1, 2);
  next.items[0]!.entry.label = "pear";
  next.pagination = { page: 1, page_size: 50, total: 1, total_pages: 1 };
  await act(async () => finish(next));
  await screen.findByRole("heading", { name: "pear" });
  expect(
    screen.queryByRole("heading", { name: "apple" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "banana" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("已加载全部 1 个词条")).toBeVisible();
  expect(
    vi.mocked(api.wordList.items).mock.calls.map((call) => call[1]?.page)
  ).toEqual([1, 2, 1]);
});

it("可用性缓存刷新失败保留数量并提供重试，成功后恢复申请公开", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  const { client } = open(true, 60_000);
  const apply = await screen.findByRole("button", { name: "申请公开" });
  await waitFor(() => expect(apply).toBeEnabled());
  vi.mocked(api.wordList.myAvailability).mockRejectedValueOnce(
    new Error("offline")
  );
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["wordlists", "user", "owner", "availability", "list", 1],
      exact: true
    });
  });
  await waitFor(() => expect(apply).toBeDisabled());
  expect(screen.getByText("整张词表：51 个可用词条")).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "可用数量暂时无法读取"
  );
  let finish!: (value: {
    revision: number;
    available_count: number;
    unavailable_count: number;
  }) => void;
  vi.mocked(api.wordList.myAvailability).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const retry = screen.getByRole("button", { name: "重试" });
  fireEvent.click(retry);
  await waitFor(() => expect(retry).toBeDisabled());
  fireEvent.click(retry);
  expect(api.wordList.myAvailability).toHaveBeenCalledTimes(3);
  await act(async () =>
    finish({ revision: 1, available_count: 51, unavailable_count: 0 })
  );
  await waitFor(() => expect(apply).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("appends on reaching the bottom, coalesces repeated intersections and stops at the last page", async () => {
  open(true);
  await screen.findByRole("heading", { name: "apple" });
  expect(
    screen.queryByRole("button", { name: /上一页|下一页|加载更多/ })
  ).not.toBeInTheDocument();
  let resolve!: (value: ReturnType<typeof myPageResult>) => void;
  vi.mocked(api.wordList.myItems).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  reachBottom();
  reachBottom();
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
  await screen.findByText("正在加载更多词条…");
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  await act(async () => resolve(myPageResult(2)));
  await screen.findByRole("heading", { name: "banana" });
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  expect(screen.getAllByText("私密备注：作者秘密")).toHaveLength(2);
  expect(screen.getByText("已加载全部 2 个词条")).toBeVisible();
  expect(observers.every((observer) => !observer.connected)).toBe(true);
  expect(api.wordList.myItems).toHaveBeenCalledTimes(2);
});

it("keeps loaded entries on next-page failure and retries the same page without automatic loops", async () => {
  open();
  await screen.findByRole("heading", { name: "apple" });
  vi.mocked(api.wordList.items).mockRejectedValueOnce(new Error("offline"));
  reachBottom();
  await screen.findByText(/后续词条加载失败/);
  expect(screen.getByRole("heading", { name: "apple" })).toBeVisible();
  expect(observers.every((observer) => !observer.connected)).toBe(true);
  expect(api.wordList.items).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByRole("heading", { name: "banana" });
  expect(
    vi.mocked(api.wordList.items).mock.calls.map((call) => call[1]?.page)
  ).toEqual([1, 2, 2]);
});

it("does not append a late page from the previous search and starts new reading modes at page one", async () => {
  open();
  await screen.findByRole("heading", { name: "apple" });
  let resolve!: (value: ReturnType<typeof pageResult>) => void;
  let oldSignal: AbortSignal | undefined;
  vi.mocked(api.wordList.items).mockImplementationOnce(
    (_id, _query, options) => {
      oldSignal = options?.signal;
      return new Promise((done) => {
        resolve = done;
      });
    }
  );
  reachBottom();
  await screen.findByText("正在加载更多词条…");
  fireEvent.change(screen.getByLabelText("搜索词条"), {
    target: { value: "app" }
  });
  await screen.findByRole("heading", { name: "apple" });
  await waitFor(() => expect(oldSignal?.aborted).toBe(true));
  await act(async () => resolve(pageResult(2)));
  expect(
    screen.queryByRole("heading", { name: "banana" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "完整模式" }));
  await screen.findByText("细分词性");
  expect(api.wordList.items).toHaveBeenLastCalledWith(
    "list",
    { page: 1, q: "app", view: "full" },
    expect.anything()
  );
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "排序：作者顺序" }),
    {
      button: 0,
      ctrlKey: false
    }
  );
  fireEvent.click(
    await screen.findByRole("menuitemradio", { name: "词面 Z–A" })
  );
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 1, q: "app", view: "full", sort: "label_desc" },
      expect.anything()
    )
  );
});

it("rejects changed content versions and reloads before appending the new version", async () => {
  open();
  await screen.findByRole("heading", { name: "apple" });
  vi.mocked(api.wordList.items).mockImplementation(async (_id, query) =>
    pageResult(query?.page ?? 1, 2)
  );
  reachBottom();
  await screen.findByText(/词表内容已变化/);
  expect(
    screen.queryByRole("heading", { name: "banana" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  );
  reachBottom();
  await screen.findByRole("heading", { name: "banana" });
  expect(screen.getByText("已加载全部 2 个词条")).toBeVisible();
});

it("keeps a publication application private until manual approval", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValueOnce({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.publish).mockImplementation(async () => {
    vi.mocked(api.wordList.myDetail).mockResolvedValue({
      ...list,
      state: "pending",
      revision: 2
    });
    return {
      id: "request",
      wordlist_id: list.id,
      submitted_revision: 2,
      name: list.name,
      state: "pending",
      reason: null,
      created_at: "",
      decided_at: null
    };
  });
  open(true);
  const applyButton = await screen.findByRole("button", { name: "申请公开" });
  await waitFor(() => expect(applyButton).toBeEnabled());
  fireEvent.click(applyButton);
  expect(
    await screen.findByText("公开申请正在审核中，审核通过前仅你可见。")
  ).toBeVisible();
  expect(api.wordList.publish).toHaveBeenCalledWith("list", {
    expected_revision: 1,
    idempotency_key: expect.any(String)
  });
  expect(
    screen.queryByRole("link", { name: "查看公开页面" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "撤回为私密" })).toBeEnabled();
});

it("handles entries becoming unavailable after precheck and allows a new attempt after recovery", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.publish).mockImplementation(async () => {
    vi.mocked(api.wordList.myAvailability).mockResolvedValue({
      revision: 1,
      available_count: 50,
      unavailable_count: 1
    });
    vi.mocked(api.wordList.myItems).mockResolvedValue({
      ...myPageResult(1),
      items: [
        {
          ...myPageResult(1).items[0]!,
          entry: null,
          entry_label: "tea",
          unavailable_reason: "archived"
        }
      ]
    });
    throw new HttpError(400, "unavailable entries", [], "validation_failed");
  });
  const { client } = open(true);
  const button = await screen.findByRole("button", { name: "申请公开" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText(
    "申请公开失败：词表中有暂不可用的词条。请在下方查看原因，移除或替换后再申请。"
  );
  expect(await screen.findByText("原因：已移入垃圾桶")).toBeVisible();
  expect(
    screen.getByText(/查看暂不可用的词条/).closest("details")
  ).toHaveAttribute("open");
  expect(button).toBeDisabled();
  const first = vi.mocked(api.wordList.publish).mock.calls[0]![1];
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 51,
    unavailable_count: 0
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue(myPageResult(1));
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(api.wordList.publish).toHaveBeenCalledTimes(2));
  expect(
    vi.mocked(api.wordList.publish).mock.calls[1]![1].idempotency_key
  ).not.toBe(first.idempotency_key);
});

it.each([
  new Error("response lost"),
  new HttpError(503, "unavailable"),
  new HttpError(408, "request timeout")
])(
  "keeps uncertain applications safe to retry without exposing internal terms (%s)",
  async (error) => {
    vi.mocked(api.wordList.myDetail).mockResolvedValue({
      ...list,
      state: "draft"
    });
    vi.mocked(api.wordList.publish).mockRejectedValue(error);
    open(true);
    const applyButton = await screen.findByRole("button", { name: "申请公开" });
    await waitFor(() => expect(applyButton).toBeEnabled());
    fireEvent.click(applyButton);
    const notice = await screen.findByText(
      "暂时无法确认申请是否成功，请刷新页面查看词表状态后再试。"
    );
    expect(notice).not.toHaveTextContent("请求键");
    const first = vi.mocked(api.wordList.publish).mock.calls[0]![1];
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "申请公开" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "申请公开" }));
    await waitFor(() => expect(api.wordList.publish).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.wordList.publish).mock.calls[1]![1]).toEqual(first);
  }
);

it("explains a rejected withdrawal as a changed wordlist instead of an uncertain result", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    vi.mocked(api.wordList.withdraw).mockRejectedValue(
      new HttpError(409, "conflict", [], "word_list_conflict")
    );
    open(true);
    fireEvent.click(await screen.findByRole("button", { name: "撤回为私密" }));
    expect(
      await screen.findByText("词表已发生变化，请刷新页面后再操作。")
    ).toBeVisible();
    expect(api.wordList.withdraw).toHaveBeenCalledWith("list", {
      expected_revision: 1
    });
  } finally {
    confirm.mockRestore();
  }
});

it("explains unavailable entries before publication and prevents submission", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 50,
    unavailable_count: 1
  });
  vi.mocked(api.wordList.myItems).mockResolvedValue({
    ...myPageResult(1),
    items: [
      {
        ...myPageResult(1).items[0]!,
        entry: null,
        entry_label: "tea",
        unavailable_reason: "archived"
      }
    ]
  });
  open(true);
  await screen.findByText("有不可用词条，移除或替换后可申请公开。");
  expect(screen.getByText("原因：已移入垃圾桶")).toBeVisible();
  expect(
    screen.getByText(/查看暂不可用的词条/).closest("details")
  ).toHaveAttribute("open");
  const button = screen.getByRole("button", { name: "申请公开" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(api.wordList.publish).not.toHaveBeenCalled();
});

it("waits for whole-list availability before enabling publication", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  let finish!: (value: {
    revision: number;
    available_count: number;
    unavailable_count: number;
  }) => void;
  vi.mocked(api.wordList.myAvailability).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  open(true);
  const button = await screen.findByRole("button", { name: "申请公开" });
  expect(button).toBeDisabled();
  expect(screen.getByText("正在检查词条可用性，请稍候。")).toBeVisible();
  await act(async () =>
    finish({ revision: 1, available_count: 51, unavailable_count: 0 })
  );
  await waitFor(() => expect(button).toBeEnabled());
});

it("keeps publication disabled when counts cannot be verified and enables it after retry", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.myAvailability)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      revision: 1,
      available_count: 51,
      unavailable_count: 0
    });
  open(true);
  await screen.findByText(
    "暂时无法确认词条是否全部可用，请在下方重试后再申请。"
  );
  expect(screen.getByRole("button", { name: "申请公开" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "申请公开" })).toBeEnabled()
  );
});

it("uses whole-list counts when unavailable entries are on another page or hidden by search", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 1,
    available_count: 50,
    unavailable_count: 1
  });
  vi.mocked(api.wordList.myItems).mockImplementation(async (_id, query) => {
    const result = myPageResult(query?.page ?? 1);
    return query?.page === 2
      ? {
          ...result,
          items: [
            {
              ...result.items[0]!,
              entry: null,
              entry_label: "tea",
              unavailable_reason: "archived"
            }
          ]
        }
      : result;
  });
  open(true);
  await screen.findByText(/有不可用词条/);
  expect(screen.getByRole("button", { name: "申请公开" })).toBeDisabled();
  expect(screen.queryByText("原因：已移入垃圾桶")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "加载更多词条以查看原因" })
  );
  expect(await screen.findByText("原因：已移入垃圾桶")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索词条" }), {
    target: { value: "apple" }
  });
  await waitFor(() =>
    expect(
      vi
        .mocked(api.wordList.myItems)
        .mock.calls.some(([, query]) => query?.q === "apple")
    ).toBe(true)
  );
  expect(screen.getByRole("button", { name: "申请公开" })).toBeDisabled();
  fireEvent.click(
    await screen.findByRole("button", { name: "清空搜索查看原因" })
  );
  expect(screen.getByRole("searchbox", { name: "搜索词条" })).toHaveValue("");
  expect(await screen.findByText("原因：已移入垃圾桶")).toBeVisible();
  expect(api.wordList.publish).not.toHaveBeenCalled();
});

it("blocks publication when availability belongs to a different wordlist revision", async () => {
  vi.mocked(api.wordList.myDetail).mockResolvedValue({
    ...list,
    state: "draft"
  });
  vi.mocked(api.wordList.myAvailability).mockResolvedValue({
    revision: 2,
    available_count: 51,
    unavailable_count: 0
  });
  open(true);
  await screen.findByRole("button", { name: "重新加载词表" });
  expect(screen.getByRole("button", { name: "申请公开" })).toBeDisabled();
});

it.each([false, true])(
  "自定义语音按阅读权限签名且英美都可播放 mine=%s",
  async (mine) => {
    const custom = {
      item_id: "custom",
      entry_id: null,
      custom_word: { word: " custom phrase ", definition: "释义" },
      entry: null,
      position: 0,
      private_note: "",
      note_revision: 1
    };
    const result = {
      revision: 1,
      pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      items: [custom]
    };
    vi.mocked(api.wordList.items).mockResolvedValue(result);
    vi.mocked(api.wordList.myItems).mockResolvedValue(result);
    const status = {
      items: [
        {
          item_id: "custom",
          job_id: "job",
          word: "custom phrase",
          status: "ready" as const,
          locales: ["en-GB", "en-US"] as ("en-GB" | "en-US")[]
        }
      ]
    };
    vi.mocked(api.wordList.customAudio).mockResolvedValue(status);
    vi.mocked(api.wordList.myCustomAudio).mockResolvedValue(status);
    vi.mocked(api.auth.me).mockResolvedValue(
      profile({ cefr_level: "A1", english_variant: "AmE" })
    );
    const sign = mine
      ? api.wordList.myCustomAudioUrl
      : api.wordList.customAudioUrl;
    vi.mocked(sign).mockResolvedValue({
      url: "https://example.com/audio",
      expires_at: "2026-10-23T10:00:00Z",
      url_expires_in_seconds: 300
    });
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        play = play;
        pause = pause;
        onerror = null;
      }
    );
    const mounted = open(mine);
    await screen.findByRole("button", { name: "播放 custom phrase 美式语音" });
    expect(
      screen
        .getAllByRole("button", { name: /播放 custom phrase/ })
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "播放  custom phrase  美式语音",
      "播放  custom phrase  英式语音"
    ]);
    expect(
      mine ? api.wordList.myCustomAudio : api.wordList.customAudio
    ).toHaveBeenCalledWith(
      "list",
      ["custom"],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "播放 custom phrase 美式语音" })
    );
    await waitFor(() =>
      expect(sign).toHaveBeenCalledWith(
        "list",
        "custom",
        "en-US",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
    fireEvent.click(
      screen.getByRole("button", { name: "播放 custom phrase 英式语音" })
    );
    await waitFor(() =>
      expect(sign).toHaveBeenCalledWith(
        "list",
        "custom",
        "en-GB",
        expect.anything()
      )
    );
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    mounted.unmount();
    expect(pause).toHaveBeenCalledTimes(2);
  }
);

it("自定义词在阅读页展示原释义，不误判为不可用并说明可用于拼写练习", async () => {
  vi.mocked(api.wordList.availability).mockResolvedValue({
    revision: 1,
    available_count: 1,
    unavailable_count: 0,
    custom_count: 1
  });
  vi.mocked(api.wordList.items).mockResolvedValue({
    revision: 1,
    pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
    items: [
      {
        item_id: "custom",
        entry_id: null,
        custom_word: { word: "custom phrase", definition: "独立的自定义释义" },
        entry: null,
        position: 0,
        author_note: "自定义词的注"
      }
    ]
  });
  open();
  expect(await screen.findByText("独立的自定义释义")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "custom phrase" })
  ).toBeInTheDocument();
  expect(
    screen.getByText(/其中 1 个自定义词条，可用于拼写练习/)
  ).toBeInTheDocument();
  expect(screen.getByText("注：自定义词的注")).toBeInTheDocument();
  expect(
    screen.queryByText("当前已加载的词条均不可用。")
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "简洁模式" }));
  expect(
    screen.getByRole("heading", { name: "custom phrase" }).closest("tr")!
      .children
  ).toHaveLength(3);
  expect(screen.getByText("独立的自定义释义")).toBeVisible();
  expect(screen.getByText("注：自定义词的注").closest("td")).toHaveAttribute(
    "colspan",
    "3"
  );
});
