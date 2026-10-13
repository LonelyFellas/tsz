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
vi.mock("./WordlistTips", () => ({ TipPanel: () => null }));
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      get: vi.fn(),
      myDetail: vi.fn(),
      items: vi.fn(),
      myItems: vi.fn(),
      reviews: vi.fn()
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
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}
function reachBottom() {
  const observer = observers.filter((observer) => observer.connected).pop();
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
  vi.clearAllMocks();
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", TestObserver);
  identity.identity = "student";
  useUserStore.setState({ hydrated: true, user: user("owner") });
  vi.mocked(api.wordList.get).mockResolvedValue(list);
  vi.mocked(api.wordList.myDetail).mockResolvedValue(list);
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
function open(mine = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const element = () => (
    <QueryClientProvider client={client}>
      <WordListDetail id="list" mine={mine} />
    </QueryClientProvider>
  );
  const result = render(element());
  return { client, ...result, refresh: () => result.rerender(element()) };
}
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
it("search resets pagination and unsupported full mode can return to the standard response", async () => {
  open();
  await screen.findByText("A1-UK");
  reachBottom();
  await waitFor(() =>
    expect(api.wordList.items).toHaveBeenLastCalledWith(
      "list",
      { page: 2, q: "" },
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
      { page: 1, q: "app" },
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
  expect(oldSignal?.aborted).toBe(true);
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
