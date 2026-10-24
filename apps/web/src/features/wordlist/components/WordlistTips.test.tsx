import { renderWithProviders } from "@/test/render";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useUserStore } from "@/stores/user";
import { HttpError } from "@tsz/api-client";
import type { CreateWordlistTip } from "@tsz/types";
import { TipPanel } from "./WordlistTips";
vi.mock("@/lib/request", () => ({
  api: { wordList: { tip: vi.fn(), tipReceipt: vi.fn() } }
}));
import { api } from "@/lib/request";
const list = {
  id: "list",
  owner_user_id: "author",
  owner_name: "作者",
  name: "词表",
  state: "published" as const,
  revision: 3,
  item_count: 1,
  created_at: "",
  updated_at: ""
};
const onRetry = vi.fn();
const onClose = vi.fn();
function panel(tipped: string | undefined = "0", failed = false) {
  return (
    <TipPanel
      list={list}
      tipped={tipped}
      failed={failed}
      onRetry={onRetry}
      onClose={onClose}
    />
  );
}
function receipt(input: CreateWordlistTip) {
  return {
    event_id: input.event_id,
    wordlist_id: "list",
    payer_user_id: "payer",
    author_user_id: "author",
    amount: input.amount,
    operation_id: "op",
    created_at: ""
  };
}
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  sessionStorage.clear();
  useUserStore.setState({
    user: {
      id: "payer",
      display_name: "读者",
      avatar_url: "",
      active_role: "student",
      roles: ["student"]
    }
  });
  vi.mocked(api.wordList.tip).mockImplementation(async (_id, input) =>
    receipt(input)
  );
});
it("defaults to two coins and a simultaneous like, charging only on confirmation", async () => {
  renderWithProviders(panel());
  expect(screen.getByRole("radio", { name: "2 枚天生币" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "同时点赞内容" })).toBeChecked();
  expect(api.wordList.tip).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "已投出 2 天生币"
  );
  expect(api.wordList.tip).toHaveBeenCalledWith(
    "list",
    expect.objectContaining({ amount: "2", like: true }),
    expect.anything()
  );
  expect(sessionStorage.getItem("wordlist-tip:payer:list")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(onClose).toHaveBeenCalledOnce();
});
it("can select one coin without adding a like", async () => {
  renderWithProviders(panel());
  fireEvent.click(screen.getByRole("radio", { name: "1 枚天生币" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "同时点赞内容" }));
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByRole("status");
  expect(api.wordList.tip).toHaveBeenCalledWith(
    "list",
    expect.objectContaining({ amount: "1", like: false }),
    expect.anything()
  );
});
it("only permits a one-coin top-up and refuses another charge when full", async () => {
  const view = renderWithProviders(panel("1"));
  expect(screen.getByRole("radio", { name: "1 枚天生币" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "2 枚天生币" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByRole("status");
  expect(api.wordList.tip).toHaveBeenCalledWith(
    "list",
    expect.objectContaining({ amount: "1" }),
    expect.anything()
  );
  view.unmount();
  renderWithProviders(panel("7"));
  expect(screen.getByRole("button", { name: "确认投出" })).toBeDisabled();
  expect(screen.getByText("这份词表已投满 2 枚。")).toBeInTheDocument();
});
it("does not treat unknown or failed state as zero", () => {
  const view = renderWithProviders(
    <TipPanel list={list} failed={false} onRetry={onRetry} onClose={onClose} />
  );
  expect(screen.getByRole("button", { name: "确认投出" })).toBeDisabled();
  view.rerender(
    <TipPanel list={list} failed={true} onRetry={onRetry} onClose={onClose} />
  );
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "确认投出" })).toBeDisabled();
});
it("restores the exact amount and like intent after a lost response, even at the limit", async () => {
  vi.mocked(api.wordList.tip).mockRejectedValueOnce(new Error("lost response"));
  const view = renderWithProviders(panel());
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByText(/结果尚未确认/);
  const intent = vi.mocked(api.wordList.tip).mock.calls[0]![1];
  expect(
    JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
  ).toEqual(intent);
  expect(screen.getByRole("checkbox", { name: "同时点赞内容" })).toBeDisabled();
  view.unmount();
  vi.mocked(api.wordList.tipReceipt).mockResolvedValue(receipt(intent));
  renderWithProviders(panel("2"));
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await screen.findByRole("status");
  expect(api.wordList.tipReceipt).toHaveBeenCalledWith(
    intent.event_id,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(api.wordList.tip).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("wordlist-tip:payer:list")).toBeNull();
});
it("queries a legacy large intent before retrying and never changes its amount", async () => {
  const intent = { event_id: "event", idempotency_key: "key", amount: "7" };
  sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
  vi.mocked(api.wordList.tipReceipt).mockRejectedValueOnce(
    new HttpError(404, "not found")
  );
  vi.mocked(api.wordList.tip).mockRejectedValueOnce(
    new HttpError(400, "invalid", [], "coin_invalid_amount")
  );
  renderWithProviders(panel());
  expect(
    screen.getByRole("checkbox", { name: "同时点赞内容" })
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await screen.findByText(/每次可投 1 枚或 2 枚/);
  expect(api.wordList.tip).toHaveBeenCalledWith(
    "list",
    intent,
    expect.anything()
  );
  expect(sessionStorage.getItem("wordlist-tip:payer:list")).toBeNull();
  expect(screen.getByRole("button", { name: "确认投出" })).toBeEnabled();
});
it("keeps uncertain receipt failures and identity conflicts locked to the original intent", async () => {
  const intent = {
    event_id: "event",
    idempotency_key: "key",
    amount: "1",
    like: true
  };
  sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
  vi.mocked(api.wordList.tipReceipt).mockRejectedValueOnce(
    new Error("network")
  );
  renderWithProviders(panel());
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await screen.findByText(/结果尚未确认/);
  expect(api.wordList.tip).not.toHaveBeenCalled();
  vi.mocked(api.wordList.tipReceipt).mockRejectedValueOnce(
    new HttpError(404, "not found")
  );
  vi.mocked(api.wordList.tip).mockRejectedValueOnce(
    new HttpError(409, "conflict", [], "coin_idempotency_conflict")
  );
  fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
  await waitFor(() => expect(api.wordList.tip).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "重试这次投币" })).toBeEnabled()
  );
  expect(
    JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
  ).toEqual(intent);
});
it.each([
  [409, "coin_wallet_unavailable"],
  [404, "not_found"]
])(
  "preserves an unresolved intent after a retry returns %s %s",
  async (status, code) => {
    const intent = {
      event_id: "event",
      idempotency_key: "key",
      amount: "1",
      like: true
    };
    sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
    vi.mocked(api.wordList.tipReceipt).mockRejectedValueOnce(
      new HttpError(404, "not found")
    );
    vi.mocked(api.wordList.tip).mockRejectedValueOnce(
      new HttpError(status as number, "unavailable", [], code as string)
    );
    renderWithProviders(panel());
    fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
    await screen.findByText(/结果尚未确认/);
    expect(
      JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
    ).toEqual(intent);
    expect(screen.getByRole("radio", { name: "1 枚天生币" })).toBeDisabled();
    vi.mocked(api.wordList.tipReceipt).mockResolvedValueOnce(receipt(intent));
    fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
    await screen.findByText(/作者已收到/);
    expect(api.wordList.tip).toHaveBeenCalledOnce();
  }
);
it("unlocks a confirmed payment while display refreshes are still pending", async () => {
  let finish!: () => void;
  const invalidation = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const refresh = vi
    .spyOn(QueryClient.prototype, "invalidateQueries")
    .mockReturnValue(invalidation);
  renderWithProviders(panel());
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByText(/作者已收到/);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
  );
  expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled();
  expect(refresh).toHaveBeenCalledWith({ queryKey: ["coins"] });
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => finish());
});
it("refreshes state after a rejected limit without reporting success", async () => {
  vi.mocked(api.wordList.tip).mockRejectedValueOnce(
    new HttpError(409, "limit", [], "word_list_tip_limit")
  );
  renderWithProviders(panel());
  fireEvent.click(screen.getByRole("button", { name: "确认投出" }));
  await screen.findByText(/请刷新投币状态/);
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.queryByText(/作者已收到/)).not.toBeInTheDocument();
  expect(sessionStorage.getItem("wordlist-tip:payer:list")).toBeNull();
});
it.each(["switch", "unmount"])(
  "late receipt 404 after %s cannot charge the new session",
  async (mode) => {
    const intent = {
      event_id: "event",
      idempotency_key: "key",
      amount: "1",
      like: true
    };
    sessionStorage.setItem("wordlist-tip:payer:list", JSON.stringify(intent));
    let reject!: (error: unknown) => void;
    vi.mocked(api.wordList.tipReceipt).mockReturnValue(
      new Promise((_, no) => {
        reject = no;
      })
    );
    const view = renderWithProviders(panel());
    fireEvent.click(screen.getByRole("button", { name: "重试这次投币" }));
    await waitFor(() => expect(api.wordList.tipReceipt).toHaveBeenCalled());
    const signal = vi.mocked(api.wordList.tipReceipt).mock.calls[0]![1]?.signal;
    if (mode === "switch")
      act(() =>
        useUserStore.setState({
          user: {
            id: "different",
            display_name: "新用户",
            avatar_url: "",
            active_role: "student",
            roles: ["student"]
          }
        })
      );
    else view.unmount();
    await act(async () => reject(new HttpError(404, "not found")));
    expect(signal?.aborted).toBe(true);
    expect(api.wordList.tip).not.toHaveBeenCalled();
    expect(
      JSON.parse(sessionStorage.getItem("wordlist-tip:payer:list")!)
    ).toEqual(intent);
  }
);
