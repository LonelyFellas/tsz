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
  fireEvent.change(screen.getByLabelText("投币数量"), {
    target: { value: "7" }
  });
  fireEvent.click(screen.getByRole("button", { name: "投币" }));
  expect(api.wordList.tip).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "确认投出" })).toBeInTheDocument();
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
  await screen.findByRole("button", { name: "投币 17" });
  expect(api.wordList.interactionStates).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "投币 17" }));
  expect(screen.getByRole("link", { name: "登录后投币" })).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole("button", { name: "我收藏的" }));
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
