import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { WordListBrowser } from "./WordListBrowser";
import { DetailInteractions } from "./WordlistInteractions";
vi.mock("@/lib/request", () => ({
  api: {
    wordList: {
      list: vi.fn(),
      mine: vi.fn(),
      favorites: vi.fn(),
      interactionStats: vi.fn(),
      interactionStates: vi.fn(),
      tipStates: vi.fn(),
      setInteraction: vi.fn(),
      tip: vi.fn(),
      tipReceipt: vi.fn()
    }
  }
}));
import { api } from "@/lib/request";
const list = {
  id: "list",
  owner_user_id: "author",
  owner_name: "作者",
  name: "互动词表",
  state: "published" as const,
  revision: 1,
  item_count: 2,
  created_at: "",
  updated_at: ""
};
const pagination = { page: 1, page_size: 50, total: 1, total_pages: 1 };
function user(id: string) {
  return {
    id,
    display_name: id,
    avatar_url: "",
    active_role: "student" as const,
    roles: ["student" as const]
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.mocked(api.wordList.tipStates).mockResolvedValue({
    items: [{ wordlist_id: "list", tip_amount: "0" }]
  });
  sessionStorage.clear();
  useUserStore.setState({ user: user("reader") });
  vi.mocked(api.wordList.list).mockResolvedValue({ items: [list], pagination });
  vi.mocked(api.wordList.mine).mockResolvedValue({
    items: [],
    pagination: { ...pagination, total: 0 }
  });
  vi.mocked(api.wordList.interactionStats).mockResolvedValue({
    items: [
      {
        wordlist_id: "list",
        like_count: 2,
        favorite_count: 3,
        tip_amount: "17"
      }
    ]
  });
  vi.mocked(api.wordList.interactionStates).mockResolvedValue({
    items: [{ wordlist_id: "list", liked: false, favorited: false }]
  });
});
it("batches card statistics, separates navigation, and confirms before charging", async () => {
  renderWithProviders(<WordListBrowser />);
  const like = await screen.findByRole("button", { name: "点赞" });
  await waitFor(() => expect(like).toBeEnabled());
  expect(api.wordList.interactionStats).toHaveBeenCalledWith(
    ["list"],
    expect.anything()
  );
  expect(like.closest("a")).toBeNull();
  expect(screen.getByRole("link", { name: /互动词表/ })).toHaveAttribute(
    "href",
    "/wordlists/list"
  );
  fireEvent.click(screen.getByRole("button", { name: "投币 17" }));
  expect(
    screen.getByRole("dialog", { name: "给作者投币" })
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "2 枚天生币" })).toBeChecked();
  expect(api.wordList.tip).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "确认投出" })).toBeInTheDocument();
});
it("refreshes total, personal state and likes together after a confirmed tip", async () => {
  vi.mocked(api.wordList.tip).mockImplementation(async (_id, input) => {
    vi.mocked(api.wordList.tipStates).mockResolvedValue({
      items: [{ wordlist_id: "list", tip_amount: "2" }]
    });
    vi.mocked(api.wordList.interactionStats).mockResolvedValue({
      items: [
        {
          wordlist_id: "list",
          like_count: 3,
          favorite_count: 3,
          tip_amount: "19"
        }
      ]
    });
    vi.mocked(api.wordList.interactionStates).mockResolvedValue({
      items: [{ wordlist_id: "list", liked: true, favorited: false }]
    });
    return {
      event_id: input.event_id,
      wordlist_id: "list",
      payer_user_id: "reader",
      author_user_id: "author",
      amount: "2",
      operation_id: "op",
      created_at: ""
    };
  });
  renderWithProviders(<DetailInteractions list={list} />);
  fireEvent.click(await screen.findByRole("button", { name: "投币 17" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认投出" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByText(/作者已收到/);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(screen.getByRole("button", { name: "已投币 19" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(screen.getByRole("button", { name: "取消点赞" })).toHaveTextContent(
    "3"
  );
  fireEvent.click(screen.getByRole("button", { name: "已投币 19" }));
  expect(screen.getByRole("button", { name: "确认投出" })).toBeDisabled();
});
it("keeps self-tipping disabled and closing a dialog never charges", async () => {
  const view = renderWithProviders(<DetailInteractions list={list} />);
  fireEvent.click(await screen.findByRole("button", { name: "投币 17" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.wordList.tip).not.toHaveBeenCalled();
  view.unmount();
  useUserStore.setState({ user: user("author") });
  renderWithProviders(<DetailInteractions list={list} />);
  expect(
    screen.getByRole("button", { name: "不能给自己的词表投币" })
  ).toBeDisabled();
});
it("failed writes never show success and account switches cannot reuse private state", async () => {
  vi.mocked(api.wordList.setInteraction).mockRejectedValue(
    new Error("offline")
  );
  renderWithProviders(<DetailInteractions list={list} />);
  const like = await screen.findByRole("button", { name: "点赞" });
  await waitFor(() => expect(like).toBeEnabled());
  fireEvent.click(like);
  expect(await screen.findByRole("alert")).toHaveTextContent("操作结果未确认");
  expect(like).toHaveAttribute("aria-pressed", "false");
  vi.mocked(api.wordList.interactionStates).mockResolvedValue({
    items: [{ wordlist_id: "list", liked: true, favorited: true }]
  });
  act(() => useUserStore.setState({ user: user("other") }));
  expect(screen.getByRole("button", { name: "点赞" })).toBeDisabled();
  expect(
    await screen.findByRole("button", { name: "取消点赞" })
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("操作结果未确认，请刷新状态后重试。")).toBeNull();
});
it("guests see statistics and login links without private requests or automatic charge", async () => {
  useUserStore.setState({ user: null });
  renderWithProviders(<DetailInteractions list={list} />);
  expect(
    await screen.findByRole("link", { name: "登录后点赞" })
  ).toHaveAttribute("href", "/login?redirect=%2Fwordlists%2Flist");
  expect(
    await screen.findByRole("link", { name: "登录后投币" })
  ).toHaveAttribute("href", "/login?redirect=%2Fwordlists%2Flist");
  expect(api.wordList.interactionStates).not.toHaveBeenCalled();
  expect(api.wordList.tipStates).not.toHaveBeenCalled();
  expect(api.wordList.tip).not.toHaveBeenCalled();
});
it("removes unavailable references and sends search and pagination to favorites", async () => {
  vi.mocked(api.wordList.favorites).mockResolvedValue({
    items: [{ wordlist_id: "hidden", wordlist: null }],
    pagination: { ...pagination, total: 2, total_pages: 2 }
  });
  vi.mocked(api.wordList.setInteraction).mockResolvedValue({
    wordlist_id: "hidden",
    liked: false,
    favorited: false
  });
  renderWithProviders(<WordListBrowser mine />);
  fireEvent.click(screen.getByRole("button", { name: "收藏" }));
  expect(await screen.findByText("词表暂不可用")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));
  await waitFor(() =>
    expect(api.wordList.setInteraction).toHaveBeenCalledWith("hidden", {
      kind: "favorite",
      active: false
    })
  );
  fireEvent.change(screen.getByLabelText("搜索词表"), {
    target: { value: "公开" }
  });
  await waitFor(() =>
    expect(api.wordList.favorites).toHaveBeenLastCalledWith(
      { page: 1, q: "公开" },
      expect.anything()
    )
  );
});
it("successful interaction refreshes both mounted card and detail", async () => {
  vi.mocked(api.wordList.setInteraction).mockImplementation(async () => {
    vi.mocked(api.wordList.interactionStates).mockResolvedValue({
      items: [{ wordlist_id: "list", liked: true, favorited: false }]
    });
    vi.mocked(api.wordList.interactionStats).mockResolvedValue({
      items: [
        {
          wordlist_id: "list",
          like_count: 3,
          favorite_count: 3,
          tip_amount: "17"
        }
      ]
    });
    return { wordlist_id: "list", liked: true, favorited: false };
  });
  renderWithProviders(
    <>
      <WordListBrowser />
      <DetailInteractions list={list} />
    </>
  );
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "点赞" })).toHaveLength(2)
  );
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "点赞" })[0]).toBeEnabled()
  );
  fireEvent.click(screen.getAllByRole("button", { name: "点赞" })[0]!);
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "取消点赞" })).toHaveLength(2)
  );
  expect(
    screen.getAllByRole("button", { name: "取消点赞" })[1]
  ).toHaveTextContent("3");
});
