import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dictionary } from "./Dictionary";
import { writeHistory } from "./history";
const { search, me, push } = vi.hoisted(() => ({
  search: vi.fn(),
  me: vi.fn(),
  push: vi.fn()
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (s: unknown) => unknown) =>
    select({ user: { id: "dictionary-user" } })
}));
vi.mock("@/lib/request", () => ({
  api: { dictionary: { search }, auth: { me } }
}));
vi.mock("@tsz/voice-editor/reader", () => ({
  RichTextReadOnly: ({ value }: { value: { text: string } }) => (
    <span>{value.text}</span>
  )
}));
function response(label: string) {
  return {
    items: [
      { content: { entry_id: label, label, pos: [] }, audio: [], examples: [] }
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  };
}
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  me.mockResolvedValue({
    learning_settings: { cefr_level: "B1", english_variant: "BrE" }
  });
  search.mockResolvedValue(response("apple"));
});
describe("词典页面", () => {
  it("清空输入和 Escape 不触发查询，清空后焦点仍在搜索框", async () => {
    const user = userEvent.setup();
    render(<Dictionary />, { wrapper });
    const input = screen.getByRole("searchbox", { name: "查找英文词条" });
    await user.type(input, "apple");
    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    await user.type(input, "pear{Escape}");
    expect(input).toHaveValue("");
    expect(push).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
  it("显示本地历史，重查及删除互不混淆，空输入不发请求", async () => {
    writeHistory("dictionary-user", ["apple", "pear"]);
    const user = userEvent.setup();
    render(<Dictionary />, { wrapper });
    await user.click(await screen.findByRole("button", { name: "apple" }));
    expect(push).toHaveBeenCalledWith("/dictionary?q=apple");
    push.mockClear();
    await user.click(screen.getByRole("button", { name: "删除历史 pear" }));
    expect(
      screen.queryByRole("button", { name: "pear" })
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "查询" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请输入");
    expect(search).not.toHaveBeenCalled();
  });
  it("删除当前查询历史后，重新打开页面也不会重新写回", async () => {
    writeHistory("dictionary-user", ["apple"]);
    const user = userEvent.setup();
    const view = render(<Dictionary query="apple" />, { wrapper });
    await user.click(
      await screen.findByRole("button", { name: "删除历史 apple" })
    );
    view.unmount();
    render(<Dictionary query="apple" />, { wrapper });
    await screen.findByRole("link", { name: /apple，查看词条详情/ });
    expect(
      screen.queryByRole("button", { name: "删除历史 apple" })
    ).not.toBeInTheDocument();
  });
  it("查询切换时取消旧请求且不展示晚到的旧结果", async () => {
    let oldResolve!: (value: unknown) => void;
    let oldSignal: AbortSignal | undefined;
    search.mockImplementation(
      (q: string, _page: number, opts: { signal: AbortSignal }) => {
        if (q === "apple") {
          oldSignal = opts.signal;
          return new Promise((resolve) => {
            oldResolve = resolve;
          });
        }
        return Promise.resolve(response("pear"));
      }
    );
    const view = render(<Dictionary query="apple" />, { wrapper });
    await waitFor(() => expect(search).toHaveBeenCalled());
    view.rerender(<Dictionary query="pear" />);
    expect(
      await screen.findByRole("link", { name: /pear，查看词条详情/ })
    ).toHaveAttribute("href", expect.stringContaining("/dictionary/pear?"));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      oldResolve(response("apple"));
    });
    expect(
      screen.queryByRole("link", { name: /apple，查看词条详情/ })
    ).not.toBeInTheDocument();
  });
  it("请求失败有重试，重试后显示结果", async () => {
    search.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<Dictionary query="apple" />, { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent("查询暂时失败");
    await user.click(screen.getByRole("button", { name: "重新查询" }));
    expect(
      await screen.findByRole("link", { name: /apple，查看词条详情/ })
    ).toBeInTheDocument();
  });
});
